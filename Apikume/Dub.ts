// @ts-nocheck
import { resolveSingleAnimeMap } from "./Ids.js";

const ANIDUB_LOOKUP_ANILIST_URL = "https://api.anidub.moe/v1/anime/lookup";
const ANIDUB_LOOKUP_MAL_URL = "https://api.anidub.moe/v1/anime/lookup-mal";
const ANIDUB_BATCH_LIMIT = 50;
const MAL_CLIENT_ID =
  (typeof process !== "undefined" && process.env?.MAL_CLIENT_ID) ||
  "6114d00ca681b7701d1e15fe11a4987e";

function getCurrentClientIp(explicitIp?: string | null): string {
  if (!explicitIp || typeof explicitIp !== "string") return "";
  const cleaned = explicitIp.split(",")[0].trim().replace(/^::ffff:/i, "");
  if (!cleaned || cleaned === "127.0.0.1" || cleaned === "::1") return "";
  return cleaned;
}

function buildUserIpHeaders(clientIp?: string | null): Record<string, string> {
  if (typeof window !== "undefined") return {};
  const effectiveIp = getCurrentClientIp(clientIp);
  if (!effectiveIp) return {};
  return {
    "X-Forwarded-For": effectiveIp,
    "X-Real-IP": effectiveIp,
    "X-Client-IP": effectiveIp,
    Forwarded: `for=${effectiveIp}`,
  };
}

function getForwardedHeaders(clientIp?: string | null): Record<string, string> {
  return buildUserIpHeaders(clientIp);
}

function clientIpToUuid(clientIp?: string | null, salt: string = "anidub-v1"): string {
  const effectiveIp = getCurrentClientIp(clientIp) || "127.0.0.1";
  const input = `${salt}:${effectiveIp}`;
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  let h3 = 0x9e3779b9 ^ input.length;
  let h4 = 0x85ebca6b ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  const hex =
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h3 >>> 0).toString(16).padStart(8, "0") +
    (h4 >>> 0).toString(16).padStart(8, "0");
  const p1 = hex.slice(0, 8);
  const p2 = hex.slice(8, 12);
  const p3 = "4" + hex.slice(13, 16);
  const variantNibble = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const p4 = variantNibble + hex.slice(17, 20);
  const p5 = hex.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

export interface AniDubItem {
  anikume: string | null;
  sub: string | null;
  dub: string | null;
}

export interface AniDubPrefetchedItem {
  anikume?: string | null;
  anikume_id?: string | null;
  anilist?: string | number | null;
  anilist_id?: string | number | null;
  mal?: string | number | null;
  mal_id?: string | number | null;
  status?: string | null;
  airingStatus?: string | null;
  episodes?: number | string | null;
  num_episodes?: number | string | null;
  nextAiringEpisode?: number | { episode?: number | null } | null;
}

