// @ts-nocheck
import {
  getAnimeMappingWithBoundaries,
  getFribbDataset,
  fetchAniZip,
  findByAnikumeId,
  findByTrackerId,
  getOrCreateAnikumeId,
  getOrCreateAnikumeIdsBatch,
  updateMissingId
} from "../Ids.js";
import { getAnibridgeFullMapping } from "./AniBridge.js";
import { fetchChiakiWatchOrder } from "./Chiaki.js";
import { getForwardedHeaders, getUserGeoInfo } from "./Episodes.js";
import {
  mapAndFormatAnimeItemsBatch,
  formatRating,
  cleanDescription,
  normalizeFormat,
  normalizeStatus,
  getHeroClearLogo
} from "./Catalog.js";
import { getOverview } from "../Overview.js";

const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

const TIMEZONE_SHORT_MAP: Record<string, string> = {
  "Asia/Kolkata": "IST",
  "Asia/Calcutta": "IST",
  "Asia/Tokyo": "JST",
  "Asia/Seoul": "KST",
  "Asia/Shanghai": "CST",
  "Asia/Hong_Kong": "HKT",
  "Asia/Taipei": "CST",
  "Asia/Singapore": "SGT",
  "Asia/Dubai": "GST",
  "Asia/Bangkok": "ICT",
  "Asia/Jakarta": "WIB",
  "Asia/Karachi": "PKT",
  "Asia/Dhaka": "BST",
  "Asia/Kathmandu": "NPT",
  "Asia/Colombo": "IST",
  "Europe/London": "BST",
  "Europe/Paris": "CEST",
  "Europe/Berlin": "CEST",
  "Europe/Madrid": "CEST",
  "Europe/Rome": "CEST",
  "Europe/Amsterdam": "CEST",
  "Europe/Moscow": "MSK",
  "America/New_York": "EDT",
  "America/Chicago": "CDT",
  "America/Denver": "MDT",
  "America/Los_Angeles": "PDT",
  "America/Phoenix": "MST",
  "America/Toronto": "EDT",
  "America/Vancouver": "PDT",
  "America/Sao_Paulo": "BRT",
  "Australia/Sydney": "AEST",
  "Australia/Melbourne": "AEST",
  "Australia/Brisbane": "AEST",
  "Australia/Perth": "AWST",
  "Pacific/Auckland": "NZST",
  "UTC": "UTC",
  "GMT": "GMT"
};

function formatNextAiringEpisode(episodeNumber: any, airingTimestamp: number, timezone: string) {
  const dateObj = new Date(airingTimestamp * 1000);
  let formattedParts: any[] = [];
  try {
    formattedParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short"
    }).formatToParts(dateObj);
  } catch {
    formattedParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short"
    }).formatToParts(dateObj);
  }

  const getPart = (type: string) => formattedParts.find((p) => p.type === type)?.value || "";
  const date = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
  const time = `${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
  let tzShort = TIMEZONE_SHORT_MAP[timezone];
  if (!tzShort) {
    const rawTzPart = getPart("timeZoneName");
    if (rawTzPart && !rawTzPart.startsWith("GMT")) {
      tzShort = rawTzPart;
    } else {
      tzShort = rawTzPart || timezone;
    }
  }
  return { episode: episodeNumber, date, time, timezone: tzShort, airing_at: airingTimestamp };
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatUpcomingReleaseDate(
  airingTimestamp: number | null,
  startDate: any,
  rawDateStr: string | null,
  userTimezone = "UTC"
) {
  if (airingTimestamp && airingTimestamp > 0) {
    const dateObj = new Date(airingTimestamp * 1000);
    const tz = userTimezone && userTimezone !== "UTC" ? userTimezone : "UTC";
    let parts: any[] = [];
    try {
      parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).formatToParts(dateObj);
    } catch {
      parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).formatToParts(dateObj);
    }
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const day2 = getPart("day");
    const month2 = getPart("month");
    const year2 = getPart("year");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");
    if (year2 && month2 && day2 && hour && minute && second) {
      return `${day2} ${month2} ${year2} - ${hour}:${minute}:${second}`;
    }
  }
  let year = startDate?.year || null;
  let month = startDate?.month || null;
  let day = startDate?.day || null;

  if (!year && rawDateStr) {
    const rawSegments = String(rawDateStr).trim().split("-");
    if (rawSegments[0]) year = parseInt(rawSegments[0], 10) || null;
    if (rawSegments[1]) month = parseInt(rawSegments[1], 10) || null;
    if (rawSegments[2]) day = parseInt(rawSegments[2], 10) || null;
  }

  if (!year) return null;
  if (month && day && month >= 1 && month <= 12) {
    const monthStr = SHORT_MONTHS[month - 1];
    return `${day} ${monthStr} ${year}`;
  }
  if (month && month >= 1 && month <= 12) {
    const monthStr = SHORT_MONTHS[month - 1];
    return `${monthStr} ${year}`;
  }
  return `${year}`;
}

export function formatRelationType(rel: string | null) {
  if (!rel) return "Other";
  const r = rel.toUpperCase().replace(/\s+/g, "_").trim();
  switch (r) {
    case "SIDE_STORY":
      return "Side Story";
    case "PREQUEL":
      return "Prequel";
    case "SEQUEL":
      return "Sequel";
    case "PARENT":
    case "PARENT_STORY":
      return "Parent Story";
    case "SUMMARY":
      return "Summary";
    case "ALTERNATIVE":
    case "ALTERNATIVE_VERSION":
    case "ALTERNATIVE_SETTING":
      return "Alternative";
    case "SPIN_OFF":
      return "Spin-Off";
    case "ADAPTATION":
      return "Adaptation";
    case "CHARACTER":
      return "Character";
    case "OTHER":
      return "Other";
    default:
      return rel
        .split(/[_\s]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
  }
}

export function buildExternalLinks(mapping: any, anilistId: any, malId: any) {
  const links: any[] = [];
  const effectiveAnilistId = anilistId || mapping?.anilist_id;
  const effectiveMalId = malId || mapping?.mal_id;

  if (effectiveAnilistId) {
    links.push({ site: "AniList", link: `https://anilist.co/anime/${effectiveAnilistId}` });
  }
  if (effectiveMalId) {
    links.push({ site: "MyAnimeList", link: `https://myanimelist.net/anime/${effectiveMalId}` });
  }
  if (mapping?.themoviedb_id || mapping?.tmdb_id) {
    const tmdbVal = mapping.themoviedb_id || mapping.tmdb_id;
    let isMovie = false;
    let tmdbIdStr = "";
    if (typeof tmdbVal === "object" && tmdbVal !== null) {
      if (tmdbVal.tv) {
        tmdbIdStr = String(tmdbVal.tv);
      } else if (tmdbVal.movie) {
        tmdbIdStr = String(Array.isArray(tmdbVal.movie) ? tmdbVal.movie[0] : tmdbVal.movie);
        isMovie = true;
      }
    } else {
      tmdbIdStr = String(tmdbVal);
    }
    if (tmdbIdStr && tmdbIdStr !== "null" && tmdbIdStr !== "undefined") {
      links.push({
        site: "The Movie Database",
        link: isMovie ? `https://www.themoviedb.org/movie/${tmdbIdStr}` : `https://www.themoviedb.org/tv/${tmdbIdStr}`
      });
    }
  }
  if (mapping?.tvdb_id && String(mapping.tvdb_id) !== "null") {
    links.push({ site: "TheTVDB", link: `https://thetvdb.com/dereferrer/series/${mapping.tvdb_id}` });
  }
  if (mapping?.anidb_id && String(mapping.anidb_id) !== "null") {
    links.push({ site: "AniDB", link: `https://anidb.net/anime/${mapping.anidb_id}` });
  }
  if (mapping?.["anime-planet_id"] && String(mapping["anime-planet_id"]) !== "null") {
    links.push({ site: "Anime-Planet", link: `https://www.anime-planet.com/anime/${mapping["anime-planet_id"]}` });
  }
  if (mapping?.simkl_id && String(mapping.simkl_id) !== "null") {
    links.push({ site: "Simkl", link: `https://simkl.com/anime/${mapping.simkl_id}` });
  }
  if (mapping?.livechart_id && String(mapping.livechart_id) !== "null") {
    links.push({ site: "LiveChart", link: `https://www.livechart.me/anime/${mapping.livechart_id}` });
  }
  if (mapping?.anisearch_id && String(mapping.anisearch_id) !== "null") {
    links.push({ site: "aniSearch", link: `https://www.anisearch.com/anime/${mapping.anisearch_id}` });
  }
  if (mapping?.animecountdown_id && String(mapping.animecountdown_id) !== "null") {
    links.push({ site: "Anime Countdown", link: `https://animecountdown.com/${mapping.animecountdown_id}` });
  }

  return links.map((link) => {
    try {
      const url = new URL(link.link);
      return { ...link, logo: `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128` };
    } catch {
      return link;
    }
  });
}

