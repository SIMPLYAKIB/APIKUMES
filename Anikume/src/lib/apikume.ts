import { getPreferredTitle, stripHtml as baseStripHtml } from "./utils";
import { getOverview } from "../../../Apikume/Overview";

export interface ApikumeTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  synonyms?: string[];
}

export interface ApikumeHeroItem {
  anikume_id: string;
  title: ApikumeTitle;
  poster: string | null;
  banner?: string | null;
  logo?: string | null;
  description?: string | null;
  rating?: string | number | null;
  status?: string | null;
  year?: number | null;
  format?: string | null;
  sub?: string | number | null;
  dub?: string | number | null;
  adult?: string | boolean | null;
  is_adult?: boolean | null;
}

export interface ApikumeAnimeItem {
  anikume_id: string;
  title: ApikumeTitle;
  poster: string | null;
  format?: string | null;
  status?: string | null;
  rating?: string | number | null;
  sub?: string | number | null;
  dub?: string | number | null;
  adult?: string | boolean | null;
  is_adult?: boolean | null;
}

export interface ApikumeHomeResponse {
  hero_slider: ApikumeHeroItem[];
  trending_now: ApikumeAnimeItem[];
  popular_this_season: ApikumeAnimeItem[];
  upcoming: ApikumeAnimeItem[];
  all_time_popular: ApikumeAnimeItem[];
  top_10: ApikumeAnimeItem[];
  top_10_movies: ApikumeAnimeItem[];
}

export interface ApikumeEpisodeItem {
  episode: number;
  "season-episode"?: string;
  absoluteepisode?: string;
  title?: string;
  description?: string;
  image?: string;
  is_filler?: boolean;
}

export interface ApikumeEpisodesResponse {
  total_episodes: number;
  episodes: ApikumeEpisodeItem[];
  next_episodes?: any[];
}

export interface ApikumeCharacterItem {
  character: string;
  role?: string;
  image?: string;
  actor?: string;
  actor_image?: string;
  language?: string;
}

export interface ApikumeRelatedItem {
  relation?: string;
  anikume_id: string;
  title: ApikumeTitle;
  poster: string;
  format?: string;
  status?: string;
  rating?: string | number | null;
  is_adult?: boolean;
}

export interface ApikumeExternalLink {
  site?: string;
  link?: string;
  url?: string;
  logo?: string;
}

export interface ApikumeAnimeDetail {
  anikume_id?: string;
  is_adult?: boolean;
  age_rating?: string | null;
  date?: string | null;
  season?: string | null;
  title: ApikumeTitle;
  poster: string;
  banner?: string | null;
  rating?: string | number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  episodes?: number | null;
  episode_duration?: number | null;
  total_runtime?: number | null;
  status?: string | null;
  format?: string | null;
  score?: number | string | null;
  year?: number | null;
  source?: string | null;
  studios?: string[];
  tags?: string[];
  next_airing_episode?: {
    episode: number;
    date?: string;
    time?: string;
    timezone?: string;
    airing_at?: number;
  } | null;
  trailer?: any;
  synopsis?: string | null;
  genres?: string[];
  related?: ApikumeRelatedItem[];
  external_links?: ApikumeExternalLink[];
  characters?: ApikumeCharacterItem[];
  recommendations?: ApikumeRelatedItem[];
}