function chunkArray<T>(items: T[], size: number = ANIDUB_BATCH_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isReleasingStatus(status?: string | null): boolean {
  if (!status) return false;
  const s = String(status).trim().toUpperCase();
  return (
    s === "RELEASING" ||
    s === "AIRING" ||
    s === "CURRENTLY_AIRING" ||
    s === "CURRENT" ||
    s === "ONGOING"
  );
}

function parsePositiveInt(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = typeof val === "number" ? val : parseInt(String(val), 10);
  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function extractNextAiringEpisodeNumber(nextAiringEpisode: any): number | null {
  if (nextAiringEpisode === null || nextAiringEpisode === undefined) return null;
  if (typeof nextAiringEpisode === "number") {
    return parsePositiveInt(nextAiringEpisode);
  }
  if (typeof nextAiringEpisode === "object" && nextAiringEpisode.episode !== undefined) {
    return parsePositiveInt(nextAiringEpisode.episode);
  }
  return null;
}

/**
 * Computes the `sub` episode count as a string with quotes:
 * - If status is RELEASING: takes `nextAiringEpisode - 1` (fallback to `episodes` if nextAiringEpisode is unavailable).
 * - If status is NOT RELEASING: takes `episodes` (when not null).
 */
export function computeSubEpisodesString(meta: {
  status?: string | null;
  episodes?: number | string | null;
  nextAiringEpisode?: number | { episode?: number | null } | null;
}): string | null {
  const releasing = isReleasingStatus(meta.status);
  const nextEp = extractNextAiringEpisodeNumber(meta.nextAiringEpisode);
  const totalEps = parsePositiveInt(meta.episodes);

  if (releasing) {
    if (nextEp !== null && nextEp > 0) {
      const subCount = Math.max(0, nextEp - 1);
      return String(subCount);
    }
    if (totalEps !== null && totalEps > 0) {
      return String(totalEps);
    }
    return null;
  }

  if (totalEps !== null && totalEps > 0) {
    return String(totalEps);
  }
  if (nextEp !== null && nextEp > 0) {
    const subCount = Math.max(0, nextEp - 1);
    return String(subCount);
  }
  return null;
}

/**
 * Extracts English (`language: "en"`) dubbedEpisodes from an anidub.moe result item
 * and formats it as an integer string.
 */
function extractEnglishDubString(anidubItem: any): string | null {
  if (!anidubItem || typeof anidubItem !== "object") return null;

  let enDub =
    anidubItem.dub && anidubItem.dub.language === "en" ? anidubItem.dub : null;

  if (!enDub && Array.isArray(anidubItem.dubs)) {
    enDub = anidubItem.dubs.find((d: any) => d && d.language === "en") || null;
  }

  if (!enDub) return null;

  const dubbedEps = parsePositiveInt(enDub.dubbedEpisodes);
  if (dubbedEps !== null) {
    return String(dubbedEps);
  }

  return null;
}

async function postAnidubBatch(url: string, ids: number[], clientIp?: string) {
  const effectiveIp = getCurrentClientIp(clientIp);
  const ipHeaders = buildUserIpHeaders(effectiveIp);
  const primaryInstallId = clientIpToUuid(effectiveIp, "anidub-v1");

  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Anidub-Install": primaryInstallId,
      "X-Source": "extension",
      ...ipHeaders,
    },
    body: JSON.stringify({
      ids,
      language: "en",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (res.status === 429) {
    const fallbackInstallId = clientIpToUuid(effectiveIp, `anidub-retry-${Math.floor(Date.now() / 60000)}`);
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Anidub-Install": fallbackInstallId,
        "X-Source": "extension",
        ...ipHeaders,
      },
      body: JSON.stringify({
        ids,
        language: "en",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  }

  return res;
}

/**
 * Calls POST https://api.anidub.moe/v1/anime/lookup in chunks of up to 50 AniList IDs.
 */
async function fetchAnidubByAnilistIds(
  anilistIds: number[],
  clientIp?: string
): Promise<{
  byAnilist: Map<string, any>;
  byMal: Map<string, any>;
  notFound: Set<number>;
}> {
  const byAnilist = new Map<string, any>();
  const byMal = new Map<string, any>();
  const notFound = new Set<number>();

  const uniqueIds = Array.from(new Set(anilistIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (uniqueIds.length === 0) {
    return { byAnilist, byMal, notFound };
  }

  const chunks = chunkArray(uniqueIds, ANIDUB_BATCH_LIMIT);
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await postAnidubBatch(ANIDUB_LOOKUP_ANILIST_URL, chunk, clientIp);
        if (!res.ok) return;
        const json = await res.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        for (const item of results) {
          if (item?.anilistId !== undefined && item?.anilistId !== null) {
            byAnilist.set(String(item.anilistId), item);
          }
          if (item?.malId !== undefined && item?.malId !== null) {
            byMal.set(String(item.malId), item);
          }
        }
        if (Array.isArray(json?.notFound)) {
          for (const nf of json.notFound) {
            const num = Number(nf);
            if (!Number.isNaN(num)) notFound.add(num);
          }
        }
      } catch (err) {
        console.warn("[AniDub] Error calling /v1/anime/lookup:", err);
      }
    })
  );

  return { byAnilist, byMal, notFound };
}

/**
 * Calls POST https://api.anidub.moe/v1/anime/lookup-mal in chunks of up to 50 MAL IDs.
 */
async function fetchAnidubByMalIds(
  malIds: number[],
  clientIp?: string
): Promise<{
  byAnilist: Map<string, any>;
  byMal: Map<string, any>;
}> {
  const byAnilist = new Map<string, any>();
  const byMal = new Map<string, any>();

  const uniqueIds = Array.from(new Set(malIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (uniqueIds.length === 0) {
    return { byAnilist, byMal };
  }

  const chunks = chunkArray(uniqueIds, ANIDUB_BATCH_LIMIT);
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await postAnidubBatch(ANIDUB_LOOKUP_MAL_URL, chunk, clientIp);
        if (!res.ok) return;
        const json = await res.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        for (const item of results) {
          if (item?.malId !== undefined && item?.malId !== null) {
            byMal.set(String(item.malId), item);
          }
          if (item?.anilistId !== undefined && item?.anilistId !== null) {
            byAnilist.set(String(item.anilistId), item);
          }
        }
      } catch (err) {
        console.warn("[AniDub] Error calling /v1/anime/lookup-mal:", err);
      }
    })
  );

  return { byAnilist, byMal };
}