async function fetchAnilistDetails(anilistId: number, clientIp?: string) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        isAdult
        title {
          romaji
          english
          native
        }
        synonyms
        coverImage {
          extraLarge
          large
          medium
        }
        bannerImage
        trailer { id site thumbnail }
        description(asHtml: false)
        format
        status
        episodes
        duration
        genres
        averageScore
        seasonYear
        startDate {
          year
          month
          day
        }
        source
        studios(isMain: true) {
          edges {
            isMain
            node {
              id
              name
            }
          }
        }
        nextAiringEpisode {
          episode
          airingAt
          timeUntilAiring
        }
        characters(sort: [ROLE, RELEVANCE], perPage: 25) {
          edges {
            role
            node {
              id
              name {
                full
                native
                alternative
              }
              image {
                large
                medium
              }
            }
            voiceActors(language: JAPANESE) {
              id
              name {
                full
                native
              }
              languageV2
              image {
                large
                medium
              }
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              id
              idMal
              type
              isAdult
              format
              status
              averageScore
              title {
                romaji
                english
                native
              }
              coverImage {
                extraLarge
                large
              }
              bannerImage
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 10) {
          nodes {
            mediaRecommendation {
              id
              idMal
              type
              isAdult
              title {
                romaji
                english
                native
              }
              coverImage {
                extraLarge
                large
                medium
              }
              bannerImage
              description(asHtml: false)
              averageScore
              format
              status
              seasonYear
              genres
            }
          }
        }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
    body: JSON.stringify({ query, variables: { id: anilistId } })
  });
  if (!res.ok) {
    throw new Error(`AniList returned status ${res.status}`);
  }
  const json = await res.json();
  if (!json.data?.Media) {
    throw new Error(`AniList anime not found for ID: ${anilistId}`);
  }
  return json.data.Media;
}

export function getMalLargePoster(url: string | null) {
  if (!url) return null;
  if (url.includes("cdn.myanimelist.net/images/anime/")) {
    if (/l\.(jpg|jpeg|webp|png)$/i.test(url)) return url;
    return url.replace(/(\d+)\.(jpg|jpeg|webp|png)$/i, "$1l.$2");
  }
  return url;
}

function calculateNextAiringFromMalBroadcast(broadcast: any, userTimezone = "UTC") {
  if (!broadcast?.day_of_the_week) return null;
  const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const targetDay = days[broadcast.day_of_the_week.toLowerCase()];
  if (targetDay === undefined) return null;
  const [hours, minutes] = (broadcast.start_time || "00:00").split(":").map(Number);
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const nowJst = new Date(now.getTime() + jstOffset);
  const currentJstDay = nowJst.getUTCDay();
  const daysUntil = (targetDay - currentJstDay + 7) % 7;
  const targetJst = new Date(nowJst);
  targetJst.setUTCDate(nowJst.getUTCDate() + daysUntil);
  targetJst.setUTCHours(hours || 0, minutes || 0, 0, 0);
  if (daysUntil === 0 && targetJst.getTime() <= nowJst.getTime()) {
    targetJst.setUTCDate(targetJst.getUTCDate() + 7);
  }
  const airingAtSeconds = Math.floor((targetJst.getTime() - jstOffset) / 1000);
  return formatNextAiringEpisode(null, airingAtSeconds, userTimezone);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function formatFullDate(year?: number | null, month?: number | null, day?: number | null): string | null {
  if (!year) return null;
  const monthName = month && month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : null;
  if (day && monthName) {
    return `${day} ${monthName} ${year}`;
  }
  if (monthName) {
    return `${monthName} ${year}`;
  }
  return `${year}`;
}

export function parseMalDate(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return formatFullDate(y, m, d);
    }
  }
  if (parts.length === 2) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(y) && !isNaN(m)) {
      return formatFullDate(y, m, null);
    }
  }
  if (parts.length === 1 && parts[0].length === 4) {
    const y = parseInt(parts[0], 10);
    if (!isNaN(y)) {
      return formatFullDate(y, null, null);
    }
  }
  return null;
}

async function fetchMalCharactersWithVoiceActors(malId: number, clientIp?: string) {
  try {
    const fields = "id,first_name,last_name,main_picture,biography,num_favorites";
    const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}/characters?fields=${fields}`, {
      headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) }
    });
    if (res.ok) {
      const data = await res.json();
      return (data.data || []).map((item: any) => {
        const node = item.node;
        const fullName =
          [node?.first_name, node?.last_name].filter(Boolean).join(" ") || node?.last_name || node?.first_name || null;
        const rawImage = node?.main_picture?.large || node?.main_picture?.medium || null;
        return {
          character: fullName,
          role: item.role === "Main" ? "MAIN" : "SUPPORTING",
          image: rawImage,
          actor: null,
          actor_image: null,
          language: null
        };
      });
    }
  } catch (err) {
    console.warn(`MAL official character fetch failed for ID ${malId}:`, err);
  }
  return [];
}

async function fetchMalDetails(malId: number, clientIp?: string) {
  const fields =
    "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,num_episodes,start_season,broadcast,source,average_episode_duration,rating,pictures,background,related_anime{node{id,title,main_picture,media_type,status,start_date,alternative_titles,genres,mean,synopsis}},related_manga,recommendations{node{id,title,main_picture,media_type,status,start_date,alternative_titles,genres,mean,synopsis},num_recommendations},studios,statistics,videos";
  const malRes = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=${fields}`, {
    headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) }
  });
  if (!malRes.ok) {
    throw new Error(`MAL returned status ${malRes.status}`);
  }
  return await malRes.json();
}