export type AnilistMedia = {
  id: string;
  idMal?: number | null;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { extraLarge: string; large: string; color: string | null };
  bannerImage: string | null;
  format: string | null;
  episodes: number | null;
  chapters?: number | null;
  num_chapters?: number | null;
  duration: number | null;
  totalRuntime?: number | null;
  rank?: number | null;
  members?: number | null;
  age_rating?: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: { year: number | null; month: number | null; day: number | null };
  endDate?: { year: number | null; month: number | null; day: number | null };
  averageScore: number | null;
  meanScore: number | null;
  popularity: number | null;
  favourites: number | null;
  genres: string[];
  studios?: { nodes: { id: number | string; name: string }[] };
  rawStudios?: string[];
  rawDate?: string | null;
  description: string | null;
  trailer?: { id: string | null; site: string | null; thumbnail: string | null } | null;
  source?: string | null;
  countryOfOrigin?: string | null;
  isAdult?: boolean;
  characters?: {
    edges: {
      role: string;
      node: { id: number | string; name: { full: string }; image: { large: string } };
      voiceActors: {
        id: number | string;
        name: { full: string };
        image: { large: string };
        languageV2: string;
      }[];
    }[];
  };
  relations?: {
    edges: {
      relationType: string;
      node: AnilistMedia;
    }[];
  };
  recommendations?: {
    nodes: { mediaRecommendation: AnilistMedia | null }[];
  };
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  streamingEpisodes?: {
    title: string | null;
    thumbnail: string | null;
    url: string | null;
    site: string | null;
  }[];
  synonyms?: string[];
  tags?: { name: string; rank: number | null; isMediaSpoiler: boolean }[];
  externalLinks?: {
    id: number | string;
    site: string;
    url: string;
    type?: string | null;
    icon?: string | null;
    color?: string | null;
  }[];
};

export type ApikumeMedia = AnilistMedia;

export type Episode = {
  episode: number;
  title: string;
  description?: string;
  image?: string;
  date?: string;
  filler?: boolean;
};

export function apikumeTitle(title?: ApikumeTitle | null): string {
  if (!title) return "Untitled";
  return getPreferredTitle(title);
}

export function titleOf(m: AnilistMedia | any) {
  if (!m) return "Untitled";
  return getPreferredTitle(m.title ?? m);
}

export function stripHtml(s: string | null | undefined) {
  return baseStripHtml(s);
}

export function prettyFormat(m: AnilistMedia | string | null) {
  if (!m) return "";
  let f: string;
  let country: string | null = null;

  if (typeof m === "object") {
    f = m.format || "";
    country = m.countryOfOrigin || null;
  } else {
    f = m;
  }

  if (!f) return "";

  if (f === "MANGA" || f === "NOVEL" || f === "ONE_SHOT") {
    let formatText = f.replace(/_/g, " ");
    formatText = formatText.charAt(0).toUpperCase() + formatText.slice(1).toLowerCase();

    if (country === "KR") formatText = "Manhwa";
    else if (country === "CN") formatText = "Manhua";
    else if (country === "JP") formatText = "Manga";

    if (f === "ONE_SHOT") formatText = "One Shot";
    return formatText;
  }
  return (
    (
      {
        TV: "TV Show",
        TV_SHORT: "TV Short",
        MOVIE: "Movie",
        SPECIAL: "Special",
        OVA: "OVA",
        ONA: "ONA",
        MUSIC: "Music",
      } as Record<string, string>
    )[f] ?? f.replace(/_/g, " ")
  );
}

export function prettyDuration(d: number | null | undefined) {
  if (!d) return "";
  if (d < 60) return `${d} mins`;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return m === 0 ? `${h} hour${h > 1 ? "s" : ""}` : `${h}h ${m}m`;
}

export function currentSeason(): { season: string; year: number } {
  const m = new Date().getMonth();
  const year = new Date().getFullYear();
  const season = m <= 1 || m === 11 ? "WINTER" : m <= 4 ? "SPRING" : m <= 7 ? "SUMMER" : "FALL";
  const y = m === 11 ? year + 1 : year;
  return { season, year: y };
}

// Persistent and in-memory API data cache disabled per user request
if (typeof window !== "undefined") {
  try {
    sessionStorage.removeItem("apikume_endpoint_cache_v2");
    sessionStorage.removeItem("app_runtime_session_id");
    sessionStorage.removeItem("app_session_last_active_ts");
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (
        k &&
        (k.startsWith("apikume_") ||
          k.startsWith("mangaball_session_updated_") ||
          k.startsWith("episodes_session_updated_"))
      ) {
        sessionKeysToRemove.push(k);
      }
    }
    sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));

    const localKeysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("episodes_cache_")) {
        localKeysToRemove.push(k);
      }
    }
    localKeysToRemove.forEach((k) => localStorage.removeItem(k));

    if (window.parent && window.parent !== window) {
      try {
        window.parent.sessionStorage.removeItem("apikume_endpoint_cache_v2");
      } catch {}
    }
  } catch {}
}

export function getSessionEndpointData<T = any>(_key: string): T | undefined {
  return undefined;
}

