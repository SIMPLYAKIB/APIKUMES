// @ts-nocheck
import {
  findByAnikumeId,
  findByTrackerId,
  getOrCreateAnikumeId,
  getAnimeMappingWithBoundaries,
  normalizeMapTracker
} from "../Ids.js";
import { searchAnikoto, clearAnikotoCache } from "./AniKoto.js";
import { searchMkissa } from "./Mkissa.js";
import { searchAnizone, matchBestAnizoneCandidate } from "./AniZone.js";
import { searchAnibd, matchBestAnibdCandidate } from "./AniBd.js";
import { searchKickAssAnime } from "./KickAssAnime.js";
import { searchAniwave } from "./AniWave.js";
import { searchAnineko } from "./AniNeko.js";
import { searchAnimeParadise } from "./AnimeParadise.js";
import { searchPirateXPlay } from "./PirateXPlay.js";
import { getAnibridgeFullMapping } from "./AniBridge.js";
import { directProxyFetch } from "./Proxy.js";
import { serverCache } from "./Cache.js";

export const VALID_SOURCEMAP_SITES = [
  "anikume",
  "reanime",
  "anikoto",
  "mkissa",
  "anizone",
  "anibd",
  "kickassanime",
  "aniwave",
  "anineko",
  "animeparadise",
  "2dhive",
  "piratexplay"
];

const identityCache = new Map<string, { canonicalAnikumeId: string | null; anilistId: number | null; malId: number | null; expiresAt: number }>();
const titleCache = new Map<string, { data: any; expiresAt: number }>();
const sourceMapCache = new Map<string, { sources: Record<string, string | null>; fullResolved: boolean; expiresAt: number }>();

export function clearSourceMapCache() {
  identityCache.clear();
  titleCache.clear();
  sourceMapCache.clear();
  clearAnikotoCache();
}

export function cleanTitle(str: any) {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

async function fetchMalTitles(malId: number, anilistId?: number | null) {
  try {
    const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=id,title,alternative_titles`, {
      headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.title || data.alternative_titles)) {
        const alt = data.alternative_titles || {};
        const synonyms = Array.isArray(alt.synonyms) ? [...alt.synonyms] : [];
        return {
          anilist_id: anilistId || null,
          mal_id: data.id || malId,
          english: alt.en || null,
          romaji: data.title || null,
          native: alt.ja || null,
          synonyms
        };
      }
    }
  } catch {}
  return null;
}

async function fetchAniListTitles(anilistId: number, knownMalId?: number | null) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        synonyms
      }
    }
  `;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      const media = data?.data?.Media;
      if (media && (media.title?.english || media.title?.romaji || media.title?.native)) {
        return {
          anilist_id: media.id,
          mal_id: media.idMal || knownMalId || null,
          english: media.title?.english || null,
          romaji: media.title?.romaji || null,
          native: media.title?.native || null,
          synonyms: Array.isArray(media.synonyms) ? media.synonyms : []
        };
      }
    }
  } catch {}

  let malId = knownMalId || null;
  if (!malId) {
    try {
      const m = await getAnimeMappingWithBoundaries("anilist", String(anilistId), "fribb");
      if (m?.mal_id) malId = parseInt(String(m.mal_id), 10);
    } catch {}
  }
  if (malId) {
    return await fetchMalTitles(malId, anilistId);
  }
  return null;
}

