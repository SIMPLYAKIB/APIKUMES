// @ts-nocheck
import {
  getFribbDataset,
  getAnimeMappingWithBoundaries,
  fetchAniZip,
  normalizeMapTracker,
  INVALID_MAP_TRACKERS,
  VALID_MAP_TRACKERS,
  findByAnikumeId,
  findByTrackerId,
} from "../Ids.js";
import { fetchAniMap } from "./AniMap.js";
import { serverCache } from "./Cache.js";

interface AkMapOptions {
  rawId: string;
  trackerParam?: string;
  seasonParam?: string | number;
  epParam?: string | number;
  provider?: string;
}

function attachItemBoundaries(dataset: any, item: any): any {
  if (!item) return null;
  let tvdbStartEnd = null;
  let tmdbStartEnd = null;

  const tvdbId = item.tvdb_id || item.thetvdb_id;
  const tvdbSeason = item.season?.tvdb !== undefined && item.season?.tvdb !== null ? String(item.season.tvdb) : null;
  if (tvdbId && tvdbSeason !== null && dataset.tvdbOffsets) {
    const key = `${tvdbId}:${tvdbSeason}`;
    const offsets = dataset.tvdbOffsets.get(key);
    const myOffset = item.episode_offset?.tvdb !== undefined && item.episode_offset?.tvdb !== null
      ? parseInt(item.episode_offset.tvdb) || 0
      : 0;
    if (offsets && offsets.length > 0) {
      const idx = offsets.indexOf(myOffset);
      const start = myOffset + 1;
      const end = idx !== -1 && offsets[idx + 1] !== undefined ? offsets[idx + 1] : null;
      tvdbStartEnd = { start, end };
    } else {
      tvdbStartEnd = { start: myOffset + 1, end: null };
    }
  }

  let tmdbShowId = null;
  if (item.themoviedb_id) {
    if (typeof item.themoviedb_id === "object" && item.themoviedb_id.tv) {
      tmdbShowId = String(item.themoviedb_id.tv);
    } else if (typeof item.themoviedb_id !== "object") {
      tmdbShowId = String(item.themoviedb_id);
    }
  } else if (item.tmdb_id) {
    tmdbShowId = String(item.tmdb_id);
  }

  const tmdbSeason = item.season?.tmdb !== undefined && item.season?.tmdb !== null ? String(item.season.tmdb) : null;
  if (tmdbShowId && tmdbSeason !== null && dataset.tmdbOffsets) {
    const key = `${tmdbShowId}:${tmdbSeason}`;
    const offsets = dataset.tmdbOffsets.get(key);
    const myOffset = item.episode_offset?.tmdb !== undefined && item.episode_offset?.tmdb !== null
      ? parseInt(item.episode_offset.tmdb) || 0
      : 0;
    if (offsets && offsets.length > 0) {
      const idx = offsets.indexOf(myOffset);
      const start = myOffset + 1;
      const end = idx !== -1 && offsets[idx + 1] !== undefined ? offsets[idx + 1] : null;
      tmdbStartEnd = { start, end };
    } else {
      tmdbStartEnd = { start: myOffset + 1, end: null };
    }
  }

  return {
    ...item,
    _tvdb_start_end: tvdbStartEnd,
    _tmdb_start_end: tmdbStartEnd,
  };
}