export async function fetchApikumeEndpoint<T = any>(
  endpoint: string,
  _bypassCache: boolean = false,
): Promise<T> {
  const apiPath = endpoint.replace(/^\/api\/anime/, "/anime");
  const url =
    typeof window === "undefined"
      ? endpoint.startsWith("http")
        ? endpoint
        : `https://apikume.onrender.com${apiPath}`
      : endpoint;

  let res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if ((!res.ok || !isJson) && typeof window !== "undefined" && !url.startsWith("http")) {
    res = await fetch(`https://apikume.onrender.com${apiPath}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  }

  if (!res.ok) {
    throw new Error(`Failed to load ${endpoint}: ${res.status}`);
  }

  const data = await res.json();
  if (data && typeof data === "object" && (data as any).error && !(data as any).results) {
    throw new Error((data as any).message || (data as any).error || `Invalid response for ${endpoint}`);
  }
  return data as T;
}

export interface ApikumeSectionResponse {
  section?: string;
  limit?: number;
  total?: number;
  use?: string;
  results: any[];
}

export interface ApikumeCombinedAnimeResponse {
  heroslider: { total: number; use: string; results: ApikumeHeroItem[] };
  trendingnow: { total: number; use: string; results: ApikumeAnimeItem[] };
  thisseason: { total: number; use: string; results: ApikumeAnimeItem[] };
  popular: { total: number; use: string; results: ApikumeAnimeItem[] };
  top10: { total: number; use: string; results: ApikumeAnimeItem[] };
  upcoming: { total: number; use: string; results: ApikumeAnimeItem[] };
}

function normalizeApikumeItemList<T = any>(list: any[]): T[] {
  if (!Array.isArray(list)) return [];
  return list.map((item: any) => ({
    ...item,
    is_adult:
      item?.is_adult === true ||
      item?.adult === "true" ||
      item?.adult === true,
  }));
}

export async function fetchApikumeAnimeHome(
  _bypassCache: boolean = false,
): Promise<ApikumeCombinedAnimeResponse> {
  const endpointKey = "/api/anime";
  const res = await fetch(endpointKey, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load /api/anime: ${res.status}`);
  }
  const data = await res.json();
  if (data && typeof data === "object" && (data as any).error && !data?.heroslider) {
    throw new Error((data as any).message || (data as any).error || "Failed to load /api/anime");
  }
  const normalized: ApikumeCombinedAnimeResponse = {
    heroslider: {
      total: data?.heroslider?.total ?? 0,
      use: data?.heroslider?.use ?? "anilist",
      results: normalizeApikumeItemList<ApikumeHeroItem>(data?.heroslider?.results),
    },
    trendingnow: {
      total: data?.trendingnow?.total ?? 0,
      use: data?.trendingnow?.use ?? "anilist",
      results: normalizeApikumeItemList<ApikumeAnimeItem>(data?.trendingnow?.results),
    },
    thisseason: {
      total: data?.thisseason?.total ?? 0,
      use: data?.thisseason?.use ?? "anilist",
      results: normalizeApikumeItemList<ApikumeAnimeItem>(data?.thisseason?.results),
    },
    popular: {
      total: data?.popular?.total ?? 0,
      use: data?.popular?.use ?? "anilist",
      results: normalizeApikumeItemList<ApikumeAnimeItem>(data?.popular?.results),
    },
    top10: {
      total: data?.top10?.total ?? 0,
      use: data?.top10?.use ?? "anilist",
      results: normalizeApikumeItemList<ApikumeAnimeItem>(data?.top10?.results),
    },
    upcoming: {
      total: data?.upcoming?.total ?? 0,
      use: data?.upcoming?.use ?? "anilist",
      results: normalizeApikumeItemList<ApikumeAnimeItem>(data?.upcoming?.results),
    },
  };

  return normalized;
}