export async function getAnimeFullDetails(
  id: string,
  trackerParam?: string,
  providerParam?: string,
  clientIp?: string,
  browserTimezone?: string
) {
  const tracker = (trackerParam || "anikume").toLowerCase().trim();
  const provider = providerParam ? providerParam.toLowerCase().trim() : null;
  let canonicalAnikumeId: string | null = null;
  let anilistId: number | null = null;
  let malId: number | null = null;

  const geoInfo = await getUserGeoInfo(clientIp, browserTimezone);
  const userTimezone = geoInfo.timezone || "UTC";

  if (tracker === "anilist") {
    anilistId = parseInt(id, 10) || null;
    if (anilistId) {
      const existing = await findByTrackerId("anilist", String(anilistId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        malId = existing.mal_id ? parseInt(existing.mal_id, 10) : null;
      }
    }
  } else if (tracker === "mal") {
    malId = parseInt(id, 10) || null;
    if (malId) {
      const existing = await findByTrackerId("mal", String(malId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        anilistId = existing.anilist_id ? parseInt(existing.anilist_id, 10) : null;
      }
    }
  } else {
    const record = await findByAnikumeId(id);
    if (record) {
      canonicalAnikumeId = record.anikume_id;
      anilistId = record.anilist_id ? parseInt(record.anilist_id, 10) : null;
      malId = record.mal_id ? parseInt(record.mal_id, 10) : null;
    } else {
      if (/^\d+$/.test(id.trim())) {
        anilistId = parseInt(id.trim(), 10);
      } else {
        canonicalAnikumeId = id.trim();
      }
    }
  }

  let mapping: any = null;
  if (anilistId) {
    try {
      mapping = await getAnimeMappingWithBoundaries("anilist", String(anilistId));
    } catch {}
    if (mapping?.mal_id && !malId) {
      malId = parseInt(String(mapping.mal_id), 10);
      if (canonicalAnikumeId) {
        updateMissingId(canonicalAnikumeId, "mal", String(malId)).catch(() => {});
      }
    }
  } else if (malId) {
    try {
      mapping = await getAnimeMappingWithBoundaries("mal", String(malId));
    } catch {}
    if (mapping?.anilist_id && !anilistId) {
      anilistId = parseInt(String(mapping.anilist_id), 10);
      if (canonicalAnikumeId) {
        updateMissingId(canonicalAnikumeId, "anilist", String(anilistId)).catch(() => {});
      }
    }
  }

  if (!canonicalAnikumeId) {
    canonicalAnikumeId = await getOrCreateAnikumeId({ anilist_id: anilistId, mal_id: malId });
  }

  const externalLinks = buildExternalLinks(mapping, anilistId, malId);
  const effectiveProvider = provider ? provider.toLowerCase().trim() : null;

  let details: any = null;
  if (effectiveProvider === "mal") {
    if (!malId) {
      throw { status: 404, code: "MAL_ID_NOT_FOUND", message: `No MAL ID mapped for ${tracker} ID: ${id}` };
    }
    try {
      details = await buildMalDetails(malId, anilistId, canonicalAnikumeId, externalLinks, clientIp, userTimezone);
    } catch (err) {
      if (provider === "mal") throw err;
      if (anilistId) {
        details = await buildAnilistDetails(anilistId, malId, canonicalAnikumeId, externalLinks, clientIp, userTimezone);
      } else {
        throw err;
      }
    }
  } else if (effectiveProvider === "anilist") {
    if (!anilistId) {
      throw { status: 404, code: "ANILIST_ID_NOT_FOUND", message: `No AniList ID mapped for ${tracker} ID: ${id}` };
    }
    try {
      details = await buildAnilistDetails(anilistId, malId, canonicalAnikumeId, externalLinks, clientIp, userTimezone);
    } catch (err) {
      if (provider === "anilist") throw err;
      if (malId) {
        details = await buildMalDetails(malId, anilistId, canonicalAnikumeId, externalLinks, clientIp, userTimezone);
      } else {
        throw err;
      }
    }
  } else {
    if (anilistId) {
      try {
        details = await buildAnilistDetails(anilistId, malId, canonicalAnikumeId, externalLinks, clientIp, userTimezone);
      } catch (err) {
        console.warn("AniList details fetch failed, falling back to MAL:", err);
      }
    }
    if (!details && malId) {
      try {
        details = await buildMalDetails(malId, anilistId, canonicalAnikumeId, externalLinks, clientIp, userTimezone);
      } catch (err) {
        console.error("MAL details fetch fallback failed:", err);
      }
    }
  }

  if (!details) {
    throw { status: 404, code: "ANIME_NOT_FOUND", message: `Anime details not found for ID: ${id}` };
  }

  if (details.recommendations.length === 0) {
    try {
      const { browseAnime } = await import("./Catalog.js");
      const genreToSearch = details.genres?.[0] || "Action";
      const fallbackResult = await browseAnime({ genre: genreToSearch, sort: "POPULARITY_DESC" }, clientIp);
      const filtered = fallbackResult.media.filter((r: any) => r.anikume_id !== canonicalAnikumeId);
      details.recommendations = filtered.slice(0, 10).map((r: any) => ({
        anikume_id: r.anikume_id,
        title: r.title,
        poster: r.poster,
        format: r.format,
        status: r.status,
        is_adult: r.is_adult
      }));
    } catch (e) {}
  }

  if (details) {
    try {
      const tvdbVal = mapping?.tvdb_id || mapping?.thetvdb_id || mapping?.tvdb;
      const tmdbVal = mapping?.tmdb_id || mapping?.themoviedb_id || mapping?.tmdb;
      const isMovie = details.format === "Movie" || details.format === "MOVIE";
      details.logo = await getHeroClearLogo(tvdbVal, tmdbVal, isMovie, anilistId, malId);
    } catch (e) {
      details.logo = details.logo || null;
    }
  }

  return details;
}

async function buildAnilistDetails(
  anilistId: number,
  malId: number | null,
  canonicalAnikumeId: string,
  externalLinks: any[],
  clientIp?: string,
  userTimezone = "UTC"
) {
  const rawMedia = await fetchAnilistDetails(anilistId, clientIp);
  const normStatus = normalizeStatus(rawMedia.status);
  const isUpcomingAnime = normStatus === "UPCOMING" || rawMedia.status === "NOT_YET_RELEASED" || rawMedia.nextAiringEpisode?.episode === 1;
  let nextAiringObj: any = null;
  let formattedReleaseDate: string | null = null;

  if (isUpcomingAnime) {
    formattedReleaseDate =
      formatUpcomingReleaseDate(rawMedia.nextAiringEpisode?.airingAt, rawMedia.startDate, null, userTimezone) ||
      (rawMedia.seasonYear ? `${rawMedia.seasonYear}` : null);
  } else if (rawMedia.nextAiringEpisode?.airingAt) {
    const airingTimestamp = rawMedia.nextAiringEpisode.airingAt;
    nextAiringObj = formatNextAiringEpisode(rawMedia.nextAiringEpisode.episode, airingTimestamp, userTimezone);
  }

  let trailerObj: any = null;
  if (rawMedia.trailer?.site === "youtube" && rawMedia.trailer.id) {
    trailerObj = {
      id: rawMedia.trailer.id,
      site: "youtube",
      url: `https://www.youtube.com/watch?v=${rawMedia.trailer.id}`,
      thumbnail: rawMedia.trailer.thumbnail || `https://i.ytimg.com/vi/${rawMedia.trailer.id}/hqdefault.jpg`
    };
  }

  const characterList = (rawMedia.characters?.edges || []).map((edge: any) => {
    const charNode = edge.node;
    const primaryVa = edge.voiceActors?.[0];
    return {
      character: charNode?.name?.full || charNode?.name?.native || null,
      role: edge.role === "MAIN" ? "MAIN" : "SUPPORTING",
      image: charNode?.image?.large || charNode?.image?.medium || null,
      actor: primaryVa ? primaryVa.name?.full || primaryVa.name?.native || null : null,
      actor_image: primaryVa ? primaryVa.image?.large || primaryVa.image?.medium || null : null,
      language: primaryVa ? primaryVa.languageV2 || "Japanese" : null
    };
  });

  const relationEdges = (rawMedia.relations?.edges || []).filter((edge: any) => edge.node?.type === "ANIME");
  const relationIdPairs = relationEdges.map((edge: any) => ({
    anilist_id: edge.node?.id || null,
    mal_id: edge.node?.idMal || null
  }));

  const recRawList = (rawMedia.recommendations?.nodes || [])
    .map((node: any) => node.mediaRecommendation)
    .filter((rec: any) => rec && (rec.type === "ANIME" || !rec.type))
    .slice(0, 10)
    .map((rec: any) => {
      const poster2 = rec.coverImage?.extraLarge || rec.coverImage?.large || rec.coverImage?.medium || null;
      const banner2 = rec.bannerImage || poster2;
      return {
        anilist_id: rec.id,
        mal_id: rec.idMal,
        title: rec.title,
        poster: poster2,
        banner: banner2,
        description: cleanDescription(rec.description),
        rating: formatRating(rec.averageScore),
        status: rec.status,
        format: rec.format,
        year: rec.seasonYear || null,
        season: rec.season || null,
        genres: rec.genres || [],
        is_adult: false
      };
    });

  const recIdPairs = recRawList.map((rec: any) => ({ anilist_id: rec.anilist_id || null, mal_id: rec.mal_id || null }));
  const combinedAnikumeIds = await getOrCreateAnikumeIdsBatch([...relationIdPairs, ...recIdPairs]);
  const relationAnikumeIds = combinedAnikumeIds.slice(0, relationIdPairs.length);
  const recAnikumeIds = combinedAnikumeIds.slice(relationIdPairs.length);

  const relationList = relationEdges.map((edge: any, idx: number) => {
    const node = edge.node;
    const poster2 = node.coverImage?.extraLarge || node.coverImage?.large || null;
    return {
      relation: formatRelationType(edge.relationType),
      anikume_id: relationAnikumeIds[idx] || null,
      title: { romaji: node.title?.romaji || null, english: node.title?.english || null, native: node.title?.native || null },
      poster: poster2,
      rating: formatRating(node.averageScore),
      format: normalizeFormat(node.format),
      status: normalizeStatus(node.status),
      is_adult: false
    };
  });

  const recommendations = await mapAndFormatAnimeItemsBatch(recRawList, new Map());
  const studios = (rawMedia.studios?.edges || []).map((e: any) => e.node?.name).filter(Boolean);
  const poster = rawMedia.coverImage?.extraLarge || rawMedia.coverImage?.large || rawMedia.coverImage?.medium || null;
  const banner = rawMedia.bannerImage || poster;

  return {
    is_adult: false,
    title: {
      romaji: rawMedia.title?.romaji || null,
      english: rawMedia.title?.english || null,
      native: rawMedia.title?.native || null,
      synonyms: rawMedia.synonyms || []
    },
    poster,
    banner,
    rating: formatRating(rawMedia.averageScore),
    status: isUpcomingAnime ? "UPCOMING" : normalizeStatus(rawMedia.status),
    format: normalizeFormat(rawMedia.format),
    score: rawMedia.averageScore ? rawMedia.averageScore / 10 : null,
    year: rawMedia.seasonYear || null,
    source: rawMedia.source || null,
    studios,
    ...(isUpcomingAnime ? { release_date: formattedReleaseDate || null } : { next_airing_episode: nextAiringObj }),
    trailer: trailerObj,
    synopsis: cleanDescription(rawMedia.description),
    genres: rawMedia.genres || [],
    related: relationList,
    external_links: externalLinks,
    characters: characterList,
    recommendations
  };
}

async function buildMalDetails(
  malId: number,
  anilistId: number | null,
  canonicalAnikumeId: string,
  externalLinks: any[],
  clientIp?: string,
  userTimezone = "UTC"
) {
  const [malData, characterList] = await Promise.all([
    fetchMalDetails(malId, clientIp),
    fetchMalCharactersWithVoiceActors(malId, clientIp)
  ]);

  const isAdult = Boolean(
    malData.nsfw === "black" ||
      malData.nsfw === "gray" ||
      malData.rating === "rx" ||
      malData.genres?.some((g: any) => g.name === "Hentai" || g.name === "Erotica")
  );

  const normMalStatus = normalizeStatus(malData.status);
  const isMalUpcoming = normMalStatus === "UPCOMING" || malData.status === "not_yet_aired";
  let nextAiringObj: any = null;
  let formattedReleaseDate: string | null = null;

  if (isMalUpcoming) {
    formattedReleaseDate =
      formatUpcomingReleaseDate(null, null, malData.start_date, userTimezone) ||
      (malData.start_season?.year ? `${malData.start_season.year}` : null);
  } else if (malData.status === "currently_airing" && malData.broadcast) {
    nextAiringObj = calculateNextAiringFromMalBroadcast(malData.broadcast, userTimezone);
  }

  let trailerObj: any = null;
  const videos = malData.videos || [];
  if (Array.isArray(videos) && videos.length > 0) {
    for (const v of videos) {
      if (!v) continue;
      const url = v.url || "";
      let videoId: string | null = null;
      let site = "youtube";
      const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (ytMatch) {
        videoId = ytMatch[1];
        site = "youtube";
      } else if (v.id) {
        videoId = String(v.id);
      }
      if (videoId) {
        trailerObj = {
          id: videoId,
          site,
          url: site === "youtube" ? `https://www.youtube.com/watch?v=${videoId}` : url,
          thumbnail: v.thumbnail || (site === "youtube" ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null)
        };
        break;
      }
    }
  }

  if (!trailerObj) {
    let resolvedAniId = anilistId;
    if (!resolvedAniId) {
      try {
        const { mapMalToAnilist } = await import("./mapper.js");
        const mapped = await mapMalToAnilist(malId);
        if (mapped) resolvedAniId = parseInt(mapped, 10) || null;
      } catch {}
    }
    if (resolvedAniId) {
      try {
        const aniData = await fetchAnilistDetails(resolvedAniId, clientIp);
        if (aniData?.trailer?.site === "youtube" && aniData.trailer.id) {
          trailerObj = {
            id: aniData.trailer.id,
            site: "youtube",
            url: `https://www.youtube.com/watch?v=${aniData.trailer.id}`,
            thumbnail: aniData.trailer.thumbnail || `https://i.ytimg.com/vi/${aniData.trailer.id}/hqdefault.jpg`
          };
        } else if (aniData?.trailer?.id && aniData?.trailer?.site) {
          trailerObj = {
            id: aniData.trailer.id,
            site: aniData.trailer.site,
            url: aniData.trailer.site === "dailymotion" ? `https://www.dailymotion.com/video/${aniData.trailer.id}` : null,
            thumbnail: aniData.trailer.thumbnail || null
          };
        }
        if (isMalUpcoming && aniData?.nextAiringEpisode?.airingAt) {
          const formattedWithTime = formatUpcomingReleaseDate(
            aniData.nextAiringEpisode.airingAt,
            aniData.startDate,
            null,
            userTimezone
          );
          if (formattedWithTime) {
            formattedReleaseDate = formattedWithTime;
          }
        }
      } catch {}
    }
  }


  const relationEdges = malData.related_anime || [];
  const relationIdPairs = relationEdges.map((rel: any) => ({ mal_id: rel.node?.id || null }));

  let recRawList = (malData.recommendations || []).slice(0, 10).map((rec: any) => {
    const node = rec.node;
    const rawPoster = node?.main_picture?.large || node?.main_picture?.medium || null;
    return {
      mal_id: node?.id,
      title: {
        romaji: node?.title || null,
        english: node?.alternative_titles?.en || node?.title || null,
        native: node?.alternative_titles?.ja || null
      },
      poster: getMalLargePoster(rawPoster),
      banner: getMalLargePoster(rawPoster),
      description: node?.synopsis ? cleanDescription(node.synopsis) : null,
      rating: node?.mean ? formatRating(node.mean) : null,
      status: node?.status ? normalizeStatus(node.status) : null,
      format: node?.media_type ? normalizeFormat(node.media_type) : null,
      is_adult: false
    };
  });

  if (recRawList.length === 0) {
    try {
      const fallbackRes = await fetch(
        `https://api.myanimelist.net/v2/anime/ranking?ranking_type=bypopularity&limit=10`,
        { headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) } }
      );
      if (fallbackRes.ok) {
        const fJson = await fallbackRes.json();
        recRawList = (fJson.data || []).map((entry: any) => {
          const n = entry.node;
          const p = getMalLargePoster(n.main_picture?.large || n.main_picture?.medium);
          return {
            mal_id: n.id,
            title: { romaji: n.title, english: n.title, native: null },
            poster: p,
            banner: p,
            description: null,
            rating: null,
            status: null,
            format: null,
            is_adult: false
          };
        });
      }
    } catch {}
  }

  const recIdPairs = recRawList.map((rec: any) => ({ mal_id: rec.mal_id || null }));
  const combinedAnikumeIds = await getOrCreateAnikumeIdsBatch([...relationIdPairs, ...recIdPairs]);
  const relationAnikumeIds = combinedAnikumeIds.slice(0, relationIdPairs.length);

  const relationList = relationEdges.map((rel: any, idx: number) => {
    const node = rel.node;
    const rawPoster = node?.main_picture?.large || node?.main_picture?.medium || null;
    return {
      relation: formatRelationType(rel.relation_type_formatted || rel.relation_type || "Other"),
      anikume_id: relationAnikumeIds[idx] || null,
      title: {
        romaji: node?.title || null,
        english: node?.alternative_titles?.en || node?.title || null,
        native: node?.alternative_titles?.ja || null
      },
      poster: getMalLargePoster(rawPoster),
      rating: formatRating(node?.mean),
      format: node?.media_type ? normalizeFormat(node.media_type) : null,
      status: node?.status ? normalizeStatus(node.status) : null,
      is_adult: false
    };
  });

  const recommendations = await mapAndFormatAnimeItemsBatch(recRawList, new Map());
  const poster = getMalLargePoster(malData.main_picture?.large || malData.main_picture?.medium);
  const banner = poster;
  const studios = (malData.studios || []).map((s: any) => s.name).filter(Boolean);

  return {
    is_adult: isAdult,
    title: {
      romaji: malData.title || null,
      english: malData.alternative_titles?.en || malData.title || null,
      native: malData.alternative_titles?.ja || null,
      synonyms: malData.alternative_titles?.synonyms || []
    },
    poster,
    banner,
    rating: formatRating(malData.mean),
    status: isMalUpcoming ? "UPCOMING" : normalizeStatus(malData.status),
    format: normalizeFormat(malData.media_type),
    score: malData.mean ? Number(malData.mean.toFixed(2)) : null,
    year:
      malData.start_season?.year ||
      (malData.start_date ? parseInt(malData.start_date.substring(0, 4), 10) : null) ||
      null,
    source: malData.source ? String(malData.source).toUpperCase() : null,
    studios,
    ...(isMalUpcoming ? { release_date: formattedReleaseDate || null } : { next_airing_episode: nextAiringObj }),
    trailer: trailerObj,
    synopsis: cleanDescription(malData.synopsis),
    genres: (malData.genres || []).map((g: any) => g.name),
    related: relationList,
    external_links: externalLinks,
    characters: characterList,
    recommendations
  };
}

