// @ts-nocheck
import { resolveSingleAnimeMap, getOrCreateAnikumeId } from "./Ids.js";
import { resolveAniDubForPrefetchedItems } from "./Dub.js";

function getForwardedHeaders(clientIp?: string | null): Record<string, string> {
  if (typeof window !== "undefined" || !clientIp || typeof clientIp !== "string") return {};
  const cleaned = clientIp.split(",")[0].trim().replace(/^::ffff:/i, "");
  if (!cleaned || cleaned === "127.0.0.1" || cleaned === "::1") return {};
  return {
    "X-Forwarded-For": cleaned,
    "X-Real-IP": cleaned,
    "X-Client-IP": cleaned,
    Forwarded: `for=${cleaned}`
  };
}

function formatRating(score: any): string | null {
  if (score === undefined || score === null) return null;
  const num = typeof score === "number" ? score : parseFloat(String(score));
  if (isNaN(num) || num <= 0) return null;
  const val = num > 10 ? num / 10 : num;
  return val.toFixed(1);
}

function cleanDescription(desc: any): string | null {
  if (!desc || typeof desc !== "string") return null;
  const text = desc
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
  return text || null;
}

function normalizeStatus(status: any): string | null {
  if (!status) return null;
  const s = String(status).toUpperCase().trim();
  if (["RELEASING", "AIRING", "CURRENTLY_AIRING", "CURRENT", "ONGOING"].includes(s)) {
    return "RELEASING";
  }
  if (["FINISHED", "COMPLETED", "FINISHED_AIRING"].includes(s)) {
    return "FINISHED";
  }
  if (["UPCOMING", "NOT_YET_RELEASED", "NOT_YET_AIRED", "TO_BE_RELEASED", "NOT YET AIRED"].includes(s)) {
    return "UPCOMING";
  }
  if (["CANCELLED", "CANCELED", "DISCONTINUED"].includes(s)) {
    return "CANCELLED";
  }
  return "FINISHED";
}

function normalizeFormat(format: any): string | null {
  if (!format) return null;
  const f = String(format).toUpperCase().trim();
  if (f === "TV" || f === "TV_SHOW" || f === "TV SHOW") return "TV Show";
  if (f === "TV_SHORT" || f === "TV SHORT") return "TV Short";
  if (f === "MOVIE") return "Movie";
  if (f === "SPECIAL" || f === "TV_SPECIAL") return "Special";
  if (f === "OVA") return "OVA";
  if (f === "ONA") return "ONA";
  if (f === "MUSIC") return "Music";
  return String(format);
}

export type OverviewUse = "anilist" | "mal";
export type OverviewTracker = "anikume" | "anilist" | "mal";

export interface OverviewExternalLink {
  site: string;
  link: string;
  logo: string;
}

export interface OverviewItem {
  anikume_id: string | null;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
    synonyms: string[];
  };
  poster: string | null;
  banner: string | null;
  rating: string | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  episode_duration: number | null;
  total_runtime: number | null;
  status: string | null;
  format: string | null;
  sub: string | null;
  dub: string | null;
  adult: string;
  age_rating: string | null;
  date: string | null;
  season: string | null;
  source: string | null;
  studios: string[];
  trailer: string | null;
  synopsis: string | null;
  genres: string[];
  tags: string[];
  external_links: OverviewExternalLink[];
}

export interface OverviewResponse {
  use: OverviewUse;
  results: OverviewItem;
}

const MAL_CLIENT_ID =
  (typeof process !== "undefined" && process.env?.MAL_CLIENT_ID) ||
  "6114d00ca681b7701d1e15fe11a4987e";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

export function normalizeOverviewUse(rawUse?: string | null): OverviewUse | null {
  if (!rawUse || typeof rawUse !== "string") return null;
  const clean = rawUse.trim().toLowerCase();
  if (clean === "anilist" || clean === "1" || clean === "way1") return "anilist";
  if (clean === "mal" || clean === "myanimelist" || clean === "2" || clean === "way2") return "mal";
  return null;
}