export async function fetchApikumeHeroSlider(): Promise<ApikumeHeroItem[]> {
  const endpointKey = "/api/heroslider";
  try {
    const res = await fetch(endpointKey, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to load /api/heroslider: ${res.status}`);
    }
    const data = await res.json();
    const items = normalizeApikumeItemList<ApikumeHeroItem>(data?.results);
    return items;
  } catch (e) {
    console.warn("fetchApikumeHeroSlider() failed:", e);
    return [];
  }
}

export async function fetchApikumeSection<T = any>(
  section: string,
  limit?: number,
): Promise<T[]> {
  const norm = section.toLowerCase().trim();
  if (norm === "hero_slider" || norm === "heroslider") {
    return (await fetchApikumeHeroSlider()) as unknown as T[];
  }

  const endpointMap: Record<string, string> = {
    trending: "/api/trendingnow",
    trending_now: "/api/trendingnow",
    trendingnow: "/api/trendingnow",
    season: "/api/thisseason",
    this_season: "/api/thisseason",
    thisseason: "/api/thisseason",
    popular_this_season: "/api/thisseason",
    popular: "/api/popular",
    all_time_popular: "/api/popular",
    top_10: "/api/top10",
    top10: "/api/top10",
    upcoming: "/api/upcoming",
  };

  const directUrl = endpointMap[norm];
  if (directUrl) {
    try {
      const res = await fetch(directUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Failed to load ${directUrl}: ${res.status}`);
      }
      const data = await res.json();
      const items = normalizeApikumeItemList<T>(data?.results);
      return limit ? items.slice(0, limit) : items;
    } catch (e) {
      console.warn(`fetchApikumeSection(${section}) failed:`, e);
      return [];
    }
  }

  const q = new URLSearchParams({ section });
  if (limit) q.set("limit", String(limit));
  try {
    const data = await fetchApikumeEndpoint<ApikumeSectionResponse>(
      `/anime?${q.toString()}`,
    );
    return Array.isArray(data?.results) ? data.results : [];
  } catch (e) {
    console.warn(`fetchApikumeSection(${section}) failed:`, e);
    return [];
  }
}

export async function fetchApikumeHome(): Promise<ApikumeHomeResponse> {
  const combined = await fetchApikumeAnimeHome();
  const hero_slider = combined?.heroslider?.results ?? [];
  const trending = combined?.trendingnow?.results ?? [];
  const season = combined?.thisseason?.results ?? [];
  const popular = combined?.popular?.results ?? [];
  const top_10 = combined?.top10?.results ?? [];
  const upcoming = combined?.upcoming?.results ?? [];

  return {
    hero_slider,
    trending_now: trending,
    trending,
    upcoming,
    top_10,
    popular_this_season: season,
    season,
    popular,
    top_rated: [],
    all_time_popular: popular,
    top_10_movies: [],
  } as any;
}

export type ApikumeDetailDataType =
  | "overview"
  | "character"
  | "recommendation"
  | "season"
  | "episode"
  | "artwork";

export async function fetchApikumeData<T = any>(
  id: string | number,
  dataType: ApikumeDetailDataType,
  fresh: boolean = false,
): Promise<T> {
  const cleanId = String(id).trim();
  if (dataType === "overview") {
    const { response } = await getOverview({ id: cleanId, fresh });
    return response as unknown as T;
  }
  const endpoint = `/anime/${encodeURIComponent(cleanId)}?data=${dataType}${fresh ? "&fresh=true" : ""}`;
  return fetchApikumeEndpoint<T>(endpoint, fresh);
}

export async function fetchApikumeDetail(id: string | number): Promise<ApikumeAnimeDetail> {
  const cleanId = String(id).trim();
  const { response } = await getOverview({ id: cleanId });
  const detail = response?.results ?? (response as any)?.overview ?? response;
  return detail as unknown as ApikumeAnimeDetail;
}

export async function fetchApikumeEpisodes(
  id: string | number,
  fresh: boolean = false,
): Promise<ApikumeEpisodesResponse> {
  const res = await fetchApikumeData<any>(id, "episode", fresh);
  const epBlock = res?.results ?? res?.episode ?? res;
  const episodes = Array.isArray(epBlock?.episodes)
    ? epBlock.episodes
    : Array.isArray(epBlock)
      ? epBlock
      : [];
  const total_episodes =
    typeof res?.total === "number"
      ? res.total
      : typeof epBlock?.total_episodes === "number"
        ? epBlock.total_episodes
        : episodes.length;
  const rawNext =
    epBlock?.next_episodes ??
    res?.next_episodes ??
    epBlock?.next_episode ??
    res?.next_episode ??
    epBlock?.next_airing_episode ??
    res?.next_airing_episode;
  const next_episodes = Array.isArray(rawNext)
    ? rawNext
    : rawNext && typeof rawNext === "object"
      ? [rawNext]
      : [];
  return {
    total_episodes,
    episodes,
    next_episodes,
  };
}

