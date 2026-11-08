// @ts-nocheck
import {
  getAnimeMappingWithBoundaries,
  fetchAniZip,
  findByAnikumeId,
  findByTrackerId,
  getOrCreateAnikumeId,
  updateMissingId
} from "../Ids.js";
import { getMalLargePoster } from "./Details.js";
import { getFillerEpisodesSet } from "./AnimeFillerList.js";
import { getCurrentClientIp, buildUserIpHeaders } from "./RateLimiter.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

const ipTimezoneCache = new Map<string, string>();

function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  const trimmed = tz.trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat(void 0, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

function parseStartEnd(startEnd) {
  if (!startEnd) return null;
  if (typeof startEnd === "string") {
    const parts = startEnd.split("-");
    const start2 = parseInt(parts[0]) || 1;
    const endStr = parts[1]?.trim();
    const end2 = !endStr || endStr === "null" || endStr === "undefined" ? null : parseInt(endStr) || null;
    return { start: start2, end: end2 };
  }
  const start = startEnd.start || 1;
  const end = startEnd.end === null || startEnd.end === void 0 || startEnd.end === "null" ? null : startEnd.end;
  return { start, end };
}

function isPublicIp(ip) {
  if (!ip) return false;
  const trimmed = ip.trim();
  if (trimmed === "::1" || trimmed === "127.0.0.1" || trimmed === "localhost" || trimmed === "unknown") return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|169\.254\.|fc00:|fe80:)/i.test(trimmed)) return false;
  return true;
}

async function getUserGeoInfo(clientIp, browserTimezone) {
  if (browserTimezone && isValidTimezone(browserTimezone)) {
    return { ip: clientIp || "127.0.0.1", timezone: browserTimezone.trim(), timezone_source: "browser", country: null, region: null, city: null };
  }
  if (!clientIp || !isPublicIp(clientIp)) {
    return { ip: clientIp || "127.0.0.1", timezone: "UTC", timezone_source: "fallback", country: null, region: null, city: null };
  }
  if (ipTimezoneCache.has(clientIp)) {
    const tz = ipTimezoneCache.get(clientIp)!;
    return { ip: clientIp, timezone: tz, timezone_source: "ip", country: null, region: null, city: null };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${clientIp}`, { signal: AbortSignal.timeout(400) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === "success" && data.timezone && isValidTimezone(data.timezone)) {
        ipTimezoneCache.set(clientIp, data.timezone);
        return {
          ip: clientIp,
          timezone: data.timezone,
          timezone_source: "ip",
          country: data.countryCode ? data.countryCode.toLowerCase() : data.country || null,
          region: data.regionName || null,
          city: data.city || null
        };
      }
    }
  } catch {}
  return { ip: clientIp || "127.0.0.1", timezone: "UTC", timezone_source: "fallback", country: null, region: null, city: null };
}

function getForwardedHeaders(clientIp?: string) {
  const effectiveIp = getCurrentClientIp(clientIp);
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Origin: "https://anilist.co",
    Referer: "https://anilist.co/",
    Accept: "application/json, text/plain, */*",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    ...buildUserIpHeaders(effectiveIp),
  };
  return headers;
}

async function getAnimeMediaMeta(anilistId, malId, clientIp) {
  let status = null;
  let format = null;
  let total_episodes = null;
  let max_aired_episode = null;
  let next_airing_episode = null;
  let is_movie = false;
  let title = null;
  let banner = null;

  if (anilistId) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
        body: JSON.stringify({
          query: `query ($id: Int) {
            Media(id: $id, type: ANIME) {
              id
              status
              format
              episodes
              title { english romaji native }
              bannerImage
              coverImage { extraLarge large medium }
              nextAiringEpisode {
                episode
                airingAt
                timeUntilAiring
              }
            }
          }`,
          variables: { id: Number(anilistId) }
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const json = await res.json();
        const media = json.data?.Media;
        if (media) {
          format = media.format ? String(media.format).toUpperCase() : null;
          is_movie = format === "MOVIE";
          if (media.status === "FINISHED") status = "FINISHED";
          else if (media.status === "RELEASING") status = "RELEASING";
          else if (media.status === "NOT_YET_RELEASED") status = "UPCOMING";
          else if (media.status === "CANCELLED") status = "CANCELLED";
          if (typeof media.episodes === "number") total_episodes = media.episodes;
          title = media.title?.english || media.title?.romaji || media.title?.native || null;
          banner = media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || null;
          if (media.nextAiringEpisode && typeof media.nextAiringEpisode.episode === "number") {
            max_aired_episode = Math.max(0, media.nextAiringEpisode.episode - 1);
            next_airing_episode = {
              episode: media.nextAiringEpisode.episode,
              airing_at: media.nextAiringEpisode.airingAt,
              time_until_airing: media.nextAiringEpisode.timeUntilAiring
            };
          } else if (media.status === "NOT_YET_RELEASED") {
            max_aired_episode = 0;
          } else if (media.status === "FINISHED" && typeof media.episodes === "number") {
            max_aired_episode = media.episodes;
          }
          return { status, format, total_episodes, max_aired_episode, next_airing_episode, is_movie, title, banner };
        }
      }
    } catch (err) {
      console.warn("[Episodes] AniList media meta lookup error:", err);
    }
  }

  if (malId) {
    try {
      const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=status,num_episodes,media_type,title,alternative_titles,main_picture,pictures`, {
        headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) },
        cache: "no-store",
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.media_type) {
          format = String(data.media_type).toUpperCase();
          is_movie = format === "MOVIE";
        }
        title = data.alternative_titles?.en || data.title || null;
        banner = getMalLargePoster(data.main_picture?.large || data.main_picture?.medium);
        if (data.status === "finished_airing") status = "FINISHED";
        else if (data.status === "currently_airing") status = "RELEASING";
        else if (data.status === "not_yet_aired") status = "UPCOMING";
        else if (data.status === "cancelled") status = "CANCELLED";
        if (typeof data.num_episodes === "number") total_episodes = data.num_episodes;
        if (data.status === "not_yet_aired") {
          max_aired_episode = 0;
        } else if (data.status === "finished_airing" && typeof data.num_episodes === "number") {
          max_aired_episode = data.num_episodes;
        }
        return { status, format, total_episodes, max_aired_episode, next_airing_episode: null, is_movie, title, banner };
      }
    } catch (err) {
      console.warn("[Episodes] MAL media meta lookup error:", err);
    }
  }

  return { status: null, format: null, total_episodes: null, max_aired_episode: null, next_airing_episode: null, is_movie: false, title: null, banner: null };
}