export function formatAgeRating(rawRating?: string | null, isAdult?: boolean, genres: string[] = []): string {
  if (rawRating) {
    const lower = rawRating.toLowerCase().replace(/[-_]/g, " ").trim();
    if (lower === "g" || lower.startsWith("g ")) return "G";
    if (lower.includes("pg 13") || lower.includes("13")) return "PG-13";
    if (lower === "pg" || lower.startsWith("pg ")) return "PG";
    if (lower === "rx" || lower.includes("hentai")) return "Rx";
    if (lower === "r+" || lower.includes("r +") || lower.includes("mild")) return "R+";
    if (lower === "r" || lower.includes("17") || lower.includes("violence")) return "R";
    return rawRating.toUpperCase();
  }
  if (isAdult) return "Rx";
  if (genres.some((g) => String(g).toLowerCase() === "ecchi")) return "R+";
  if (genres.some((g) => ["horror", "psychological", "thriller", "action"].includes(String(g).toLowerCase()))) return "R";
  return "PG-13";
}

export function mergeTags(tagsA: string[] = [], tagsB: string[] = []): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const t of [...tagsA, ...tagsB]) {
    if (!t || typeof t !== "string") continue;
    const clean = t.trim();
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      merged.push(clean);
    }
  }
  return merged;
}