export function mapApikumeToAnilistMedia(raw: any, id?: string): AnilistMedia {
  const d = raw?.results && !Array.isArray(raw.results) ? raw.results : raw?.overview ? raw.overview : raw;
  const resolvedId = String(id || d?.anikume_id || d?.id || "").trim();
  const ratingNum = d?.score ?? (d?.rating != null ? parseFloat(String(d.rating)) : null);
  const score100 =
    ratingNum != null && !Number.isNaN(Number(ratingNum))
      ? Math.round(Number(ratingNum) <= 10 ? Number(ratingNum) * 10 : Number(ratingNum))
      : null;

  const parsedDate = (() => {
    if (d?.year) {
      return { year: Number(d.year) || null, month: null, day: null };
    }
    if (typeof d?.date === "string" && d.date.trim()) {
      const dt = new Date(d.date);
      if (!Number.isNaN(dt.getTime())) {
        return {
          year: dt.getFullYear(),
          month: dt.getMonth() + 1,
          day: dt.getDate(),
        };
      }
      const yearMatch = d.date.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        return { year: Number(yearMatch[0]), month: null, day: null };
      }
    }
    return { year: null, month: null, day: null };
  })();

  const rawStudiosList = Array.isArray(d?.studios) ? d.studios : [];

  return {
    id: resolvedId,
    idMal: null,
    title: {
      romaji:
        typeof d?.title === "string"
          ? d.title
          : d?.title?.romaji || d?.title?.english || d?.title?.native || "Untitled",
      english: typeof d?.title === "object" ? d?.title?.english || d?.title?.romaji || null : null,
      native: typeof d?.title === "object" ? d?.title?.native || null : null,
    },
    synonyms: d?.title?.synonyms || [],
    coverImage: {
      extraLarge: d?.poster || d?.coverImage?.extraLarge || d?.coverImage?.large || "",
      large: d?.poster || d?.coverImage?.large || d?.coverImage?.extraLarge || "",
      color: null,
    },
    bannerImage: d?.banner || d?.bannerImage || d?.poster || null,
    format: d?.format?.toUpperCase() || "TV",
    episodes:
      typeof d?.total_episodes === "number"
        ? d.total_episodes
        : d?.next_airing_episode?.episode
          ? d.next_airing_episode.episode - 1
          : typeof d?.episodes === "number"
            ? d.episodes
            : d?.sub != null && /^\d+$/.test(String(d.sub).trim())
              ? parseInt(String(d.sub).trim(), 10)
              : null,
    chapters: null,
    duration:
      typeof d?.episode_duration === "number"
        ? d.episode_duration
        : typeof d?.duration === "number"
          ? d.duration
          : null,
    totalRuntime:
      typeof d?.total_runtime === "number"
        ? d.total_runtime
        : typeof d?.totalRuntime === "number"
          ? d.totalRuntime
          : null,
    rank:
      typeof d?.rank === "number"
        ? d.rank
        : typeof d?.ranked === "number"
          ? d.ranked
          : null,
    members: typeof d?.members === "number" ? d.members : null,
    age_rating: d?.age_rating || d?.ageRating || null,
    status: d?.status || "RELEASING",
    season: d?.season || null,
    seasonYear: d?.year || parsedDate.year || null,
    startDate: parsedDate,
    averageScore: score100,
    meanScore: score100,
    popularity: typeof d?.popularity === "number" ? d.popularity : null,
    favourites:
      typeof d?.favorites === "number"
        ? d.favorites
        : typeof d?.favourites === "number"
          ? d.favourites
          : null,
    genres: d?.genres || [],
    tags: Array.isArray(d?.tags)
      ? d.tags.map((t: any) =>
          typeof t === "string"
            ? { name: t, rank: null, isMediaSpoiler: false }
            : {
                name: t?.name || String(t),
                rank: t?.rank ?? null,
                isMediaSpoiler: !!t?.isMediaSpoiler,
              },
        )
      : [],
    description: d?.synopsis || d?.description || null,
    isAdult: !!(d?.is_adult || d?.isAdult || d?.adult === "true" || d?.adult === true),
    source: d?.source || null,
    rawStudios: rawStudiosList,
    rawDate: d?.date || null,
    studios: {
      nodes: rawStudiosList.map((s: string, idx: number) => ({ id: idx, name: s })),
    },
    nextAiringEpisode: d?.next_airing_episode
      ? {
          episode: d.next_airing_episode.episode,
          airingAt:
            d.next_airing_episode.airing_at ||
            Math.floor(
              new Date(
                `${d.next_airing_episode.date} ${d.next_airing_episode.time || ""}`,
              ).getTime() / 1000,
            ) ||
            0,
        }
      : null,
    characters: d?.characters
      ? {
          edges: d.characters.map((c: any) => ({
            role: c.role || "MAIN",
            node: {
              id: 0,
              name: { full: c.character },
              image: { large: c.image || "" },
            },
            voiceActors: c.actor
              ? [
                  {
                    id: 0,
                    name: { full: c.actor },
                    image: { large: c.actor_image || "" },
                    languageV2: c.language || "Japanese",
                  },
                ]
              : [],
          })),
        }
      : { edges: [] },
    relations: d?.related
      ? {
          edges: d.related.map((r: any) => ({
            relationType: r.relation || "SIDE_STORY",
            node: mapApikumeToAnilistMedia(r, r.anikume_id),
          })),
        }
      : { edges: [] },
    recommendations: d?.recommendations
      ? {
          nodes: d.recommendations.map((rec: any) => ({
            mediaRecommendation: mapApikumeToAnilistMedia(rec, rec.anikume_id),
          })),
        }
      : { edges: [] },
    externalLinks: d?.external_links
      ? d.external_links.map((l: any) => ({
          id: l.site || l.link || l.url,
          site: l.site || "External",
          url: l.link || l.url || "",
          type: "INFO",
          icon: l.logo || null,
          color: null,
        }))
      : [],
    trailer: (() => {
      if (!d?.trailer) return null;
      let ytId = typeof d.trailer === "object" ? d.trailer.id : null;
      const url =
        typeof d.trailer === "object"
          ? d.trailer.url
          : typeof d.trailer === "string"
            ? d.trailer
            : "";
      if (!ytId && url) {
        const match = url.match(/(?:v=|\/embed\/|\.be\/)([\w-]{11})/);
        if (match) ytId = match[1];
      }
      if (!ytId && typeof d.trailer === "string" && d.trailer.length === 11) {
        ytId = d.trailer;
      }
      if (!ytId) return null;
      return {
        id: ytId,
        site: "youtube",
        thumbnail: d.trailer?.thumbnail || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      };
    })(),
  };
}