export function normalizeOverviewTracker(rawTracker?: string | null): OverviewTracker | null {
  if (!rawTracker || typeof rawTracker !== "string" || !rawTracker.trim()) return "anikume";
  const clean = rawTracker.trim().toLowerCase();
  if (clean === "anikume") return "anikume";
  if (clean === "anilist") return "anilist";
  if (clean === "mal" || clean === "myanimelist") return "mal";
  return null;
}

function getMalLargePoster(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("cdn.myanimelist.net/images/anime/")) {
    if (/l\.(jpg|jpeg|webp|png)$/i.test(url)) return url;
    return url.replace(/(\d+)\.(jpg|jpeg|webp|png)$/i, "$1l.$2");
  }
  return url;
}

function formatFullDate(year?: number | null, month?: number | null, day?: number | null): string | null {
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

function parseMalDate(dateStr?: string | null): string | null {
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

function formatAgeRating(rawRating?: string | null, isAdult?: boolean, genres: string[] = []): string {
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

function buildExternalLinksFromMapped(
  mapped: any,
  anilistId: number | null,
  malId: number | null,
  formatStr: string | null
): OverviewExternalLink[] {
  const links: { site: string; link: string }[] = [];
  const effectiveAnilistId = anilistId || mapped?.anilist;
  const effectiveMalId = malId || mapped?.mal;
  const isMovie = String(formatStr || mapped?.type || "").toUpperCase() === "MOVIE";

  if (effectiveAnilistId) {
    links.push({ site: "AniList", link: `https://anilist.co/anime/${effectiveAnilistId}` });
  }
  if (effectiveMalId) {
    links.push({ site: "MyAnimeList", link: `https://myanimelist.net/anime/${effectiveMalId}` });
  }
  const tmdbId = mapped?.tmdb?.id ?? (typeof mapped?.tmdb === "string" ? mapped.tmdb : null);
  if (tmdbId && String(tmdbId) !== "null" && String(tmdbId) !== "undefined") {
    links.push({
      site: "The Movie Database",
      link: isMovie ? `https://www.themoviedb.org/movie/${tmdbId}` : `https://www.themoviedb.org/tv/${tmdbId}`
    });
  }
  const tvdbId = mapped?.tvdb?.id ?? (typeof mapped?.tvdb === "string" ? mapped.tvdb : null);
  if (tvdbId && String(tvdbId) !== "null" && String(tvdbId) !== "undefined") {
    links.push({ site: "TheTVDB", link: `https://thetvdb.com/dereferrer/series/${tvdbId}` });
  }
  if (mapped?.anidb && String(mapped.anidb) !== "null") {
    links.push({ site: "AniDB", link: `https://anidb.net/anime/${mapped.anidb}` });
  }
  if (mapped?.["anime-planet"] && String(mapped["anime-planet"]) !== "null") {
    links.push({ site: "Anime-Planet", link: `https://www.anime-planet.com/anime/${mapped["anime-planet"]}` });
  }
  if (mapped?.simkl && String(mapped.simkl) !== "null") {
    links.push({ site: "Simkl", link: `https://simkl.com/anime/${mapped.simkl}` });
  }
  if (mapped?.livechart && String(mapped.livechart) !== "null") {
    links.push({ site: "LiveChart", link: `https://www.livechart.me/anime/${mapped.livechart}` });
  }
  if (mapped?.anisearch && String(mapped.anisearch) !== "null") {
    links.push({ site: "aniSearch", link: `https://www.anisearch.com/anime/${mapped.anisearch}` });
  }
  if (mapped?.animecountdown && String(mapped.animecountdown) !== "null") {
    links.push({ site: "Anime Countdown", link: `https://animecountdown.com/${mapped.animecountdown}` });
  }
  if (mapped?.kitsu && String(mapped.kitsu) !== "null") {
    links.push({ site: "Kitsu", link: `https://kitsu.app/anime/${mapped.kitsu}` });
  }
  if (mapped?.imdb && String(mapped.imdb) !== "null") {
    links.push({ site: "IMDb", link: `https://www.imdb.com/title/${mapped.imdb}` });
  }

  return links.map((item) => {
    try {
      const url = new URL(item.link);
      return {
        ...item,
        logo: `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`
      };
    } catch {
      return { ...item, logo: "" };
    }
  });
}

async function fetchKitsuBannerTrailerAndTags(
  kitsuId: string | number | null | undefined
): Promise<{ banner: string | null; trailer: string | null; tags: string[] }> {
  const kitsuIdStr = kitsuId !== undefined && kitsuId !== null ? String(kitsuId).trim() : "";
  if (!kitsuIdStr) return { banner: null, trailer: null, tags: [] };

  try {
    const kitsuHeaders: Record<string, string> = {
      Accept: "application/vnd.api+json"
    };
    if (typeof window === "undefined") {
      kitsuHeaders["User-Agent"] = "Anikume/1.0";
    }
    const res = await fetch(
      `https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuIdStr)}?include=categories`,
      {
        headers: kitsuHeaders,
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      }
    );
    if (!res.ok) return { banner: null, trailer: null, tags: [] };
    const json = await res.json();
    const attrs = json?.data?.attributes;
    if (!attrs) return { banner: null, trailer: null, tags: [] };

    let banner: string | null = null;
    const coverImg = attrs.coverImage;
    if (coverImg && typeof coverImg === "object") {
      banner =
        coverImg.tiny ||
        coverImg.small ||
        coverImg.large ||
        coverImg.original ||
        null;
    } else if (typeof coverImg === "string" && coverImg.trim()) {
      banner = coverImg.trim();
    }

    let trailer: string | null = null;
    const ytId = typeof attrs.youtubeVideoId === "string" ? attrs.youtubeVideoId.trim() : "";
    if (ytId) {
      trailer =
        ytId.startsWith("http://") || ytId.startsWith("https://")
          ? ytId
          : `https://www.youtube.com/watch?v=${ytId}`;
    }

    const tags: string[] = [];
    if (Array.isArray(json?.included)) {
      for (const item of json.included) {
        if (item && item.type === "categories" && item.attributes?.title) {
          const title = String(item.attributes.title).trim();
          if (title && !tags.includes(title)) {
            tags.push(title);
          }
        }
      }
    }

    return { banner, trailer, tags };
  } catch {
    return { banner: null, trailer: null, tags: [] };
  }
}

async function fetchOverviewFromAnilist(
  anilistId: number,
  mapped: any,
  clientIp?: string
): Promise<OverviewItem> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        isAdult
        title { romaji english native }
        synonyms
        coverImage { extraLarge large medium }
        bannerImage
        trailer { id site }
        description(asHtml: false)
        format
        status
        episodes
        duration
        popularity
        favourites
        rankings { rank type allTime }
        genres
        tags { name isMediaSpoiler }
        averageScore
        season
        seasonYear
        startDate { year month day }
        nextAiringEpisode { airingAt episode timeUntilAiring }
        source
        studios(isMain: true) { edges { node { name } } }
      }
    }
  `;

  const [res, kitsuData] = await Promise.all([
    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getForwardedHeaders(clientIp)
      },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    }),
    fetchKitsuBannerTrailerAndTags(mapped?.kitsu)
  ]);

  if (!res.ok) {
    throw new Error(`AniList returned status ${res.status}`);
  }
  const json = await res.json();
  const media = json?.data?.Media;
  if (!media) {
    throw new Error(`AniList returned empty Media for ID ${anilistId}`);
  }

  const malIdFromAni = media.idMal ? Number(media.idMal) : mapped?.mal ? Number(mapped.mal) : null;
  let canonicalAnikumeId: string | null = mapped?.anikume || null;
  if (!canonicalAnikumeId) {
    canonicalAnikumeId = await getOrCreateAnikumeId({
      anilist_id: anilistId,
      mal_id: malIdFromAni
    });
  }

  // Resolve sub & dub via Dub.ts using the prefetched AniList status/episodes/nextAiringEpisode
  const dubResolved = await resolveAniDubForPrefetchedItems(
    [
      {
        anikume: canonicalAnikumeId,
        anilist: String(anilistId),
        mal: malIdFromAni ? String(malIdFromAni) : null,
        status: media.status || null,
        episodes: typeof media.episodes === "number" ? media.episodes : null,
        nextAiringEpisode: media.nextAiringEpisode || null
      }
    ],
    {
      clientIp,
      skipAnilistSubRefetch: true
    }
  );
  const dubItem = dubResolved.items[0];
  const subStr = dubItem?.sub ?? null;
  const dubStr = dubItem?.dub ?? null;

  const posterUrl =
    media.coverImage?.extraLarge ||
    media.coverImage?.large ||
    media.coverImage?.medium ||
    null;

  const bannerUrl =
    media.bannerImage && typeof media.bannerImage === "string" && media.bannerImage.trim() !== ""
      ? media.bannerImage.trim()
      : kitsuData.banner || null;

  // Use trailer strictly from AniList when using AniList
  let trailerStr: string | null = null;
  if (media.trailer?.site?.toLowerCase() === "youtube" && media.trailer?.id) {
    trailerStr = `https://www.youtube.com/watch?v=${media.trailer.id}`;
  } else if (media.trailer?.site?.toLowerCase() === "dailymotion" && media.trailer?.id) {
    trailerStr = `https://www.dailymotion.com/video/${media.trailer.id}`;
  }

  const rankings = Array.isArray(media.rankings) ? media.rankings : [];
  const ratedAllTime = rankings.find((r: any) => r && r.type === "RATED" && r.allTime && typeof r.rank === "number");
  const anyRated = rankings.find((r: any) => r && r.type === "RATED" && typeof r.rank === "number");
  const anyAllTime = rankings.find((r: any) => r && r.allTime && typeof r.rank === "number");
  const firstRanking = rankings.find((r: any) => r && typeof r.rank === "number");
  const pickedRank = (ratedAllTime || anyRated || anyAllTime || firstRanking)?.rank;

  const rankNum = typeof pickedRank === "number" ? pickedRank : null;
  const popularityNum = typeof media.popularity === "number" ? media.popularity : null;
  const membersNum = typeof media.popularity === "number" ? media.popularity : null;
  const favoritesNum = typeof media.favourites === "number" ? media.favourites : null;

  const rawEpisodesNum = typeof media.episodes === "number" && media.episodes > 0 ? media.episodes : null;
  const parsedSubNum = subStr && /^\d+$/.test(subStr) ? parseInt(subStr, 10) : null;
  const effectiveEpCount = rawEpisodesNum ?? parsedSubNum;

  const episodeDurationNum =
    effectiveEpCount !== null && typeof media.duration === "number" && media.duration > 0
      ? media.duration
      : null;
  const totalRuntimeNum =
    effectiveEpCount !== null && episodeDurationNum !== null
      ? effectiveEpCount * episodeDurationNum
      : null;

  const statusStr = normalizeStatus(media.status);
  const formatStr = normalizeFormat(media.format) || mapped?.type || null;
  const isAdultBool = Boolean(media.isAdult);

  let dateStr: string | null = null;
  if (media.startDate?.year) {
    dateStr = formatFullDate(media.startDate.year, media.startDate.month, media.startDate.day);
  } else if (media.nextAiringEpisode?.airingAt) {
    const airDate = new Date(media.nextAiringEpisode.airingAt * 1000);
    dateStr = formatFullDate(
      airDate.getUTCFullYear(),
      airDate.getUTCMonth() + 1,
      airDate.getUTCDate()
    );
  }

  const seasonStr = media.season ? String(media.season).toUpperCase() : null;
  const sourceStr = media.source ? String(media.source).toUpperCase() : null;
  const studiosList = (media.studios?.edges || []).map((e: any) => e.node?.name).filter(Boolean);
  const synopsisStr = cleanDescription(media.description);
  const genresList = Array.isArray(media.genres) ? media.genres : [];
  const ageRatingStr = formatAgeRating(null, isAdultBool, genresList);
  const tagsList = (media.tags || [])
    .filter((t: any) => !t.isMediaSpoiler)
    .map((t: any) => t.name)
    .filter(Boolean);

  const externalLinks = buildExternalLinksFromMapped(mapped, anilistId, malIdFromAni, formatStr);

  return {
    anikume_id: canonicalAnikumeId,
    title: {
      romaji: media.title?.romaji || null,
      english: media.title?.english || null,
      native: media.title?.native || null,
      synonyms: Array.isArray(media.synonyms) ? media.synonyms : []
    },
    poster: posterUrl,
    banner: bannerUrl,
    rating: formatRating(media.averageScore),
    rank: rankNum,
    popularity: popularityNum,
    members: membersNum,
    favorites: favoritesNum,
    episode_duration: episodeDurationNum,
    total_runtime: totalRuntimeNum,
    status: statusStr,
    format: formatStr,
    sub: subStr,
    dub: dubStr,
    adult: isAdultBool ? "true" : "false",
    age_rating: ageRatingStr,
    date: dateStr,
    season: seasonStr,
    source: sourceStr,
    studios: studiosList,
    trailer: trailerStr,
    synopsis: synopsisStr,
    genres: genresList,
    tags: tagsList,
    external_links: externalLinks
  };
}