export async function getAkAnimeMap(options: AkMapOptions) {
  let { rawId, trackerParam, seasonParam, epParam, provider } = options;
  rawId = (rawId || "").trim();

  let detectedTracker: string | undefined = trackerParam ? trackerParam.trim().toLowerCase() : undefined;
  let parsedSeason: number | undefined = seasonParam !== undefined && seasonParam !== null && String(seasonParam).trim() !== ""
    ? parseInt(String(seasonParam).trim(), 10)
    : undefined;
  let parsedEp: number | undefined = epParam !== undefined && epParam !== null && String(epParam).trim() !== ""
    ? parseInt(String(epParam).trim(), 10)
    : undefined;

  // Check prefix tracker e.g. tvdb:267440:4:20 or tmdb:85937:2:5 or anilist:21
  const lowerId = rawId.toLowerCase();
  for (const prefix of ["tvdb", "thetvdb", "tmdb", "themoviedb", "anilist", "al", "mal", "myanimelist", "anikume", "anidb", "kitsu"]) {
    if (lowerId.startsWith(`${prefix}:`)) {
      detectedTracker = prefix;
      rawId = rawId.slice(prefix.length + 1).trim();
      break;
    }
  }

  // Parse colon separated format: (id):(season):(ep)
  if (rawId.includes(":")) {
    const parts = rawId.split(":").map(p => p.trim());
    if (parts.length >= 3) {
      rawId = parts[0];
      if (parsedSeason === undefined || isNaN(parsedSeason)) {
        parsedSeason = parseInt(parts[1], 10);
      }
      if (parsedEp === undefined || isNaN(parsedEp)) {
        parsedEp = parseInt(parts[2], 10);
      }
    } else if (parts.length === 2) {
      rawId = parts[0];
      if (parsedSeason === undefined || isNaN(parsedSeason)) {
        parsedSeason = parseInt(parts[1], 10);
      }
    }
  }

  const normTracker = detectedTracker ? normalizeMapTracker(detectedTracker) : undefined;

  // Validate that (id):(season):(ep) is ONLY allowed for tvdb and tmdb
  const hasSeasonOrEp = (parsedSeason !== undefined && !isNaN(parsedSeason)) || (parsedEp !== undefined && !isNaN(parsedEp));
  if (hasSeasonOrEp) {
    if (normTracker && normTracker !== "tvdb" && normTracker !== "tmdb") {
      const err: any = new Error("(id):(season):(ep) format is only allowed for 'tvdb' and 'tmdb' trackers");
      err.status = 400;
      err.code = "INVALID_TRACKER_FOR_EPISODE";
      throw err;
    }
  }

  const fribb = await getFribbDataset();

  // If tracker is not explicitly given but season/ep is given, infer tvdb or tmdb
  let activeTracker = normTracker;
  if (!activeTracker && hasSeasonOrEp) {
    // Check if rawId matches TVDB show or TMDB show in Fribb
    const numId = parseInt(rawId, 10);
    const hasTvdb = fribb.items.some(it => it.tvdb_id === numId || it.thetvdb_id === numId);
    if (hasTvdb) {
      activeTracker = "tvdb";
    } else {
      const hasTmdb = fribb.items.some(it => {
        if (it.themoviedb_id) {
          if (typeof it.themoviedb_id === "object" && it.themoviedb_id.tv === numId) return true;
          if (it.themoviedb_id === numId) return true;
        }
        return it.tmdb_id === numId;
      });
      if (hasTmdb) {
        activeTracker = "tmdb";
      } else {
        activeTracker = "tvdb"; // default to tvdb
      }
    }
  }

  // Handle (id):(season):(ep) search for tvdb and tmdb
  if (hasSeasonOrEp && (activeTracker === "tvdb" || activeTracker === "tmdb")) {
    const targetSeason = parsedSeason !== undefined && !isNaN(parsedSeason) ? parsedSeason : 1;
    const targetEp = parsedEp !== undefined && !isNaN(parsedEp) ? parsedEp : 1;
    const numId = parseInt(rawId, 10);

    let matchedItem: any = null;
    let relativeEpisode: number = targetEp;

    if (activeTracker === "tvdb") {
      const candidates = fribb.items.filter(it => {
        const itTvdb = it.tvdb_id || it.thetvdb_id;
        if (itTvdb !== numId && String(itTvdb) !== rawId) return false;
        const itSeason = it.season?.tvdb !== undefined && it.season?.tvdb !== null
          ? parseInt(String(it.season.tvdb), 10)
          : 1;
        return itSeason === targetSeason;
      });

      if (candidates.length > 0) {
        const sorted = candidates.map(it => {
          const offset = it.episode_offset?.tvdb !== undefined && it.episode_offset?.tvdb !== null
            ? parseInt(String(it.episode_offset.tvdb), 10)
            : 0;
          return { item: it, offset };
        }).sort((a, b) => a.offset - b.offset);

        for (let i = 0; i < sorted.length; i++) {
          const current = sorted[i];
          const start = current.offset + 1;
          const next = sorted[i + 1];
          const end = next ? next.offset : Infinity;
          if (targetEp >= start && targetEp <= end) {
            matchedItem = current.item;
            relativeEpisode = targetEp - current.offset;
            break;
          }
        }

        if (!matchedItem && sorted.length > 0) {
          // Fallback to last entry if ep exceeds known offsets
          const last = sorted[sorted.length - 1];
          matchedItem = last.item;
          relativeEpisode = targetEp - last.offset;
        }
      }
    } else if (activeTracker === "tmdb") {
      const candidates = fribb.items.filter(it => {
        let itTmdb: any = null;
        if (it.themoviedb_id) {
          if (typeof it.themoviedb_id === "object") {
            itTmdb = it.themoviedb_id.tv;
          } else {
            itTmdb = it.themoviedb_id;
          }
        } else if (it.tmdb_id) {
          itTmdb = it.tmdb_id;
        }
        if (itTmdb !== numId && String(itTmdb) !== rawId) return false;
        const itSeason = it.season?.tmdb !== undefined && it.season?.tmdb !== null
          ? parseInt(String(it.season.tmdb), 10)
          : 1;
        return itSeason === targetSeason;
      });

      if (candidates.length > 0) {
        const sorted = candidates.map(it => {
          const offset = it.episode_offset?.tmdb !== undefined && it.episode_offset?.tmdb !== null
            ? parseInt(String(it.episode_offset.tmdb), 10)
            : 0;
          return { item: it, offset };
        }).sort((a, b) => a.offset - b.offset);

        for (let i = 0; i < sorted.length; i++) {
          const current = sorted[i];
          const start = current.offset + 1;
          const next = sorted[i + 1];
          const end = next ? next.offset : Infinity;
          if (targetEp >= start && targetEp <= end) {
            matchedItem = current.item;
            relativeEpisode = targetEp - current.offset;
            break;
          }
        }

        if (!matchedItem && sorted.length > 0) {
          const last = sorted[sorted.length - 1];
          matchedItem = last.item;
          relativeEpisode = targetEp - last.offset;
        }
      }
    }

    if (!matchedItem) {
      const err: any = new Error(`No anime found for ${activeTracker} ID ${rawId} Season ${targetSeason} Episode ${targetEp}`);
      err.status = 404;
      err.code = "ANIME_NOT_FOUND";
      throw err;
    }

    let boundedItem = attachItemBoundaries(fribb, matchedItem);
    // Enrich missing fields if necessary
    if (!boundedItem.mal_id || !boundedItem.anilist_id) {
      const animap = boundedItem.anilist_id
        ? await fetchAniMap("anilist", boundedItem.anilist_id)
        : (boundedItem.mal_id ? await fetchAniMap("mal", boundedItem.mal_id) : null);
      if (animap) {
        if (!boundedItem.anilist_id && animap.anilist_id) boundedItem.anilist_id = animap.anilist_id;
        if (!boundedItem.mal_id && animap.mal_id && animap.mal_id.length > 0) boundedItem.mal_id = animap.mal_id[0];
      }
    }

    return formatAkOutput(boundedItem, relativeEpisode);
  }

  // Handle movie search if only ID is given for tmdb or tvdb
  if (activeTracker === "tmdb") {
    const numId = parseInt(rawId, 10);
    // Movie search first!
    let movieItem = fribb.items.find(it => {
      if (it.themoviedb_id && typeof it.themoviedb_id === "object" && it.themoviedb_id.movie) {
        if (Array.isArray(it.themoviedb_id.movie)) {
          return it.themoviedb_id.movie.includes(numId) || it.themoviedb_id.movie.map(String).includes(rawId);
        }
        return it.themoviedb_id.movie === numId || String(it.themoviedb_id.movie) === rawId;
      }
      return false;
    });

    if (!movieItem) {
      // Check if AniMap has this TMDB movie
      const animap = await fetchAniMap("tmdb", rawId);
      if (animap && animap.anilist_id) {
        const full = await getAnimeMappingWithBoundaries("anilist", String(animap.anilist_id), provider);
        if (full) return formatAkOutput(full);
      }
      // Fallback to TV show lookup if not a movie
      movieItem = fribb.items.find(it => {
        if (it.themoviedb_id) {
          if (typeof it.themoviedb_id === "object" && (it.themoviedb_id.tv === numId || String(it.themoviedb_id.tv) === rawId)) return true;
          if (it.themoviedb_id === numId || String(it.themoviedb_id) === rawId) return true;
        }
        return it.tmdb_id === numId || String(it.tmdb_id) === rawId;
      });
    }

    if (movieItem) {
      const bounded = attachItemBoundaries(fribb, movieItem);
      return formatAkOutput(bounded);
    }
  } else if (activeTracker === "tvdb") {
    const numId = parseInt(rawId, 10);
    // If only ID is given for TVDB, check movie entries first (type === MOVIE or season 0)
    let movieItem = fribb.items.find(it => {
      const itTvdb = it.tvdb_id || it.thetvdb_id;
      if (itTvdb !== numId && String(itTvdb) !== rawId) return false;
      return it.type === "MOVIE" || it.season?.tvdb === 0 || it.season?.tvdb === "0";
    });

    if (!movieItem) {
      // Check general TVDB entry (season 1 or default)
      movieItem = fribb.items.find(it => {
        const itTvdb = it.tvdb_id || it.thetvdb_id;
        return itTvdb === numId || String(itTvdb) === rawId;
      });
    }

    if (movieItem) {
      const bounded = attachItemBoundaries(fribb, movieItem);
      return formatAkOutput(bounded);
    }
  }

  // Standard lookup for anilist / mal / anikume / or other trackers
  const finalTracker = activeTracker || "anikume";
  const fullMapping = await getAnimeMappingWithBoundaries(finalTracker, rawId, provider);
  if (!fullMapping) {
    const err: any = new Error(`No anime mapping found for ${finalTracker} ID: ${rawId}`);
    err.status = 404;
    err.code = "MAPPING_NOT_FOUND";
    throw err;
  }

  return formatAkOutput(fullMapping);
}