async function fetchAniListTitlesByMal(malId: number) {
  const query = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        synonyms
      }
    }
  `;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { idMal: malId } }),
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      const media = data?.data?.Media;
      if (media && (media.title?.english || media.title?.romaji || media.title?.native)) {
        return {
          anilist_id: media.id,
          mal_id: media.idMal || malId,
          english: media.title?.english || null,
          romaji: media.title?.romaji || null,
          native: media.title?.native || null,
          synonyms: Array.isArray(media.synonyms) ? media.synonyms : []
        };
      }
    }
  } catch {}
  return await fetchMalTitles(malId);
}

export function matchBestAnikotoCandidate(candidates: any[], cleanedDbTitles: string[]) {
  if (!candidates || candidates.length === 0 || !cleanedDbTitles || cleanedDbTitles.length === 0) {
    return null;
  }
  let bestMatch: any = null;
  let highestScore = 0;
  for (const candidate of candidates) {
    const candidateTitles = [cleanTitle(candidate.title), cleanTitle(candidate.title_jp || "")].filter(Boolean);
    let score = 0;
    const matchedDbTitles = new Set();
    for (const cTitle of candidateTitles) {
      for (const dbTitle of cleanedDbTitles) {
        if (!matchedDbTitles.has(dbTitle)) {
          if (cTitle === dbTitle) {
            score += 1000;
            matchedDbTitles.add(dbTitle);
            break;
          } else if (cTitle.includes(dbTitle) || dbTitle.includes(cTitle)) {
            const minLen = Math.min(cTitle.length, dbTitle.length);
            const maxLen = Math.max(cTitle.length, dbTitle.length);
            const ratio = minLen / maxLen;
            score += Math.round(ratio * 100);
            matchedDbTitles.add(dbTitle);
            break;
          }
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { ...candidate, _score: score };
    }
  }
  return bestMatch;
}

export function matchBestAniwaveCandidate(candidates: any[], cleanedDbTitles: string[]) {
  if (!candidates || candidates.length === 0 || !cleanedDbTitles || cleanedDbTitles.length === 0) {
    return null;
  }
  let bestMatch: any = null;
  let highestScore = 0;
  for (const candidate of candidates) {
    const candidateTitles = [cleanTitle(candidate.title), cleanTitle(candidate.japanese_title || "")].filter(Boolean);
    let score = 0;
    const matchedDbTitles = new Set();
    for (const cTitle of candidateTitles) {
      for (const dbTitle of cleanedDbTitles) {
        if (!matchedDbTitles.has(dbTitle)) {
          if (cTitle === dbTitle) {
            score += 1000;
            matchedDbTitles.add(dbTitle);
            break;
          } else if (cTitle.includes(dbTitle) || dbTitle.includes(cTitle)) {
            const minLen = Math.min(cTitle.length, dbTitle.length);
            const maxLen = Math.max(cTitle.length, dbTitle.length);
            const ratio = minLen / maxLen;
            score += Math.round(ratio * 100);
            matchedDbTitles.add(dbTitle);
            break;
          }
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { ...candidate, _score: score };
    }
  }
  return bestMatch;
}

export function matchBestAninekoCandidate(candidates: any[], cleanedDbTitles: string[]) {
  if (!candidates || candidates.length === 0 || !cleanedDbTitles || cleanedDbTitles.length === 0) {
    return null;
  }
  let bestMatch: any = null;
  let highestScore = 0;
  for (const candidate of candidates) {
    const candidateTitles = [cleanTitle(candidate.title)].filter(Boolean);
    let score = 0;
    const matchedDbTitles = new Set();
    for (const cTitle of candidateTitles) {
      for (const dbTitle of cleanedDbTitles) {
        if (!matchedDbTitles.has(dbTitle)) {
          if (cTitle === dbTitle) {
            score += 1000;
            matchedDbTitles.add(dbTitle);
            break;
          } else if (cTitle.includes(dbTitle) || dbTitle.includes(cTitle)) {
            const minLen = Math.min(cTitle.length, dbTitle.length);
            const maxLen = Math.max(cTitle.length, dbTitle.length);
            const ratio = minLen / maxLen;
            score += Math.round(ratio * 100);
            matchedDbTitles.add(dbTitle);
            break;
          }
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { ...candidate, _score: score };
    }
  }
  return bestMatch;
}

export const matchBestAnekoCandidate = matchBestAninekoCandidate;

export function matchBestAnimeParadiseCandidate(candidates: any[], cleanedDbTitles: string[]) {
  if (!candidates || candidates.length === 0 || !cleanedDbTitles || cleanedDbTitles.length === 0) {
    return null;
  }
  let bestMatch: any = null;
  let highestScore = 0;
  for (const candidate of candidates) {
    const candidateTitles = [
      cleanTitle(candidate.title),
      cleanTitle(candidate.alternativeTitle?.english || ""),
      cleanTitle(candidate.alternativeTitle?.romaji || ""),
      cleanTitle(candidate.alternativeTitle?.native || ""),
      cleanTitle(candidate.slug ? candidate.slug.replace(/-/g, " ") : "")
    ].filter(Boolean);
    let score = 0;
    const matchedDbTitles = new Set();
    for (const cTitle of candidateTitles) {
      for (const dbTitle of cleanedDbTitles) {
        if (!matchedDbTitles.has(dbTitle)) {
          if (cTitle === dbTitle) {
            score += 1000;
            matchedDbTitles.add(dbTitle);
            break;
          } else if (cTitle.includes(dbTitle) || dbTitle.includes(cTitle)) {
            const minLen = Math.min(cTitle.length, dbTitle.length);
            const maxLen = Math.max(cTitle.length, dbTitle.length);
            const ratio = minLen / maxLen;
            score += Math.round(ratio * 100);
            matchedDbTitles.add(dbTitle);
            break;
          }
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { ...candidate, _score: score };
    }
  }
  return bestMatch;
}

export function matchBestMkissaCandidate(candidates: any[], cleanedDbTitles: string[], malId?: any, anilistId?: any) {
  if (!candidates || candidates.length === 0) {
    return null;
  }
  for (const candidate of candidates) {
    if (malId && candidate.mal_id && String(candidate.mal_id) === String(malId)) {
      return { ...candidate, _score: 2000 };
    }
    if (anilistId && candidate.anilist_id && String(candidate.anilist_id) === String(anilistId)) {
      return { ...candidate, _score: 2000 };
    }
  }
  if (!cleanedDbTitles || cleanedDbTitles.length === 0) {
    return candidates[0] || null;
  }
  let bestMatch: any = null;
  let highestScore = 0;
  for (const candidate of candidates) {
    const candidateTitles = [
      cleanTitle(candidate.name),
      cleanTitle(candidate.english_name || ""),
      cleanTitle(candidate.native_name || "")
    ].filter(Boolean);
    let score = 0;
    const matchedDbTitles = new Set();
    for (const cTitle of candidateTitles) {
      for (const dbTitle of cleanedDbTitles) {
        if (!matchedDbTitles.has(dbTitle)) {
          if (cTitle === dbTitle) {
            score += 1000;
            matchedDbTitles.add(dbTitle);
            break;
          } else if (cTitle.includes(dbTitle) || dbTitle.includes(cTitle)) {
            const minLen = Math.min(cTitle.length, dbTitle.length);
            const maxLen = Math.max(cTitle.length, dbTitle.length);
            const ratio = minLen / maxLen;
            score += Math.round(ratio * 100);
            matchedDbTitles.add(dbTitle);
            break;
          }
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { ...candidate, _score: score };
    }
  }
  return bestMatch;
}

export function matchBestKickAssAnimeCandidate(candidates: any[], cleanedDbTitles: string[]) {
  if (!candidates || candidates.length === 0 || !cleanedDbTitles || cleanedDbTitles.length === 0) {
    return null;
  }
  let bestMatch: any = null;
  let highestScore = 0;
  for (const candidate of candidates) {
    const candidateTitles = [cleanTitle(candidate.title), cleanTitle(candidate.title_en || "")].filter(Boolean);
    let score = 0;
    const matchedDbTitles = new Set();
    for (const cTitle of candidateTitles) {
      for (const dbTitle of cleanedDbTitles) {
        if (!matchedDbTitles.has(dbTitle)) {
          if (cTitle === dbTitle) {
            score += 1000;
            matchedDbTitles.add(dbTitle);
            break;
          } else if (cTitle.includes(dbTitle) || dbTitle.includes(cTitle)) {
            const minLen = Math.min(cTitle.length, dbTitle.length);
            const maxLen = Math.max(cTitle.length, dbTitle.length);
            const ratio = minLen / maxLen;
            score += Math.round(ratio * 100);
            matchedDbTitles.add(dbTitle);
            break;
          }
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { ...candidate, _score: score };
    }
  }
  return bestMatch;
}

export function matchBestPirateXPlayCandidate(candidates: any[], cleanedDbTitles: string[]) {
  if (!candidates || candidates.length === 0 || !cleanedDbTitles || cleanedDbTitles.length === 0) {
    return null;
  }
  let bestMatch: any = null;
  let highestScore = 0;
  for (const candidate of candidates) {
    const slugWithoutId = candidate.slug.replace(/-\d+$/, "").replace(/-/g, " ");
    const candidateTitles = [cleanTitle(candidate.title), cleanTitle(slugWithoutId)].filter(Boolean);
    let score = 0;
    const matchedDbTitles = new Set();
    for (const cTitle of candidateTitles) {
      for (const dbTitle of cleanedDbTitles) {
        if (!matchedDbTitles.has(dbTitle)) {
          if (cTitle === dbTitle) {
            score += 1000;
            matchedDbTitles.add(dbTitle);
            break;
          } else if (cTitle.includes(dbTitle) || dbTitle.includes(cTitle)) {
            const minLen = Math.min(cTitle.length, dbTitle.length);
            const maxLen = Math.max(cTitle.length, dbTitle.length);
            const ratio = minLen / maxLen;
            score += Math.round(ratio * 100);
            matchedDbTitles.add(dbTitle);
            break;
          }
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { ...candidate, _score: score };
    }
  }
  return bestMatch;
}

async function resolveFastPrimaryAndSecondary(
  primaryQuery: string,
  secondaryQuery: string,
  searchFn: (q: string) => Promise<any>,
  extractArray: (res: any) => any[],
  matchFn: (items: any[]) => any
) {
  if (!primaryQuery && !secondaryQuery) return null;

  const p1 = primaryQuery ? searchFn(primaryQuery).catch(() => null) : Promise.resolve(null);
  const hasDistinctSecondary =
    Boolean(secondaryQuery) && cleanTitle(secondaryQuery) !== cleanTitle(primaryQuery);
  const p2 = hasDistinctSecondary ? searchFn(secondaryQuery).catch(() => null) : null;

  const res1 = await p1;
  const list1 = res1 ? extractArray(res1) : [];

  if (list1.length > 0) {
    const match1 = matchFn(list1);
    // If no secondary query or we already found an exact title match (score >= 1000), return immediately!
    if (match1 && (!p2 || (match1._score && match1._score >= 1000))) {
      return match1;
    }
  }

  if (!p2) {
    return list1.length > 0 ? matchFn(list1) : null;
  }

  const res2 = await p2;
  const list2 = res2 ? extractArray(res2) : [];
  const combined = [...list1, ...list2];
  return combined.length > 0 ? matchFn(combined) : null;
}

export async function getAnimeSourceMap(
  id: string,
  trackerParam = "anikume",
  sourceParam?: string,
  isFresh = false
) {
  const cleanId = (id || "").trim();
  if (!cleanId) {
    const err: any = new Error("Anime ID is required");
    err.status = 400;
    err.code = "INVALID_ID";
    throw err;
  }

  let requestedSources: string[] | null = null;
  if (typeof sourceParam === "string" && sourceParam.trim() !== "") {
    requestedSources = sourceParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    for (const s of requestedSources) {
      if (!VALID_SOURCEMAP_SITES.includes(s)) {
        const err: any = new Error(
          `Source '${s}' is unsupported. Valid sources: ${VALID_SOURCEMAP_SITES.join(", ")}`
        );
        err.status = 400;
        err.code = "INVALID_SOURCE";
        throw err;
      }
    }
  }

  let lookupTracker = normalizeMapTracker(trackerParam);
  if (lookupTracker === "reanime") {
    lookupTracker = "anilist";
  }

  const identityKey = `${lookupTracker}:${cleanId}`;
  let canonicalAnikumeId: string | null = null;
  let anilistId: number | null = null;
  let malId: number | null = null;

  if (isFresh) {
    clearAnikotoCache();
  }
  const cachedIdentity = !isFresh ? identityCache.get(identityKey) : null;
  if (cachedIdentity && Date.now() < cachedIdentity.expiresAt) {
    canonicalAnikumeId = cachedIdentity.canonicalAnikumeId;
    anilistId = cachedIdentity.anilistId;
    malId = cachedIdentity.malId;
  } else {
    let lookupId = cleanId;
    if (lookupTracker === "anikume") {
      const record = await findByAnikumeId(lookupId);
      if (record) {
        canonicalAnikumeId = record.anikume_id;
        if (record.anilist_id) anilistId = parseInt(String(record.anilist_id), 10);
        if (record.mal_id) malId = parseInt(String(record.mal_id), 10);
      } else if (/^\d+$/.test(lookupId)) {
        lookupTracker = "anilist";
        anilistId = parseInt(lookupId, 10);
      }
    } else if (lookupTracker === "anilist" && /^\d+$/.test(lookupId)) {
      anilistId = parseInt(lookupId, 10);
    } else if (lookupTracker === "mal" && /^\d+$/.test(lookupId)) {
      malId = parseInt(lookupId, 10);
    }

    // Fast in-memory Fribb mapping lookup if either ID is missing
    if (anilistId && !malId) {
      try {
        const m = await getAnimeMappingWithBoundaries("anilist", String(anilistId), "fribb");
        if (m?.mal_id || m?.myanimelist) malId = parseInt(String(m.mal_id || m.myanimelist), 10);
      } catch {}
    } else if (malId && !anilistId) {
      try {
        const m = await getAnimeMappingWithBoundaries("mal", String(malId), "fribb");
        if (m?.anilist_id || m?.anilist) anilistId = parseInt(String(m.anilist_id || m.anilist), 10);
      } catch {}
    } else if (!anilistId && !malId && lookupTracker !== "anikume") {
      try {
        const mapping = await getAnimeMappingWithBoundaries(lookupTracker, lookupId);
        if (mapping?.anilist_id || mapping?.anilist) {
          anilistId = parseInt(String(mapping.anilist_id || mapping.anilist), 10);
        }
        if (mapping?.mal_id || mapping?.myanimelist) {
          malId = parseInt(String(mapping.mal_id || mapping.myanimelist), 10);
        }
      } catch {}
    }

    if (!canonicalAnikumeId && (anilistId || malId)) {
      try {
        canonicalAnikumeId = await getOrCreateAnikumeId({
          anilist_id: anilistId ? String(anilistId) : null,
          mal_id: malId ? String(malId) : null
        });
      } catch {}
    }

    if (canonicalAnikumeId || anilistId || malId) {
      identityCache.set(identityKey, {
        canonicalAnikumeId,
        anilistId,
        malId,
        expiresAt: Date.now() + 86400 * 1000
      });
    }
  }

  const cacheGroupKey = canonicalAnikumeId || `id:${anilistId || ""}:${malId || ""}:${cleanId}`;
  let mapEntry = !isFresh ? sourceMapCache.get(cacheGroupKey) : undefined;
  if (!mapEntry || Date.now() >= mapEntry.expiresAt) {
    mapEntry = {
      sources: {
        anikume: canonicalAnikumeId ? String(canonicalAnikumeId) : null,
        reanime: anilistId ? String(anilistId) : null,
        "2dhive": malId ? String(malId) : null
      },
      fullResolved: false,
      expiresAt: Date.now() + 86400 * 1000
    };
    sourceMapCache.set(cacheGroupKey, mapEntry);
  } else {
    if (canonicalAnikumeId && !mapEntry.sources.anikume) mapEntry.sources.anikume = String(canonicalAnikumeId);
    if (anilistId && !mapEntry.sources.reanime) mapEntry.sources.reanime = String(anilistId);
    if (malId && !mapEntry.sources["2dhive"]) mapEntry.sources["2dhive"] = String(malId);
  }

  // Check if cache already satisfies the request
  if (!isFresh) {
    if (requestedSources) {
      const allPresent = requestedSources.every((s) => s in mapEntry.sources);
      if (allPresent) {
        const filtered: Record<string, string> = {};
        for (const s of requestedSources) {
          const val = mapEntry.sources[s];
          if (val !== null && val !== undefined) {
            filtered[s] = String(val);
          }
        }
        return filtered;
      }
    } else if (mapEntry.fullResolved) {
      return Object.fromEntries(
        Object.entries(mapEntry.sources)
          .filter(([_, v]) => v !== null && v !== undefined)
          .map(([k, v]) => [k, String(v)])
      );
    }
  }

  // Determine which external scrapers need to run
  const needsSite = (site: string) => {
    if (!isFresh && site in mapEntry.sources && mapEntry.sources[site] !== undefined) {
      return false;
    }
    if (requestedSources) {
      return requestedSources.includes(site);
    }
    return true;
  };

  const titleBasedSites = [
    "anikoto",
    "mkissa",
    "anizone",
    "anibd",
    "kickassanime",
    "aniwave",
    "anineko",
    "animeparadise",
    "piratexplay"
  ];
  const needsAnyTitleSite = titleBasedSites.some((s) => needsSite(s));

  if (needsAnyTitleSite) {
    // Resolve titleInfo fast (check titleCache -> serverCache overview -> AniList/MAL API)
    const titleCacheKey = `${anilistId || ""}:${malId || ""}`;
    let titleInfo: any = !isFresh ? titleCache.get(titleCacheKey)?.data : null;

    if (!isFresh && !titleInfo && canonicalAnikumeId) {
      const cachedOverview =
        serverCache.get(`overview:${canonicalAnikumeId}:anikume`) ||
        (anilistId ? serverCache.get(`overview:${anilistId}:anilist`) : null);
      if (cachedOverview && cachedOverview.title) {
        titleInfo = {
          anilist_id: anilistId,
          mal_id: malId,
          english: cachedOverview.title.english || null,
          romaji: cachedOverview.title.romaji || null,
          native: cachedOverview.title.native || null,
          synonyms: Array.isArray(cachedOverview.synonyms) ? cachedOverview.synonyms : []
        };
      }
    }

    // Run TMDB lookup in parallel ONLY if piratexplay is needed
    const tmdbPromise = needsSite("piratexplay")
      ? (async () => {
          let resolvedTmdb: string | null = null;
          if (anilistId) {
            try {
              const mapping = await getAnimeMappingWithBoundaries("anilist", String(anilistId));
              if (mapping?.themoviedb_id) {
                if (typeof mapping.themoviedb_id === "object") {
                  if (mapping.themoviedb_id.tv) {
                    resolvedTmdb = String(mapping.themoviedb_id.tv);
                  } else if (mapping.themoviedb_id.movie) {
                    resolvedTmdb = Array.isArray(mapping.themoviedb_id.movie)
                      ? String(mapping.themoviedb_id.movie[0])
                      : String(mapping.themoviedb_id.movie);
                  }
                } else {
                  resolvedTmdb = String(mapping.themoviedb_id);
                }
              } else if (mapping?.tmdb_id) {
                resolvedTmdb = String(mapping.tmdb_id);
              }
            } catch {}
          }
          if (!resolvedTmdb && anilistId) {
            try {
              const anibridge = await getAnibridgeFullMapping(String(anilistId), String(anilistId));
              if (anibridge?.tmdb_id) {
                resolvedTmdb = String(anibridge.tmdb_id);
              }
            } catch {}
          }
          return resolvedTmdb;
        })()
      : Promise.resolve(null);

    if (!titleInfo) {
      if (anilistId) {
        titleInfo = await fetchAniListTitles(anilistId, malId);
      } else if (malId) {
        titleInfo = await fetchAniListTitlesByMal(malId);
      }
      if (titleInfo) {
        if (!malId && titleInfo.mal_id) {
          malId = Number(titleInfo.mal_id);
          mapEntry.sources["2dhive"] = String(malId);
        }
        if (!anilistId && titleInfo.anilist_id) {
          anilistId = Number(titleInfo.anilist_id);
          mapEntry.sources.reanime = String(anilistId);
        }
        titleCache.set(`${anilistId || ""}:${malId || ""}`, {
          data: titleInfo,
          expiresAt: Date.now() + 86400 * 1000
        });
      }
    }

    const rawTitles: string[] = [];
    if (titleInfo) {
      if (titleInfo.english) rawTitles.push(titleInfo.english);
      if (titleInfo.romaji) rawTitles.push(titleInfo.romaji);
      if (titleInfo.native) rawTitles.push(titleInfo.native);
      if (Array.isArray(titleInfo.synonyms)) {
        for (const syn of titleInfo.synonyms) {
          if (syn) rawTitles.push(syn);
        }
      }
    }
    const cleanedDbTitles = [...new Set(rawTitles.map(cleanTitle).filter(Boolean))];

    if (titleInfo && (titleInfo.english || titleInfo.romaji || rawTitles.length > 0)) {
      const candEnglish = (titleInfo.english || "").trim();
      const candRomaji = (titleInfo.romaji || "").trim();
      const isRomajiShort = candRomaji.length <= 5 && candEnglish.length > candRomaji.length;
      const primaryQuery = (
        isRomajiShort || !candRomaji
          ? candEnglish || candRomaji || rawTitles[0] || ""
          : candRomaji || candEnglish || rawTitles[0] || ""
      ).trim();
      const secondaryQuery = (
        candEnglish && candEnglish !== primaryQuery
          ? candEnglish
          : candRomaji && candRomaji !== primaryQuery
          ? candRomaji
          : rawTitles.find((t) => t !== primaryQuery) || ""
      ).trim();

      const tasks: Promise<void>[] = [];

      if (needsSite("anikoto")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchAnikoto(q),
            (res) => res?.results || [],
            (list) => matchBestAnikotoCandidate(list, cleanedDbTitles)
          ).then((match) => {
            const val = match?.tip_id || match?.id || null;
            mapEntry.sources.anikoto = val ? String(val) : null;
          })
        );
      }

      if (needsSite("mkissa")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchMkissa(q, { limit: 6, sortBy: "Top", sortDirection: -1 }),
            (res) => res?.results || [],
            (list) => matchBestMkissaCandidate(list, cleanedDbTitles, malId, anilistId)
          ).then((match) => {
            mapEntry.sources.mkissa = match?.id ? String(match.id) : null;
          })
        );
      }

      if (needsSite("anizone")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchAnizone(q),
            (res) => res?.results || [],
            (list) => matchBestAnizoneCandidate(list, cleanedDbTitles)
          ).then((match) => {
            const val = match?.id || match?.slug || null;
            mapEntry.sources.anizone = val ? String(val) : null;
          })
        );
      }

      if (needsSite("anibd")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchAnibd(q),
            (res) => res?.data || [],
            (list) => matchBestAnibdCandidate(list, cleanedDbTitles, anilistId)
          ).then((match) => {
            mapEntry.sources.anibd = match?.postid ? String(match.postid) : null;
          })
        );
      }

      if (needsSite("kickassanime")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchKickAssAnime(q),
            (res) => res?.results || [],
            (list) => matchBestKickAssAnimeCandidate(list, cleanedDbTitles)
          ).then((match) => {
            mapEntry.sources.kickassanime = match?.slug ? String(match.slug) : null;
          })
        );
      }

      if (needsSite("aniwave")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchAniwave(q),
            (res) => res?.results || [],
            (list) => matchBestAniwaveCandidate(list, cleanedDbTitles)
          ).then((match) => {
            const val = match?.tip_id || match?.id || null;
            mapEntry.sources.aniwave = val ? String(val) : null;
          })
        );
      }

      if (needsSite("anineko")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchAnineko(q),
            (res) => res?.results || [],
            (list) => matchBestAninekoCandidate(list, cleanedDbTitles)
          ).then((match) => {
            const val = match?.id || match?.slug || null;
            mapEntry.sources.anineko = val ? String(val) : null;
          })
        );
      }

      if (needsSite("animeparadise")) {
        tasks.push(
          resolveFastPrimaryAndSecondary(
            primaryQuery,
            secondaryQuery,
            (q) => searchAnimeParadise(q),
            (res) => res?.results || [],
            (list) => matchBestAnimeParadiseCandidate(list, cleanedDbTitles)
          ).then((match) => {
            const val = match?.id || match?.slug || null;
            mapEntry.sources.animeparadise = val ? String(val) : null;
          })
        );
      }

      if (needsSite("piratexplay")) {
        tasks.push(
          (async () => {
            const tmdbId = await tmdbPromise;
            let pirateSlug: string | null = null;
            if (tmdbId) {
              try {
                const res = await searchPirateXPlay(tmdbId);
                const match = (res?.results || []).find((item: any) => {
                  const lastNumber = item.slug?.match(/-(\d+)$/)?.[1];
                  return lastNumber === tmdbId || item.slug?.endsWith(`-${tmdbId}`);
                });
                if (match?.slug) pirateSlug = String(match.slug);
              } catch {}
            }
            if (!pirateSlug) {
              const best = await resolveFastPrimaryAndSecondary(
                primaryQuery,
                secondaryQuery,
                (q) => searchPirateXPlay(q),
                (res) => res?.results || [],
                (list) => matchBestPirateXPlayCandidate(list, cleanedDbTitles)
              );
              if (best?.slug) pirateSlug = String(best.slug);
            }
            mapEntry.sources.piratexplay = pirateSlug;
          })()
        );
      }

      await Promise.allSettled(tasks);
    }
  }

  if (!requestedSources) {
    mapEntry.fullResolved = true;
  }

  if (requestedSources) {
    const filtered: Record<string, string> = {};
    for (const s of requestedSources) {
      const val = mapEntry.sources[s];
      if (val !== null && val !== undefined) {
        filtered[s] = String(val);
      }
    }
    return filtered;
  }

  return Object.fromEntries(
    Object.entries(mapEntry.sources)
      .filter(([_, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  );
}

export const getAnimeAllMap = getAnimeSourceMap;

