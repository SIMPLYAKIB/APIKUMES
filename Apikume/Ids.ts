// @ts-nocheck
import { serverCache } from "./Server/Cache.js";

// ============================================================================
// 1. ANIKUME ID CODEC & GITHUB ONLINE DATABASE (anime-list.json)
// ============================================================================

const _env: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env ? process.env : {};
const GITHUB_TOKEN = _env.GITHUB_TOKEN || "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";
const GITHUB_OWNER = _env.GITHUB_REPO_OWNER || "akibkawshara7";
const GITHUB_REPO = _env.GITHUB_REPO_NAME || "anikume-database";
const GITHUB_BRANCH = _env.GITHUB_BRANCH || "main";
const GITHUB_FILE_PATH = _env.GITHUB_FILE_PATH || "anime-list.json";

const BASE62_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE62_LEN = BASE62_CHARS.length;

let cachedItems: any[] | null = null;
let cachedItemsExpiresAt = 0;
let cachedSha: string | null = null;
let isCommitting = false;
let hasPendingChanges = false;
let debounceCommitTimer: any = null;
let commitPromiseChain = Promise.resolve();

const DATASET_TTL_MS = 86400 * 1000; // 24 hours (86,400 seconds)

// Uncompressed 24-hour in-memory caches for instant mapper lookups (skips zlib Gzip/Gunzip overhead)
const fastMapperOutputCache = new Map<string, { data: any; usedDbs: string[]; expiresAt: number }>();
const fastMapperStateCache = new Map<string, { state: any; usedDbs: string[]; expiresAt: number }>();
const aniZipV1MemoryCache = new Map<string, { data: any; expiresAt: number }>();

let hasPrewarmedOnFirstSearch = false;

export function clearIdsCache() {
  fastMapperOutputCache.clear();
  fastMapperStateCache.clear();
  aniZipV1MemoryCache.clear();
  cachedItems = null;
  cachedItemsExpiresAt = 0;
  cachedFribbDataset = null;
  cachedFribbExpiresAt = 0;
  cachedAnimeApiDataset = null;
  cachedAnimeApiExpiresAt = 0;
  hasPrewarmedOnFirstSearch = false;
}

const byAnikumeMap = new Map<string, any>();
const byAnilistMap = new Map<string, any>();
const byMalMap = new Map<string, any>();

function rebuildGitHubIndexes(items: any[]) {
  byAnikumeMap.clear();
  byAnilistMap.clear();
  byMalMap.clear();
  for (const item of items) {
    if (item.anikume_id) byAnikumeMap.set(String(item.anikume_id), item);
    if (item.anilist_id) byAnilistMap.set(String(item.anilist_id), item);
    if (item.mal_id) byMalMap.set(String(item.mal_id), item);
  }
}

const BUFFER_POOL_SIZE = 512;
const randomBuffer = new Uint8Array(BUFFER_POOL_SIZE);
let bufferOffset = BUFFER_POOL_SIZE;

function getFastRandomByte() {
  if (bufferOffset >= BUFFER_POOL_SIZE) {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(randomBuffer);
    } else {
      for (let i = 0; i < BUFFER_POOL_SIZE; i++) {
        randomBuffer[i] = Math.floor(Math.random() * 256);
      }
    }
    bufferOffset = 0;
  }
  return randomBuffer[bufferOffset++];
}

export function generateRandomAnikumeId(length = 10) {
  let result = "";
  for (let i = 0; i < length; i++) {
    const randByte = getFastRandomByte();
    result += BASE62_CHARS[randByte % BASE62_LEN];
  }
  return result;
}

export function generateAnikumeId() {
  return generateRandomAnikumeId(10);
}

let dbLoadingPromise: Promise<{ items: any[]; sha: string | null }> | null = null;

export async function fetchLiveDatasetFromGitHub(forceFresh = false) {
  if (cachedItems && !forceFresh && Date.now() < cachedItemsExpiresAt) {
    return { items: cachedItems, sha: cachedSha };
  }
  if (dbLoadingPromise && !forceFresh) {
    return dbLoadingPromise;
  }

  const loadTask = (async () => {
    try {
      const isBrowser = typeof window !== "undefined";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3.raw"
      };
      if (GITHUB_TOKEN) {
        headers.Authorization = `token ${GITHUB_TOKEN}`;
      }
      if (!isBrowser) {
        headers["User-Agent"] = "Apikume-API";
      }

      let res: Response | null = null;
      try {
        res = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=${GITHUB_BRANCH}`,
          {
            headers,
            cache: "no-store"
          }
        );
      } catch {
        res = null;
      }

      if ((!res || !res.ok) && isBrowser) {
        try {
          res = await fetch(
            `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE_PATH}`,
            { cache: "no-store" }
          );
        } catch {
          res = null;
        }
      }

      if (!res) {
        if (cachedItems) return { items: cachedItems, sha: cachedSha };
        return { items: [], sha: null };
      }
      if (res.status === 404) {
        cachedItems = [];
        cachedItemsExpiresAt = Date.now() + DATASET_TTL_MS;
        cachedSha = null;
        rebuildGitHubIndexes([]);
        return { items: [], sha: null };
      }
      if (!res.ok) {
        if (!isBrowser) {
          console.warn(`[GitHub-Online-DB] Warning: GitHub API returned status ${res.status}`);
        }
        if (cachedItems) return { items: cachedItems, sha: cachedSha };
        return { items: [], sha: null };
      }
      const etag = res.headers.get("etag");
      const commitSha = res.headers.get("x-git-commit-sha");
      const sha = commitSha || (etag ? etag.replace(/W\/"|"|'/g, "") : null);
      const rawText = await res.text();
      if (!rawText.trim()) {
        cachedItems = [];
        cachedItemsExpiresAt = Date.now() + DATASET_TTL_MS;
        cachedSha = sha;
        rebuildGitHubIndexes([]);
        return { items: [], sha };
      }
      const parsed = JSON.parse(rawText);
      const rawList = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.data)
        ? parsed.data
        : Array.isArray(parsed.items)
        ? parsed.items
        : [];
      const items = rawList
        .map((item: any) => ({
          anikume_id: String(item.anikume_id || item.anikume || ""),
          anilist_id:
            item.anilist_id && item.anilist_id !== "null"
              ? String(item.anilist_id)
              : item.anilist && item.anilist !== "null"
              ? String(item.anilist)
              : null,
          mal_id:
            item.mal_id && item.mal_id !== "null"
              ? String(item.mal_id)
              : item.mal && item.mal !== "null"
              ? String(item.mal)
              : null
        }))
        .filter((item: any) => Boolean(item.anikume_id));
      cachedItems = items;
      cachedItemsExpiresAt = Date.now() + DATASET_TTL_MS;
      cachedSha = sha;
      rebuildGitHubIndexes(items);
      return { items, sha };
    } catch (err) {
      if (typeof window === "undefined") {
        console.warn("[GitHub-Online-DB] Error fetching live dataset from GitHub:", err);
      }
      if (cachedItems) return { items: cachedItems, sha: cachedSha };
      return { items: [], sha: null };
    } finally {
      dbLoadingPromise = null;
    }
  })();

  dbLoadingPromise = loadTask;
  return loadTask;
}

async function getLatestFileSha() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          "User-Agent": "Apikume-API",
          Accept: "application/vnd.github.v3+json"
        },
        cache: "no-store"
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha || null;
  } catch {
    return null;
  }
}

async function pushToGitHubDirect(items: any[], currentSha: string | null) {
  if (typeof window !== "undefined") return null;
  try {
    const payload = items.map((rec) => ({
      anikume_id: rec.anikume_id,
      anilist_id: rec.anilist_id,
      mal_id: rec.mal_id
    }));
    const jsonString = JSON.stringify(payload, null, 2);
    const contentBase64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(jsonString).toString("base64")
        : btoa(unescape(encodeURIComponent(jsonString)));
    let targetSha = currentSha || cachedSha;
    if (!targetSha) {
      targetSha = await getLatestFileSha();
    }
    const body: any = {
      message: `Update ${GITHUB_FILE_PATH} (${payload.length} anime IDs)`,
      content: contentBase64,
      branch: GITHUB_BRANCH
    };
    if (targetSha) {
      body.sha = targetSha;
    }
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          "User-Agent": "Apikume-API",
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    if (res.status === 409) {
      const freshSha = await getLatestFileSha();
      if (freshSha) {
        body.sha = freshSha;
        const retryRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`,
          {
            method: "PUT",
            headers: {
              Authorization: `token ${GITHUB_TOKEN}`,
              "User-Agent": "Apikume-API",
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }
        );
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const newSha = retryData.content?.sha || null;
          cachedSha = newSha;
          return newSha;
        }
      }
    }
    if (res.ok) {
      const resData = await res.json();
      const newSha = resData.content?.sha || null;
      cachedSha = newSha;
      return newSha;
    } else {
      const errText = await res.text();
      console.warn(`[GitHub-Online-DB] Failed to commit to GitHub (Status ${res.status}):`, errText);
      return null;
    }
  } catch (err) {
    console.warn("[GitHub-Online-DB] Error pushing to GitHub:", err);
    return null;
  }
}

export function scheduleSingleGitHubCommit(delayMs = 300) {
  if (typeof window !== "undefined") return;
  hasPendingChanges = true;
  if (debounceCommitTimer) {
    clearTimeout(debounceCommitTimer);
  }
  debounceCommitTimer = setTimeout(() => {
    debounceCommitTimer = null;
    commitPromiseChain = commitPromiseChain.then(async () => {
      if (!hasPendingChanges || !cachedItems) return;
      if (isCommitting) return;
      isCommitting = true;
      hasPendingChanges = false;
      try {
        const newSha = await pushToGitHubDirect(cachedItems, cachedSha);
        if (newSha) {
          cachedSha = newSha;
        }
      } catch (err) {
        console.error("[GitHub-Online-DB] Single write error:", err);
      } finally {
        isCommitting = false;
        if (hasPendingChanges) {
          scheduleSingleGitHubCommit(100);
        }
      }
    });
  }, delayMs);
}

// ============================================================================
// 2. THREE MAPPING DATABASES (Fribb -> Nattadasu animeapi.json -> Ani.zip v1)
// ============================================================================

const FRIBB_TTL_MS = DATASET_TTL_MS;
let cachedFribbDataset: any = null;
let cachedFribbExpiresAt = 0;
let fribbLoadingPromise: Promise<any> | null = null;

