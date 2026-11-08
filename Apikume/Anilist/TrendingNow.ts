// @ts-nocheck
import { getForwardedHeaders } from "../Server/Episodes.js";
import { directProxyFetch } from "../Server/Proxy.js";

const ANILIST_TRENDING_PAGE_URL = "https://anilist.co/search/anime/trending";
const ANILIST_INTERNAL_GRAPHQL_URL = "https://anilist.co/graphql";

const TRENDING_NOW_QUERY = `
  query ($page: Int = 1, $perPage: Int = 20) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        perPage
        currentPage
        lastPage
        hasNextPage
      }
      media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC]) {
        id
        idMal
        title {
          romaji
          english
          native
          userPreferred
        }
        coverImage {
          extraLarge
          large
          medium
          color
        }
        bannerImage
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
        description(asHtml: false)
        season
        seasonYear
        type
        format
        status(version: 2)
        episodes
        duration
        chapters
        volumes
        genres
        isAdult
        averageScore
        meanScore
        popularity
        favourites
        trending
        countryOfOrigin
        source(version: 3)
        hashtag
        siteUrl
        trailer {
          id
          site
          thumbnail
        }
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
        studios(isMain: true) {
          nodes {
            id
            name
          }
        }
      }
    }
  }
`;

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

function formatRating(score: any): string | null {
  if (score === undefined || score === null) return null;
  const num = typeof score === "number" ? score : parseFloat(String(score));
  if (isNaN(num) || num <= 0) return null;
  const val = num > 10 ? num / 10 : num;
  return val.toFixed(1);
}

function mapTrendingAnimeItem(media: any) {
  return {
    id: media.id,
    mal_id: media.idMal ?? null,
    title: {
      romaji: media.title?.romaji ?? null,
      english: media.title?.english ?? null,
      native: media.title?.native ?? null,
      user_preferred: media.title?.userPreferred ?? null
    },
    poster:
      media.coverImage?.extraLarge ||
      media.coverImage?.large ||
      media.coverImage?.medium ||
      null,
    cover_image: {
      extra_large: media.coverImage?.extraLarge ?? null,
      large: media.coverImage?.large ?? null,
      medium: media.coverImage?.medium ?? null,
      color: media.coverImage?.color ?? null
    },
    banner: media.bannerImage ?? null,
    color: media.coverImage?.color ?? null,
    description: cleanDescription(media.description),
    rating: formatRating(media.averageScore ?? media.meanScore),
    average_score: media.averageScore ?? null,
    mean_score: media.meanScore ?? null,
    trending: media.trending ?? null,
    popularity: media.popularity ?? null,
    favourites: media.favourites ?? null,
    format: media.format ?? null,
    status: media.status ?? null,
    episodes: media.episodes ?? null,
    duration: media.duration ?? null,
    season: media.season ?? null,
    year: media.seasonYear ?? media.startDate?.year ?? null,
    start_date: {
      year: media.startDate?.year ?? null,
      month: media.startDate?.month ?? null,
      day: media.startDate?.day ?? null
    },
    end_date: {
      year: media.endDate?.year ?? null,
      month: media.endDate?.month ?? null,
      day: media.endDate?.day ?? null
    },
    genres: Array.isArray(media.genres) ? media.genres : [],
    studios: Array.isArray(media.studios?.nodes)
      ? media.studios.nodes.map((s: any) => s?.name).filter(Boolean)
      : [],
    next_airing_episode: media.nextAiringEpisode
      ? {
          episode: media.nextAiringEpisode.episode ?? null,
          airing_at: media.nextAiringEpisode.airingAt ?? null,
          time_until_airing: media.nextAiringEpisode.timeUntilAiring ?? null
        }
      : null,
    trailer: media.trailer?.id
      ? {
          id: media.trailer.id,
          site: media.trailer.site ?? null,
          thumbnail: media.trailer.thumbnail ?? null
        }
      : null,
    country_of_origin: media.countryOfOrigin ?? null,
    source: media.source ?? null,
    hashtag: media.hashtag ?? null,
    is_adult: Boolean(media.isAdult),
    site_url: media.siteUrl || (media.id ? `https://anilist.co/anime/${media.id}` : null)
  };
}

async function fetchTrendingPage(page: number, perPage: number, clientIp?: string) {
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: ANILIST_TRENDING_PAGE_URL,
    Origin: "https://anilist.co",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "X-Requested-With": "XMLHttpRequest",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    ...getForwardedHeaders(clientIp)
  };

  const response = await directProxyFetch(ANILIST_INTERNAL_GRAPHQL_URL, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({
      query: TRENDING_NOW_QUERY,
      variables: {
        page,
        perPage
      }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  if (!response.ok) {
    const err: any = new Error(
      `Direct request to ${ANILIST_INTERNAL_GRAPHQL_URL} failed with HTTP ${response.status} ${response.statusText}`
    );
    err.status = response.status;
    err.code = "ANILIST_CO_GRAPHQL_ERROR";
    err.endpoint = ANILIST_INTERNAL_GRAPHQL_URL;
    err.referer = ANILIST_TRENDING_PAGE_URL;
    err.request_headers = requestHeaders;
    err.anilist_response_headers = responseHeaders;
    throw err;
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    const err: any = new Error(
      `Invalid JSON received from ${ANILIST_INTERNAL_GRAPHQL_URL} (HTTP ${response.status})`
    );
    err.status = 502;
    err.code = "ANILIST_CO_INVALID_JSON";
    err.endpoint = ANILIST_INTERNAL_GRAPHQL_URL;
    err.referer = ANILIST_TRENDING_PAGE_URL;
    err.request_headers = requestHeaders;
    err.anilist_response_headers = responseHeaders;
    throw err;
  }

  const mediaList = json?.data?.Page?.media;
  if (!Array.isArray(mediaList)) {
    return [];
  }
  return mediaList;
}

export async function fetchAnilistTrendingNow(limitParam?: number, clientIp?: string) {
  const defaultLimit = 20;
  const parsedLimit =
    typeof limitParam === "number" && !isNaN(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), 100)
      : defaultLimit;

  let rawMedia: any[] = [];

  if (parsedLimit <= 50) {
    rawMedia = await fetchTrendingPage(1, parsedLimit, clientIp);
  } else {
    const pagesNeeded = Math.ceil(parsedLimit / 50);
    const pagePromises = [];
    for (let p = 1; p <= pagesNeeded; p++) {
      pagePromises.push(fetchTrendingPage(p, 50, clientIp));
    }
    const pagesResults = await Promise.all(pagePromises);
    for (const list of pagesResults) {
      rawMedia.push(...list);
    }
  }

  const results = rawMedia.slice(0, parsedLimit).map(mapTrendingAnimeItem);

  return {
    section: "trending_now",
    endpoint: ANILIST_INTERNAL_GRAPHQL_URL,
    source_url: ANILIST_TRENDING_PAGE_URL,
    limit: parsedLimit,
    total: results.length,
    results
  };
}