async function fetchTmdbMovie(tmdbId, _clientIp, fallbackBanner = null, animeTitle = null) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
  const res = await fetch(url, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
    cache: "no-store",
    signal: AbortSignal.timeout(2500)
  });
  if (!res.ok) throw new Error(`TMDB movie request failed: ${res.status}`);
  const data = await res.json();
  const backdrop = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null;
  const poster = data.poster_path ? `https://image.tmdb.org/t/p/original${data.poster_path}` : null;
  const image = backdrop || fallbackBanner || poster || null;
  const movieTitle = data.title || (animeTitle ? animeTitle : "Episode 1");
  return [
    {
      episode: 1,
      SeasonNumber: null,
      EpisodeNumber: null,
      AbsoluteEpisodeNumber: null,
      is_filler: false,
      title: movieTitle,
      description: data.overview || (animeTitle ? `Episode 1 of ${animeTitle}.` : null),
      image
    }
  ];
}

async function fetchAnilistMovieEpisodes(anilistId, animeTitle, banner, clientIp) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        bannerImage
        coverImage { extraLarge large medium }
        title { english romaji native }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
    body: JSON.stringify({ query, variables: { id: Number(anilistId) } }),
    cache: "no-store",
    signal: AbortSignal.timeout(2500)
  });
  if (!res.ok) throw new Error("AniList movie request failed");
  const json = await res.json();
  const media = json.data?.Media;
  if (!media) throw new Error("AniList movie not found");
  const resolvedName = (media.title?.english || media.title?.romaji || media.title?.native || animeTitle || "Anime").replace(/\.+$/, "");
  const image = media.bannerImage || banner || media.coverImage?.extraLarge || media.coverImage?.large || null;
  return [
    {
      episode: 1,
      SeasonNumber: null,
      EpisodeNumber: null,
      AbsoluteEpisodeNumber: null,
      is_filler: false,
      title: "Episode 1.",
      description: `Episode 1 of ${resolvedName}.`,
      image
    }
  ];
}