function buildDatasetIndex(items: any[]) {
  const index = new Map<string, any>();
  const tvdbOffsets = new Map<string, Set<number>>();
  const tmdbOffsets = new Map<string, Set<number>>();

  for (const item of items) {
    if (item.anilist_id !== undefined && item.anilist_id !== null) {
      index.set(`anilist:${item.anilist_id}`, item);
    }
    if (item.mal_id !== undefined && item.mal_id !== null) {
      index.set(`mal:${item.mal_id}`, item);
    }
    if (item.kitsu_id !== undefined && item.kitsu_id !== null) {
      index.set(`kitsu:${item.kitsu_id}`, item);
    }
    if (item.anidb_id !== undefined && item.anidb_id !== null) {
      index.set(`anidb:${item.anidb_id}`, item);
    }
    if (item.simkl_id !== undefined && item.simkl_id !== null) {
      index.set(`simkl:${item.simkl_id}`, item);
    }
    if (item["anime-planet_id"] !== undefined && item["anime-planet_id"] !== null) {
      index.set(`animeplanet:${item["anime-planet_id"]}`, item);
      index.set(`anime-planet:${item["anime-planet_id"]}`, item);
    }
    if (item.livechart_id !== undefined && item.livechart_id !== null) {
      index.set(`livechart:${item.livechart_id}`, item);
    }
    if (item.anisearch_id !== undefined && item.anisearch_id !== null) {
      index.set(`anisearch:${item.anisearch_id}`, item);
    }
    if (item.animecountdown_id !== undefined && item.animecountdown_id !== null) {
      index.set(`animecountdown:${item.animecountdown_id}`, item);
    }

    const actualTvdbId = item.tvdb_id || item.thetvdb_id;
    if (actualTvdbId !== undefined && actualTvdbId !== null) {
      const showId = String(actualTvdbId);
      const existing = index.get(`tvdb:${showId}`);
      if (!existing || existing.type !== "TV" || item.type === "TV") {
        index.set(`tvdb:${showId}`, item);
      }
      if (item.season?.tvdb !== undefined && item.season?.tvdb !== null) {
        const tvdbSeason = String(item.season.tvdb);
        index.set(`tvdb:${showId}:${tvdbSeason}`, item);
        const key = `${showId}:${tvdbSeason}`;
        const set = tvdbOffsets.get(key) || new Set<number>();
        if (item.episode_offset?.tvdb !== undefined && item.episode_offset?.tvdb !== null) {
          const offsetVal = parseInt(item.episode_offset.tvdb, 10);
          if (!isNaN(offsetVal)) {
            set.add(offsetVal);
          }
        } else {
          set.add(0);
        }
        tvdbOffsets.set(key, set);
      }
    }

    if (item.themoviedb_id !== undefined && item.themoviedb_id !== null) {
      const tmdb = item.themoviedb_id;
      if (typeof tmdb === "object") {
        if (tmdb.tv) {
          const showId = String(tmdb.tv);
          const existing = index.get(`tmdb:${showId}`);
          if (!existing || existing.type !== "TV" || item.type === "TV") {
            index.set(`tmdb:${showId}`, item);
          }
          if (item.season?.tmdb !== undefined && item.season?.tmdb !== null) {
            const tmdbSeason = String(item.season.tmdb);
            index.set(`tmdb:${showId}:${tmdbSeason}`, item);
            const key = `${showId}:${tmdbSeason}`;
            const set = tmdbOffsets.get(key) || new Set<number>();
            if (item.episode_offset?.tmdb !== undefined && item.episode_offset?.tmdb !== null) {
              const offsetVal = parseInt(item.episode_offset.tmdb, 10);
              if (!isNaN(offsetVal)) {
                set.add(offsetVal);
              }
            } else {
              set.add(0);
            }
            tmdbOffsets.set(key, set);
          }
        }
        if (tmdb.movie) {
          if (Array.isArray(tmdb.movie)) {
            for (const m of tmdb.movie) {
              if (m) index.set(`tmdb:${m}`, item);
            }
          } else {
            index.set(`tmdb:${tmdb.movie}`, item);
          }
        }
      } else {
        index.set(`tmdb:${tmdb}`, item);
      }
    }
  }

  const sortedTvdbOffsets = new Map<string, number[]>();
  for (const [k, set] of Array.from(tvdbOffsets.entries())) {
    sortedTvdbOffsets.set(
      k,
      Array.from(set).sort((a, b) => a - b)
    );
  }
  const sortedTmdbOffsets = new Map<string, number[]>();
  for (const [k, set] of Array.from(tmdbOffsets.entries())) {
    sortedTmdbOffsets.set(
      k,
      Array.from(set).sort((a, b) => a - b)
    );
  }

  const datasetObj = { items, index, tvdbOffsets: sortedTvdbOffsets, tmdbOffsets: sortedTmdbOffsets };

  // Pre-calculate TMDB and TVDB { id, season, episode } once per item when indexing Fribb
  for (const item of items) {
    const isMovie = String(item.type || "").toUpperCase() === "MOVIE";

    // Pre-calculate TMDB
    let tmdbId: string | null = null;
    let isTmdbMovie = isMovie;
    if (item.themoviedb_id !== undefined && item.themoviedb_id !== null) {
      if (typeof item.themoviedb_id === "object") {
        if (isMovie && item.themoviedb_id.movie) {
          tmdbId = Array.isArray(item.themoviedb_id.movie)
            ? String(item.themoviedb_id.movie[0])
            : String(item.themoviedb_id.movie);
          isTmdbMovie = true;
        } else if (item.themoviedb_id.tv) {
          tmdbId = String(item.themoviedb_id.tv);
          isTmdbMovie = false;
        } else if (item.themoviedb_id.movie) {
          tmdbId = Array.isArray(item.themoviedb_id.movie)
            ? String(item.themoviedb_id.movie[0])
            : String(item.themoviedb_id.movie);
          isTmdbMovie = true;
        }
      } else {
        tmdbId = String(item.themoviedb_id);
      }
    } else if (item.tmdb_id !== undefined && item.tmdb_id !== null) {
      tmdbId = String(item.tmdb_id);
    }

    if (tmdbId) {
      let tmdbSeason: string | null = null;
      let tmdbEpisode: string | null = null;
      if (!isTmdbMovie) {
        tmdbSeason =
          item.season?.tmdb !== undefined && item.season?.tmdb !== null ? String(item.season.tmdb) : null;
        if (tmdbSeason !== null) {
          const startEnd = getIndexedProviderStartEnd(datasetObj, item, "tmdb");
          item._tmdb_start_end = startEnd;
          if (startEnd) {
            tmdbEpisode = startEnd.end ? `${startEnd.start}-${startEnd.end}` : `${startEnd.start}-null`;
          } else {
            tmdbEpisode = "1-null";
          }
        } else {
          const offset =
            item.episode_offset?.tmdb !== undefined && item.episode_offset?.tmdb !== null
              ? parseInt(item.episode_offset.tmdb, 10) || 0
              : 0;
          tmdbEpisode = `${offset + 1}-null`;
        }
      }
      item._precomputed_tmdb = {
        id: tmdbId,
        season: tmdbSeason,
        episode: tmdbEpisode
      };
    } else {
      item._precomputed_tmdb = null;
    }

    // Pre-calculate TVDB
    const rawTvdb = item.tvdb_id ?? item.thetvdb_id;
    if (rawTvdb !== undefined && rawTvdb !== null) {
      const tvdbId = String(rawTvdb);
      const rawTvdbSeason = item.season?.tvdb;
      const isTvdbMovie = isMovie || rawTvdbSeason === 0 || rawTvdbSeason === "0";
      let tvdbSeason: string | null = null;
      let tvdbEpisode: string | null = null;
      if (!isTvdbMovie) {
        tvdbSeason = rawTvdbSeason !== undefined && rawTvdbSeason !== null ? String(rawTvdbSeason) : null;
        if (tvdbSeason !== null) {
          const startEnd = getIndexedProviderStartEnd(datasetObj, item, "tvdb");
          item._tvdb_start_end = startEnd;
          if (startEnd) {
            tvdbEpisode = startEnd.end ? `${startEnd.start}-${startEnd.end}` : `${startEnd.start}-null`;
          } else {
            tvdbEpisode = "1-null";
          }
        } else {
          const offset =
            item.episode_offset?.tvdb !== undefined && item.episode_offset?.tvdb !== null
              ? parseInt(item.episode_offset.tvdb, 10) || 0
              : 0;
          tvdbEpisode = `${offset + 1}-null`;
        }
      }
      item._precomputed_tvdb = {
        id: tvdbId,
        season: tvdbSeason,
        episode: tvdbEpisode
      };
    } else {
      item._precomputed_tvdb = null;
    }
  }

  return datasetObj;
}

export async function getFribbDataset(forceFresh = false) {
  if (!forceFresh && cachedFribbDataset && Date.now() < cachedFribbExpiresAt) {
    return cachedFribbDataset;
  }
  if (!forceFresh && fribbLoadingPromise) {
    return fribbLoadingPromise;
  }
  fribbLoadingPromise = (async () => {
    try {
      const res = await fetch("https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json", {
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`Failed to fetch Fribb dataset: HTTP ${res.status}`);
      const rawData = await res.json();
      cachedFribbDataset = buildDatasetIndex(Array.isArray(rawData) ? rawData : []);
      cachedFribbExpiresAt = Date.now() + FRIBB_TTL_MS;
      return cachedFribbDataset;
    } catch (err) {
      if (typeof window === "undefined") {
        console.warn("[IDs] Error loading Fribb dataset:", err);
      }
      if (!cachedFribbDataset) {
        cachedFribbDataset = buildDatasetIndex([]);
      }
      return cachedFribbDataset;
    } finally {
      fribbLoadingPromise = null;
    }
  })();
  return fribbLoadingPromise;
}

// DB 2: Nattadasu animeApi (https://raw.githubusercontent.com/nattadasu/animeApi/refs/heads/v3/database/animeapi.json)
let cachedAnimeApiDataset: { index: Map<string, any>; items: any[] } | null = null;
let cachedAnimeApiExpiresAt = 0;
let animeApiLoadingPromise: Promise<{ index: Map<string, any>; items: any[] }> | null = null;

function buildAnimeApiIndex(rawItems: any[]) {
  const index = new Map<string, any>();
  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const anilistId =
      item.anilist_id ?? item.anilist ?? item.mappings?.anilist_id ?? item.mappings?.anilist ?? null;
    const malId =
      item.mal_id ?? item.mal ?? item.myanimelist_id ?? item.mappings?.mal_id ?? item.mappings?.mal ?? null;

    if (anilistId !== null && anilistId !== undefined) {
      index.set(`anilist:${anilistId}`, item);
    }
    if (malId !== null && malId !== undefined) {
      index.set(`mal:${malId}`, item);
    }
  }
  return { items: rawItems, index };
}