export async function fetchMalThemesAndDemographics(malId: number, clientIp?: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=themes,demographics`, {
      headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) },
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const themes = (data.themes || []).map((t: any) => t.name).filter(Boolean);
    const demographics = (data.demographics || []).map((d: any) => d.name).filter(Boolean);
    return [...themes, ...demographics];
  } catch {
    return [];
  }
}

export async function fetchAnilistTags(anilistId: number, clientIp?: string): Promise<string[]> {
  try {
    const query = `query ($id: Int) { Media(id: $id, type: ANIME) { tags { name isMediaSpoiler } } }`;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data?.Media?.tags || [])
      .filter((t: any) => !t.isMediaSpoiler)
      .map((t: any) => t.name)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function getAnimeOverviewDetails(
  id: string,
  trackerParam?: string,
  providerParam?: string,
  clientIp?: string
) {
  const { response } = await getOverview({
    id,
    tracker: trackerParam,
    use: providerParam,
    fresh: true,
    clientIp
  });
  return response;
}

export async function getAnimeCharacters(
  id: string,
  trackerParam?: string,
  providerParam?: string,
  clientIp?: string,
  limitParam?: number
) {
  const rawId = (id || "").trim();
  const rawTracker = (trackerParam || "").trim().toLowerCase();
  const isNumericId = /^\d+$/.test(rawId);

  // 1. Validate numeric ID: direct numeric AniList/MAL ID not allowed unless tracker is provided
  if (isNumericId) {
    if (!rawTracker || rawTracker === "anikume") {
      throw {
        status: 400,
        code: "TRACKER_REQUIRED",
        message: "Numeric ID requires an explicit tracker parameter (e.g. ?tracker=anilist or ?tracker=mal)"
      };
    }
  }

  const tracker = rawTracker || "anikume";
  let canonicalAnikumeId: string | null = null;
  let anilistId: number | null = null;
  let malId: number | null = null;

  if (tracker === "anilist") {
    anilistId = parseInt(rawId, 10) || null;
    if (anilistId) {
      const existing = await findByTrackerId("anilist", String(anilistId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        malId = existing.mal_id ? parseInt(existing.mal_id, 10) : null;
      }
    }
  } else if (tracker === "mal") {
    malId = parseInt(rawId, 10) || null;
    if (malId) {
      const existing = await findByTrackerId("mal", String(malId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        anilistId = existing.anilist_id ? parseInt(existing.anilist_id, 10) : null;
      }
    }
  } else {
    const record = await findByAnikumeId(rawId);
    if (record) {
      canonicalAnikumeId = record.anikume_id;
      anilistId = record.anilist_id ? parseInt(record.anilist_id, 10) : null;
      malId = record.mal_id ? parseInt(record.mal_id, 10) : null;
    } else {
      throw {
        status: 404,
        code: "ANIME_NOT_FOUND",
        message: `Anime not found for ID: ${rawId}`
      };
    }
  }

  // Helper to resolve missing partner ID only when needed for fallback
  const ensurePartnerId = async () => {
    if (anilistId && !malId) {
      try {
        const mapping = await getAnimeMappingWithBoundaries("anilist", String(anilistId));
        if (mapping?.mal_id) malId = parseInt(String(mapping.mal_id), 10);
      } catch {}
    } else if (malId && !anilistId) {
      try {
        const mapping = await getAnimeMappingWithBoundaries("mal", String(malId));
        if (mapping?.anilist_id) anilistId = parseInt(String(mapping.anilist_id), 10);
      } catch {}
    }
  };

  let characterList: any[] = [];
  let totalCharacters = 0;
  let effectiveTracker = tracker === "mal" ? "mal" : "anilist";

  const fetchAnilistCharacters = async () => {
    if (!anilistId) throw new Error("No AniList ID");
    const fetchPerPage = 100;
    const query = `
      query ($id: Int, $perPage: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          characters(sort: [ROLE, RELEVANCE], perPage: $perPage) {
            pageInfo {
              total
            }
            edges {
              role
              node {
                id
                name { full native }
                image { large medium }
              }
              voiceActors(sort: [RELEVANCE, ID]) {
                id
                name { full native }
                languageV2
                image { large medium }
              }
            }
          }
        }
      }
    `;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
      body: JSON.stringify({ query, variables: { id: anilistId, perPage: fetchPerPage } }),
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`AniList characters returned status ${res.status}`);
    const json = await res.json();
    const media = json.data?.Media;
    if (!media) throw new Error("AniList returned empty Media for characters");

    const edges = media.characters?.edges || [];
    totalCharacters = media.characters?.pageInfo?.total || edges.length;

    characterList = edges.map((edge: any) => {
      const charNode = edge.node;
      const vaList = edge.voiceActors || [];
      const primaryVa =
        vaList.find((v: any) => v.languageV2 === "Japanese" || v.language === "JAPANESE") ||
        vaList[0] ||
        null;

      return {
        character: charNode?.name?.full || charNode?.name?.native || null,
        role: edge.role === "MAIN" ? "MAIN" : "SUPPORTING",
        image: charNode?.image?.large || charNode?.image?.medium || null,
        actor: primaryVa ? primaryVa.name?.full || primaryVa.name?.native || null : null,
        language: primaryVa ? primaryVa.languageV2 || "Japanese" : null,
        actor_image: primaryVa ? primaryVa.image?.large || primaryVa.image?.medium || null : null
      };
    });
  };

  const fetchMalCharacters = async () => {
    if (!malId) throw new Error("No MAL ID");
    const malChars = await fetchMalCharactersWithVoiceActors(malId, clientIp);
    if (!malChars || malChars.length === 0) throw new Error("No MAL characters found");
    characterList = malChars;
    totalCharacters = malChars.length;
    effectiveTracker = "mal";
  };

  const rawProvider = (providerParam || "").trim().toLowerCase();
  if (rawProvider && rawProvider !== "anilist" && rawProvider !== "mal") {
    throw {
      status: 400,
      code: "INVALID_PROVIDER",
      message: "Invalid provider. Supported: anilist, mal"
    };
  }

  const effectiveProvider = rawProvider || "anilist";
  let actualProvider = effectiveProvider;

  if (effectiveProvider === "mal") {
    if (!malId) await ensurePartnerId();
    if (!malId) {
      if (rawProvider === "mal") {
        throw { status: 404, code: "MAL_ID_NOT_FOUND", message: `No MAL ID mapped for ID: ${rawId}` };
      }
      if (anilistId) {
        await fetchAnilistCharacters();
        actualProvider = "anilist";
      } else {
        throw { status: 404, code: "CHARACTERS_NOT_FOUND", message: `Characters not found for ID: ${rawId}` };
      }
    } else {
      try {
        await fetchMalCharacters();
        actualProvider = "mal";
      } catch (malErr) {
        if (rawProvider === "mal") {
          throw { status: 500, code: "MAL_FETCH_ERROR", message: `Failed to fetch characters from MAL: ${malErr.message || malErr}` };
        }
        console.warn("MAL character fetch failed, falling back to AniList:", malErr);
        if (!anilistId) await ensurePartnerId();
        if (anilistId) {
          await fetchAnilistCharacters();
          actualProvider = "anilist";
        } else {
          throw { status: 404, code: "CHARACTERS_NOT_FOUND", message: `Characters not found for ID: ${rawId}` };
        }
      }
    }
  } else {
    // effectiveProvider === "anilist"
    if (!anilistId) await ensurePartnerId();
    if (!anilistId) {
      if (rawProvider === "anilist") {
        throw { status: 404, code: "ANILIST_ID_NOT_FOUND", message: `No AniList ID mapped for ID: ${rawId}` };
      }
      if (malId) {
        await fetchMalCharacters();
        actualProvider = "mal";
      } else {
        throw { status: 404, code: "CHARACTERS_NOT_FOUND", message: `Characters not found for ID: ${rawId}` };
      }
    } else {
      try {
        await fetchAnilistCharacters();
        actualProvider = "anilist";
      } catch (aniErr) {
        if (rawProvider === "anilist") {
          throw { status: 500, code: "ANILIST_FETCH_ERROR", message: `Failed to fetch characters from AniList: ${aniErr.message || aniErr}` };
        }
        console.warn("AniList character fetch failed, falling back to MAL:", aniErr);
        if (!malId) await ensurePartnerId();
        if (malId) {
          await fetchMalCharacters();
          actualProvider = "mal";
        } else {
          throw { status: 404, code: "CHARACTERS_NOT_FOUND", message: `Characters not found for ID: ${rawId}` };
        }
      }
    }
  }

  return {
    data: "character",
    total: totalCharacters,
    results: characterList
  };
}

export async function getAnimeRecommendations(
  id: string,
  trackerParam?: string,
  providerParam?: string,
  clientIp?: string,
  limitParam?: number
) {
  const rawId = (id || "").trim();
  const rawTracker = (trackerParam || "").trim().toLowerCase();
  const isNumericId = /^\d+$/.test(rawId);

  // 1. Validate numeric ID: direct numeric AniList/MAL ID not allowed unless tracker is provided
  if (isNumericId) {
    if (!rawTracker || rawTracker === "anikume") {
      throw {
        status: 400,
        code: "TRACKER_REQUIRED",
        message: "Numeric ID requires an explicit tracker parameter (e.g. ?tracker=anilist or ?tracker=mal)"
      };
    }
  }

  const tracker = rawTracker || "anikume";
  let canonicalAnikumeId: string | null = null;
  let anilistId: number | null = null;
  let malId: number | null = null;

  if (tracker === "anilist") {
    anilistId = parseInt(rawId, 10) || null;
    if (anilistId) {
      const existing = await findByTrackerId("anilist", String(anilistId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        malId = existing.mal_id ? parseInt(existing.mal_id, 10) : null;
      }
    }
  } else if (tracker === "mal") {
    malId = parseInt(rawId, 10) || null;
    if (malId) {
      const existing = await findByTrackerId("mal", String(malId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        anilistId = existing.anilist_id ? parseInt(existing.anilist_id, 10) : null;
      }
    }
  } else {
    const record = await findByAnikumeId(rawId);
    if (record) {
      canonicalAnikumeId = record.anikume_id;
      anilistId = record.anilist_id ? parseInt(record.anilist_id, 10) : null;
      malId = record.mal_id ? parseInt(record.mal_id, 10) : null;
    } else {
      throw {
        status: 404,
        code: "ANIME_NOT_FOUND",
        message: `Anime not found for ID: ${rawId}`
      };
    }
  }

  // Helper to resolve missing partner ID only when needed for fallback
  const ensurePartnerId = async () => {
    if (anilistId && !malId) {
      try {
        const mapping = await getAnimeMappingWithBoundaries("anilist", String(anilistId));
        if (mapping?.mal_id) malId = parseInt(String(mapping.mal_id), 10);
      } catch {}
    } else if (malId && !anilistId) {
      try {
        const mapping = await getAnimeMappingWithBoundaries("mal", String(malId));
        if (mapping?.anilist_id) anilistId = parseInt(String(mapping.anilist_id), 10);
      } catch {}
    }
  };

  let recommendationsList: any[] = [];
  let totalRecs = 0;

  const fetchAnilistRecommendations = async () => {
    if (!anilistId) throw new Error("No AniList ID");
    const fetchPerPage = 50;
    const query = `
      query ($id: Int, $perPage: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          recommendations(perPage: $perPage, sort: [RATING_DESC, ID]) {
            pageInfo {
              total
            }
            nodes {
              mediaRecommendation {
                id
                idMal
                isAdult
                format
                status
                averageScore
                title {
                  romaji
                  english
                  native
                }
                coverImage {
                  extraLarge
                  large
                  medium
                }
              }
            }
          }
        }
      }
    `;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
      body: JSON.stringify({ query, variables: { id: anilistId, perPage: fetchPerPage } }),
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`AniList recommendations returned status ${res.status}`);
    const json = await res.json();
    const media = json.data?.Media;
    if (!media) throw new Error("AniList returned empty Media for recommendations");

    const rawNodes = (media.recommendations?.nodes || [])
      .map((n: any) => n.mediaRecommendation)
      .filter((r: any) => r && r.id);

    totalRecs = media.recommendations?.pageInfo?.total || rawNodes.length;

    const itemsToResolve = rawNodes.map((r: any) => ({
      anilist_id: String(r.id),
      mal_id: r.idMal ? String(r.idMal) : null
    }));
    const anikumeIds = await getOrCreateAnikumeIdsBatch(itemsToResolve);

    recommendationsList = rawNodes.map((r: any, idx: number) => ({
      anikume_id: anikumeIds[idx] || null,
      title: {
        romaji: r.title?.romaji || null,
        english: r.title?.english || r.title?.romaji || null,
        native: r.title?.native || null
      },
      poster: r.coverImage?.extraLarge || r.coverImage?.large || r.coverImage?.medium || null,
      rating: formatRating(r.averageScore),
      format: normalizeFormat(r.format),
      status: normalizeStatus(r.status),
      is_adult: Boolean(r.isAdult)
    }));
  };

  const fetchMalRecommendations = async () => {
    if (!malId) throw new Error("No MAL ID");
    const fields = "recommendations{node{id,title,main_picture,media_type,status,alternative_titles,nsfw,genres,mean},num_recommendations}";
    const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=${fields}`, {
      headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) },
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`MAL recommendations returned status ${res.status}`);
    const malData = await res.json();
    const rawNodes = (malData.recommendations || [])
      .map((r: any) => r.node)
      .filter((n: any) => n && n.id);

    totalRecs = rawNodes.length;

    const itemsToResolve = rawNodes.map((n: any) => ({
      anilist_id: null,
      mal_id: String(n.id)
    }));
    const anikumeIds = await getOrCreateAnikumeIdsBatch(itemsToResolve);

    recommendationsList = rawNodes.map((n: any, idx: number) => {
      const rawPoster = n.main_picture?.large || n.main_picture?.medium || null;
      const isAdult = Boolean(
        n.nsfw === "black" ||
        n.nsfw === "gray" ||
        n.genres?.some((g: any) => g.name === "Hentai" || g.name === "Erotica")
      );
      return {
        anikume_id: anikumeIds[idx] || null,
        title: {
          romaji: n.title || null,
          english: n.alternative_titles?.en || n.title || null,
          native: n.alternative_titles?.ja || null
        },
        poster: getMalLargePoster(rawPoster),
        rating: formatRating(n.mean),
        format: normalizeFormat(n.media_type),
        status: normalizeStatus(n.status),
        is_adult: isAdult
      };
    });
  };

  const rawProvider = (providerParam || "").trim().toLowerCase();
  if (rawProvider && rawProvider !== "anilist" && rawProvider !== "mal") {
    throw {
      status: 400,
      code: "INVALID_PROVIDER",
      message: "Invalid provider. Supported: anilist, mal"
    };
  }

  const effectiveProvider = rawProvider || "anilist";
  let actualProvider = effectiveProvider;

  if (effectiveProvider === "mal") {
    if (!malId) await ensurePartnerId();
    if (!malId) {
      if (rawProvider === "mal") {
        throw { status: 404, code: "MAL_ID_NOT_FOUND", message: `No MAL ID mapped for ID: ${rawId}` };
      }
      if (anilistId) {
        await fetchAnilistRecommendations();
        actualProvider = "anilist";
      } else {
        throw { status: 404, code: "RECOMMENDATIONS_NOT_FOUND", message: `Recommendations not found for ID: ${rawId}` };
      }
    } else {
      try {
        await fetchMalRecommendations();
        actualProvider = "mal";
      } catch (malErr) {
        if (rawProvider === "mal") {
          throw { status: 500, code: "MAL_FETCH_ERROR", message: `Failed to fetch recommendations from MAL: ${malErr.message || malErr}` };
        }
        console.warn("MAL recommendations fetch failed, falling back to AniList:", malErr);
        if (!anilistId) await ensurePartnerId();
        if (anilistId) {
          await fetchAnilistRecommendations();
          actualProvider = "anilist";
        } else {
          throw { status: 404, code: "RECOMMENDATIONS_NOT_FOUND", message: `Recommendations not found for ID: ${rawId}` };
        }
      }
    }
  } else {
    // effectiveProvider === "anilist"
    if (!anilistId) await ensurePartnerId();
    if (!anilistId) {
      if (rawProvider === "anilist") {
        throw { status: 404, code: "ANILIST_ID_NOT_FOUND", message: `No AniList ID mapped for ID: ${rawId}` };
      }
      if (malId) {
        await fetchMalRecommendations();
        actualProvider = "mal";
      } else {
        throw { status: 404, code: "RECOMMENDATIONS_NOT_FOUND", message: `Recommendations not found for ID: ${rawId}` };
      }
    } else {
      try {
        await fetchAnilistRecommendations();
        actualProvider = "anilist";
      } catch (aniErr) {
        if (rawProvider === "anilist") {
          throw { status: 500, code: "ANILIST_FETCH_ERROR", message: `Failed to fetch recommendations from AniList: ${aniErr.message || aniErr}` };
        }
        console.warn("AniList recommendations fetch failed, falling back to MAL:", aniErr);
        if (!malId) await ensurePartnerId();
        if (malId) {
          await fetchMalRecommendations();
          actualProvider = "mal";
        } else {
          throw { status: 404, code: "RECOMMENDATIONS_NOT_FOUND", message: `Recommendations not found for ID: ${rawId}` };
        }
      }
    }
  }

  return {
    data: "recommendation",
    total: totalRecs,
    results: recommendationsList
  };
}