/**
 * Fetches status, episodes, and nextAiringEpisode in batches of 50 from AniList GraphQL
 * (or MAL API fallback when only MAL ID is known and not on AniList).
 * Used ONLY when pre-fetched metadata was not already supplied by heroslider / catalog APIs.
 */
async function fetchSubMetadataBatch(
  anilistIds: number[],
  malIdsWithoutAnilist: number[],
  clientIp?: string
): Promise<{
  byAnilist: Map<string, { status: string | null; episodes: number | null; nextAiringEpisode: number | null }>;
  byMal: Map<string, { status: string | null; episodes: number | null; nextAiringEpisode: number | null }>;
}> {
  const byAnilist = new Map<string, { status: string | null; episodes: number | null; nextAiringEpisode: number | null }>();
  const byMal = new Map<string, { status: string | null; episodes: number | null; nextAiringEpisode: number | null }>();

  const uniqueAniIds = Array.from(new Set(anilistIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (uniqueAniIds.length > 0) {
    const aniChunks = chunkArray(uniqueAniIds, ANIDUB_BATCH_LIMIT);
    const query = `
      query ($ids: [Int]) {
        Page(page: 1, perPage: 50) {
          media(id_in: $ids, type: ANIME) {
            id
            idMal
            status
            episodes
            nextAiringEpisode {
              episode
            }
          }
        }
      }
    `;
    await Promise.all(
      aniChunks.map(async (chunk) => {
        try {
          const res = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...getForwardedHeaders(clientIp)
            },
            body: JSON.stringify({
              query,
              variables: { ids: chunk }
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(7000)
          });
          if (!res.ok) return;
          const json = await res.json();
          const mediaList = json?.data?.Page?.media;
          if (!Array.isArray(mediaList)) return;
          for (const m of mediaList) {
            const meta = {
              status: m.status || null,
              episodes: typeof m.episodes === "number" ? m.episodes : null,
              nextAiringEpisode:
                typeof m.nextAiringEpisode?.episode === "number"
                  ? m.nextAiringEpisode.episode
                  : null
            };
            if (m.id) byAnilist.set(String(m.id), meta);
            if (m.idMal) byMal.set(String(m.idMal), meta);
          }
        } catch {}
      })
    );
  }

  const remainingMalIds = Array.from(
    new Set(
      malIdsWithoutAnilist.filter(
        (n) => Number.isInteger(n) && n > 0 && !byMal.has(String(n))
      )
    )
  );

  if (remainingMalIds.length > 0) {
    // 1. Try batching via AniList idMal_in first (gives nextAiringEpisode for releasing anime)
    const malChunks = chunkArray(remainingMalIds, ANIDUB_BATCH_LIMIT);
    const malQuery = `
      query ($malIds: [Int]) {
        Page(page: 1, perPage: 50) {
          media(idMal_in: $malIds, type: ANIME) {
            id
            idMal
            status
            episodes
            nextAiringEpisode {
              episode
            }
          }
        }
      }
    `;
    await Promise.all(
      malChunks.map(async (chunk) => {
        try {
          const res = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...getForwardedHeaders(clientIp)
            },
            body: JSON.stringify({
              query: malQuery,
              variables: { malIds: chunk }
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(7000)
          });
          if (!res.ok) return;
          const json = await res.json();
          const mediaList = json?.data?.Page?.media;
          if (!Array.isArray(mediaList)) return;
          for (const m of mediaList) {
            const meta = {
              status: m.status || null,
              episodes: typeof m.episodes === "number" ? m.episodes : null,
              nextAiringEpisode:
                typeof m.nextAiringEpisode?.episode === "number"
                  ? m.nextAiringEpisode.episode
                  : null
            };
            if (m.id) byAnilist.set(String(m.id), meta);
            if (m.idMal) byMal.set(String(m.idMal), meta);
          }
        } catch {}
      })
    );

    // 2. Fallback to MAL v2 API for any MAL ID still missing
    const stillMissingMal = remainingMalIds.filter((n) => !byMal.has(String(n)));
    if (stillMissingMal.length > 0) {
      await Promise.all(
        stillMissingMal.map(async (malId) => {
          try {
            const res = await fetch(
              `https://api.myanimelist.net/v2/anime/${malId}?fields=id,status,num_episodes`,
              {
                headers: {
                  "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
                  Accept: "application/json",
                  ...buildUserIpHeaders(clientIp),
                },
                cache: "no-store",
                signal: AbortSignal.timeout(6000)
              }
            );
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.id) {
              byMal.set(String(data.id), {
                status: data.status || null,
                episodes:
                  typeof data.num_episodes === "number" && data.num_episodes > 0
                    ? data.num_episodes
                    : null,
                nextAiringEpisode: null
              });
            }
          } catch {}
        })
      );
    }
  }

  return { byAnilist, byMal };
}