export async function getAnimeApiDataset(forceFresh = false) {
  if (!forceFresh && cachedAnimeApiDataset && Date.now() < cachedAnimeApiExpiresAt) {
    return cachedAnimeApiDataset;
  }
  if (!forceFresh && animeApiLoadingPromise) {
    return animeApiLoadingPromise;
  }

  animeApiLoadingPromise = (async () => {
    try {
      const res = await fetch(
        "https://raw.githubusercontent.com/nattadasu/animeApi/refs/heads/v3/database/animeapi.json",
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`Failed to fetch animeapi.json: HTTP ${res.status}`);
      const rawData = await res.json();
      const list = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.data)
        ? rawData.data
        : Array.isArray(rawData?.anime)
        ? rawData.anime
        : typeof rawData === "object" && rawData !== null
        ? Object.values(rawData)
        : [];
      cachedAnimeApiDataset = buildAnimeApiIndex(list);
      cachedAnimeApiExpiresAt = Date.now() + FRIBB_TTL_MS;
      return cachedAnimeApiDataset;
    } catch (err) {
      if (typeof window === "undefined") {
        console.warn("[IDs] Error loading nattadasu animeapi.json:", err);
      }
      if (!cachedAnimeApiDataset) {
        cachedAnimeApiDataset = buildAnimeApiIndex([]);
      }
      return cachedAnimeApiDataset;
    } finally {
      animeApiLoadingPromise = null;
    }
  })();
  return animeApiLoadingPromise;
}

