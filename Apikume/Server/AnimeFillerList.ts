// @ts-nocheck
import * as cheerio from "cheerio";
import { serverCache } from "./Cache.js";

const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

export function normalizeTitleForMatching(str: string): { unicode: string; ascii: string } {
  if (!str) return { unicode: "", ascii: "" };
  const unicode = str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const ascii = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return { unicode, ascii };
}

export async function fetchAniListEnglishTitle(anilistId: number | string): Promise<string | null> {
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      body: JSON.stringify({
        query: `query ($id: Int) {
          Media(id: $id, type: ANIME) {
            title { english romaji native }
          }
        }`,
        variables: { id: Number(anilistId) }
      }),
      signal: AbortSignal.timeout(2000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const t = json.data?.Media?.title;
    return t?.english || t?.romaji || t?.native || null;
  } catch {
    return null;
  }
}

export async function fetchMalEnglishTitle(malId: number | string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=title,alternative_titles`, {
      headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID, "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(2000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.alternative_titles?.en || data.title || null;
  } catch {
    return null;
  }
}

export async function getFillerEpisodesSet(params: {
  anilistId?: number | string | null;
  malId?: number | string | null;
  title?: string | null;
  isFresh?: boolean;
}): Promise<Set<number>> {
  const anilistId = params.anilistId ? Number(params.anilistId) : null;
  const malId = params.malId ? Number(params.malId) : null;
  const isFresh = Boolean(params.isFresh);
  let searchTitle = params.title?.trim() || null;

  if (isFresh) {
    if (anilistId) serverCache.delete(`filler:al:${anilistId}`);
    if (malId) serverCache.delete(`filler:mal:${malId}`);
    if (searchTitle) serverCache.delete(`filler:t:${searchTitle.toLowerCase()}`);
  } else {
    if (anilistId) {
      const cached = serverCache.get(`filler:al:${anilistId}`);
      if (cached && Array.isArray(cached)) {
        return new Set(cached);
      }
    }
    if (malId) {
      const cached = serverCache.get(`filler:mal:${malId}`);
      if (cached && Array.isArray(cached)) {
        return new Set(cached);
      }
    }
    if (searchTitle) {
      const cached = serverCache.get(`filler:t:${searchTitle.toLowerCase()}`);
      if (cached && Array.isArray(cached)) {
        return new Set(cached);
      }
    }
  }

  // Resolve title from AniList or MAL if not provided
  if (!searchTitle && anilistId) {
    searchTitle = await fetchAniListEnglishTitle(anilistId);
  }
  if (!searchTitle && malId) {
    searchTitle = await fetchMalEnglishTitle(malId);
  }

  if (!searchTitle) return new Set();

  if (isFresh) {
    serverCache.delete(`filler:t:${searchTitle.toLowerCase()}`);
  }

  try {
    const searchUrl = `https://www.animefillerlist.com/search/node/${encodeURIComponent(searchTitle)}`;
    const fillerRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(2500)
    });
    if (!fillerRes.ok) return new Set();
    const pageHtml = await fillerRes.text();
    const $ = cheerio.load(pageHtml);
    const results: { title: string; url: string }[] = [];
    $("ol.search-results li, li.search-result").each((_i, el) => {
      const a = $(el).find("h3.title a, h3 a").first();
      const t = a.text().trim();
      const url = a.attr("href") || "";
      if (t && url) results.push({ title: t, url });
    });

    const targetNorm = normalizeTitleForMatching(searchTitle);
    let bestMatch: { title: string; url: string } | null = null;
    let maxScore = -1;

    for (const item of results) {
      const itemNorm = normalizeTitleForMatching(item.title);
      let score = 0;
      if (itemNorm.unicode === targetNorm.unicode || itemNorm.ascii === targetNorm.ascii) {
        score = 100;
      } else if (itemNorm.ascii.startsWith(targetNorm.ascii) || targetNorm.ascii.startsWith(itemNorm.ascii)) {
        score = 80;
      } else if (itemNorm.ascii.includes(targetNorm.ascii) || targetNorm.ascii.includes(itemNorm.ascii)) {
        score = 60;
      }
      if (score > maxScore && score >= 50) {
        maxScore = score;
        bestMatch = item;
      }
    }

    if (!bestMatch) return new Set();

    const showRes = await fetch(bestMatch.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(2500)
    });
    if (!showRes.ok) return new Set();
    const showHtml = await showRes.text();
    const $show = cheerio.load(showHtml);
    const fillerSet = new Set<number>();
    $show("table.EpisodeList tr, table.Filler tr").each((_i, el) => {
      const numberStr = $show(el).find("td.Number, td.number, td.ep-number").text().trim();
      const type = $show(el).find("td.Type, td.type, span.type").text().trim().toLowerCase();
      if (numberStr && (type === "filler" || (type.includes("filler") && !type.includes("canon") && !type.includes("manga")))) {
        const num = parseInt(numberStr, 10);
        if (!isNaN(num)) fillerSet.add(num);
      }
    });

    const fillerArray = Array.from(fillerSet);
    if (anilistId) {
      serverCache.set(`filler:al:${anilistId}`, fillerArray, 86400);
    }
    if (malId) {
      serverCache.set(`filler:mal:${malId}`, fillerArray, 86400);
    }
    if (searchTitle) {
      serverCache.set(`filler:t:${searchTitle.toLowerCase()}`, fillerArray, 86400);
    }

    return fillerSet;
  } catch (err) {
    console.warn("[AnimeFillerList] Error:", err);
    return new Set();
  }
}