export async function fetchAnimeById(id: number | string): Promise<AnilistMedia> {
  const strId = String(id).trim();
  const data = await fetchApikumeDetail(strId);
  return mapApikumeToAnilistMedia(data, strId);
}

export async function fetchEpisodes(
  animeId: number | string,
  media?: AnilistMedia,
  forceRefresh: boolean = false,
): Promise<Episode[]> {
  try {
    if (media?.status === "NOT_YET_RELEASED" || media?.status?.toUpperCase() === "UPCOMING") {
      return [];
    }

    const strId = String(animeId).trim();
    const fallbackImage = media?.bannerImage || media?.coverImage?.extraLarge || "";
    const fallbackDesc = media?.description ? stripHtml(media.description) : "";

    const epRes = await fetchApikumeEpisodes(strId, forceRefresh);
    if (epRes?.episodes && Array.isArray(epRes.episodes) && epRes.episodes.length > 0) {
      return epRes.episodes
        .map((ep: any) => {
          const epNum = typeof ep.episode === "number" ? ep.episode : Number(ep.episode) || 1;
          return {
            episode: epNum,
            title: ep.title || `Episode ${epNum}`,
            description: ep.description || fallbackDesc,
            image: ep.image || fallbackImage,
            date: "",
            filler: Boolean(
              ep.is_filler === true ||
                ep.is_filler === "true" ||
                ep.is_filler === 1 ||
                ep.filler === true ||
                ep.filler === "true" ||
                ep.filler === 1 ||
                ep.isFiller === true,
            ),
          };
        })
        .sort((a: Episode, b: Episode) => a.episode - b.episode);
    }

    if (media) {
      const knownTotal = totalEpisodeCount(media);
      if (knownTotal > 0) {
        return Array.from({ length: knownTotal }, (_, i) => ({
          episode: i + 1,
          title: `Episode ${i + 1}`,
          description: fallbackDesc,
          image: fallbackImage,
          date: "",
        }));
      }
    }

    return [];
  } catch {
    return [];
  }
}