async function fetchOverviewFromMal(
  malId: number,
  mapped: any,
  clientIp?: string
): Promise<OverviewItem> {
  const fields =
    "id,title,main_picture,alternative_titles,start_date,synopsis,mean,rank,popularity,num_list_users,num_favorites,num_episodes,average_episode_duration,nsfw,media_type,status,genres,themes,demographics,start_season,source,rating,studios,videos,broadcast";

  // Fetch MAL overview details and Kitsu banner + trailer + tags simultaneously in parallel
  const [malRes, kitsuData] = await Promise.all([
    fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=${fields}`, {
      headers: {
        "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
        Accept: "application/json",
        ...getForwardedHeaders(clientIp)
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    }),
    fetchKitsuBannerTrailerAndTags(mapped?.kitsu)
  ]);

  if (!malRes.ok) {
    throw new Error(`MAL returned status ${malRes.status}`);
  }
  const malData = await malRes.json();
  if (!malData || !malData.id) {
    throw new Error(`MAL returned empty data for ID ${malId}`);
  }

  const anilistIdFromMap = mapped?.anilist ? Number(mapped.anilist) : null;
  let canonicalAnikumeId: string | null = mapped?.anikume || null;
  if (!canonicalAnikumeId) {
    canonicalAnikumeId = await getOrCreateAnikumeId({
      anilist_id: anilistIdFromMap,
      mal_id: malId
    });
  }

  const statusStr = normalizeStatus(malData.status);
  const rawEpisodesNum =
    typeof malData.num_episodes === "number" && malData.num_episodes > 0
      ? malData.num_episodes
      : null;

  // Resolve sub & dub via Dub.ts using the mapped IDs from Ids.ts
  const dubResolved = await resolveAniDubForPrefetchedItems(
    [
      {
        anikume: canonicalAnikumeId,
        anilist: anilistIdFromMap ? String(anilistIdFromMap) : null,
        mal: String(malId),
        status: statusStr,
        episodes: rawEpisodesNum,
        nextAiringEpisode: null
      }
    ],
    {
      clientIp
    }
  );
  const dubItem = dubResolved.items[0];
  const subStr = dubItem?.sub ?? null;
  const dubStr = dubItem?.dub ?? null;

  const rawPoster = malData.main_picture?.large || malData.main_picture?.medium || null;
  const posterUrl = getMalLargePoster(rawPoster);

  // Banner and trailer from Kitsu
  const bannerUrl = kitsuData.banner || null;
  const trailerStr = kitsuData.trailer || null;

  const rankNum = typeof malData.rank === "number" ? malData.rank : null;
  const popularityNum = typeof malData.popularity === "number" ? malData.popularity : null;
  const membersNum = typeof malData.num_list_users === "number" ? malData.num_list_users : null;
  const favoritesNum = typeof malData.num_favorites === "number" ? malData.num_favorites : null;

  const parsedSubNum = subStr && /^\d+$/.test(subStr) ? parseInt(subStr, 10) : null;
  const effectiveEpCount = rawEpisodesNum ?? parsedSubNum;

  const rawSec =
    typeof malData.average_episode_duration === "number" && malData.average_episode_duration > 0
      ? malData.average_episode_duration
      : null;
  const episodeDurationNum =
    effectiveEpCount !== null && rawSec !== null ? Math.round(rawSec / 60) : null;
  const totalRuntimeNum =
    effectiveEpCount !== null && episodeDurationNum !== null
      ? effectiveEpCount * episodeDurationNum
      : null;

  const formatStr = normalizeFormat(malData.media_type) || mapped?.type || null;

  const genresList = (malData.genres || []).map((g: any) => g.name).filter(Boolean);
  const isAdultBool = Boolean(
    malData.nsfw === "black" ||
      malData.nsfw === "gray" ||
      malData.rating === "rx" ||
      genresList.some((g: string) => g === "Hentai" || g === "Erotica")
  );
  const ageRatingStr = formatAgeRating(malData.rating, isAdultBool, genresList);
  const dateStr = malData.start_date ? parseMalDate(malData.start_date) : null;
  const seasonStr = malData.start_season?.season
    ? String(malData.start_season.season).toUpperCase()
    : null;
  const sourceStr = malData.source ? String(malData.source).toUpperCase() : null;
  const studiosList = (malData.studios || []).map((s: any) => s.name).filter(Boolean);
  const synopsisStr = cleanDescription(malData.synopsis);

  // Tags from Kitsu (as MAL does not provide anime tags); fall back to MAL themes/demographics if Kitsu has no categories
  const malThemes = (malData.themes || []).map((t: any) => t.name).filter(Boolean);
  const malDemographics = (malData.demographics || []).map((d: any) => d.name).filter(Boolean);
  const tagsList = kitsuData.tags && kitsuData.tags.length > 0 ? kitsuData.tags : [...malThemes, ...malDemographics];

  const externalLinks = buildExternalLinksFromMapped(mapped, anilistIdFromMap, malId, formatStr);

  return {
    anikume_id: canonicalAnikumeId,
    title: {
      romaji: malData.title || null,
      english: malData.alternative_titles?.en || malData.title || null,
      native: malData.alternative_titles?.ja || null,
      synonyms: Array.isArray(malData.alternative_titles?.synonyms)
        ? malData.alternative_titles.synonyms
        : []
    },
    poster: posterUrl,
    banner: bannerUrl,
    rating: formatRating(malData.mean),
    rank: rankNum,
    popularity: popularityNum,
    members: membersNum,
    favorites: favoritesNum,
    episode_duration: episodeDurationNum,
    total_runtime: totalRuntimeNum,
    status: statusStr,
    format: formatStr,
    sub: subStr,
    dub: dubStr,
    adult: isAdultBool ? "true" : "false",
    age_rating: ageRatingStr,
    date: dateStr,
    season: seasonStr,
    source: sourceStr,
    studios: studiosList,
    trailer: trailerStr,
    synopsis: synopsisStr,
    genres: genresList,
    tags: tagsList,
    external_links: externalLinks
  };
}

/**
 * Resolves anime overview details using `Ids.ts` + `Dub.ts` + Kitsu (banner & trailer),
 * enforcing strict single-database fetching (`?use=anilist` or `?use=mal`) and supporting
 * cross-tracker lookup (`?tracker=anikume|anilist|mal`, e.g. `?tracker=anilist&use=mal`).
 * Always fetches fresh with zero caching.
 */
export async function getOverview(options: {
  id: string;
  tracker?: string | null;
  use?: string | null;
  fresh?: boolean;
  clientIp?: string;
}): Promise<{ response: OverviewResponse; cacheHit: boolean }> {
  const cleanId = String(options.id || "").trim();
  if (!cleanId) {
    throw {
      status: 404,
      code: "OVERVIEW_NOT_FOUND",
      message: "Missing ID"
    };
  }

  const normTracker = normalizeOverviewTracker(options.tracker);
  if (!normTracker) {
    throw {
      status: 400,
      code: "INVALID_TRACKER",
      message: `Tracker '${options.tracker}' is unsupported. Only 'anilist' and 'mal' trackers are supported.`
    };
  }

  if (normTracker === "anikume" && /^\d+$/.test(cleanId)) {
    throw {
      status: 404,
      code: "OVERVIEW_NOT_FOUND",
      message: "Anikume ID required, or specify ?tracker=anilist or ?tracker=mal"
    };
  }

  const requestedUse = normalizeOverviewUse(options.use);
  if (options.use && typeof options.use === "string" && options.use.trim() && !requestedUse) {
    throw {
      status: 400,
      code: "INVALID_USE",
      message: `Invalid 'use' parameter '${options.use}'. Allowed values: 'anilist', 'mal'.`
    };
  }

  // Step 1: Resolve all mapped IDs via Ids.ts (uses pre-warmed memory map for <1ms lookup unless ?fresh=true)
  const mapped = await resolveSingleAnimeMap(cleanId, normTracker, Boolean(options.fresh));

  const resolvedAnilistId = mapped?.anilist
    ? parseInt(String(mapped.anilist), 10)
    : normTracker === "anilist" && /^\d+$/.test(cleanId)
    ? parseInt(cleanId, 10)
    : null;

  const resolvedMalId = mapped?.mal
    ? parseInt(String(mapped.mal), 10)
    : normTracker === "mal" && /^\d+$/.test(cleanId)
    ? parseInt(cleanId, 10)
    : null;

  if (!mapped && !resolvedAnilistId && !resolvedMalId) {
    throw {
      status: 404,
      code: "ANIME_NOT_FOUND",
      message: `Anime not found for ${normTracker} ID: ${cleanId}`
    };
  }

  let actualUse: OverviewUse = "anilist";
  let results: OverviewItem;

  // Step 2: Strict single-database execution based on ?use=
  if (requestedUse === "anilist") {
    if (!resolvedAnilistId) {
      throw {
        status: 404,
        code: "ANILIST_ID_NOT_FOUND",
        message: `No AniList ID mapped for ${normTracker} ID: ${cleanId}`
      };
    }
    actualUse = "anilist";
    results = await fetchOverviewFromAnilist(resolvedAnilistId, mapped, options.clientIp);
  } else if (requestedUse === "mal") {
    if (!resolvedMalId) {
      throw {
        status: 404,
        code: "MAL_ID_NOT_FOUND",
        message: `No MAL ID mapped for ${normTracker} ID: ${cleanId}`
      };
    }
    actualUse = "mal";
    results = await fetchOverviewFromMal(resolvedMalId, mapped, options.clientIp);
  } else {
    // Default when ?use is omitted: try AniList first, fall back to MAL if AniList fails or is unmapped
    if (resolvedAnilistId) {
      try {
        actualUse = "anilist";
        results = await fetchOverviewFromAnilist(resolvedAnilistId, mapped, options.clientIp);
      } catch (aniErr) {
        if (!resolvedMalId) throw aniErr;
        console.warn("[Overview] AniList failed, falling back to MAL:", aniErr);
        actualUse = "mal";
        results = await fetchOverviewFromMal(resolvedMalId, mapped, options.clientIp);
      }
    } else if (resolvedMalId) {
      actualUse = "mal";
      results = await fetchOverviewFromMal(resolvedMalId, mapped, options.clientIp);
    } else {
      throw {
        status: 404,
        code: "ANIME_NOT_FOUND",
        message: `Anime not found for ${normTracker} ID: ${cleanId}`
      };
    }
  }

  return {
    response: {
      use: actualUse,
      results
    },
    cacheHit: false
  };
}
