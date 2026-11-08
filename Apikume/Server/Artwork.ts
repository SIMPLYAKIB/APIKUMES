// @ts-nocheck
import { getAnimeMappingWithBoundaries, findByAnikumeId } from "../Ids.js";
import { getTvdbToken } from "./Catalog.js";
import { getAnimeMediaMeta } from "./Episodes.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";

export interface ArtworkResultItem {
  url: string;
}

export interface AnimeArtworkResponse {
  data: string;
  total: number;
  results: Record<string, ArtworkResultItem[]>[];
  result?: Record<string, ArtworkResultItem[]>[];
}

export async function getAnimeArtwork(
  id: string,
  trackerParam?: string,
  clientIp?: string
): Promise<AnimeArtworkResponse> {
  const rawId = (id || "").trim();
  const rawTracker = (trackerParam || "anikume").toLowerCase().trim();

  let canonicalAnikumeId: string | null = null;
  let anilistId: number | null = null;
  let malId: number | null = null;
  let directTmdbId: string | null = null;

  if (rawTracker === "anilist") {
    anilistId = parseInt(rawId, 10) || null;
  } else if (rawTracker === "mal") {
    malId = parseInt(rawId, 10) || null;
  } else if (rawTracker === "tmdb") {
    directTmdbId = rawId;
  } else {
    if (/^\d+$/.test(rawId)) {
      anilistId = parseInt(rawId, 10);
    } else {
      canonicalAnikumeId = rawId;
    }
  }

  // Pre-resolve Anikume ID to known IDs if available
  if (canonicalAnikumeId && !anilistId && !malId) {
    try {
      const rec = await findByAnikumeId(canonicalAnikumeId);
      if (rec?.anilist_id) anilistId = parseInt(rec.anilist_id, 10);
      if (rec?.mal_id) malId = parseInt(rec.mal_id, 10);
    } catch {}
  }

  // Resolve mapping and media format in parallel when tracker ID is already known
  let mapping: any = null;
  const earlyMetaPromise = (anilistId || malId)
    ? getAnimeMediaMeta(anilistId, malId, clientIp).catch(() => null)
    : Promise.resolve(null);

  try {
    if (canonicalAnikumeId) {
      mapping = await getAnimeMappingWithBoundaries("anikume", canonicalAnikumeId);
    } else if (anilistId) {
      mapping = await getAnimeMappingWithBoundaries("anilist", String(anilistId));
    } else if (malId) {
      mapping = await getAnimeMappingWithBoundaries("mal", String(malId));
    }
  } catch {}

  if (mapping?.anilist_id && !anilistId) anilistId = parseInt(String(mapping.anilist_id), 10);
  if (mapping?.mal_id && !malId) malId = parseInt(String(mapping.mal_id), 10);

  // Check if format is MOVIE
  let isMovie = mapping?.type === "MOVIE";
  if (!isMovie && (anilistId || malId)) {
    try {
      const meta = (await earlyMetaPromise) || (await getAnimeMediaMeta(anilistId, malId, clientIp));
      if (meta?.is_movie || meta?.format === "MOVIE") {
        isMovie = true;
      }
    } catch {}
  }

  const tvdbShowId = mapping?.tvdb_id || mapping?.thetvdb_id;
  const tmdbTarget = directTmdbId || mapping?.themoviedb_id || mapping?.tmdb_id;
  let tmdbId: string | null = null;
  if (tmdbTarget) {
    if (typeof tmdbTarget === "object") {
      tmdbId = isMovie
        ? (Array.isArray(tmdbTarget.movie) ? tmdbTarget.movie[0] : tmdbTarget.movie || tmdbTarget.tv)
        : (Array.isArray(tmdbTarget.tv) ? tmdbTarget.tv[0] : tmdbTarget.tv || tmdbTarget.movie);
    } else {
      tmdbId = String(tmdbTarget);
    }
  }

function getTvdbCategory(type: any): string | null {
  const t = String(type ?? "").trim().toLowerCase();
  if (t === "1" || t === "banner") return "banner";
  if (t === "2" || t === "poster" || t === "posters") return "posters";
  if (t === "3" || t === "backdrop" || t === "backdrops" || t === "background" || t === "fanart") return "backdrops";
  if (t === "5" || t === "icon") return "icon";
  if (t === "22" || t === "clearart") return "clearart";
  if (t === "23" || t === "clearlogo") return "clearlogo";
  return null;
}

  const categoryMap: Record<string, ArtworkResultItem[]> = {
    backdrops: [],
    posters: [],
    banner: [],
    icon: [],
    clearart: [],
    clearlogo: [],
    logos: []
  };
  const seenUrls = new Set<string>();

  const addCategorizedUrl = (cat: string, url: string | null | undefined) => {
    if (!url || typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed || seenUrls.has(trimmed)) return;
    seenUrls.add(trimmed);
    if (!categoryMap[cat]) {
      categoryMap[cat] = [];
    }
    categoryMap[cat].push({ url: trimmed });
  };

  const fetchTvdbArtwork = async (): Promise<boolean> => {
    if (!tvdbShowId) return false;
    try {
      const token = await getTvdbToken();
      if (!token) return false;
      const res = await fetch(`https://api4.thetvdb.com/v4/series/${tvdbShowId}/extended`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(4500)
      });
      if (res.ok) {
        const json = await res.json();
        const artworks = json.data?.artworks;
        if (Array.isArray(artworks)) {
          for (const art of artworks) {
            const rawImg = art.image;
            if (typeof rawImg === "string" && rawImg.trim() !== "") {
              const cat = getTvdbCategory(art.type);
              if (cat) {
                let fullUrl = rawImg.trim();
                if (!fullUrl.startsWith("http")) {
                  fullUrl = `https://artworks.thetvdb.com${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
                }
                addCategorizedUrl(cat, fullUrl);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("TVDB artwork fetch error:", e);
    }
    return seenUrls.size > 0;
  };

  const fetchTmdbArtwork = async (): Promise<boolean> => {
    if (!tmdbId) return false;
    try {
      const mediaType = isMovie ? "movie" : "tv";
      const res = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/images?api_key=${TMDB_API_KEY}`,
        { cache: "no-store", signal: AbortSignal.timeout(4500) }
      );
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.backdrops)) {
          for (const b of json.backdrops) {
            if (b.file_path && typeof b.file_path === "string") {
              addCategorizedUrl("backdrops", `https://image.tmdb.org/t/p/original${b.file_path}`);
            }
          }
        }
        if (Array.isArray(json.posters)) {
          for (const p of json.posters) {
            if (p.file_path && typeof p.file_path === "string") {
              addCategorizedUrl("posters", `https://image.tmdb.org/t/p/original${p.file_path}`);
            }
          }
        }
        if (Array.isArray(json.logos)) {
          for (const l of json.logos) {
            if (l.file_path && typeof l.file_path === "string") {
              addCategorizedUrl("logos", `https://image.tmdb.org/t/p/original${l.file_path}`);
            }
          }
        }
      }
    } catch (e) {
      console.warn("TMDB artwork fetch error:", e);
    }
    return seenUrls.size > 0;
  };

  // Strict 1-database fetch rule:
  // - Movies: Fetch TMDB only (ignore if tmdbId is missing; never fallback to TVDB for movies)
  // - Non-Movies (TV/ONA/OVA/Special): Fetch TVDB first; only if TVDB has no ID or returns no artwork, fallback to TMDB
  if (isMovie) {
    if (tmdbId) {
      await fetchTmdbArtwork();
    }
  } else {
    const hasTvdbArtwork = tvdbShowId ? await fetchTvdbArtwork() : false;
    if (!hasTvdbArtwork && tmdbId) {
      await fetchTmdbArtwork();
    }
  }

  const categoryOrder = ["backdrops", "posters", "banner", "icon", "clearart", "clearlogo", "logos"];
  const categorizedObj: Record<string, ArtworkResultItem[]> = {};
  let totalCount = 0;

  for (const cat of categoryOrder) {
    if (categoryMap[cat] && categoryMap[cat].length > 0) {
      categorizedObj[cat] = categoryMap[cat];
      totalCount += categoryMap[cat].length;
    }
  }

  for (const cat of Object.keys(categoryMap)) {
    if (!categoryOrder.includes(cat) && categoryMap[cat] && categoryMap[cat].length > 0) {
      categorizedObj[cat] = categoryMap[cat];
      totalCount += categoryMap[cat].length;
    }
  }

  const resultPayload = Object.keys(categorizedObj).length > 0 ? [categorizedObj] : [];

  return {
    data: "artwork",
    total: totalCount,
    results: resultPayload,
    result: resultPayload
  };
}