/**
 * Formats the output text in the exact same style as `ids.ts` (`total` followed by `result`).
 */
export function formatAniDubText(total: number, validItems: AniDubItem[]): string {
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
  return `total: ${total}\n${resultBlock}`;
}

/**
 * Resolves `anikume`, `sub`, and `dub` for pre-fetched items (e.g. from heroslider or catalog APIs
 * that already fetched `status`, `episodes`, or `nextAiringEpisode` alongside poster/title)
 * WITHOUT making redundant individual detail calls to AniList or MAL.
 */
export async function resolveAniDubForPrefetchedItems(
  prefetchedItems: AniDubPrefetchedItem[],
  options?: { fresh?: boolean; clientIp?: string; skipAnilistSubRefetch?: boolean }
): Promise<{
  total: number;
  items: AniDubItem[];
  formattedText: string;
}> {
  const isFresh = Boolean(options?.fresh);
  const total = prefetchedItems.length;
  if (total === 0) {
    return { total: 0, items: [], formattedText: formatAniDubText(0, []) };
  }

  // Ensure every item has anikume + (anilist or mal) resolved via ids.ts if not already present
  const resolvedEntries = await Promise.all(
    prefetchedItems.map(async (item) => {
      let anikume = item.anikume || item.anikume_id || null;
      let anilist =
        item.anilist !== undefined && item.anilist !== null
          ? String(item.anilist)
          : item.anilist_id !== undefined && item.anilist_id !== null
          ? String(item.anilist_id)
          : null;
      let mal =
        item.mal !== undefined && item.mal !== null
          ? String(item.mal)
          : item.mal_id !== undefined && item.mal_id !== null
          ? String(item.mal_id)
          : null;

      if (!anikume || (!anilist && !mal)) {
        const lookupId = anilist || mal || anikume;
        const lookupTracker = anilist ? "anilist" : mal ? "mal" : "anikume";
        if (lookupId) {
          const mapped = await resolveSingleAnimeMap(
            String(lookupId),
            lookupTracker,
            isFresh
          );
          if (mapped) {
            if (!anikume && mapped.anikume) anikume = String(mapped.anikume);
            if (!anilist && mapped.anilist) anilist = String(mapped.anilist);
            if (!mal && mapped.mal) mal = String(mapped.mal);
          }
        }
      }

      return {
        anikume,
        anilist,
        mal,
        prefetchedStatus: item.status || item.airingStatus || null,
        prefetchedEpisodes: item.episodes ?? item.num_episodes ?? null,
        prefetchedNextAiring: item.nextAiringEpisode ?? null
      };
    })
  );

  // Collect AniList IDs and MAL-only IDs for anidub.moe batch lookup (chunks of 50)
  const anilistLookupNums: number[] = [];
  const malOnlyLookupNums: number[] = [];

  for (const entry of resolvedEntries) {
    if (entry.anilist && /^\d+$/.test(entry.anilist)) {
      anilistLookupNums.push(Number(entry.anilist));
    } else if (entry.mal && /^\d+$/.test(entry.mal)) {
      malOnlyLookupNums.push(Number(entry.mal));
    }
  }

  const [aniLookupRes, malLookupRes] = await Promise.all([
    fetchAnidubByAnilistIds(anilistLookupNums, options?.clientIp),
    fetchAnidubByMalIds(malOnlyLookupNums, options?.clientIp)
  ]);

  // If any AniList ID was notFound in /v1/anime/lookup but has a MAL ID, try /v1/anime/lookup-mal for it
  const fallbackMalNums: number[] = [];
  for (const entry of resolvedEntries) {
    if (
      entry.anilist &&
      aniLookupRes.notFound.has(Number(entry.anilist)) &&
      entry.mal &&
      /^\d+$/.test(entry.mal)
    ) {
      fallbackMalNums.push(Number(entry.mal));
    }
  }
  if (fallbackMalNums.length > 0) {
    const fallbackRes = await fetchAnidubByMalIds(fallbackMalNums, options?.clientIp);
    for (const [k, v] of fallbackRes.byMal.entries()) malLookupRes.byMal.set(k, v);
    for (const [k, v] of fallbackRes.byAnilist.entries()) aniLookupRes.byAnilist.set(k, v);
  }

  // Check if any item still needs sub metadata (only if pre-fetched data didn't already give us sub)
  const needSubAnilistIds: number[] = [];
  const needSubMalIds: number[] = [];

  for (const entry of resolvedEntries) {
    const anidubItem =
      (entry.anilist ? aniLookupRes.byAnilist.get(entry.anilist) || malLookupRes.byAnilist.get(entry.anilist) : null) ||
      (entry.mal ? malLookupRes.byMal.get(entry.mal) || aniLookupRes.byMal.get(entry.mal) : null) ||
      null;

    const effectiveStatus = entry.prefetchedStatus || anidubItem?.airingStatus || null;
    const effectiveEpisodes = entry.prefetchedEpisodes ?? anidubItem?.episodes ?? null;
    const effectiveNextAiring = entry.prefetchedNextAiring ?? null;

    const alreadyHasSub = computeSubEpisodesString({
      status: effectiveStatus,
      episodes: effectiveEpisodes,
      nextAiringEpisode: effectiveNextAiring
    });

    // If it's RELEASING and we don't have nextAiringEpisode yet, or if we don't have sub at all, batch fetch
    const needsNextAiringFetch =
      isReleasingStatus(effectiveStatus) && extractNextAiringEpisodeNumber(effectiveNextAiring) === null;

    if (!options?.skipAnilistSubRefetch && (!alreadyHasSub || needsNextAiringFetch)) {
      const targetAni = entry.anilist || (anidubItem?.anilistId ? String(anidubItem.anilistId) : null);
      const targetMal = entry.mal || (anidubItem?.malId ? String(anidubItem.malId) : null);
      if (targetAni && /^\d+$/.test(targetAni)) {
        needSubAnilistIds.push(Number(targetAni));
      } else if (targetMal && /^\d+$/.test(targetMal)) {
        needSubMalIds.push(Number(targetMal));
      }
    }
  }

  const fetchedSubMeta =
    needSubAnilistIds.length > 0 || needSubMalIds.length > 0
      ? await fetchSubMetadataBatch(needSubAnilistIds, needSubMalIds, options?.clientIp)
      : { byAnilist: new Map(), byMal: new Map() };

  const items: AniDubItem[] = resolvedEntries.map((entry) => {
    const anidubItem =
      (entry.anilist ? aniLookupRes.byAnilist.get(entry.anilist) || malLookupRes.byAnilist.get(entry.anilist) : null) ||
      (entry.mal ? malLookupRes.byMal.get(entry.mal) || aniLookupRes.byMal.get(entry.mal) : null) ||
      null;

    const targetAni = entry.anilist || (anidubItem?.anilistId ? String(anidubItem.anilistId) : null);
    const targetMal = entry.mal || (anidubItem?.malId ? String(anidubItem.malId) : null);

    const apiMeta =
      (targetAni ? fetchedSubMeta.byAnilist.get(targetAni) : null) ||
      (targetMal ? fetchedSubMeta.byMal.get(targetMal) : null) ||
      null;

    const status = entry.prefetchedStatus || apiMeta?.status || anidubItem?.airingStatus || null;
    const episodes = entry.prefetchedEpisodes ?? apiMeta?.episodes ?? anidubItem?.episodes ?? null;
    const nextAiringEpisode = entry.prefetchedNextAiring ?? apiMeta?.nextAiringEpisode ?? null;

    const sub = computeSubEpisodesString({
      status,
      episodes,
      nextAiringEpisode
    });
    const dub = extractEnglishDubString(anidubItem);

    return {
      anikume: entry.anikume || null,
      sub,
      dub
    };
  });

  return {
    total,
    items,
    formattedText: formatAniDubText(total, items)
  };
}