// DB 3: Ani.zip v1 (https://api.ani.zip/v1/mappings?anilist_id= or mal_id=)
export async function fetchAniZipV1(params: { anilist_id?: any; mal_id?: any }, forceFresh = false) {
  let queryParam = "";
  let cacheKey = "";
  if (params.anilist_id) {
    const idStr = String(params.anilist_id).trim();
    queryParam = `anilist_id=${encodeURIComponent(idStr)}`;
    cacheKey = `anizip_v1:anilist:${idStr}`;
  } else if (params.mal_id) {
    const idStr = String(params.mal_id).trim();
    queryParam = `mal_id=${encodeURIComponent(idStr)}`;
    cacheKey = `anizip_v1:mal:${idStr}`;
  }
  if (!queryParam) return null;

  try {
    const url = `https://api.ani.zip/v1/mappings?${queryParam}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== "object") return null;
    const normalized = data.mappings && typeof data.mappings === "object" ? data.mappings : data;
    return normalized;
  } catch (err) {
    console.warn("[IDs] Failed to fetch from api.ani.zip/v1/mappings:", err);
    return null;
  }
}

function ensureFirstSearchPrewarm(forceFresh = false) {
  if (forceFresh) {
    hasPrewarmedOnFirstSearch = false;
  }
  if (!hasPrewarmedOnFirstSearch) {
    hasPrewarmedOnFirstSearch = true;
    fetchLiveDatasetFromGitHub(forceFresh).catch(() => {});
    if (typeof window === "undefined") {
      getFribbDataset(forceFresh).catch(() => {});
      getAnimeApiDataset(forceFresh).catch(() => {});
    }
  }
}

// Legacy-compatible fetchAniZip for episodes.ts / details.ts / catalog.ts (which read .episodes or .mappings)
export async function fetchAniZip(params: any) {
  let queryParam = "";
  if (params.anilist_id) queryParam = `anilist_id=${encodeURIComponent(String(params.anilist_id))}`;
  else if (params.mal_id) queryParam = `mal_id=${encodeURIComponent(String(params.mal_id))}`;
  else if (params.anidb_id) queryParam = `anidb_id=${encodeURIComponent(String(params.anidb_id))}`;
  else if (params.kitsu_id) queryParam = `kitsu_id=${encodeURIComponent(String(params.kitsu_id))}`;
  else if (params.animeplanet_id) queryParam = `animeplanet_id=${encodeURIComponent(String(params.animeplanet_id))}`;
  else if (params.anisearch_id) queryParam = `anisearch_id=${encodeURIComponent(String(params.anisearch_id))}`;
  else if (params.livechart_id) queryParam = `livechart_id=${encodeURIComponent(String(params.livechart_id))}`;
  if (!queryParam) return null;

  const cacheKey = `anizip_full:${queryParam}`;
  const cached = serverCache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.ani.zip/mappings?${queryParam}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || (!data.mappings && !data.anilist_id && !data.mal_id)) return null;
    serverCache.set(cacheKey, data, 86400);
    return data;
  } catch {
    return null;
  }
}

export async function mapAnilistToMal(anilistId: any) {
  if (!anilistId) return null;
  const idStr = String(anilistId).trim();
  const { items } = await fetchLiveDatasetFromGitHub();
  const dbEntry = byAnilistMap.get(idStr) || items.find((r: any) => r.anilist_id === idStr);
  if (dbEntry?.mal_id) return String(dbEntry.mal_id);

  const fribb = await getFribbDataset();
  const fribbEntry = fribb.index.get(`anilist:${idStr}`);
  if (fribbEntry?.mal_id) return String(fribbEntry.mal_id);

  const animeApi = await getAnimeApiDataset();
  const apiEntry = animeApi.index.get(`anilist:${idStr}`);
  const apiMal = apiEntry?.mal_id ?? apiEntry?.mal ?? apiEntry?.myanimelist_id ?? apiEntry?.mappings?.mal_id;
  if (apiMal) return String(apiMal);

  const aniZip = await fetchAniZipV1({ anilist_id: idStr });
  if (aniZip?.mal_id) return String(aniZip.mal_id);
  return null;
}

export async function mapMalToAnilist(malId: any) {
  if (!malId) return null;
  const idStr = String(malId).trim();
  const { items } = await fetchLiveDatasetFromGitHub();
  const dbEntry = byMalMap.get(idStr) || items.find((r: any) => r.mal_id === idStr);
  if (dbEntry?.anilist_id) return String(dbEntry.anilist_id);

  const fribb = await getFribbDataset();
  const fribbEntry = fribb.index.get(`mal:${idStr}`);
  if (fribbEntry?.anilist_id) return String(fribbEntry.anilist_id);

  const animeApi = await getAnimeApiDataset();
  const apiEntry = animeApi.index.get(`mal:${idStr}`);
  const apiAni = apiEntry?.anilist_id ?? apiEntry?.anilist ?? apiEntry?.mappings?.anilist_id;
  if (apiAni) return String(apiAni);

  const aniZip = await fetchAniZipV1({ mal_id: idStr });
  if (aniZip?.anilist_id) return String(aniZip.anilist_id);
  return null;
}

export async function getOrCreateAnikumeId(
  ids: { anilist_id?: any; mal_id?: any },
  skipSecondaryLookup = false
) {
  let anilistIdStr = ids.anilist_id && ids.anilist_id !== "null" ? String(ids.anilist_id).trim() : null;
  let malIdStr = ids.mal_id && ids.mal_id !== "null" ? String(ids.mal_id).trim() : null;
  const { items } = await fetchLiveDatasetFromGitHub();

  let existing =
    (anilistIdStr ? byAnilistMap.get(anilistIdStr) : null) ||
    (malIdStr ? byMalMap.get(malIdStr) : null) ||
    null;

  if (existing) {
    let changed = false;
    if (!existing.mal_id) {
      if (malIdStr) {
        existing.mal_id = malIdStr;
        byMalMap.set(malIdStr, existing);
        changed = true;
      } else if (existing.anilist_id && !skipSecondaryLookup) {
        const foundMal = await mapAnilistToMal(existing.anilist_id).catch(() => null);
        if (foundMal) {
          existing.mal_id = foundMal;
          byMalMap.set(foundMal, existing);
          changed = true;
        }
      }
    }
    if (!existing.anilist_id) {
      if (anilistIdStr) {
        existing.anilist_id = anilistIdStr;
        byAnilistMap.set(anilistIdStr, existing);
        changed = true;
      } else if (existing.mal_id && !skipSecondaryLookup) {
        const foundAni = await mapMalToAnilist(existing.mal_id).catch(() => null);
        if (foundAni) {
          existing.anilist_id = foundAni;
          byAnilistMap.set(foundAni, existing);
          changed = true;
        }
      }
    }
    if (changed) {
      scheduleSingleGitHubCommit();
    }
    return existing.anikume_id;
  }

  if (!skipSecondaryLookup) {
    if (anilistIdStr && !malIdStr) {
      const mappedMal = await mapAnilistToMal(anilistIdStr).catch(() => null);
      if (mappedMal) malIdStr = mappedMal;
    } else if (!anilistIdStr && malIdStr) {
      const mappedAni = await mapMalToAnilist(malIdStr).catch(() => null);
      if (mappedAni) anilistIdStr = mappedAni;
    }
  }

  const secondary =
    (anilistIdStr ? byAnilistMap.get(anilistIdStr) : null) ||
    (malIdStr ? byMalMap.get(malIdStr) : null) ||
    null;

  if (secondary) {
    let changed = false;
    if (malIdStr && !secondary.mal_id) {
      secondary.mal_id = malIdStr;
      byMalMap.set(malIdStr, secondary);
      changed = true;
    }
    if (anilistIdStr && !secondary.anilist_id) {
      secondary.anilist_id = anilistIdStr;
      byAnilistMap.set(anilistIdStr, secondary);
      changed = true;
    }
    if (changed) {
      scheduleSingleGitHubCommit();
    }
    return secondary.anikume_id;
  }

  let newAnikumeId = generateRandomAnikumeId(10);
  while (byAnikumeMap.has(newAnikumeId)) {
    newAnikumeId = generateRandomAnikumeId(10);
  }
  const newRecord = { anikume_id: newAnikumeId, anilist_id: anilistIdStr, mal_id: malIdStr };
  items.push(newRecord);
  byAnikumeMap.set(newAnikumeId, newRecord);
  if (anilistIdStr) byAnilistMap.set(anilistIdStr, newRecord);
  if (malIdStr) byMalMap.set(malIdStr, newRecord);
  scheduleSingleGitHubCommit();
  return newAnikumeId;
}

export async function getOrCreateAnikumeIdsBatch(itemsToResolve: any[]) {
  if (!itemsToResolve || itemsToResolve.length === 0) return [];
  const { items } = await fetchLiveDatasetFromGitHub();
  const results = new Array(itemsToResolve.length);
  let shouldUpdateGitHub = false;

  const pendingMappingTasks: any[] = [];
  for (let i = 0; i < itemsToResolve.length; i++) {
    const item = itemsToResolve[i];
    const anilistIdStr = item.anilist_id && item.anilist_id !== "null" ? String(item.anilist_id).trim() : null;
    const malIdStr = item.mal_id && item.mal_id !== "null" ? String(item.mal_id).trim() : null;
    let match =
      (anilistIdStr ? byAnilistMap.get(anilistIdStr) : null) ||
      (malIdStr ? byMalMap.get(malIdStr) : null);

    if (match) {
      if (malIdStr && !match.mal_id) {
        match.mal_id = malIdStr;
        byMalMap.set(malIdStr, match);
        shouldUpdateGitHub = true;
      }
      if (anilistIdStr && !match.anilist_id) {
        match.anilist_id = anilistIdStr;
        byAnilistMap.set(anilistIdStr, match);
        shouldUpdateGitHub = true;
      }
      results[i] = match.anikume_id;
    } else {
      pendingMappingTasks.push({ idx: i, anilistId: anilistIdStr, malId: malIdStr });
    }
  }

  if (pendingMappingTasks.length > 0) {
    await Promise.all(
      pendingMappingTasks.map(async (task) => {
        let anilistIdStr = task.anilistId;
        let malIdStr = task.malId;
        if (anilistIdStr && !malIdStr) {
          const mapped = await mapAnilistToMal(anilistIdStr).catch(() => null);
          if (mapped) malIdStr = mapped;
        } else if (!anilistIdStr && malIdStr) {
          const mapped = await mapMalToAnilist(malIdStr).catch(() => null);
          if (mapped) anilistIdStr = mapped;
        }
        let match =
          (anilistIdStr ? byAnilistMap.get(anilistIdStr) : null) ||
          (malIdStr ? byMalMap.get(malIdStr) : null);

        if (match) {
          if (malIdStr && !match.mal_id) {
            match.mal_id = malIdStr;
            byMalMap.set(malIdStr, match);
            shouldUpdateGitHub = true;
          }
          if (anilistIdStr && !match.anilist_id) {
            match.anilist_id = anilistIdStr;
            byAnilistMap.set(anilistIdStr, match);
            shouldUpdateGitHub = true;
          }
          results[task.idx] = match.anikume_id;
        } else {
          let newId = generateRandomAnikumeId(10);
          while (byAnikumeMap.has(newId)) {
            newId = generateRandomAnikumeId(10);
          }
          const rec = { anikume_id: newId, anilist_id: anilistIdStr, mal_id: malIdStr };
          items.push(rec);
          byAnikumeMap.set(newId, rec);
          if (anilistIdStr) byAnilistMap.set(anilistIdStr, rec);
          if (malIdStr) byMalMap.set(malIdStr, rec);
          results[task.idx] = newId;
          shouldUpdateGitHub = true;
        }
      })
    );
  }

  if (shouldUpdateGitHub) {
    scheduleSingleGitHubCommit();
  }
  return results;
}

export async function findAnimeByAnikumeId(anikumeId: string) {
  if (!anikumeId) return null;
  const trimmed = anikumeId.trim();
  await fetchLiveDatasetFromGitHub();
  return byAnikumeMap.get(trimmed) || null;
}

export async function findByAnikumeId(anikumeId: string) {
  return findAnimeByAnikumeId(anikumeId);
}

export async function findByTrackerId(tracker: string, id: string) {
  if (!id) return null;
  const idStr = String(id).trim();
  await fetchLiveDatasetFromGitHub();
  const norm = tracker ? tracker.toLowerCase().trim() : "";
  if (norm === "anilist") {
    return byAnilistMap.get(idStr) || null;
  } else if (norm === "mal" || norm === "myanimelist") {
    return byMalMap.get(idStr) || null;
  }
  return null;
}

export async function updateMissingId(anikumeId: string, type: string, newId: string) {
  if (!anikumeId || !newId || newId === "null") return;
  const newIdStr = String(newId).trim();
  await fetchLiveDatasetFromGitHub();
  const existing = byAnikumeMap.get(anikumeId.trim());
  if (!existing) return;
  let changed = false;
  if (type === "anilist" && existing.anilist_id !== newIdStr) {
    existing.anilist_id = newIdStr;
    byAnilistMap.set(newIdStr, existing);
    changed = true;
  } else if ((type === "mal" || type === "myanimelist") && existing.mal_id !== newIdStr) {
    existing.mal_id = newIdStr;
    byMalMap.set(newIdStr, existing);
    changed = true;
  }
  if (changed) {
    scheduleSingleGitHubCommit();
  }
}

export async function getSavedIdsStats() {
  const { items: animeItems } = await fetchLiveDatasetFromGitHub();
  return {
    database_type: "GitHub Repository Live JSON (Always Online - No Local Cache)",
    repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    file_path: GITHUB_FILE_PATH,
    branch: GITHUB_BRANCH,
    total_saved_anime: animeItems.length
  };
}

export async function getAllSavedIds() {
  const { items } = await fetchLiveDatasetFromGitHub();
  return items;
}

// ============================================================================
// 3. UNIFIED MAPPER ENGINE & CANONICAL SCHEMA (Condition A & Condition B)
// ============================================================================

export const CANONICAL_MAP_KEYS = [
  "anikume",
  "type",
  "anidb",
  "anilist",
  "animecountdown",
  "animenewsnetwork",
  "anime-planet",
  "anisearch",
  "imdb",
  "kitsu",
  "livechart",
  "mal",
  "simkl",
  "tmdb",
  "tvdb"
] as const;

export function formatAnimeType(rawType: any): string | null {
  if (!rawType) return null;
  const upper = String(rawType).trim().toUpperCase();
  if (upper === "TV" || upper === "TV SHOW" || upper === "TV_SHOW") return "Tv Show";
  if (upper === "TV_SHORT" || upper === "TV SHORT") return "Tv Short";
  if (upper === "MOVIE") return "Movie";
  if (upper === "OVA") return "OVA";
  if (upper === "ONA") return "ONA";
  if (upper === "SPECIAL") return "Special";
  if (upper === "MUSIC") return "Music";
  const cleaned = String(rawType).trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function getIndexedProviderStartEnd(dataset: any, mapping: any, provider: "tvdb" | "tmdb") {
  let showId: string | null = null;
  let season: string | null = null;
  if (provider === "tvdb" && (mapping.tvdb_id || mapping.thetvdb_id)) {
    showId = String(mapping.tvdb_id || mapping.thetvdb_id);
    if (mapping.season?.tvdb !== undefined && mapping.season?.tvdb !== null) {
      season = String(mapping.season.tvdb);
    }
  } else if (provider === "tmdb" && (mapping.tmdb_id || mapping.themoviedb_id?.tv)) {
    showId = String(mapping.tmdb_id || mapping.themoviedb_id?.tv);
    if (mapping.season?.tmdb !== undefined && mapping.season?.tmdb !== null) {
      season = String(mapping.season.tmdb);
    }
  }
  if (!showId || season === null) return null;
  const lookupKey = `${showId}:${season}`;
  const offsets = provider === "tvdb" ? dataset.tvdbOffsets.get(lookupKey) : dataset.tmdbOffsets.get(lookupKey);
  const myOffset =
    mapping.episode_offset &&
    mapping.episode_offset[provider] !== undefined &&
    mapping.episode_offset[provider] !== null
      ? parseInt(mapping.episode_offset[provider], 10) || 0
      : 0;
  if (!offsets || offsets.length === 0) {
    return { start: myOffset + 1, end: null };
  }
  const myIndex = offsets.indexOf(myOffset);
  if (myIndex === -1) {
    return { start: myOffset + 1, end: null };
  }
  const start = myOffset + 1;
  const end = offsets[myIndex + 1] !== undefined ? offsets[myIndex + 1] : null;
  return { start, end };
}

function createEmptyCanonicalState(anikumeId: string | null = null, anilistId: string | null = null, malId: string | null = null) {
  return {
    anikume: anikumeId ? String(anikumeId) : null,
    type: null as string | null,
    anidb: null as string | null,
    anilist: anilistId ? String(anilistId) : null,
    animecountdown: null as string | null,
    animenewsnetwork: null as string | null,
    "anime-planet": null as string | null,
    anisearch: null as string | null,
    imdb: null as string | null,
    kitsu: null as string | null,
    livechart: null as string | null,
    mal: malId ? String(malId) : null,
    simkl: null as string | null,
    tmdb: {
      id: null as string | null,
      season: null as string | null,
      episode: null as string | null
    },
    tvdb: {
      id: null as string | null,
      season: null as string | null,
      episode: null as string | null
    }
  };
}

function isFieldPopulated(state: any, key: string): boolean {
  if (key === "tmdb") {
    return Boolean(state.tmdb && state.tmdb.id);
  }
  if (key === "tvdb") {
    return Boolean(state.tvdb && state.tvdb.id);
  }
  return state[key] !== null && state[key] !== undefined && state[key] !== "";
}

function areAllTargetFieldsPopulated(state: any, targetKeys: readonly string[]): boolean {
  for (const k of targetKeys) {
    if (!isFieldPopulated(state, k)) {
      return false;
    }
  }
  return true;
}

function applyFribbToState(state: any, fribbDataset: any, item: any) {
  if (!item) return;

  if (!state.type && item.type) {
    state.type = formatAnimeType(item.type);
  }
  if (!state.anidb && item.anidb_id !== undefined && item.anidb_id !== null) {
    state.anidb = String(item.anidb_id);
  }
  if (!state.anilist && item.anilist_id !== undefined && item.anilist_id !== null) {
    state.anilist = String(item.anilist_id);
  }
  if (!state.animecountdown && item.animecountdown_id !== undefined && item.animecountdown_id !== null) {
    state.animecountdown = String(item.animecountdown_id);
  }
  const annVal = item.ann_id ?? item.animenewsnetwork_id ?? item["animenewsnetwork_id"];
  if (!state.animenewsnetwork && annVal !== undefined && annVal !== null) {
    state.animenewsnetwork = String(Array.isArray(annVal) ? annVal[0] : annVal);
  }
  if (!state["anime-planet"] && item["anime-planet_id"] !== undefined && item["anime-planet_id"] !== null) {
    state["anime-planet"] = String(item["anime-planet_id"]);
  }
  if (!state.anisearch && item.anisearch_id !== undefined && item.anisearch_id !== null) {
    state.anisearch = String(item.anisearch_id);
  }
  if (!state.imdb && item.imdb_id !== undefined && item.imdb_id !== null) {
    const imdbRaw = Array.isArray(item.imdb_id) ? item.imdb_id[0] : item.imdb_id;
    if (imdbRaw) state.imdb = String(imdbRaw);
  }
  if (!state.kitsu && item.kitsu_id !== undefined && item.kitsu_id !== null) {
    state.kitsu = String(item.kitsu_id);
  }
  if (!state.livechart && item.livechart_id !== undefined && item.livechart_id !== null) {
    state.livechart = String(item.livechart_id);
  }
  if (!state.mal && item.mal_id !== undefined && item.mal_id !== null) {
    state.mal = String(item.mal_id);
  }
  if (!state.simkl && item.simkl_id !== undefined && item.simkl_id !== null) {
    state.simkl = String(item.simkl_id);
  }

  // TMDB handling (uses pre-calculated TMDB boundary if available)
  if (!state.tmdb.id) {
    if (item._precomputed_tmdb) {
      state.tmdb.id = item._precomputed_tmdb.id;
      state.tmdb.season = item._precomputed_tmdb.season;
      state.tmdb.episode = item._precomputed_tmdb.episode;
    } else {
      const isMovie = String(item.type || "").toUpperCase() === "MOVIE";
      let tmdbId: string | null = null;
      let isTmdbMovie = isMovie;
      if (item.themoviedb_id !== undefined && item.themoviedb_id !== null) {
        if (typeof item.themoviedb_id === "object") {
          if (isMovie && item.themoviedb_id.movie) {
            tmdbId = Array.isArray(item.themoviedb_id.movie)
              ? String(item.themoviedb_id.movie[0])
              : String(item.themoviedb_id.movie);
            isTmdbMovie = true;
          } else if (item.themoviedb_id.tv) {
            tmdbId = String(item.themoviedb_id.tv);
            isTmdbMovie = false;
          } else if (item.themoviedb_id.movie) {
            tmdbId = Array.isArray(item.themoviedb_id.movie)
              ? String(item.themoviedb_id.movie[0])
              : String(item.themoviedb_id.movie);
            isTmdbMovie = true;
          }
        } else {
          tmdbId = String(item.themoviedb_id);
        }
      } else if (item.tmdb_id !== undefined && item.tmdb_id !== null) {
        tmdbId = String(item.tmdb_id);
      }

      if (tmdbId) {
        state.tmdb.id = tmdbId;
        if (!isTmdbMovie) {
          const tmdbSeason =
            item.season?.tmdb !== undefined && item.season?.tmdb !== null ? String(item.season.tmdb) : null;
          state.tmdb.season = tmdbSeason;
          if (tmdbSeason !== null) {
            const startEnd = getIndexedProviderStartEnd(
              fribbDataset,
              { ...item, season: { ...item.season, tmdb: tmdbSeason } },
              "tmdb"
            );
            if (startEnd) {
              state.tmdb.episode = startEnd.end ? `${startEnd.start}-${startEnd.end}` : `${startEnd.start}-null`;
            } else {
              state.tmdb.episode = "1-null";
            }
          } else {
            const offset =
              item.episode_offset?.tmdb !== undefined && item.episode_offset?.tmdb !== null
                ? parseInt(item.episode_offset.tmdb, 10) || 0
                : 0;
            state.tmdb.episode = `${offset + 1}-null`;
          }
        }
      }
    }
  }

  // TVDB handling (uses pre-calculated TVDB boundary if available)
  if (!state.tvdb.id) {
    if (item._precomputed_tvdb) {
      state.tvdb.id = item._precomputed_tvdb.id;
      state.tvdb.season = item._precomputed_tvdb.season;
      state.tvdb.episode = item._precomputed_tvdb.episode;
    } else {
      const isMovie = String(item.type || "").toUpperCase() === "MOVIE";
      const rawTvdb = item.tvdb_id ?? item.thetvdb_id;
      if (rawTvdb !== undefined && rawTvdb !== null) {
        state.tvdb.id = String(rawTvdb);
        const rawTvdbSeason = item.season?.tvdb;
        const isTvdbMovie = isMovie || rawTvdbSeason === 0 || rawTvdbSeason === "0";
        if (!isTvdbMovie) {
          const tvdbSeason = rawTvdbSeason !== undefined && rawTvdbSeason !== null ? String(rawTvdbSeason) : null;
          state.tvdb.season = tvdbSeason;
          if (tvdbSeason !== null) {
            const startEnd = getIndexedProviderStartEnd(
              fribbDataset,
              { ...item, season: { ...item.season, tvdb: tvdbSeason } },
              "tvdb"
            );
            if (startEnd) {
              state.tvdb.episode = startEnd.end ? `${startEnd.start}-${startEnd.end}` : `${startEnd.start}-null`;
            } else {
              state.tvdb.episode = "1-null";
            }
          } else {
            const offset =
              item.episode_offset?.tvdb !== undefined && item.episode_offset?.tvdb !== null
                ? parseInt(item.episode_offset.tvdb, 10) || 0
                : 0;
            state.tvdb.episode = `${offset + 1}-null`;
          }
        }
      }
    }
  }
}

function applyAnimeApiToState(state: any, item: any) {
  if (!item || typeof item !== "object") return;
  const src = item.mappings && typeof item.mappings === "object" ? { ...item, ...item.mappings } : item;

  if (!state.type && (src.type || src.format)) {
    state.type = formatAnimeType(src.type || src.format);
  }
  const anidb = src.anidb_id ?? src.anidb;
  if (!state.anidb && anidb !== undefined && anidb !== null) state.anidb = String(anidb);

  const anilist = src.anilist_id ?? src.anilist;
  if (!state.anilist && anilist !== undefined && anilist !== null) state.anilist = String(anilist);

  const countdown = src.animecountdown_id ?? src.animecountdown;
  if (!state.animecountdown && countdown !== undefined && countdown !== null) {
    state.animecountdown = String(countdown);
  }

  const ann = src.ann_id ?? src.animenewsnetwork_id ?? src.animenewsnetwork ?? src.ann;
  if (!state.animenewsnetwork && ann !== undefined && ann !== null) {
    state.animenewsnetwork = String(Array.isArray(ann) ? ann[0] : ann);
  }

  const ap = src["anime-planet_id"] ?? src.animeplanet_id ?? src["anime-planet"] ?? src.animeplanet;
  if (!state["anime-planet"] && ap !== undefined && ap !== null) state["anime-planet"] = String(ap);

  const anisearch = src.anisearch_id ?? src.anisearch;
  if (!state.anisearch && anisearch !== undefined && anisearch !== null) state.anisearch = String(anisearch);

  const imdb = src.imdb_id ?? src.imdb;
  if (!state.imdb && imdb !== undefined && imdb !== null) {
    const val = Array.isArray(imdb) ? imdb[0] : imdb;
    if (val) state.imdb = String(val);
  }

  const kitsu = src.kitsu_id ?? src.kitsu;
  if (!state.kitsu && kitsu !== undefined && kitsu !== null) state.kitsu = String(kitsu);

  const livechart = src.livechart_id ?? src.livechart;
  if (!state.livechart && livechart !== undefined && livechart !== null) state.livechart = String(livechart);

  const mal = src.mal_id ?? src.mal ?? src.myanimelist_id ?? src.myanimelist;
  if (!state.mal && mal !== undefined && mal !== null) state.mal = String(mal);

  const simkl = src.simkl_id ?? src.simkl;
  if (!state.simkl && simkl !== undefined && simkl !== null) state.simkl = String(simkl);

  const isMovie = String(state.type || src.type || "").toUpperCase() === "MOVIE";

  if (!state.tmdb.id) {
    const rawTmdb = src.themoviedb_id ?? src.tmdb_id ?? src.tmdb;
    if (rawTmdb !== undefined && rawTmdb !== null) {
      if (typeof rawTmdb === "object") {
        const idVal = rawTmdb.id ?? rawTmdb.tv ?? (Array.isArray(rawTmdb.movie) ? rawTmdb.movie[0] : rawTmdb.movie);
        if (idVal) state.tmdb.id = String(idVal);
        if (rawTmdb.season !== undefined && rawTmdb.season !== null) state.tmdb.season = String(rawTmdb.season);
        if (rawTmdb.episode !== undefined && rawTmdb.episode !== null) state.tmdb.episode = String(rawTmdb.episode);
      } else {
        state.tmdb.id = String(rawTmdb);
      }
      if (state.tmdb.id && !isMovie) {
        if (!state.tmdb.season && src.season?.tmdb !== undefined && src.season?.tmdb !== null) {
          state.tmdb.season = String(src.season.tmdb);
        }
        if (!state.tmdb.episode) {
          state.tmdb.episode = "1-null";
        }
      }
    }
  }

  if (!state.tvdb.id) {
    const rawTvdb = src.thetvdb_id ?? src.tvdb_id ?? src.tvdb;
    if (rawTvdb !== undefined && rawTvdb !== null) {
      if (typeof rawTvdb === "object") {
        const idVal = rawTvdb.id ?? rawTvdb.tv;
        if (idVal) state.tvdb.id = String(idVal);
        if (rawTvdb.season !== undefined && rawTvdb.season !== null) state.tvdb.season = String(rawTvdb.season);
        if (rawTvdb.episode !== undefined && rawTvdb.episode !== null) state.tvdb.episode = String(rawTvdb.episode);
      } else {
        state.tvdb.id = String(rawTvdb);
      }
      if (state.tvdb.id && !isMovie) {
        if (!state.tvdb.season && src.season?.tvdb !== undefined && src.season?.tvdb !== null) {
          state.tvdb.season = String(src.season.tvdb);
        }
        if (!state.tvdb.episode) {
          state.tvdb.episode = "1-null";
        }
      }
    }
  }
}

function applyAniZipV1ToState(state: any, data: any) {
  if (!data || typeof data !== "object") return;

  if (!state.type && data.type) {
    state.type = formatAnimeType(data.type);
  }
  if (!state.anidb && data.anidb_id !== undefined && data.anidb_id !== null) {
    state.anidb = String(data.anidb_id);
  }
  if (!state.anilist && data.anilist_id !== undefined && data.anilist_id !== null) {
    state.anilist = String(data.anilist_id);
  }
  if (!state.animecountdown && data.animecountdown_id !== undefined && data.animecountdown_id !== null) {
    state.animecountdown = String(data.animecountdown_id);
  }
  const ann = data.ann_id ?? data.animenewsnetwork_id;
  if (!state.animenewsnetwork && ann !== undefined && ann !== null) {
    state.animenewsnetwork = String(ann);
  }
  const ap = data.animeplanet_id ?? data["anime-planet_id"];
  if (!state["anime-planet"] && ap !== undefined && ap !== null) {
    state["anime-planet"] = String(ap);
  }
  if (!state.anisearch && data.anisearch_id !== undefined && data.anisearch_id !== null) {
    state.anisearch = String(data.anisearch_id);
  }
  if (!state.imdb && data.imdb_id !== undefined && data.imdb_id !== null) {
    state.imdb = String(data.imdb_id);
  }
  if (!state.kitsu && data.kitsu_id !== undefined && data.kitsu_id !== null) {
    state.kitsu = String(data.kitsu_id);
  }
  if (!state.livechart && data.livechart_id !== undefined && data.livechart_id !== null) {
    state.livechart = String(data.livechart_id);
  }
  if (!state.mal && data.mal_id !== undefined && data.mal_id !== null) {
    state.mal = String(data.mal_id);
  }
  if (!state.simkl && data.simkl_id !== undefined && data.simkl_id !== null) {
    state.simkl = String(data.simkl_id);
  }

  const isMovie = String(state.type || data.type || "").toUpperCase() === "MOVIE";

  if (!state.tmdb.id && data.themoviedb_id !== undefined && data.themoviedb_id !== null) {
    state.tmdb.id = String(data.themoviedb_id);
    if (!isMovie) {
      if (!state.tmdb.season && data.season?.tmdb !== undefined && data.season?.tmdb !== null) {
        state.tmdb.season = String(data.season.tmdb);
      }
      if (!state.tmdb.episode) state.tmdb.episode = "1-null";
    }
  }
  if (!state.tvdb.id && data.thetvdb_id !== undefined && data.thetvdb_id !== null) {
    state.tvdb.id = String(data.thetvdb_id);
    if (!isMovie) {
      if (!state.tvdb.season && data.season?.tvdb !== undefined && data.season?.tvdb !== null) {
        state.tvdb.season = String(data.season.tvdb);
      }
      if (!state.tvdb.episode) state.tvdb.episode = "1-null";
    }
  }
}

function buildFilteredOutput(state: any) {
  const out: Record<string, any> = {};
  for (const key of CANONICAL_MAP_KEYS) {
    if (key === "tmdb") {
      out.tmdb = {
        id: state.tmdb.id ?? null,
        season: state.tmdb.season ?? null,
        episode: state.tmdb.episode ?? null
      };
    } else if (key === "tvdb") {
      out.tvdb = {
        id: state.tvdb.id ?? null,
        season: state.tvdb.season ?? null,
        episode: state.tvdb.episode ?? null
      };
    } else {
      out[key] = state[key] ?? null;
    }
  }
  return out;
}

export const VALID_MAP_USE_DBS = ["fribb", "animeapi", "ani.zip"] as const;
export type MapUseDb = (typeof VALID_MAP_USE_DBS)[number];

export function normalizeMapUseParam(rawUse?: string | null): MapUseDb | null {
  if (!rawUse || typeof rawUse !== "string" || !rawUse.trim()) {
    return null;
  }
  const norm = rawUse.trim().toLowerCase();
  if (norm === "fribb") return "fribb";
  if (norm === "animeapi") return "animeapi";
  if (norm === "ani.zip" || norm === "anizip") return "ani.zip";
  return null;
}

function saveStateAndOutputToFastCache(
  _cacheKey: string,
  _stateCacheKey: string,
  _state: any,
  _result: any,
  _usedDbs: string[],
  _useDb: MapUseDb | null
) {
  // No-op: mapper output/state caching disabled
}

export async function resolveSingleAnimeMapWithMeta(
  rawId: string,
  tracker: "anikume" | "anilist" | "mal" = "anikume",
  isFresh = false,
  useDb: MapUseDb | null = null
): Promise<{ data: any; usedDbs: string[] } | null> {
  const cleanId = String(rawId || "").trim();
  if (!cleanId) return null;

  ensureFirstSearchPrewarm(isFresh);

  const targetKeys: readonly string[] = CANONICAL_MAP_KEYS;
  const useSuffix = useDb || "auto";
  const cacheKey = `ids:map:v2:${tracker}:${cleanId}:ALL:${useSuffix}`;
  const stateCacheKey = `${tracker}:${cleanId}:${useSuffix}`;

  // Step 1 (Always): Check own GitHub DB (anime-list.json) — check pre-warmed first, then re-fetch if not found
  await fetchLiveDatasetFromGitHub(isFresh);
  const lookupInGitHubDb = () => {
    if (tracker === "anikume") return byAnikumeMap.get(cleanId) || null;
    if (tracker === "anilist") return byAnilistMap.get(cleanId) || null;
    if (tracker === "mal") return byMalMap.get(cleanId) || null;
    return null;
  };

  let dbRecord: any = lookupInGitHubDb();
  if (!dbRecord && !isFresh) {
    // ID was not found in pre-warmed GitHub DB -> fetch fresh from GitHub DB and check again
    await fetchLiveDatasetFromGitHub(true);
    dbRecord = lookupInGitHubDb();
  }

  if (tracker === "anikume" && !dbRecord) {
    return null;
  }

  let knownAnikumeId: string | null = dbRecord?.anikume_id || null;
  let knownAnilistId: string | null =
    dbRecord?.anilist_id || (tracker === "anilist" ? cleanId : null);
  let knownMalId: string | null =
    dbRecord?.mal_id || (tracker === "mal" ? cleanId : null);

  const state = createEmptyCanonicalState(knownAnikumeId, knownAnilistId, knownMalId);

  // Condition A / Condition B primary lookup ID selection:
  // Take anilist_id if both present, else take whichever is present (e.g. mal when anilist is missing)
  let primaryTracker: "anilist" | "mal" | null = null;
  let primaryId: string | null = null;
  if (knownAnilistId) {
    primaryTracker = "anilist";
    primaryId = knownAnilistId;
  } else if (knownMalId) {
    primaryTracker = "mal";
    primaryId = knownMalId;
  }

  if (!primaryTracker || !primaryId) {
    return null;
  }

  const usedDbs: string[] = [];

  const syncDiscoveredIdsToGitHub = async (skipSecondary: boolean) => {
    if (state.anilist && !knownAnilistId) {
      knownAnilistId = state.anilist;
      if (knownAnikumeId) await updateMissingId(knownAnikumeId, "anilist", knownAnilistId);
    }
    if (state.mal && !knownMalId) {
      knownMalId = state.mal;
      if (knownAnikumeId) await updateMissingId(knownAnikumeId, "mal", knownMalId);
    }
    if (!knownAnikumeId && (state.anilist || state.mal)) {
      knownAnikumeId = await getOrCreateAnikumeId(
        {
          anilist_id: state.anilist,
          mal_id: state.mal
        },
        skipSecondary || Boolean(state.anilist && state.mal)
      );
      state.anikume = knownAnikumeId;
    }
  };

  // If ?use= is passed, look up ONLY the selected external database (plus own GitHub DB above)
  if (useDb) {
    usedDbs.push(useDb);
    let foundInSelectedDb = false;

    if (useDb === "fribb") {
      let fribb = await getFribbDataset(isFresh);
      let fribbEntry = fribb.index.get(`${primaryTracker}:${primaryId}`);
      if (!fribbEntry && primaryTracker === "anilist" && knownMalId) {
        fribbEntry = fribb.index.get(`mal:${knownMalId}`);
      }
      if (!fribbEntry && !isFresh) {
        fribb = await getFribbDataset(true);
        fribbEntry = fribb.index.get(`${primaryTracker}:${primaryId}`);
        if (!fribbEntry && primaryTracker === "anilist" && knownMalId) {
          fribbEntry = fribb.index.get(`mal:${knownMalId}`);
        }
      }
      if (fribbEntry) {
        foundInSelectedDb = true;
        applyFribbToState(state, fribb, fribbEntry);
      }
    } else if (useDb === "animeapi") {
      let animeApi = await getAnimeApiDataset(isFresh);
      const lookupAni = state.anilist || knownAnilistId;
      const lookupMal = state.mal || knownMalId;
      let animeApiEntry = lookupAni ? animeApi.index.get(`anilist:${lookupAni}`) : null;
      if (!animeApiEntry && lookupMal) {
        animeApiEntry = animeApi.index.get(`mal:${lookupMal}`);
      }
      if (!animeApiEntry && !isFresh) {
        animeApi = await getAnimeApiDataset(true);
        animeApiEntry = lookupAni ? animeApi.index.get(`anilist:${lookupAni}`) : null;
        if (!animeApiEntry && lookupMal) {
          animeApiEntry = animeApi.index.get(`mal:${lookupMal}`);
        }
      }
      if (animeApiEntry) {
        foundInSelectedDb = true;
        applyAnimeApiToState(state, animeApiEntry);
      }
    } else if (useDb === "ani.zip") {
      const aniZipTargetAni = state.anilist || knownAnilistId;
      const aniZipTargetMal = state.mal || knownMalId;
      if (aniZipTargetAni || aniZipTargetMal) {
        const aniZipParams = aniZipTargetAni
          ? { anilist_id: aniZipTargetAni }
          : { mal_id: aniZipTargetMal };
        let aniZipData = await fetchAniZipV1(aniZipParams, isFresh);
        if (!aniZipData && !isFresh) {
          aniZipData = await fetchAniZipV1(aniZipParams, true);
        }
        if (aniZipData) {
          foundInSelectedDb = true;
          applyAniZipV1ToState(state, aniZipData);
        }
      }
    }

    await syncDiscoveredIdsToGitHub(true);

    if (!state.anilist && !state.mal && !foundInSelectedDb) {
      return null;
    }

    const result = buildFilteredOutput(state);
    saveStateAndOutputToFastCache(cacheKey, stateCacheKey, state, result, usedDbs, useDb);
    return { data: result, usedDbs };
  }

  // In browser context (direct Overview.ts usage without server roundtrip), use fast 2KB ani.zip mapping first to avoid 45MB Fribb download
  if (typeof window !== "undefined") {
    usedDbs.push("ani.zip");
    const aniZipTargetAni = state.anilist || knownAnilistId;
    const aniZipTargetMal = state.mal || knownMalId;
    if (aniZipTargetAni || aniZipTargetMal) {
      const aniZipParams = aniZipTargetAni
        ? { anilist_id: aniZipTargetAni }
        : { mal_id: aniZipTargetMal };
      const aniZipData = await fetchAniZipV1(aniZipParams, isFresh);
      if (aniZipData) {
        applyAniZipV1ToState(state, aniZipData);
      }
    }
    await syncDiscoveredIdsToGitHub(true);
    if (!state.anilist && !state.mal) {
      return null;
    }
    const browserResult = buildFilteredOutput(state);
    saveStateAndOutputToFastCache(cacheKey, stateCacheKey, state, browserResult, usedDbs, null);
    return { data: browserResult, usedDbs };
  }

  // Default Cascade (no ?use= parameter): 1. Fribb -> 2. animeapi -> 3. ani.zip
  // Step 2: DB 1 — Fribb (anime-list-full.json)
  usedDbs.push("fribb");
  let fribb = await getFribbDataset(isFresh);
  let fribbEntry = fribb.index.get(`${primaryTracker}:${primaryId}`);
  if (!fribbEntry && primaryTracker === "anilist" && knownMalId) {
    fribbEntry = fribb.index.get(`mal:${knownMalId}`);
  }
  if (!fribbEntry && !isFresh) {
    fribb = await getFribbDataset(true);
    fribbEntry = fribb.index.get(`${primaryTracker}:${primaryId}`);
    if (!fribbEntry && primaryTracker === "anilist" && knownMalId) {
      fribbEntry = fribb.index.get(`mal:${knownMalId}`);
    }
  }
  if (fribbEntry) {
    applyFribbToState(state, fribb, fribbEntry);
  }

  await syncDiscoveredIdsToGitHub(false);

  // Lazy Fallback Stop Check #1: If all fields are present after Fribb, STOP!
  if (state.anikume && areAllTargetFieldsPopulated(state, targetKeys)) {
    const result = buildFilteredOutput(state);
    saveStateAndOutputToFastCache(cacheKey, stateCacheKey, state, result, usedDbs, null);
    return { data: result, usedDbs };
  }

  // Step 3: DB 2 — Nattadasu animeapi.json (ONLY if fields are still missing)
  usedDbs.push("animeapi");
  let animeApi = await getAnimeApiDataset(isFresh);
  const lookupAni = state.anilist || knownAnilistId;
  const lookupMal = state.mal || knownMalId;
  let animeApiEntry = lookupAni ? animeApi.index.get(`anilist:${lookupAni}`) : null;
  if (!animeApiEntry && lookupMal) {
    animeApiEntry = animeApi.index.get(`mal:${lookupMal}`);
  }
  if (!animeApiEntry && !isFresh) {
    animeApi = await getAnimeApiDataset(true);
    animeApiEntry = lookupAni ? animeApi.index.get(`anilist:${lookupAni}`) : null;
    if (!animeApiEntry && lookupMal) {
      animeApiEntry = animeApi.index.get(`mal:${lookupMal}`);
    }
  }
  if (animeApiEntry) {
    applyAnimeApiToState(state, animeApiEntry);
  }

  await syncDiscoveredIdsToGitHub(false);

  // Lazy Fallback Stop Check #2: If all fields are present after animeapi.json, STOP!
  if (state.anikume && areAllTargetFieldsPopulated(state, targetKeys)) {
    const result = buildFilteredOutput(state);
    saveStateAndOutputToFastCache(cacheKey, stateCacheKey, state, result, usedDbs, null);
    return { data: result, usedDbs };
  }

  // Step 4: DB 3 — Ani.zip v1 (https://api.ani.zip/v1/mappings?anilist_id= or mal_id=)
  usedDbs.push("ani.zip");
  const aniZipTargetAni = state.anilist || knownAnilistId;
  const aniZipTargetMal = state.mal || knownMalId;
  if (aniZipTargetAni || aniZipTargetMal) {
    const aniZipParams = aniZipTargetAni
      ? { anilist_id: aniZipTargetAni }
      : { mal_id: aniZipTargetMal };
    let aniZipData = await fetchAniZipV1(aniZipParams, isFresh);
    if (!aniZipData && !isFresh) {
      aniZipData = await fetchAniZipV1(aniZipParams, true);
    }
    if (aniZipData) {
      applyAniZipV1ToState(state, aniZipData);
    }
  }

  await syncDiscoveredIdsToGitHub(true);

  if (!state.anilist && !state.mal && !fribbEntry && !animeApiEntry) {
    return null;
  }

  const finalResult = buildFilteredOutput(state);
  saveStateAndOutputToFastCache(cacheKey, stateCacheKey, state, finalResult, usedDbs, null);
  return { data: finalResult, usedDbs };
}

export async function resolveSingleAnimeMap(
  rawId: string,
  tracker: "anikume" | "anilist" | "mal" = "anikume",
  isFresh = false,
  useDb: MapUseDb | null = null
) {
  const res = await resolveSingleAnimeMapWithMeta(rawId, tracker, isFresh, useDb);
  return res ? res.data : null;
}

/**
 * Direct programmatic mapper function for single or comma-separated multiple IDs.
 * Can be called directly inside other API modules without HTTP requests.
 */
export async function mapAnimeIds(options: {
  ids: string | string[];
  tracker?: string;
  use?: string | null;
  fresh?: boolean;
}) {
  const isFresh = Boolean(options.fresh);
  ensureFirstSearchPrewarm(isFresh);

  const rawTracker = options.tracker ? options.tracker.trim().toLowerCase() : "anikume";
  const normTracker: "anikume" | "anilist" | "mal" =
    rawTracker === "anilist"
      ? "anilist"
      : rawTracker === "mal" || rawTracker === "myanimelist"
      ? "mal"
      : "anikume";

  const idList = Array.isArray(options.ids)
    ? options.ids.map((s) => String(s).trim()).filter(Boolean)
    : String(options.ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const useDb = normalizeMapUseParam(options.use);

  const resolvedMetaList = await Promise.all(
    idList.map((singleId) =>
      resolveSingleAnimeMapWithMeta(singleId, normTracker, isFresh, useDb)
    )
  );

  const validMeta = resolvedMetaList.filter(Boolean) as { data: any; usedDbs: string[] }[];
  const validItems = validMeta.map((m) => m.data);

  // total counts how many anime ID groups were looked up in the request
  const total = idList.length;

  // use shows the selected DB if ?use= was passed, otherwise joins all DBs actually used across the looked-up IDs with "+"
  let useStr: string;
  if (useDb) {
    useStr = useDb;
  } else {
    const usedSet = new Set<string>();
    for (const meta of validMeta) {
      for (const db of meta.usedDbs) {
        usedSet.add(db);
      }
    }
    const orderedUsed = VALID_MAP_USE_DBS.filter((db) => usedSet.has(db));
    useStr = orderedUsed.length > 0 ? orderedUsed.join("+") : "fribb";
  }

  let resultBlock: string;
  if (validItems.length === 1) {
    resultBlock = `result: ${JSON.stringify(validItems[0], null, 2)}`;
  } else {
    const indentedItems = validItems
      .map((obj) =>
        JSON.stringify(obj, null, 2)
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")
      )
      .join("\n\n");
    resultBlock = `result: {\n${indentedItems}\n}`;
  }

  const formattedText = `total: ${total}\nuse: ${useStr}\n${resultBlock}`;

  return {
    total,
    use: useStr,
    items: validItems,
    single: validItems[0] || null,
    isBatch: idList.length > 1,
    formattedText
  };
}

// ============================================================================
// 4. INTERNAL COMPATIBILITY EXPORTS FOR OTHER APIKUME SERVER MODULES
// ============================================================================

export const VALID_MAP_TRACKERS = ["anikume", "anilist", "mal"];
export const INVALID_MAP_TRACKERS = [
  "hianime",
  "zoro",
  "9anime",
  "aniwatch",
  "gogoanime",
  "imdb",
  "myanimelist",
  "anidb",
  "kitsu",
  "simkl",
  "animeplanet",
  "anime-planet",
  "anisearch",
  "animecountdown",
  "livechart",
  "tvdb",
  "thetvdb",
  "tmdb",
  "themoviedb"
];

export function normalizeMapTracker(tracker?: string) {
  const norm = tracker ? tracker.toLowerCase().trim() : "anikume";
  if (norm === "reanime") return "anilist";
  if (norm === "thetvdb") return "tvdb";
  if (norm === "themoviedb") return "tmdb";
  if (norm === "myanimelist") return "mal";
  if (norm === "anime-planet") return "animeplanet";
  return norm;
}

function attachBoundaries(dataset: any, mapping: any) {
  if (!mapping) return null;
  let tmdbStartEnd = mapping._tmdb_start_end || getIndexedProviderStartEnd(dataset, mapping, "tmdb");
  let tvdbStartEnd = mapping._tvdb_start_end || getIndexedProviderStartEnd(dataset, mapping, "tvdb");
  if ((!tvdbStartEnd || tvdbStartEnd.end === null) && mapping._anizip_start_end) {
    tvdbStartEnd = mapping._anizip_start_end;
  }
  if ((!tmdbStartEnd || tmdbStartEnd.end === null) && mapping._anizip_start_end) {
    tmdbStartEnd = mapping._anizip_start_end;
  }
  return { ...mapping, _tmdb_start_end: tmdbStartEnd, _tvdb_start_end: tvdbStartEnd };
}

function mergeWithAniZip(fribb: any, aniZip: any) {
  if (!fribb && !aniZip) return null;
  const aniMappings = aniZip?.mappings || aniZip || {};
  if (!fribb) {
    return {
      anilist_id: aniMappings.anilist_id ? String(aniMappings.anilist_id) : null,
      mal_id: aniMappings.mal_id ? String(aniMappings.mal_id) : null,
      anidb_id: aniMappings.anidb_id ? String(aniMappings.anidb_id) : null,
      kitsu_id: aniMappings.kitsu_id ? String(aniMappings.kitsu_id) : null,
      "anime-planet_id": aniMappings.animeplanet_id ? String(aniMappings.animeplanet_id) : null,
      anisearch_id: aniMappings.anisearch_id ? String(aniMappings.anisearch_id) : null,
      livechart_id: aniMappings.livechart_id ? String(aniMappings.livechart_id) : null,
      simkl_id: null,
      animecountdown_id: null,
      tvdb_id: aniMappings.thetvdb_id ? String(aniMappings.thetvdb_id) : null,
      themoviedb_id: aniMappings.themoviedb_id ? { tv: String(aniMappings.themoviedb_id) } : null,
      tmdb_id: aniMappings.themoviedb_id ? String(aniMappings.themoviedb_id) : null,
      season: { tvdb: null, tmdb: null },
      episode_offset: { tvdb: null, tmdb: null },
      _anizip_start_end: null,
      _anizip_data: aniZip
    };
  }
  const merged = { ...fribb };
  if (merged.anilist_id === undefined || merged.anilist_id === null) {
    merged.anilist_id = aniMappings.anilist_id ? String(aniMappings.anilist_id) : null;
  }
  if (merged.mal_id === undefined || merged.mal_id === null) {
    merged.mal_id = aniMappings.mal_id ? String(aniMappings.mal_id) : null;
  }
  if (merged.anidb_id === undefined || merged.anidb_id === null) {
    merged.anidb_id = aniMappings.anidb_id ? String(aniMappings.anidb_id) : null;
  }
  if (merged.kitsu_id === undefined || merged.kitsu_id === null) {
    merged.kitsu_id = aniMappings.kitsu_id ? String(aniMappings.kitsu_id) : null;
  }
  if (merged["anime-planet_id"] === undefined || merged["anime-planet_id"] === null) {
    merged["anime-planet_id"] = aniMappings.animeplanet_id ? String(aniMappings.animeplanet_id) : null;
  }
  if (merged.anisearch_id === undefined || merged.anisearch_id === null) {
    merged.anisearch_id = aniMappings.anisearch_id ? String(aniMappings.anisearch_id) : null;
  }
  if (merged.livechart_id === undefined || merged.livechart_id === null) {
    merged.livechart_id = aniMappings.livechart_id ? String(aniMappings.livechart_id) : null;
  }
  if (merged.tvdb_id === undefined || merged.tvdb_id === null) {
    merged.tvdb_id = aniMappings.thetvdb_id ? String(aniMappings.thetvdb_id) : null;
  }
  if (merged.themoviedb_id === undefined || merged.themoviedb_id === null) {
    if (aniMappings.themoviedb_id) {
      merged.themoviedb_id = { tv: String(aniMappings.themoviedb_id) };
      merged.tmdb_id = String(aniMappings.themoviedb_id);
    }
  }
  merged._anizip_start_end = null;
  merged._anizip_data = aniZip;
  return merged;
}

export async function getAnimeMapping(tracker: string, id: string, provider?: string) {
  return getAnimeMappingWithBoundaries(tracker, id, provider);
}

export async function getAnimeMappingWithBoundaries(tracker: string, id: string, provider?: string) {
  const normTracker = normalizeMapTracker(tracker);
  const normProvider = provider ? provider.toLowerCase() : undefined;
  let lookupTracker = normTracker;
  let lookupId = String(id || "").trim();
  let knownAnikumeRecord: any = null;

  if (normTracker === "anikume") {
    knownAnikumeRecord = await findByAnikumeId(lookupId);
    if (knownAnikumeRecord) {
      if (knownAnikumeRecord.anilist_id) {
        lookupTracker = "anilist";
        lookupId = knownAnikumeRecord.anilist_id;
      } else if (knownAnikumeRecord.mal_id) {
        lookupTracker = "mal";
        lookupId = knownAnikumeRecord.mal_id;
      }
    } else if (/^\d+$/.test(lookupId)) {
      lookupTracker = "anilist";
    }
  } else if (normTracker === "anilist" || normTracker === "mal") {
    knownAnikumeRecord = await findByTrackerId(normTracker, lookupId);
  }

  const lookupKey = `${lookupTracker}:${lookupId}`;
  const fribb = await getFribbDataset();

  if (normProvider === "fribb") {
    const mapping = fribb.index.get(lookupKey);
    if (mapping) {
      const anikumeId =
        knownAnikumeRecord?.anikume_id ||
        (await getOrCreateAnikumeId({ anilist_id: mapping.anilist_id, mal_id: mapping.mal_id }));
      return attachBoundaries(fribb, { anikume_id: anikumeId, ...mapping });
    }
    return null;
  }

  if (normProvider === "anizip" || normProvider === "animzip") {
    const params: any = {};
    if (lookupTracker === "anilist") params.anilist_id = lookupId;
    else if (lookupTracker === "mal") params.mal_id = lookupId;
    const aniZip = await fetchAniZipV1(params);
    if (aniZip) {
      const merged2 = mergeWithAniZip(null, aniZip);
      const anikumeId =
        knownAnikumeRecord?.anikume_id ||
        (await getOrCreateAnikumeId({ anilist_id: merged2.anilist_id, mal_id: merged2.mal_id }));
      return attachBoundaries(fribb, { anikume_id: anikumeId, ...merged2 });
    }
    return null;
  }

  const fribbEntry = fribb.index.get(lookupKey);
  if (
    fribbEntry &&
    (fribbEntry.tvdb_id ||
      fribbEntry.thetvdb_id ||
      fribbEntry.themoviedb_id ||
      fribbEntry.mal_id ||
      fribbEntry.anilist_id)
  ) {
    const anikumeId =
      knownAnikumeRecord?.anikume_id ||
      (await getOrCreateAnikumeId({ anilist_id: fribbEntry.anilist_id, mal_id: fribbEntry.mal_id }));
    return attachBoundaries(fribb, { anikume_id: anikumeId, ...fribbEntry });
  }

  // Fallback to DB 2 (animeapi.json) then DB 3 (ani.zip/v1/mappings)
  const animeApi = await getAnimeApiDataset();
  const animeApiEntry = animeApi.index.get(lookupKey);
  let aniZipData = null;
  if (!animeApiEntry && (lookupTracker === "anilist" || lookupTracker === "mal")) {
    aniZipData = await fetchAniZipV1(
      lookupTracker === "anilist" ? { anilist_id: lookupId } : { mal_id: lookupId }
    );
  }

  let merged = mergeWithAniZip(fribbEntry || animeApiEntry, aniZipData);
  if (!merged && knownAnikumeRecord) {
    merged = {
      anilist_id: knownAnikumeRecord.anilist_id,
      mal_id: knownAnikumeRecord.mal_id,
      anidb_id: null,
      kitsu_id: null,
      simkl_id: null,
      "anime-planet_id": null,
      anisearch_id: null,
      animecountdown_id: null,
      livechart_id: null,
      tmdb_id: null,
      tvdb_id: null,
      themoviedb_id: null,
      season: { tvdb: null, tmdb: null },
      episode_offset: { tvdb: null, tmdb: null }
    };
  }
  if (merged) {
    const anikumeId =
      knownAnikumeRecord?.anikume_id ||
      (await getOrCreateAnikumeId({ anilist_id: merged.anilist_id, mal_id: merged.mal_id }));
    return attachBoundaries(fribb, { anikume_id: anikumeId, ...merged });
  }
  return null;
}

export function flattenMapping(mapping: any, canonicalAnikumeId: string | null) {
  let tmdbVal: string | null = null;
  if (mapping.tmdb_id !== undefined && mapping.tmdb_id !== null) {
    tmdbVal = typeof mapping.tmdb_id === "object" ? JSON.stringify(mapping.tmdb_id) : String(mapping.tmdb_id);
  } else if (mapping.themoviedb_id !== undefined && mapping.themoviedb_id !== null) {
    if (typeof mapping.themoviedb_id === "object") {
      if (mapping.themoviedb_id.tv) {
        tmdbVal = String(mapping.themoviedb_id.tv);
      } else if (mapping.themoviedb_id.movie) {
        tmdbVal = Array.isArray(mapping.themoviedb_id.movie)
          ? String(mapping.themoviedb_id.movie[0])
          : String(mapping.themoviedb_id.movie);
      } else {
        tmdbVal = JSON.stringify(mapping.themoviedb_id);
      }
    } else {
      tmdbVal = String(mapping.themoviedb_id);
    }
  }
  const tvdbSeason =
    mapping.season?.tvdb !== undefined && mapping.season?.tvdb !== null ? String(mapping.season.tvdb) : null;
  const tmdbSeason =
    mapping.season?.tmdb !== undefined && mapping.season?.tmdb !== null ? String(mapping.season.tmdb) : null;

  return {
    anikume: canonicalAnikumeId,
    kitsu: mapping.kitsu_id !== undefined && mapping.kitsu_id !== null ? String(mapping.kitsu_id) : null,
    myanimelist: mapping.mal_id !== undefined && mapping.mal_id !== null ? String(mapping.mal_id) : null,
    anilist: mapping.anilist_id !== undefined && mapping.anilist_id !== null ? String(mapping.anilist_id) : null,
    anisearch:
      mapping.anisearch_id !== undefined && mapping.anisearch_id !== null ? String(mapping.anisearch_id) : null,
    anidb: mapping.anidb_id !== undefined && mapping.anidb_id !== null ? String(mapping.anidb_id) : null,
    livechart:
      mapping.livechart_id !== undefined && mapping.livechart_id !== null ? String(mapping.livechart_id) : null,
    tvdb: mapping.tvdb_id || mapping.thetvdb_id ? String(mapping.tvdb_id || mapping.thetvdb_id) : null,
    tvdb_season: tvdbSeason,
    tvdb_episode_start_end:
      tvdbSeason !== null && mapping._tvdb_start_end
        ? mapping._tvdb_start_end.end
          ? `${mapping._tvdb_start_end.start}-${mapping._tvdb_start_end.end}`
          : `${mapping._tvdb_start_end.start}-null`
        : null,
    tmdb: tmdbVal,
    tmdb_season: tmdbSeason,
    tmdb_episode_start_end:
      tmdbSeason !== null && mapping._tmdb_start_end
        ? mapping._tmdb_start_end.end
          ? `${mapping._tmdb_start_end.start}-${mapping._tmdb_start_end.end}`
          : `${mapping._tmdb_start_end.start}-null`
        : null
  };
}

export async function getBatchAnimeMappings(idsStr: string, trackerParam = "anilist", rawProvider?: string) {
  const ids = idsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const normTracker = normalizeMapTracker(trackerParam || "anilist");
  const resultMap = new Map<string, any>();

  const results = await Promise.all(
    ids.map(async (singleId) => {
      let lookupTracker = normTracker;
      let lookupId = singleId;
      let canonicalAnikumeId = null;

      if (lookupTracker === "anikume") {
        const record = await findByAnikumeId(lookupId);
        if (record) {
          canonicalAnikumeId = record.anikume_id;
          if (record.anilist_id) {
            lookupTracker = "anilist";
            lookupId = record.anilist_id;
          } else if (record.mal_id) {
            lookupTracker = "mal";
            lookupId = record.mal_id;
          }
        } else if (/^\d+$/.test(lookupId)) {
          lookupTracker = "anilist";
        }
      }

      const mapping = await getAnimeMappingWithBoundaries(lookupTracker, lookupId, rawProvider);
      if (mapping) {
        if (!canonicalAnikumeId) {
          canonicalAnikumeId = await getOrCreateAnikumeId({
            anilist_id: mapping.anilist_id,
            mal_id: mapping.mal_id
          });
        }
        return flattenMapping(mapping, canonicalAnikumeId);
      }
      return null;
    })
  );

  const flatArray = results.filter(Boolean);
  for (const flat of flatArray) {
    if (flat.anilist) resultMap.set(`anilist:${flat.anilist}`, flat);
    if (flat.myanimelist) resultMap.set(`mal:${flat.myanimelist}`, flat);
    if (flat.anikume) resultMap.set(`anikume:${flat.anikume}`, flat);
  }

  return { resultMap, flatArray };
}