async function fetchMalMovieEpisodes(malId, animeTitle, banner, clientIp) {
  const headers = { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) };
  const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=title,alternative_titles,main_picture,pictures`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(2500)
  });
  if (!res.ok) throw new Error("MAL movie request failed");
  const data = await res.json();
  const resolvedName = (data.alternative_titles?.en || data.title || animeTitle || "Anime").replace(/\.+$/, "");
  const image = banner || getMalLargePoster(data.main_picture?.large || data.main_picture?.medium);
  return [
    {
      episode: 1,
      SeasonNumber: null,
      EpisodeNumber: null,
      AbsoluteEpisodeNumber: null,
      is_filler: false,
      title: "Episode 1.",
      description: `Episode 1 of ${resolvedName}.`,
      image
    }
  ];
}

async function fetchAniZipEpisodes(params, fillerSet = new Set(), _clientIp) {
  const aniZip = await fetchAniZip({
    anilist_id: params.anilistId ? String(params.anilistId) : undefined,
    mal_id: params.malId ? String(params.malId) : undefined,
    kitsu_id: params.kitsuId ? String(params.kitsuId) : undefined,
    anidb_id: params.anidbId ? String(params.anidbId) : undefined
  });
  if (!aniZip || !aniZip.episodes || typeof aniZip.episodes !== "object") {
    throw new Error("No AniZip episodes found");
  }
  const sortedKeys = Object.keys(aniZip.episodes).sort((a, b) => Number(a) - Number(b));
  if (sortedKeys.length === 0) {
    throw new Error("No AniZip episodes found");
  }

  let defaultBanner = null;
  if (Array.isArray(aniZip.images)) {
    const banner = aniZip.images.find((img) => img.coverType === "Banner" || img.coverType === "Fanart");
    const poster = aniZip.images.find((img) => img.coverType === "Poster" || img.coverType === "Cover");
    defaultBanner = banner?.url || poster?.url || null;
  }

  const list = [];
  sortedKeys.forEach((key) => {
    const epNum = parseInt(key, 10);
    if (isNaN(epNum) || epNum <= 0) return;
    const epData = aniZip.episodes[key] || {};
    const seasonNumber =
      epData.seasonNumber === 0 && epData.airedBeforeSeasonNumber !== undefined && epData.airedBeforeSeasonNumber !== null
        ? Number(epData.airedBeforeSeasonNumber)
        : epData.seasonNumber !== undefined && epData.seasonNumber !== null
        ? Number(epData.seasonNumber)
        : 1;
    const episodeNumber =
      epData.seasonNumber === 0 && epData.airedBeforeEpisodeNumber !== undefined && epData.airedBeforeEpisodeNumber !== null
        ? Number(epData.airedBeforeEpisodeNumber)
        : epData.episodeNumber !== undefined && epData.episodeNumber !== null
        ? Number(epData.episodeNumber)
        : epNum;
    const absNumber =
      epData.absoluteEpisodeNumber !== undefined && epData.absoluteEpisodeNumber !== null
        ? Number(epData.absoluteEpisodeNumber)
        : epNum;

    let title = `Episode ${epNum}`;
    if (epData.title) {
      if (typeof epData.title === "string") {
        title = epData.title;
      } else if (typeof epData.title === "object") {
        title = epData.title.en || epData.title["x-jat"] || epData.title.ja || title;
      }
    }

    const description = epData.overview || epData.summary || null;
    const image = epData.image || defaultBanner;
    const rawAirDate = epData.airDate || epData.airDateUtc || epData.airdate || null;

    list.push({
      episode: epNum,
      SeasonNumber: seasonNumber,
      EpisodeNumber: episodeNumber,
      AbsoluteEpisodeNumber: absNumber,
      is_filler: fillerSet.has(epNum),
      title,
      description,
      image,
      _airDate: rawAirDate
    });
  });
  return list;
}

async function fetchAnilistEpisodes(anilistId, fillerSet = new Set(), clientIp) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        episodes
        description
        bannerImage
        coverImage { extraLarge large }
        streamingEpisodes {
          title
          thumbnail
          url
          site
        }
        nextAiringEpisode {
          episode
          airingAt
        }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
    body: JSON.stringify({ query, variables: { id: Number(anilistId) } }),
    cache: "no-store",
    signal: AbortSignal.timeout(2500)
  });
  if (!res.ok) throw new Error(`AniList returned status ${res.status}`);
  const json = await res.json();
  const media = json.data?.Media;
  if (!media) throw new Error("AniList anime not found");
  const defaultBanner = media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || null;
  const cleanDesc = media.description ? media.description.replace(/<[^>]*>/g, "").trim() : null;

  if (Array.isArray(media.streamingEpisodes) && media.streamingEpisodes.length > 0) {
    const list = media.streamingEpisodes.map((ep, idx) => {
      const epNum = idx + 1;
      return {
        episode: epNum,
        SeasonNumber: null,
        EpisodeNumber: null,
        AbsoluteEpisodeNumber: null,
        is_filler: fillerSet.has(epNum),
        title: ep.title || `Episode ${epNum}`,
        description: cleanDesc,
        image: ep.thumbnail || defaultBanner
      };
    });
    return list;
  }
  const totalEpisodes = media.episodes || (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : 1);
  if (totalEpisodes > 0) {
    const list = [];
    for (let i = 1; i <= totalEpisodes; i++) {
      list.push({
        episode: i,
        SeasonNumber: null,
        EpisodeNumber: null,
        AbsoluteEpisodeNumber: null,
        is_filler: fillerSet.has(i),
        title: `Episode ${i}`,
        description: cleanDesc,
        image: defaultBanner
      });
    }
    return list;
  }
  throw new Error("No AniList episodes found");
}

async function fetchMalEpisodes(malId, fillerSet = new Set(), clientIp) {
  const headers = { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) };
  try {
    const malRes = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=num_episodes,main_picture,pictures,synopsis,title,status`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(2500)
    });
    if (malRes.ok) {
      const malData = await malRes.json();
      const count = malData.num_episodes && malData.num_episodes > 0 ? malData.num_episodes : 1;
      const defaultBanner = getMalLargePoster(malData.main_picture?.large || malData.main_picture?.medium);
      const defaultDescription = malData.synopsis || null;
      const list = [];
      for (let i = 1; i <= count; i++) {
        list.push({
          episode: i,
          SeasonNumber: null,
          EpisodeNumber: null,
          AbsoluteEpisodeNumber: null,
          is_filler: fillerSet.has(i),
          title: `Episode ${i}`,
          description: defaultDescription,
          image: defaultBanner
        });
      }
      return list;
    }
  } catch (err) {
    console.warn("Official MAL API fetch error:", err);
  }
  throw new Error("No MAL episodes found");
}