export function totalEpisodeCount(m: AnilistMedia, fetched?: Episode[]): number {
  const nextEp = m.nextAiringEpisode?.episode;
  if (nextEp && nextEp > 1) return nextEp - 1;
  if (fetched && fetched.length > 0) return fetched.length;
  if (m.episodes != null) return m.episodes;
  return 0;
}

export async function fetchHero(): Promise<AnilistMedia[]> {
  const items = await fetchApikumeSection("hero_slider");
  return items.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id));
}

export async function fetchTrending(): Promise<AnilistMedia[]> {
  const items = await fetchApikumeSection("trending");
  return items.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id));
}

export async function fetchSeasonal(): Promise<AnilistMedia[]> {
  const items = await fetchApikumeSection("season");
  return items.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id));
}

export async function fetchFavorites(): Promise<AnilistMedia[]> {
  const items = await fetchApikumeSection("popular");
  return items.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id));
}

export async function fetchUpcoming(): Promise<AnilistMedia[]> {
  const items = await fetchApikumeSection("upcoming");
  return items.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id));
}

export async function fetchTopAnime(): Promise<AnilistMedia[]> {
  const items = await fetchApikumeSection("top_10");
  return items.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id));
}

export async function fetchPopularMovies(): Promise<AnilistMedia[]> {
  const items = await fetchApikumeSection("top_10");
  return items.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id));
}

export async function searchAnime(q: string): Promise<AnilistMedia[]> {
  if (!q.trim()) return [];
  try {
    const res = await fetchApikumeEndpoint(
      `/api/anime/browse?mode=search&q=${encodeURIComponent(q)}`,
    );
    const list = Array.isArray(res) ? res : res?.results || [];
    return list.map((item: any) => mapApikumeToAnilistMedia(item, item.anikume_id || item.id));
  } catch {
    return [];
  }
}

export type BrowseParams = {
  search?: string;
  genre?: string;
  season?: string;
  year?: string;
  format?: string;
  status?: string;
  sort?: string;
  page?: number;
};

export async function browseAnime(
  p: BrowseParams,
): Promise<{ items: AnilistMedia[]; hasNext: boolean; lastPage: number; currentPage: number }> {
  try {
    const q = new URLSearchParams();
    q.set("mode", "browse");
    if (p.search) {
      q.set("q", p.search);
      q.set("search", p.search);
    }
    if (p.genre) q.set("genre", p.genre);
    if (p.season) q.set("season", p.season);
    if (p.year) q.set("year", p.year);
    if (p.format) q.set("format", p.format);
    if (p.status) q.set("status", p.status);
    if (p.sort) q.set("sort", p.sort);
    if (p.page) q.set("page", String(p.page));

    const res = await fetchApikumeEndpoint(`/api/anime/browse?${q.toString()}`);
    const results = Array.isArray(res?.results) ? res.results : [];
    const currentPage = res?.pageInfo?.currentPage || (p.page ?? 1);
    const lastPage = res?.pageInfo?.lastPage || currentPage;
    return {
      items: results.map((m: any) => mapApikumeToAnilistMedia(m, m.anikume_id || m.id)),
      hasNext: currentPage < lastPage,
      lastPage,
      currentPage,
    };
  } catch {
    return { items: [], hasNext: false, lastPage: 1, currentPage: 1 };
  }
}

export async function searchManga(_q: string): Promise<AnilistMedia[]> {
  return [];
}