/**
 * Main entry point for resolving `anikume`, `sub`, and `dub` by single or comma-separated IDs.
 * 1. Resolves `anikume`, `anilist`, and `mal` IDs via `ids.ts` (`resolveSingleAnimeMap`).
 * 2. Uses `https://api.anidub.moe/v1/anime/lookup` (in batches of 50) when `anilist` ID is present,
 *    or `https://api.anidub.moe/v1/anime/lookup-mal` (in batches of 50) when `mal` ID is used.
 * 3. Extracts English `dub` (`dubbedEpisodes`) and computes `sub` (`nextAiringEpisode - 1` if RELEASING, or `episodes` if not releasing).
 */
export async function getAniDub(options: {
  ids: string | string[];
  tracker?: string;
  fresh?: boolean;
  clientIp?: string;
  prefetchedById?: Record<string, AniDubPrefetchedItem>;
}) {
  const isFresh = Boolean(options.fresh);
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

  const total = idList.length;
  if (total === 0) {
    return {
      total: 0,
      items: [],
      single: null,
      isBatch: false,
      formattedText: formatAniDubText(0, [])
    };
  }

  // Step 1: Resolve anikume, anilist, and mal IDs using ids.ts
  const mappedList = await Promise.all(
    idList.map(async (singleId) => {
      const prefetched = options.prefetchedById?.[singleId];
      const mapped = await resolveSingleAnimeMap(
        singleId,
        normTracker,
        isFresh
      );
      if (!mapped && !prefetched) return null;

      return {
        anikume: mapped?.anikume || prefetched?.anikume || prefetched?.anikume_id || null,
        anilist: mapped?.anilist || (normTracker === "anilist" ? singleId : prefetched?.anilist || null),
        mal: mapped?.mal || (normTracker === "mal" ? singleId : prefetched?.mal || null),
        status: prefetched?.status || prefetched?.airingStatus || null,
        episodes: prefetched?.episodes ?? prefetched?.num_episodes ?? null,
        nextAiringEpisode: prefetched?.nextAiringEpisode ?? null
      } as AniDubPrefetchedItem;
    })
  );

  const validPrefetched = mappedList.filter(Boolean) as AniDubPrefetchedItem[];
  if (validPrefetched.length === 0) {
    return {
      total,
      items: [],
      single: null,
      isBatch: idList.length > 1,
      formattedText: formatAniDubText(total, [])
    };
  }

  const resolved = await resolveAniDubForPrefetchedItems(validPrefetched, {
    fresh: isFresh,
    clientIp: options.clientIp
  });

  const formattedText = formatAniDubText(total, resolved.items);

  return {
    total,
    items: resolved.items,
    single: resolved.items[0] || null,
    isBatch: idList.length > 1,
    formattedText
  };
}