async function generateFallbackEpisodes(anilistId, malId, fillerSet = new Set(), clientIp, isMovie = false) {
  let animeTitle = "Anime";
  let banner = null;
  let poster = null;
  let totalEp = 1;

  if (anilistId) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
        body: JSON.stringify({
          query: `query ($id: Int) {
            Media(id: $id, type: ANIME) {
              title { english romaji native }
              episodes
              bannerImage
              coverImage { extraLarge large medium }
            }
          }`,
          variables: { id: Number(anilistId) }
        }),
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const json = await res.json();
        const media = json.data?.Media;
        if (media) {
          animeTitle = media.title?.english || media.title?.romaji || media.title?.native || animeTitle;
          banner = media.bannerImage || null;
          poster = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || null;
          if (typeof media.episodes === "number" && media.episodes > 0) {
            totalEp = media.episodes;
          }
        }
      }
    } catch (err) {
      console.warn("AniList fallback lookup error:", err);
    }
  }

  if (malId && (totalEp <= 1 || !banner)) {
    try {
      const malRes = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=num_episodes,main_picture,pictures,title,alternative_titles`, {
        headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) },
        signal: AbortSignal.timeout(2000)
      });
      if (malRes.ok) {
        const malData = await malRes.json();
        if (animeTitle === "Anime" && malData.title) {
          animeTitle = malData.alternative_titles?.en || malData.title;
        }
        if (!poster && malData.main_picture) {
          poster = getMalLargePoster(malData.main_picture.large || malData.main_picture.medium);
        }
        if (typeof malData.num_episodes === "number" && malData.num_episodes > 0) {
          totalEp = malData.num_episodes;
        }
      }
    } catch (err) {
      console.warn("MAL fallback lookup error:", err);
    }
  }

  const cleanTitle = (animeTitle || "Anime").replace(/\.+$/, "");
  const image = banner || poster || null;
  const list = [];
  for (let i = 1; i <= totalEp; i++) {
    list.push({
      episode: i,
      SeasonNumber: null,
      EpisodeNumber: null,
      AbsoluteEpisodeNumber: null,
      is_filler: isMovie ? false : fillerSet.has(i),
      title: `Episode ${i}.`,
      description: `Episode ${i} of ${cleanTitle}.`,
      image
    });
  }
  return list;
}

const ALLOWED_EPISODE_TRACKERS = ["anikume", "anilist", "mal", "tmdb"];

async function getEpisodes(trackerParam, id, clientIp, browserTimezone, isFresh = false) {
  const tracker = (trackerParam || "anikume").toLowerCase().trim();
  let canonicalAnikumeId = null;
  let anilistId = null;
  let malId = null;
  let directTmdbId = null;

  if (tracker === "anilist") {
    anilistId = parseInt(id, 10) || null;
  } else if (tracker === "mal") {
    malId = parseInt(id, 10) || null;
  } else if (tracker === "tmdb") {
    directTmdbId = id;
  } else {
    if (/^\d+$/.test(id.trim())) {
      anilistId = parseInt(id.trim(), 10);
    } else {
      canonicalAnikumeId = id.trim();
    }
  }

  // Pre-resolve canonicalAnikumeId so AniList and MAL IDs are known before meta fetch
  if (canonicalAnikumeId && !anilistId && !malId) {
    try {
      const rec = await findByAnikumeId(canonicalAnikumeId);
      if (rec?.anilist_id) anilistId = parseInt(rec.anilist_id, 10);
      if (rec?.mal_id) malId = parseInt(rec.mal_id, 10);
    } catch {}
  }

  // Mapping resolution:
  let mappingPromise = null;
  if (canonicalAnikumeId) {
    mappingPromise = getAnimeMappingWithBoundaries("anikume", canonicalAnikumeId).catch(() => null);
  } else if (anilistId) {
    mappingPromise = getAnimeMappingWithBoundaries("anilist", String(anilistId)).catch(() => null);
  } else if (malId) {
    mappingPromise = getAnimeMappingWithBoundaries("mal", String(malId)).catch(() => null);
  } else {
    mappingPromise = Promise.resolve(null);
  }

  // Run metadata and mapping in parallel
  const metaPromise = getAnimeMediaMeta(anilistId, malId, clientIp);

  let [meta, mapping] = await Promise.all([metaPromise, mappingPromise]);

  if (mapping?.anilist_id && !anilistId) anilistId = parseInt(String(mapping.anilist_id), 10);
  if (mapping?.mal_id && !malId) malId = parseInt(String(mapping.mal_id), 10);

  // If format was not verified initially (e.g. IDs came only from mapping), verify with AniList or MAL now
  if (!meta.format && (anilistId || malId)) {
    meta = await getAnimeMediaMeta(anilistId, malId, clientIp);
  }

  if (mapping?.type === "MOVIE") {
    meta.is_movie = true;
  }

  if (meta.status === "UPCOMING") {
    throw { status: 404, code: "ANIME_UPCOMING", message: `Anime '${id}' is not yet released / upcoming. No episodes available.` };
  }

  // For anime movies: ignore loading next episode and filler
  if (meta.is_movie) {
    meta.next_airing_episode = null;
  }

  // Start filler set lookup in parallel for non-movies so it runs concurrently with AniZip / episode fetch
  const fillerPromise = meta.is_movie
    ? Promise.resolve(new Set())
    : getFillerEpisodesSet({
        anilistId,
        malId,
        title: meta.title,
        isFresh
      }).catch(() => new Set());

  const formatEpisodesResult = async (eps, isAniZip = false) => {
    const fillerSet = await fillerPromise;
    let filtered = eps.map((ep) => ({
      ...ep,
      is_filler: meta.is_movie ? false : fillerSet.has(ep.episode)
    }));
    const nextEpNum = meta?.next_airing_episode?.episode;

    if (isAniZip) {
      // 1. If next airing episode number exists (e.g., next is 7 or 1181), stop at next - 1
      if (typeof nextEpNum === "number" && nextEpNum > 0) {
        filtered = filtered.filter((e) => e.episode < nextEpNum);
      } else {
        // 2. If NO next airing episode number:
        // Exclude episodes without an air date, and exclude any episode with air date in the future (and all episodes below it)
        const now = new Date();
        const validEps = [];
        for (const ep of filtered) {
          const rawDate = ep._airDate;
          if (!rawDate) {
            // Episode without air date is excluded
            continue;
          }
          const epDate = new Date(rawDate);
          if (isNaN(epDate.getTime()) || epDate > now) {
            // Air date is in the future: stop counting here and exclude all subsequent episodes
            break;
          }
          validEps.push(ep);
        }
        filtered = validEps;
      }
    } else {
      // For non-AniZip (fallbacks)
      if (typeof nextEpNum === "number" && nextEpNum > 0) {
        filtered = filtered.filter((e) => e.episode < nextEpNum);
      } else if (meta.max_aired_episode !== null) {
        filtered = filtered.filter((e) => e.episode <= (meta.max_aired_episode || 0));
      }
    }

    if (!filtered || filtered.length === 0) {
      throw { status: 404, code: "EPISODES_NOT_FOUND", message: `No released episodes found for ID: ${id}` };
    }

    // Clean up internal _airDate property
    const cleanEpisodes = filtered.map(({ _airDate, ...rest }) => rest);

    const output = {
      total_episodes: cleanEpisodes.length,
      episodes: cleanEpisodes
    };
    Object.defineProperty(output, "_meta", {
      value: {
        status: meta.status,
        format: meta.format,
        is_movie: meta.is_movie,
        next_airing_episode: meta.is_movie
          ? null
          : meta.next_airing_episode
          ? {
              episode: meta.next_airing_episode.episode,
              airing_at: meta.next_airing_episode.airing_at,
              time_until_seconds: meta.next_airing_episode.time_until_airing
            }
          : null
      },
      enumerable: false,
      writable: true,
      configurable: true
    });
    return output;
  };

  // MOVIES: TMDB is Primary, AniList / MAL for fallback (AniZip is completely ignored)
  if (meta.is_movie) {
    const tmdbTarget = directTmdbId || mapping?.themoviedb_id || mapping?.tmdb_id;
    if (tmdbTarget) {
      try {
        const movieId = typeof tmdbTarget === "object" ? (Array.isArray(tmdbTarget.movie) ? tmdbTarget.movie[0] : tmdbTarget.movie || tmdbTarget.tv) : tmdbTarget;
        if (movieId) {
          const movie = await fetchTmdbMovie(movieId, clientIp, meta.banner, meta.title);
          if (movie && movie.length > 0) return await formatEpisodesResult(movie, false);
        }
      } catch (e) {
        console.warn("TMDB movie fetch failed, using fallback:", e);
      }
    }

    // Fallback 1: AniList
    if (anilistId) {
      try {
        const alEpisodes = await fetchAnilistMovieEpisodes(anilistId, meta.title, meta.banner, clientIp);
        if (alEpisodes && alEpisodes.length > 0) return await formatEpisodesResult(alEpisodes, false);
      } catch (e) {
        console.warn("AniList movie fallback failed:", e);
      }
    }

    // Fallback 2: MAL
    if (malId) {
      try {
        const malEpisodes = await fetchMalMovieEpisodes(malId, meta.title, meta.banner, clientIp);
        if (malEpisodes && malEpisodes.length > 0) return await formatEpisodesResult(malEpisodes, false);
      } catch (e) {
        console.warn("MAL movie fallback failed:", e);
      }
    }

    // Final movie fallback:
    const fallbackMovie = await generateFallbackEpisodes(anilistId || mapping?.anilist_id, malId || mapping?.mal_id, new Set(), clientIp, true);
    if (fallbackMovie && fallbackMovie.length > 0) return await formatEpisodesResult(fallbackMovie, false);

    throw { status: 404, code: "EPISODES_NOT_FOUND", message: `No movie episodes found for ID: ${id}` };
  }

  // TV SHOWS: AniZip is Primary (mapped to AniList / MAL), running concurrently with fillerPromise
  const anizipParams = {
    malId: malId || mapping?.mal_id,
    anilistId: anilistId || mapping?.anilist_id,
    kitsuId: mapping?.kitsu_id,
    anidbId: mapping?.anidb_id
  };
  if (anizipParams.malId || anizipParams.anilistId || anizipParams.kitsuId || anizipParams.anidbId) {
    try {
      const episodes = await fetchAniZipEpisodes(anizipParams, new Set(), clientIp);
      if (episodes && episodes.length > 0) return await formatEpisodesResult(episodes, true);
    } catch (e) {
      console.warn("AniZip episode fetch failed, falling back to AniList/MAL:", e);
    }
  }

  // Fallback 1: AniList
  if (anilistId) {
    try {
      const episodes = await fetchAnilistEpisodes(anilistId, new Set(), clientIp);
      if (episodes && episodes.length > 0) return await formatEpisodesResult(episodes, false);
    } catch (e) {
      console.warn("AniList fallback episode fetch failed:", e);
    }
  }

  // Fallback 2: MAL
  const effectiveMalId = malId || mapping?.mal_id;
  if (effectiveMalId) {
    try {
      const episodes = await fetchMalEpisodes(effectiveMalId, new Set(), clientIp);
      if (episodes && episodes.length > 0) return await formatEpisodesResult(episodes, false);
    } catch (e) {
      console.warn("MAL episode fetch failed:", e);
    }
  }

  // Final Fallback: Generate total episode list using AniList or MAL total count
  const fallbackEps = await generateFallbackEpisodes(anilistId || mapping?.anilist_id, malId || mapping?.mal_id, new Set(), clientIp);
  if (fallbackEps && fallbackEps.length > 0) return await formatEpisodesResult(fallbackEps, false);

  throw { status: 404, code: "EPISODES_NOT_FOUND", message: "No released episodes found for this anime across providers" };
}

function formatTimeHHMMSS(timestampInSeconds, timezone) {
  if (!timestampInSeconds) return null;
  const dateObj = new Date(timestampInSeconds * 1000);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(dateObj);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || "00";
    let hour = getPart("hour");
    if (hour === "24") hour = "00";
    return `${hour}:${getPart("minute")}:${getPart("second")}`;
  } catch {
    const h = String(dateObj.getUTCHours()).padStart(2, "0");
    const m = String(dateObj.getUTCMinutes()).padStart(2, "0");
    const s = String(dateObj.getUTCSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
}

function formatDateYYYYMMDD(timestampInSeconds, timezone) {
  if (!timestampInSeconds) return null;
  const dateObj = new Date(timestampInSeconds * 1000);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).formatToParts(dateObj);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${getPart("day")} ${getPart("month")} ${getPart("year")}`;
  } catch {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const y = dateObj.getUTCFullYear();
    const m = months[dateObj.getUTCMonth()];
    const d = dateObj.getUTCDate();
    return `${d} ${m} ${y}`;
  }
}

function clearEpisodesCache() {
  ipTimezoneCache.clear();
}

export {
  ALLOWED_EPISODE_TRACKERS,
  clearEpisodesCache,
  fetchAniZipEpisodes,
  fetchAnilistEpisodes,
  fetchAnilistMovieEpisodes,
  fetchMalEpisodes,
  fetchMalMovieEpisodes,
  fetchTmdbMovie,
  formatDateYYYYMMDD,
  formatTimeHHMMSS,
  generateFallbackEpisodes,
  getAnimeMediaMeta,
  getEpisodes,
  getForwardedHeaders,
  getUserGeoInfo,
  isPublicIp,
  isValidTimezone,
  parseStartEnd
};