export async function browseManga(
  _p: BrowseParams,
): Promise<{ items: AnilistMedia[]; hasNext: boolean; lastPage: number; currentPage: number }> {
  return { items: [], hasNext: false, lastPage: 1, currentPage: 1 };
}

export type AiringScheduleItem = {
  id: number | string;
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
  media: AnilistMedia;
};

export async function fetchSchedule(
  _start: number,
  _end: number,
  _page: number = 1,
): Promise<{ items: AiringScheduleItem[]; hasNextPage: boolean }> {
  const data = await fetchSeasonal();
  return {
    items: data.map((m, i) => ({
      id: m.id,
      episode: 1,
      airingAt: Math.floor(Date.now() / 1000) + i * 3600,
      timeUntilAiring: 3600,
      media: m,
    })),
    hasNextPage: false,
  };
}

export async function fetchHeroManga(): Promise<AnilistMedia[]> {
  return [];
}
export async function fetchTrendingManga(): Promise<AnilistMedia[]> {
  return [];
}
export async function fetchSeasonalManga(): Promise<AnilistMedia[]> {
  return [];
}
export async function fetchFavoritesManga(): Promise<AnilistMedia[]> {
  return [];
}
export async function fetchUpcomingManga(): Promise<AnilistMedia[]> {
  return [];
}
export async function fetchMangaById(id: number | string): Promise<AnilistMedia> {
  return fetchAnimeById(id);
}
export async function fetchMangaballDataWithCache(
  _mediaOrId: number | string | AnilistMedia,
  _status?: string | null,
  _isColored?: boolean,
  _idMalOverride?: number | string | null,
  _forceRefresh: boolean = false,
) {
  return { chapters: [] };
}
export async function fetchTopManga(): Promise<AnilistMedia[]> {
  return fetchTopAnime();
}
export async function fetchTopManhwa(): Promise<AnilistMedia[]> {
  return [];
}
export async function fetchMangaSchedule(
  _start: number,
  _end: number,
  _page: number = 1,
): Promise<{ results: AnilistMedia[]; hasNextPage: boolean }> {
  return { results: [], hasNextPage: false };
}
export async function fetchChapters(
  _id: any,
  media: AnilistMedia,
  _dub?: boolean,
): Promise<{ chapter: string; date: string; id: string }[]> {
  const count = media.num_chapters || 10;
  return Array.from({ length: count }).map((_, i) => ({
    chapter: String(i + 1),
    date: new Date().toISOString(),
    id: String(i + 1),
  }));
}
export function totalChapterCount(media: AnilistMedia): number {
  return media.num_chapters || 10;
}

export const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

export const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
export const FORMATS = ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"];
export const MANGA_FORMATS = ["MANGA", "MANHWA", "MANHUA", "NOVEL", "ONE_SHOT"];
export const STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];
export const SORTS = [
  { value: "POPULARITY_DESC", label: "Popularity" },
  { value: "SCORE_DESC", label: "Score" },
  { value: "TRENDING_DESC", label: "Trending" },
  { value: "FAVOURITES_DESC", label: "Favorites" },
  { value: "START_DATE_DESC", label: "Newest" },
  { value: "TITLE_ROMAJI", label: "A–Z" },
];

export interface ApikumeWatchSource {
  source: string;
  embed?: string;
  hls?: string;
  url?: string;
  video?: string;
  mp4?: string;
  file?: string;
  src?: string;
  type?: string;
  subtitle?: string;
  caption?: string;
  [key: string]: any;
}

export interface ApikumeWatchResponse {
  sub?: ApikumeWatchSource[];
  dub?: ApikumeWatchSource[];
  hindi?: ApikumeWatchSource[];
  tamil?: ApikumeWatchSource[];
  telugu?: ApikumeWatchSource[];
  malayalam?: ApikumeWatchSource[];
  raw?: ApikumeWatchSource[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  [key: string]: any;
}

export async function fetchApikumeWatch(
  id: string | number,
  ep: number,
): Promise<ApikumeWatchResponse> {
  return fetchApikumeEndpoint<ApikumeWatchResponse>(`/api/anime/watch/${id}/${ep}`);
}

export function prefetchApikumeAnime(_id: string) {
  // No-op
}