function formatAkOutput(mapping: any, episode?: number) {
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

  const tvdbSeason = mapping.season?.tvdb !== undefined && mapping.season?.tvdb !== null
    ? String(mapping.season.tvdb)
    : null;
  const tmdbSeason = mapping.season?.tmdb !== undefined && mapping.season?.tmdb !== null
    ? String(mapping.season.tmdb)
    : null;

  const tvdbStartEnd = tvdbSeason !== null && mapping._tvdb_start_end
    ? (mapping._tvdb_start_end.end ? `${mapping._tvdb_start_end.start}-${mapping._tvdb_start_end.end}` : `${mapping._tvdb_start_end.start}-null`)
    : null;

  const tmdbStartEnd = tmdbSeason !== null && mapping._tmdb_start_end
    ? (mapping._tmdb_start_end.end ? `${mapping._tmdb_start_end.start}-${mapping._tmdb_start_end.end}` : `${mapping._tmdb_start_end.start}-null`)
    : null;

  const out: Record<string, any> = {
    anilist: mapping.anilist_id !== undefined && mapping.anilist_id !== null ? String(mapping.anilist_id) : null,
    mal: mapping.mal_id !== undefined && mapping.mal_id !== null ? String(mapping.mal_id) : null,
    tvdb: mapping.tvdb_id || mapping.thetvdb_id ? String(mapping.tvdb_id || mapping.thetvdb_id) : null,
    tvdb_season: tvdbSeason,
    tvdb_episode_start_end: tvdbStartEnd,
    tmdb: tmdbVal,
    tmdb_season: tmdbSeason,
    tmdb_episode_start_end: tmdbStartEnd,
  };

  if (episode !== undefined) {
    out.episode = episode;
  }

  return out;
}