export async function getAnimeSeason(
  rawId: string,
  rawTracker?: string,
  rawProvider?: string,
  clientIp?: string,
  isFresh = false
) {
  const cleanId = String(rawId || "").trim();
  const rawTrackerClean = (rawTracker || "").trim().toLowerCase();
  const isNumericId = /^\d+$/.test(cleanId);
  if (isNumericId) {
    if (!rawTrackerClean || rawTrackerClean === "anikume") {
      throw {
        status: 400,
        code: "TRACKER_REQUIRED",
        message: "Numeric ID requires an explicit tracker parameter (e.g. ?tracker=anilist or ?tracker=mal)"
      };
    }
  }

  const tracker = rawTrackerClean || "anikume";
  let canonicalAnikumeId: string | null = null;
  let anilistId: number | null = null;
  let malId: number | null = null;

  if (tracker === "anilist") {
    anilistId = parseInt(cleanId, 10) || null;
    if (anilistId) {
      const existing = await findByTrackerId("anilist", String(anilistId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        malId = existing.mal_id ? parseInt(existing.mal_id, 10) : null;
      }
    }
  } else if (tracker === "mal") {
    malId = parseInt(cleanId, 10) || null;
    if (malId) {
      const existing = await findByTrackerId("mal", String(malId));
      if (existing) {
        canonicalAnikumeId = existing.anikume_id;
        anilistId = existing.anilist_id ? parseInt(existing.anilist_id, 10) : null;
      }
    }
  } else {
    const record = await findByAnikumeId(cleanId);
    if (record) {
      canonicalAnikumeId = record.anikume_id;
      anilistId = record.anilist_id ? parseInt(record.anilist_id, 10) : null;
      malId = record.mal_id ? parseInt(record.mal_id, 10) : null;
    } else {
      throw {
        status: 404,
        code: "ANIME_NOT_FOUND",
        message: `Anime not found for ID: ${rawId}`
      };
    }
  }

  const fribb = await getFribbDataset().catch(() => null);

  // Fast hero_slider-style mapper helper: Fribb (0ms) -> AniBridge (0ms) -> AniZip
  const mapAnilistToMalFast = async (aId: number | string): Promise<number | null> => {
    const key = String(aId).trim();
    if (!key) return null;
    const fribbEntry = fribb?.index ? fribb.index.get(`anilist:${key}`) : null;
    if (fribbEntry?.mal_id) {
      const parsed = parseInt(String(fribbEntry.mal_id), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const bridgeEntry = await getAnibridgeFullMapping(key, null).catch(() => null);
    if (bridgeEntry?.mal_id) {
      const parsed = parseInt(String(bridgeEntry.mal_id), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const aniZip = await fetchAniZip({ anilist_id: key }).catch(() => null);
    if (aniZip?.mappings?.mal_id) {
      const parsed = parseInt(String(aniZip.mappings.mal_id), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
  };

  const mapMalToAnilistFast = async (mId: number | string): Promise<string | null> => {
    const key = String(mId).trim();
    if (!key) return null;
    const fribbEntry = fribb?.index ? fribb.index.get(`mal:${key}`) : null;
    if (fribbEntry?.anilist_id) {
      return String(fribbEntry.anilist_id);
    }
    const bridgeEntry = await getAnibridgeFullMapping(null, key).catch(() => null);
    if (bridgeEntry?.anilist_id) {
      return String(bridgeEntry.anilist_id);
    }
    const aniZip = await fetchAniZip({ mal_id: key }).catch(() => null);
    if (aniZip?.mappings?.anilist_id) {
      return String(aniZip.mappings.anilist_id);
    }
    return null;
  };

  // Map AniList to MAL first if MAL ID is not already known so Chiaki can run directly by MAL ID
  if (anilistId && !malId) {
    malId = await mapAnilistToMalFast(anilistId);
  }

  const ensurePartnerId = async () => {
    if (anilistId && !malId) {
      malId = await mapAnilistToMalFast(anilistId);
    } else if (malId && !anilistId) {
      const resolvedAni = await mapMalToAnilistFast(malId);
      if (resolvedAni) anilistId = parseInt(resolvedAni, 10) || null;
    }
  };

  const rawProviderClean = (rawProvider || "").trim().toLowerCase();
  const effectiveProvider = rawProviderClean === "mal" || (!rawProviderClean && tracker === "mal") ? "mal" : "anilist";

  let relatedRawPairs: { anilist_id: string | null; mal_id: string | null }[] = [];
  let relatedRawItems: any[] = [];

  const fetchAnilistRelated = async (): Promise<boolean> => {
    if (!anilistId) return false;
    try {
      const query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            idMal
            relations {
              edges {
                relationType
                node {
                  id
                  idMal
                  type
                  isAdult
                  format
                  status
                  averageScore
                  title {
                    romaji
                    english
                    native
                  }
                  coverImage {
                    extraLarge
                    large
                    medium
                  }
                }
              }
            }
          }
        }
      `;
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
        body: JSON.stringify({ query, variables: { id: anilistId } }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return false;
      const json = await res.json();
      const media = json.data?.Media;
      if (!media) return false;

      if (!malId && media.idMal) {
        malId = Number(media.idMal) || null;
      }

      const relationEdges = (media.relations?.edges || []).filter((edge: any) => edge.node?.id);
      relatedRawPairs = relationEdges.map((e: any) => ({
        anilist_id: e.node?.id ? String(e.node.id) : null,
        mal_id: e.node?.idMal ? String(e.node.idMal) : null
      }));

      relatedRawItems = relationEdges.map((edge: any) => {
        const node = edge.node;
        const poster = node.coverImage?.extraLarge || node.coverImage?.large || node.coverImage?.medium || null;
        return {
          title: {
            romaji: node.title?.romaji || null,
            english: node.title?.english || node.title?.romaji || null,
            native: node.title?.native || null
          },
          poster,
          rating: formatRating(node.averageScore),
          format: normalizeFormat(node.format),
          status: normalizeStatus(node.status),
          relation: formatRelationType(edge.relationType),
          is_adult: Boolean(node.isAdult)
        };
      });
      return true;
    } catch (err) {
      console.warn("fetchAnilistRelated error:", err);
      return false;
    }
  };

  const fetchMalRelated = async (): Promise<boolean> => {
    if (!malId) return false;
    try {
      const fields = "id,related_anime{relation_type,relation_type_formatted,node{id,title,main_picture,media_type,status,alternative_titles,nsfw,mean}}";
      const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=${fields}`, {
        headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, ...getForwardedHeaders(clientIp) },
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return false;
      const malData = await res.json();
      if (!malData || !malData.id) return false;

      const relatedAnime = malData.related_anime || [];

      relatedRawPairs = relatedAnime.map((r: any) => {
        const mId = r.node?.id ? String(r.node.id) : null;
        const fribbEntry = mId && fribb?.index ? fribb.index.get(`mal:${mId}`) : null;
        const aId = fribbEntry?.anilist_id ? String(fribbEntry.anilist_id) : null;
        return {
          anilist_id: aId,
          mal_id: mId
        };
      });

      relatedRawItems = relatedAnime.map((r: any) => {
        const node = r.node;
        const rawPoster = node?.main_picture?.large || node?.main_picture?.medium || null;
        const isAdult = Boolean(
          node?.nsfw === "black" ||
          node?.nsfw === "gray"
        );
        return {
          title: {
            romaji: node?.title || null,
            english: node?.alternative_titles?.en || node?.title || null,
            native: node?.alternative_titles?.ja || null
          },
          poster: getMalLargePoster(rawPoster),
          rating: formatRating(node?.mean),
          format: node?.media_type ? normalizeFormat(node.media_type) : null,
          status: node?.status ? normalizeStatus(node.status) : null,
          relation: formatRelationType(r.relation_type_formatted || r.relation_type || "Other"),
          is_adult: isAdult
        };
      });
      return true;
    } catch (err) {
      console.warn("fetchMalRelated error:", err);
      return false;
    }
  };

  // Run 1-database related fetch and direct Chiaki watch_order fetch (by MAL ID) in parallel
  const initialMalId = malId;
  const earlyChiakiPromise = initialMalId
    ? fetchChiakiWatchOrder(initialMalId, isFresh).catch(() => null)
    : Promise.resolve(null);

  const relatedTaskPromise = (async () => {
    if (effectiveProvider === "mal") {
      if (!malId) await ensurePartnerId();
      const okMal = await fetchMalRelated();
      if (!okMal) {
        if (!anilistId) await ensurePartnerId();
        await fetchAnilistRelated();
      }
    } else {
      if (!anilistId) await ensurePartnerId();
      const okAni = await fetchAnilistRelated();
      if (!okAni) {
        if (!malId) await ensurePartnerId();
        await fetchMalRelated();
      }
    }
  })();

  let [chiakiRes] = await Promise.all([earlyChiakiPromise, relatedTaskPromise]);

  // If malId was only discovered during fetchAnilistRelated (via media.idMal), fetch Chiaki directly now
  if (!chiakiRes && !initialMalId && malId) {
    chiakiRes = await fetchChiakiWatchOrder(malId, isFresh).catch(() => null);
  }

  let watchOrderRawPairs: { anilist_id: string | null; mal_id: string | null }[] = [];
  let watchOrderRawItems: any[] = [];

  if (chiakiRes && Array.isArray(chiakiRes.watch_order) && chiakiRes.watch_order.length > 0) {
    const ALLOWED_WATCH_ORDER_FORMATS = new Set([
      "tv",
      "tv show",
      "tv_short",
      "tv short",
      "movie",
      "ova",
      "ona",
      "special",
      "tv special",
      "tv_special"
    ]);
    const items = chiakiRes.watch_order.filter((item: any) => {
      const rawType = String(item.type || "").toLowerCase().trim().replace(/_/g, " ");
      return ALLOWED_WATCH_ORDER_FORMATS.has(rawType);
    });

    // Map each Chiaki item's mal_id -> anilist_id using the same fast mapper as hero_slider:
    // Fribb (0ms) -> AniBridge (0ms) -> AniZip
    watchOrderRawPairs = await Promise.all(
      items.map(async (item: any) => {
        const mIdStr = item.mal_id ? String(item.mal_id) : null;
        let aIdStr = item.anilist_id ? String(item.anilist_id) : null;
        if (!aIdStr && mIdStr) {
          aIdStr = await mapMalToAnilistFast(mIdStr);
        }
        return {
          anilist_id: aIdStr,
          mal_id: mIdStr
        };
      })
    );

    // Build watch_order items directly from Chiaki data (no AniList/MAL metadata queries)
    watchOrderRawItems = items.map((item: any) => ({
      title: {
        romaji: item.title || null,
        english: item.alt_title || item.title || null,
        native: item.title || null
      },
      poster: item.avatar || null,
      rating: formatRating(item.rating?.score),
      format: normalizeFormat(item.type)
    }));
  }

  // Single consolidated batch call for Anikume IDs across both related and watch_order
  const allIdPairs = [...relatedRawPairs, ...watchOrderRawPairs];
  const allAnikumeIds = allIdPairs.length > 0 ? await getOrCreateAnikumeIdsBatch(allIdPairs) : [];

  const relatedAnikumeIds = allAnikumeIds.slice(0, relatedRawPairs.length);
  const watchOrderAnikumeIds = allAnikumeIds.slice(relatedRawPairs.length);

  const relatedList = relatedRawItems.map((item, idx) => ({
    anikume_id: relatedAnikumeIds[idx] || null,
    ...item
  }));

  const watchOrderList = watchOrderRawItems.map((item, idx) => ({
    anikume_id: watchOrderAnikumeIds[idx] || null,
    ...item
  }));

  return {
    data: "season",
    results: {
      watch_order: watchOrderList,
      related: relatedList
    }
  };
}

