// @ts-nocheck
import express from "express";
import compression from "compression";
import { dump as yamlDump } from "js-yaml";
import { apiReference } from "@scalar/express-api-reference";
import { getAkAnimeMap } from "./AkMap.js";
import {
  mapAnimeIds,
  clearIdsCache,
  normalizeMapUseParam,
  VALID_MAP_USE_DBS,
  getAnimeMappingWithBoundaries,
  getBatchAnimeMappings,
  flattenMapping,
  VALID_MAP_TRACKERS,
  INVALID_MAP_TRACKERS,
  normalizeMapTracker,
  findByAnikumeId,
  findByTrackerId,
  getSavedIdsStats,
  getOrCreateAnikumeId
} from "../Ids.js";
import { getHeroSlider, clearHeroSliderCache, normalizeHeroSliderUse } from "../HeroSlider.js";
import { getAllAnime, normalizeAnimeUse } from "../Anime.js";
import { getTrendingNow, normalizeTrendingNowUse } from "../TrendingNow.js";
import { getThisSeason, normalizeThisSeasonUse } from "../ThisSeason.js";
import { getPopular, normalizePopularUse } from "../Popular.js";
import { getTop10, normalizeTop10Use } from "../Top10.js";
import { getUpcoming, normalizeUpcomingUse } from "../Upcoming.js";
import { getSearch, normalizeSearchUse } from "../Search.js";
import { getAniDub } from "../Dub.js";
import { getAniLogo } from "../Logo.js";
import { getOverview, normalizeOverviewUse, normalizeOverviewTracker } from "../Overview.js";
import {
  getEpisodes,
  ALLOWED_EPISODE_TRACKERS,
  clearEpisodesCache,
  getUserGeoInfo,
  isValidTimezone,
  getForwardedHeaders,
  formatDateYYYYMMDD,
  formatTimeHHMMSS
} from "./Episodes.js";
import {
  getAnimeCatalog,
  searchAnime5,
  browseAnime,
  clearLogoCache,
  fetchAnimeSection,
  SECTION_DEFAULT_LIMITS,
  SECTION_ALIASES,
  SECTION_POOL_MAX_LIMIT
} from "./Catalog.js";
import { getAnimeFullDetails, getAnimeOverviewDetails, getAnimeCharacters, getAnimeRecommendations, getAnimeSeason } from "./Details.js";
import { fetchWatchStreams } from "./Watch.js";
import { rateLimiterMiddleware, getRateLimitStatus, getClientIp } from "./RateLimiter.js";
import { serverCache, formatDurationDhms } from "./Cache.js";
import { proxyMkissaApi } from "./Mkissa.js";
import { getAnimeSourceMap, clearSourceMapCache, VALID_SOURCEMAP_SITES } from "./AllMap.js";
import { getAnimeArtwork } from "./Artwork.js";
import { fetchChiakiRawSearch, clearChiakiCache } from "./Chiaki.js";
import { fetchAnilistTrendingNow } from "../Anilist/TrendingNow.js";
import { getRequestListener } from "@hono/node-server";
import proxyApp from "./Proxy.js";

const app = express();
app.set("trust proxy", true);
app.set("etag", false);
app.use(compression());

const proxyRequestListener = getRequestListener(proxyApp.fetch);
app.all(["/proxy", "/proxy/*"], (req, res) => {
  proxyRequestListener(req, res);
});

app.use(express.json());

// Normalize query strings that contain multiple '?' (e.g. /anime?section=trending?fresh=true or /anime/id?data=overview?fresh=true)
app.use((req, _res, next) => {
  const rawUrl = req.originalUrl || req.url || "";
  const qIndex = rawUrl.indexOf("?");
  if (qIndex !== -1) {
    const pathPart = rawUrl.slice(0, qIndex);
    const rawQuery = rawUrl.slice(qIndex + 1);
    const normalizedQuery = rawQuery.replace(/\?/g, "&");
    if (normalizedQuery !== rawQuery) {
      req.url = `${pathPart}?${normalizedQuery}`;
      req.originalUrl = req.url;
    }
    const searchParams = new URLSearchParams(normalizedQuery);
    const parsedQuery: Record<string, any> = {};
    for (const [k, v] of searchParams.entries()) {
      const cleanKey = k.trim();
      if (cleanKey) {
        parsedQuery[cleanKey] = v.trim();
        parsedQuery[cleanKey.toLowerCase()] = v.trim();
      }
    }
    req.query = { ...req.query, ...parsedQuery };
  }
  next();
});

function isFreshRequest(req): boolean {
  const rawFresh = req.query?.fresh ?? req.query?.nocache;
  if (Array.isArray(rawFresh)) {
    if (
      rawFresh.some((v) => {
        const s = String(v ?? "").trim().toLowerCase();
        return s === "true" || s === "1" || s === "yes" || s === "fresh" || s === "";
      })
    ) {
      return true;
    }
  } else if (rawFresh !== undefined && rawFresh !== null) {
    const s = String(rawFresh).trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "fresh" || s === "") {
      return true;
    }
  }

  const urlCandidates = [req.originalUrl, req.url].filter(Boolean);
  const freshRegex = /(?:[?&/]|%3f|%26)(?:fresh|nocache)(?:=(?:true|1|yes|fresh)|(?=[&#/]|$))/i;
  for (const raw of urlCandidates) {
    const str = String(raw);
    let decoded = str;
    try {
      decoded = decodeURIComponent(str);
    } catch {}
    if (freshRegex.test(str) || freshRegex.test(decoded)) {
      return true;
    }
  }
  return false;
}

async function purgeAnimeDetailsCacheKeys(prefix: string, rawId: string, trackerParam: string) {
  const trimmedId = String(rawId || "").trim();
  const candidateIds = new Set<string>([trimmedId]);
  try {
    const record =
      trackerParam === "anilist" || trackerParam === "mal"
        ? await findByTrackerId(trackerParam, trimmedId)
        : await findByAnikumeId(trimmedId);
    if (record) {
      if (record.anikume_id) candidateIds.add(String(record.anikume_id));
      if (record.anilist_id) candidateIds.add(String(record.anilist_id));
      if (record.mal_id) candidateIds.add(String(record.mal_id));
    }
  } catch {}

  const allKeys = Array.from(serverCache.store.keys());
  for (const key of allKeys) {
    for (const cid of candidateIds) {
      if (key.startsWith(`${prefix}:${cid}:`)) {
        serverCache.delete(key);
      }
    }
  }
}

function purgeSectionCacheKeys(canonicalSection: string) {
  const prefix = `catalog:section:${canonicalSection}:`;
  const allKeys = Array.from(serverCache.store.keys());
  for (const key of allKeys) {
    if (key.startsWith(prefix)) {
      serverCache.delete(key);
    }
  }
}

app.use(rateLimiterMiddleware);

app.get(["/favicon.ico", "/favicon.png"], (req, res) => {
  res.redirect("https://favicondl.com/api/extract?url=github.com&size=512");
});

function extractBrowserTimezone(req) {
  const q = req.query;
  const h = req.headers;
  const candidate =
    (typeof q.timezone === "string" && q.timezone.trim()) ||
    (typeof q.tz === "string" && q.tz.trim()) ||
    (typeof q.user_timezone === "string" && q.user_timezone.trim()) ||
    (typeof h["x-timezone"] === "string" && h["x-timezone"].trim()) ||
    (typeof h["x-user-timezone"] === "string" && h["x-user-timezone"].trim()) ||
    (typeof h["timezone"] === "string" && h["timezone"].trim()) ||
    (typeof h["sec-ch-timezone"] === "string" && h["sec-ch-timezone"].trim()) ||
    (typeof h["x-client-timezone"] === "string" && h["x-client-timezone"].trim()) ||
    null;
  if (candidate && isValidTimezone(candidate)) {
    return candidate;
  }
  return null;
}

function getHostedUrl(req) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const hostHeader =
    typeof forwardedHost === "string" && forwardedHost
      ? forwardedHost.split(",")[0].trim()
      : req.get("host") || "localhost:3000";
  const forwardedProto = req.headers["x-forwarded-proto"];
  let proto =
    typeof forwardedProto === "string" && forwardedProto
      ? forwardedProto.split(",")[0].trim()
      : req.protocol || "http";
  if (!hostHeader.includes("localhost") && !hostHeader.includes("127.0.0.1")) {
    proto = "https";
  }
  return `${proto}://${hostHeader}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0 || days > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function formatLocalTime(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short"
    }).format(date);
  } catch {
    return date.toUTCString();
  }
}

app.get("/status", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const clientIp = getClientIp(req);
  const browserTz = extractBrowserTimezone(req);
  const geoInfo = await getUserGeoInfo(clientIp, browserTz);
  const hostedUrl = getHostedUrl(req);
  const rateLimitInfo = getRateLimitStatus(clientIp);
  const now = new Date();
  const uptimeSeconds = process.uptime();
  const idStats = await getSavedIdsStats();
  const cacheStats = serverCache.getStats();

  res.json({
    status: "operational",
    service: "Apikume API",
    version: "2.0.0",
    hosted_url: hostedUrl,
    user_id_ip: clientIp,
    anilist_forwarded_headers: getForwardedHeaders(clientIp),
    storage: {
      database_type: idStats.database_type,
      repository: idStats.repository,
      file_path: idStats.file_path,
      branch: idStats.branch,
      total_saved_anime: idStats.total_saved_anime
    },
    cache: {
      status: "disabled",
      metrics: {
        items_cached: 0,
        memory_usage: "0.00 MB",
        memory_max: "0 MB (disabled)",
        cache_hits: 0,
        cache_misses: cacheStats.missCount,
        by_category: {}
      },
      active_cached_items: [],
      durations: {
        all_endpoints: {
          server_cache: "0s (Disabled - always fresh fetch)",
          compressed: false
        }
      }
    },
    client: {
      ip: clientIp,
      browser_timezone: browserTz,
      ip_timezone: geoInfo.timezone_source === "ip" ? geoInfo.timezone : geoInfo.country ? geoInfo.timezone : null,
      effective_timezone: geoInfo.timezone,
      timezone_source: geoInfo.timezone_source,
      country: geoInfo.country,
      region: geoInfo.region,
      city: geoInfo.city
    },
    time: {
      utc_time: now.toISOString(),
      local_time: formatLocalTime(now, geoInfo.timezone),
      timestamp_ms: now.getTime()
    },
    rate_limit: {
      limit: rateLimitInfo.limit,
      used: rateLimitInfo.used,
      remaining: rateLimitInfo.remaining,
      reset_in_seconds: rateLimitInfo.reset_in_seconds,
      window: rateLimitInfo.window,
      status: rateLimitInfo.status,
      message: rateLimitInfo.message
    },
    uptime: {
      seconds: Math.floor(uptimeSeconds),
      formatted: formatUptime(uptimeSeconds)
    }
  });
});

function applyNoCacheHeaders(req, res) {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.removeHeader("ETag");
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
}

app.get("/heroslider", async (req, res) => {
  try {
    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeHeroSliderUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response, cacheHit } = await getHeroSlider({
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("Hero slider error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "HEROSLIDER_FETCH_ERROR",
      message: err.message || "Failed to fetch hero slider"
    });
  }
});

app.get("/trendingnow", async (req, res) => {
  try {
    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeTrendingNowUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response } = await getTrendingNow({
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("TrendingNow error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "TRENDINGNOW_FETCH_ERROR",
      message: err.message || "Failed to fetch trending now"
    });
  }
});

app.get("/thisseason", async (req, res) => {
  try {
    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeThisSeasonUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response } = await getThisSeason({
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("ThisSeason error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "THISSEASON_FETCH_ERROR",
      message: err.message || "Failed to fetch this season"
    });
  }
});

app.get("/popular", async (req, res) => {
  try {
    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizePopularUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response } = await getPopular({
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("Popular error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "POPULAR_FETCH_ERROR",
      message: err.message || "Failed to fetch popular"
    });
  }
});

app.get("/top10", async (req, res) => {
  try {
    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeTop10Use(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response } = await getTop10({
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("Top10 error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "TOP10_FETCH_ERROR",
      message: err.message || "Failed to fetch top 10"
    });
  }
});

app.get("/upcoming", async (req, res) => {
  try {
    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeUpcomingUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response } = await getUpcoming({
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("Upcoming error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "UPCOMING_FETCH_ERROR",
      message: err.message || "Failed to fetch upcoming"
    });
  }
});

app.get("/search", async (req, res) => {
  try {
    const rawQueryParam =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : typeof req.query.search === "string" && req.query.search.trim()
        ? req.query.search.trim()
        : typeof req.query.query === "string" && req.query.query.trim()
        ? req.query.query.trim()
        : "";

    if (!rawQueryParam) {
      return res.status(400).json({
        error: true,
        code: "MISSING_QUERY",
        message: "Missing search query parameter 'q' (e.g. /search?q=naruto)."
      });
    }

    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeSearchUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response } = await getSearch({
      q: rawQueryParam,
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("Search error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "SEARCH_FETCH_ERROR",
      message: err.message || "Failed to fetch search results"
    });
  }
});

app.get("/map/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const rawTrackerParam =
      typeof req.query.tracker === "string" && req.query.tracker.trim()
        ? req.query.tracker.trim().toLowerCase()
        : "anikume";

    // Only anikume (default), anilist, and mal trackers are supported
    if (
      rawTrackerParam !== "anikume" &&
      rawTrackerParam !== "anilist" &&
      rawTrackerParam !== "mal"
    ) {
      if (String(req.originalUrl || "").startsWith("/api")) {
        return next();
      }
      return res.status(400).json({
        error: true,
        code: "INVALID_TRACKER",
        message: `Tracker '${rawTrackerParam}' is unsupported. Only 'anilist' and 'mal' trackers are supported.`
      });
    }

    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : null;

    let normalizedUse: string | null = null;
    if (rawUseParam) {
      normalizedUse = normalizeMapUseParam(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Database '${rawUseParam}' is unsupported. Allowed 'use' values: ${VALID_MAP_USE_DBS.join(", ")}.`
        });
      }
    }

    const idList = String(id || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (idList.length === 0) {
      if (String(req.originalUrl || "").startsWith("/api")) {
        return next();
      }
      return res.status(404).json({
        error: true,
        code: "MAPPING_NOT_FOUND",
        message: "Missing ID"
      });
    }

    // /api/map/(anikume id only) by default; numeric IDs require ?tracker=anilist or ?tracker=mal
    if (rawTrackerParam === "anikume" && idList.some((part) => /^\d+$/.test(part))) {
      if (String(req.originalUrl || "").startsWith("/api")) {
        return next();
      }
      return res.status(404).json({
        error: true,
        code: "MAPPING_NOT_FOUND",
        message: "Anikume ID required, or specify ?tracker=anilist or ?tracker=mal"
      });
    }

    const isFresh = isFreshRequest(req);

    const { items, formattedText } = await mapAnimeIds({
      ids: idList,
      tracker: rawTrackerParam,
      use: normalizedUse,
      fresh: isFresh
    });

    if (!items || items.length === 0) {
      if (String(req.originalUrl || "").startsWith("/api")) {
        return next();
      }
      return res.status(404).json({
        error: true,
        code: "MAPPING_NOT_FOUND",
        message: `No mapping found for ${rawTrackerParam} ID: ${id}`
      });
    }

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(formattedText);
  } catch (err: any) {
    if (err.status !== 404) console.error("Anime mapping error:", err);
    if (String(req.originalUrl || "").startsWith("/api")) {
      return next();
    }
    res.status(err.status || 500).json({
      error: true,
      code: err.code || "MAPPING_FETCH_ERROR",
      message: err.message || "Failed to fetch anime mapping"
    });
  }
});

app.get("/dub/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const rawTrackerParam =
      typeof req.query.tracker === "string" && req.query.tracker.trim()
        ? req.query.tracker.trim().toLowerCase()
        : "anikume";

    if (
      rawTrackerParam !== "anikume" &&
      rawTrackerParam !== "anilist" &&
      rawTrackerParam !== "mal"
    ) {
      return res.status(400).json({
        error: true,
        code: "INVALID_TRACKER",
        message: `Tracker '${rawTrackerParam}' is unsupported. Only 'anilist' and 'mal' trackers are supported.`
      });
    }

    const idList = String(id || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (idList.length === 0) {
      return res.status(404).json({
        error: true,
        code: "DUB_NOT_FOUND",
        message: "Missing ID"
      });
    }

    if (rawTrackerParam === "anikume" && idList.some((part) => /^\d+$/.test(part))) {
      return res.status(404).json({
        error: true,
        code: "DUB_NOT_FOUND",
        message: "Anikume ID required, or specify ?tracker=anilist or ?tracker=mal"
      });
    }

    const clientIp = getClientIp(req);

    // No cache — always fetch fresh
    const { items, formattedText } = await getAniDub({
      ids: idList,
      tracker: rawTrackerParam,
      fresh: true,
      clientIp
    });

    if (!items || items.length === 0) {
      return res.status(404).json({
        error: true,
        code: "DUB_NOT_FOUND",
        message: `No dub info found for ${rawTrackerParam} ID: ${id}`
      });
    }

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(formattedText);
  } catch (err: any) {
    if (err.status !== 404) console.error("Dub fetch error:", err);
    if (String(req.originalUrl || "").startsWith("/api")) {
      return next();
    }
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "DUB_FETCH_ERROR",
      message: err.message || "Failed to fetch dub info"
    });
  }
});

app.get("/logo/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const rawTrackerParam =
      typeof req.query.tracker === "string" && req.query.tracker.trim()
        ? req.query.tracker.trim().toLowerCase()
        : "anikume";

    if (
      rawTrackerParam !== "anikume" &&
      rawTrackerParam !== "anilist" &&
      rawTrackerParam !== "mal"
    ) {
      return res.status(400).json({
        error: true,
        code: "INVALID_TRACKER",
        message: `Tracker '${rawTrackerParam}' is unsupported. Only 'anilist' and 'mal' trackers are supported.`
      });
    }

    const idList = String(id || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (idList.length === 0) {
      return res.status(404).json({
        error: true,
        code: "LOGO_NOT_FOUND",
        message: "Missing ID"
      });
    }

    if (rawTrackerParam === "anikume" && idList.some((part) => /^\d+$/.test(part))) {
      return res.status(404).json({
        error: true,
        code: "LOGO_NOT_FOUND",
        message: "Anikume ID required, or specify ?tracker=anilist or ?tracker=mal"
      });
    }

    const isFresh = isFreshRequest(req);

    // No cache — always fetch fresh
    const { items, formattedText } = await getAniLogo({
      ids: idList,
      tracker: rawTrackerParam,
      fresh: isFresh
    });

    if (!items || items.length === 0) {
      return res.status(404).json({
        error: true,
        code: "LOGO_NOT_FOUND",
        message: `No logo info found for ${rawTrackerParam} ID: ${id}`
      });
    }

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(formattedText);
  } catch (err: any) {
    if (err.status !== 404) console.error("Logo fetch error:", err);
    if (String(req.originalUrl || "").startsWith("/api")) {
      return next();
    }
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "LOGO_FETCH_ERROR",
      message: err.message || "Failed to fetch logo info"
    });
  }
});

app.get("/overview/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rawTrackerParam =
      typeof req.query.tracker === "string" && req.query.tracker.trim()
        ? req.query.tracker.trim().toLowerCase()
        : "anikume";

    const normalizedTracker = normalizeOverviewTracker(rawTrackerParam);
    if (!normalizedTracker) {
      return res.status(400).json({
        error: true,
        code: "INVALID_TRACKER",
        message: `Tracker '${rawTrackerParam}' is unsupported. Only 'anilist' and 'mal' trackers are supported.`
      });
    }

    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeOverviewUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    // No cache — always fetch fresh
    const { response } = await getOverview({
      id,
      tracker: normalizedTracker,
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    if (err.status !== 404 && err.status !== 400) console.error("Overview fetch error:", err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "OVERVIEW_FETCH_ERROR",
      message: err.message || "Failed to fetch overview"
    });
  }
});

app.get("/anime/sourcemap/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rawTrackerParam =
      typeof req.query.tracker === "string" && req.query.tracker.trim()
        ? req.query.tracker.trim().toLowerCase()
        : "anikume";

    if (INVALID_MAP_TRACKERS.includes(rawTrackerParam)) {
      return res.status(400).json({
        error: true,
        code: "INVALID_TRACKER",
        message: `Tracker '${rawTrackerParam}' is unsupported. Valid trackers: ${VALID_MAP_TRACKERS.filter(
          (t) => !["myanimelist", "anime-planet", "kitsu"].includes(t)
        ).join(", ")}`
      });
    }

    const rawSourceParam =
      typeof req.query.source === "string" && req.query.source.trim()
        ? req.query.source.trim().toLowerCase()
        : undefined;

    const isFresh = isFreshRequest(req);

    const data = await getAnimeSourceMap(id, rawTrackerParam, rawSourceParam, true);

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    res.json(data);
  } catch (err: any) {
    if (err.status !== 404 && err.status !== 400) console.error("Anime sourcemap error:", err);
    res.status(err.status || 500).json({
      error: true,
      code: err.code || "SOURCEMAP_FETCH_ERROR",
      message: err.message || "Failed to fetch anime sourcemap"
    });
  }
});



const VALID_WATCH_SOURCES = [
  "megavid",
  "megaplay",
  "reanime",
  "anikoto",
  "anizone",
  "mkissa",
  "anibd",
  "kickassanime",
  "aniwave",
  "anineko",
  "animeparadise",
  "2dhive",
  "piratexplay"
];

app.get(
  [
    "/anime/watch/:id/:ep",
    "/anime/watch/:id/:ep/",
    "/anime/watch/:id/:ep/:source",
    "/anime/watch/:id/:ep/:source/"
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const rawSource = req.query.source || req.params.source || "megaplay";
      const reqSource = String(rawSource).toLowerCase().trim() || "megaplay";

      if (reqSource !== "megaplay" && reqSource !== "novuscloud") {
        return res.status(400).json({
          error: true,
          code: "UNSUPPORTED_SOURCE",
          message: "Currently only 'megaplay' and 'novuscloud' sources are available."
        });
      }

      const rawEpParam = req.params.ep || req.query.ep || req.query.episode || "1";
      if (!id || !id.trim()) {
        return res.status(400).json({ error: true, code: "MISSING_ID", message: "Missing anime ID parameter." });
      }
      const cleanEp = String(rawEpParam).replace(/^ep-?/i, "").replace(/^anikoto-/i, "").trim() || "1";

      const result = await fetchWatchStreams(id.trim(), cleanEp, reqSource);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.setHeader("X-Cache-Strategy", "no-cache (disabled for watch)");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");

      return res.json(result);
    } catch (err: any) {
      if (err.status !== 404 && err.status !== 400) console.error("Anime watch error:", err.message || err);
      res.status(err.status || 500).json({
        error: true,
        code: err.code || "WATCH_FETCH_ERROR",
        message: err.message || "Failed to fetch watch streams"
      });
    }
  }
);

app.all(["/mkissa/proxy", "/mkissa/api"], async (req, res) => {
  try {
    const queryString = req.url.includes("?") ? req.url.split("?")[1] : "";
    const body = req.method === "POST" || req.method === "PUT" ? req.body : undefined;
    const result = await proxyMkissaApi(req.method, queryString, body, req.headers);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.status(result.status);
    if (typeof result.data === "object" && result.data !== null) {
      res.json(result.data);
    } else {
      res.setHeader("Content-Type", result.contentType);
      res.send(result.data);
    }
  } catch (err) {
    console.error("Mkissa proxy error:", err.message || err);
    res.status(err.status || 500).json({
      error: true,
      code: err.code || "MKISSA_PROXY_ERROR",
      message: err.message || "Failed to proxy Mkissa request"
    });
  }
});

app.get(["/anime/browse", "/browse"], async (req, res, next) => {
  const accept = String(req.headers.accept || "");
  const isApiPath = String(req.originalUrl || "").startsWith("/api/");
  if (
    !isApiPath &&
    accept.includes("text/html") &&
    !req.query.mode &&
    !req.query.q &&
    req.query.fresh === undefined
  ) {
    return next();
  }
  try {
    const isFresh = isFreshRequest(req);

    const params = {
      mode: typeof req.query.mode === "string" ? req.query.mode.trim().toLowerCase() : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      genre: typeof req.query.genre === "string" ? req.query.genre : undefined,
      tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
      tags: typeof req.query.tags === "string" ? req.query.tags : undefined,
      season: typeof req.query.season === "string" ? req.query.season : undefined,
      format: typeof req.query.format === "string" ? req.query.format : undefined,
      country: typeof req.query.country === "string" ? req.query.country : undefined,
      countryOfOrigin: typeof req.query.countryOfOrigin === "string" ? req.query.countryOfOrigin : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      sort: typeof req.query.sort === "string" ? req.query.sort : undefined,
      page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
      perPage:
        typeof req.query.perPage === "string"
          ? Number(req.query.perPage)
          : typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined,
      limit:
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : typeof req.query.perPage === "string"
          ? Number(req.query.perPage)
          : undefined,
      year: typeof req.query.year === "string" ? req.query.year : undefined,
      az: typeof req.query.az === "string" ? req.query.az : undefined
    };

    const clientIp = getClientIp(req);
    const data = await browseAnime(params, clientIp);

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", isFresh ? "fresh-fetch" : "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");

    res.json(data);
  } catch (err: any) {
    if (err.status !== 404) console.error("Anime browse error:", err.message || err);
    res.status(err.status || 500).json({
      error: true,
      code: err.code || "BROWSE_FETCH_ERROR",
      message: err.message || "Failed to fetch browse catalog"
    });
  }
});

app.get(["/anime/:id", "/anime/details/:id"], async (req, res, next) => {
  try {
    const { id } = req.params;
    const isFresh = isFreshRequest(req);

    // 1. ?data is strictly REQUIRED for API! If ?data is missing and browser requests HTML, pass to UI router
    const rawDataParam = typeof req.query.data === "string" ? req.query.data.toLowerCase().trim() : "";
    if (!rawDataParam) {
      const accept = String(req.headers.accept || "");
      const isApiPath = String(req.originalUrl || "").startsWith("/api/");
      if (!isApiPath && accept.includes("text/html")) {
        return next();
      }
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Not Found"
      });
    }

    const rawTracker = typeof req.query.tracker === "string" ? req.query.tracker.trim().toLowerCase() : "";
    const isNumericId = /^\d+$/.test(String(id).trim());

    // 2. If numeric AniList/MAL ID without tracker, return 404 Not Found
    if (isNumericId && (!rawTracker || rawTracker === "anikume")) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Not Found"
      });
    }

    // 3. Validate data parameter: overview, character, recommendation, season, episode, artwork
    const dataParam = rawDataParam;
    if (
      dataParam !== "overview" &&
      dataParam !== "character" &&
      dataParam !== "characters" &&
      dataParam !== "recommendation" &&
      dataParam !== "recommendations" &&
      dataParam !== "season" &&
      dataParam !== "episode" &&
      dataParam !== "episodes" &&
      dataParam !== "artwork"
    ) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Not Found"
      });
    }

    const trackerParam = rawTracker || "anikume";

    let parsedLimit: number | undefined = undefined;
    if (req.query.limit !== undefined && req.query.limit !== null && String(req.query.limit).trim() !== "") {
      const l = parseInt(String(req.query.limit), 10);
      if (!isNaN(l) && l > 0) parsedLimit = l;
    }

    const clientIp = getClientIp(req);

    if (dataParam === "overview") {
      const rawUseParam =
        typeof req.query.use === "string" && req.query.use.trim()
          ? req.query.use.trim()
          : typeof req.query.way === "string" && req.query.way.trim()
          ? req.query.way.trim()
          : typeof req.query.provider === "string" && req.query.provider.trim()
          ? req.query.provider.trim()
          : null;

      if (rawUseParam) {
        const normalizedUse = normalizeOverviewUse(rawUseParam);
        if (!normalizedUse) {
          return res.status(400).json({
            error: true,
            code: "INVALID_USE",
            message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
          });
        }
      }

      // No cache — always fetch fresh from Overview.ts
      const { response } = await getOverview({
        id,
        tracker: trackerParam,
        use: rawUseParam,
        fresh: isFresh,
        clientIp
      });

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
      return res.status(200).json(response);
    }

    if (dataParam === "recommendation" || dataParam === "recommendations") {
      const recData = await getAnimeRecommendations(id, trackerParam, undefined, clientIp);

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");

      const responseObj: any = {
        data: "recommendation",
        total: recData.total,
        results: recData.results
      };
      return res.json(responseObj);
    }

    if (dataParam === "character" || dataParam === "characters") {
      const charData = await getAnimeCharacters(id, trackerParam, undefined, clientIp);

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");

      const responseObj: any = {
        data: "character",
        total: charData.total,
        results: charData.results
      };
      return res.json(responseObj);
    }

    if (dataParam === "season") {
      const seasonData = await getAnimeSeason(id, trackerParam, undefined, clientIp, true);

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");

      const responseObj: any = {
        data: "season",
        results: seasonData.results
      };
      return res.json(responseObj);
    }

    if (dataParam === "episode" || dataParam === "episodes") {
      const browserTimezone = extractBrowserTimezone(req);
      const userGeo = await getUserGeoInfo(clientIp, browserTimezone);
      const userTz = userGeo.timezone || "UTC";

      const rawEpData = await getEpisodes(trackerParam, id.trim(), clientIp, browserTimezone, true);
      const meta = rawEpData?._meta;

      let nextEpisodesList: any[] = [];
      if (meta?.next_airing_episode?.airing_at && !meta?.is_movie) {
        const formattedDate = formatDateYYYYMMDD(meta.next_airing_episode.airing_at, userTz);
        const formattedTime = formatTimeHHMMSS(meta.next_airing_episode.airing_at, userTz);
        nextEpisodesList = [
          {
            episode: String(meta.next_airing_episode.episode),
            date: formattedDate,
            time: formattedTime
          }
        ];
      }

      const episodesList = rawEpData.episodes || [];
      const totalCount = rawEpData.total_episodes || episodesList.length;

      const responseObj: any = {
        data: "episode",
        total: totalCount,
        results: {
          next_episodes: nextEpisodesList,
          episodes: episodesList
        }
      };

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");

      return res.json(responseObj);
    }

    if (dataParam === "artwork") {
      const artworkData = await getAnimeArtwork(id.trim(), trackerParam, clientIp);

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");

      const responseObj: any = {
        data: "artwork",
        total: artworkData.total,
        results: artworkData.results || artworkData.result
      };
      return res.json(responseObj);
    }
  } catch (err: any) {
    if (err.status !== 404 && err.status !== 400) console.error("Anime details error:", err.message || err);
    res.status(err.status || 500).json({
      error: true,
      code: err.code || "DETAILS_FETCH_ERROR",
      message: err.message || "Failed to fetch anime details"
    });
  }
});

async function handleSectionCatalog(req, res) {
  try {
    const rawSection = req.query.section;
    if (!rawSection || typeof rawSection !== "string" || !rawSection.trim()) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Not Found"
      });
    }

    const rawTracker =
      typeof req.query.tracker === "string" && req.query.tracker.trim()
        ? req.query.tracker.trim().toLowerCase()
        : undefined;

    const effectiveTracker = rawTracker || "anilist";
    const rawLimit = req.query.limit;

    const clientIp = getClientIp(req);
    const rawTrimmed = rawSection.toLowerCase().trim();
    const cleanSectionKey = rawTrimmed.replace(/_/g, " ");
    const canonicalSection = SECTION_ALIASES[rawTrimmed] || SECTION_ALIASES[cleanSectionKey];
    if (!canonicalSection) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Not Found"
      });
    }

    const defaultLimit = SECTION_DEFAULT_LIMITS[canonicalSection] || 20;
    let parsedLimit = rawLimit !== undefined && rawLimit !== null ? parseInt(String(rawLimit), 10) : defaultLimit;
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      parsedLimit = defaultLimit;
    }

    if (canonicalSection === "hero_slider") {
      const effectiveLimit = 6;
      const sectionData = await fetchAnimeSection(canonicalSection, effectiveLimit, effectiveTracker, clientIp);

      if (sectionData) {
        delete sectionData.provider;
        delete sectionData.tracker;
      }

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
      return res.json(sectionData);
    }

    if (canonicalSection === "top_10") {
      const effectiveLimit = 10;
      const fetched = await fetchAnimeSection(canonicalSection, effectiveLimit, effectiveTracker, clientIp);
      const sectionData = {
        section: canonicalSection,
        limit: effectiveLimit,
        total: (fetched.results || []).length,
        results: fetched.results || []
      };

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
      return res.json(sectionData);
    }

    const effectiveLimit = Math.min(parsedLimit, SECTION_POOL_MAX_LIMIT);
    const fetched = await fetchAnimeSection(canonicalSection, effectiveLimit, effectiveTracker, clientIp);
    const poolItems = Array.isArray(fetched?.allResults) ? fetched.allResults : (fetched?.results || []);
    const slicedResults = (poolItems || []).slice(0, effectiveLimit);
    const sectionData = {
      section: canonicalSection,
      limit: effectiveLimit,
      total: slicedResults.length,
      results: slicedResults
    };

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    res.json(sectionData);
  } catch (err) {
    if (err.status !== 404) console.error("Anime section error:", err.message || err);
    res.status(err.status || 500).json({
      error: true,
      code: err.code || "SECTION_FETCH_ERROR",
      message: err.message || "Failed to fetch anime section"
    });
  }
}

// Combined Home Anime API on /api/anime and /anime (or legacy ?section= catalog)
app.get("/anime", async (req, res, next) => {
  if (req.query.section) {
    return handleSectionCatalog(req, res);
  }
  try {
    const rawUseParam =
      typeof req.query.use === "string" && req.query.use.trim()
        ? req.query.use.trim()
        : typeof req.query.way === "string" && req.query.way.trim()
        ? req.query.way.trim()
        : null;

    if (rawUseParam) {
      const normalizedUse = normalizeAnimeUse(rawUseParam);
      if (!normalizedUse) {
        return res.status(400).json({
          error: true,
          code: "INVALID_USE",
          message: `Invalid 'use' parameter '${rawUseParam}'. Allowed values: 'anilist', 'mal'.`
        });
      }
    }

    const isFresh = isFreshRequest(req);
    const clientIp = getClientIp(req);

    const { response } = await getAllAnime({
      use: rawUseParam,
      fresh: isFresh,
      clientIp
    });

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(200).json(response);
  } catch (err: any) {
    console.error("Combined anime error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "ANIME_FETCH_ERROR",
      message: err.message || "Failed to fetch combined anime sections"
    });
  }
});

app.all("/anime", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return next();
  }
  res.status(404).json({
    error: true,
    code: "NOT_FOUND",
    message: "Not Found"
  });
});

app.get("/test/anime", async (req, res) => {
  try {
    const rawSection =
      typeof req.query.section === "string" ? req.query.section.trim().toLowerCase() : "";

    if (rawSection !== "trending_now" && rawSection !== "treading_now") {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Not Found"
      });
    }

    let parsedLimit: number | undefined = undefined;
    if (req.query.limit !== undefined && req.query.limit !== null && String(req.query.limit).trim() !== "") {
      const l = parseInt(String(req.query.limit), 10);
      if (!isNaN(l) && l > 0) {
        parsedLimit = l;
      }
    }

    const clientIp = getClientIp(req);
    const data = await fetchAnilistTrendingNow(parsedLimit, clientIp);

    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.json(data);
  } catch (err: any) {
    if (err.status !== 404) console.error("Test anime trending_now error:", err.message || err);
    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "TRENDING_NOW_FETCH_ERROR",
      message: err.message || "Failed to fetch trending now anime from anilist.co/graphql",
      endpoint: err.endpoint || "https://anilist.co/graphql",
      referer: err.referer || "https://anilist.co/search/anime/trending",
      request_headers: err.request_headers || null,
      anilist_response_headers: err.anilist_response_headers || null
    });
  }
});

app.get("/health", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache");
  res.json({ status: "ok", service: "apikume" });
});

app.get(["/chiaki/:text", "/chiaki"], async (req, res) => {
  try {
    const rawText = (req.params.text || req.query.text || req.query.q || req.query.term || "").trim();
    if (!rawText) {
      return res.status(400).json({
        error: true,
        code: "MISSING_TEXT",
        message: "Search text parameter is required for /chiaki/:text"
      });
    }

    const rawResult = await fetchChiakiRawSearch(rawText);
    applyNoCacheHeaders(req, res);
    res.setHeader("X-Cache-Strategy", "no-cache");
    res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
    return res.json(rawResult);
  } catch (err: any) {
    console.error("Chiaki search error:", err.message || err);
    return res.status(err.status || 500).json({
      error: true,
      code: err.code || "CHIAKI_SEARCH_ERROR",
      message: err.message || "Failed to fetch Chiaki search results"
    });
  }
});

app.get(
  [
    "/ak/map/:id",
    "/ak/map/:id/:season/:ep",
    "/ak/map"
  ],
  async (req, res) => {
    try {
      const rawId = (req.params.id || req.query.id || "").trim();
      if (!rawId) {
        return res.status(400).json({
          error: true,
          code: "MISSING_ID",
          message: "ID parameter is required for /ak/map"
        });
      }

      const trackerParam =
        typeof req.query.tracker === "string" && req.query.tracker.trim()
          ? req.query.tracker.trim().toLowerCase()
          : undefined;
      const seasonParam = req.params.season || req.query.season;
      const epParam = req.params.ep || req.query.ep || req.query.episode;

      const data = await getAkAnimeMap({
        rawId,
        trackerParam,
        seasonParam,
        epParam
      });

      applyNoCacheHeaders(req, res);
      res.setHeader("X-Cache-Strategy", "no-cache");
      res.setHeader("X-Cache-Server-Duration", "0s (disabled)");
      return res.json(data);
    } catch (err: any) {
      if (err.status !== 404 && err.status !== 400) {
        console.error("AK Map error:", err.message || err);
      }
      return res.status(err.status || 500).json({
        error: true,
        code: err.code || "AK_MAP_ERROR",
        message: err.message || "Failed to resolve anime mapping"
      });
    }
  }
);

const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Apikume API",
    version: "2.0.0",
    description:
      "A high-performance Anime API featuring compressed server caching, instant 5-item top_10 searches, instantaneous Anikume IDs, multi-tier episode fetching (AniZip for TV shows, TMDB for Movies, with AniList and MAL fallbacks), batch cross-tracker ID mapping, TVDB extended artwork / TMDB backdrop extraction, hero sliders, and 10.0 ratings."
  },
  servers: [{ url: "/" }],
  tags: [
    {
      name: "Anime",
      description: "Core anime endpoints (Catalog, Search, Browse, Details, Episode metadata, Artwork, and Streaming sources)"
    },
    {
      name: "Utility / Tools",
      description: "Developer utility tools, system health, rate limits, server cache control, and cross-tracker ID mappers"
    }
  ],
  paths: {
    "/anime": {
      get: {
        tags: ["Anime"],
        summary:
          "Get anime catalog section (hero_slider, trending, season, popular, top_rated, upcoming, top_10)",
        parameters: [
          {
            name: "section",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["hero_slider", "trending", "season", "popular", "top_rated", "upcoming", "top_10"] },
            description: "Catalog section to fetch (hero_slider has TVDB/TMDB clear logos)."
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" },
            description: "Number of items to return (default: 6 for hero_slider, 10 for top_10, 20 for others)."
          },
          {
            name: "tracker",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["anilist", "mal"] },
            description: "Choose specific tracker directly (anilist, mal)."
          },
          {
            name: "fresh",
            in: "query",
            required: false,
            schema: { type: "boolean" },
            description: "Force fresh fetch bypassing and replacing server RAM cache."
          }
        ],
        responses: {
          200: {
            description: "Anime catalog section items"
          },
          404: { description: "Not Found" }
        }
      }
    },
    "/anime/browse": {
      get: {
        tags: ["Anime"],
        summary: "Multi-filter anime discovery, catalog browsing, and search with hybrid AniList + MAL sync and deduplication",
        parameters: [
          { name: "mode", in: "query", required: false, schema: { type: "string", enum: ["search", "browse"] }, description: "Mode: 'search' (defaults to 5 fast results) or 'browse' (defaults to 20 results with filters)" },
          { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Search keyword (e.g. naruto, one piece)" },
          { name: "genre", in: "query", required: false, schema: { type: "string" }, description: "Single or comma-separated genres (e.g. Action, Comedy, Fantasy)" },
          { name: "format", in: "query", required: false, schema: { type: "string", enum: ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"] }, description: "Media format" },
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"] }, description: "Release status" },
          { name: "season", in: "query", required: false, schema: { type: "string", enum: ["WINTER", "SPRING", "SUMMER", "FALL"] }, description: "Anime season" },
          { name: "year", in: "query", required: false, schema: { type: "string" }, description: "Release year (e.g. 2024)" },
          { name: "sort", in: "query", required: false, schema: { type: "string", enum: ["POPULARITY_DESC", "SCORE_DESC", "TRENDING_DESC", "START_DATE_DESC", "TITLE_ROMAJI"] }, description: "Sorting order" },
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 }, description: "Page number" },
          { name: "perPage", in: "query", required: false, schema: { type: "integer" }, description: "Items per page (max 50)" },
          { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Target limit (overrides perPage; 5 default for search, 20 default for browse)" },
          { name: "fresh", in: "query", required: false, schema: { type: "boolean" }, description: "Force fresh fetch bypassing and replacing server RAM cache" }
        ],
        responses: {
          200: { description: "Paginated anime browse and search results containing mode, pageInfo, limit, total, and results array" },
          500: { description: "Server error retrieving browse results" }
        }
      }
    },
    "/anime/{id}": {
      get: {
        tags: ["Anime"],
        summary: "Get anime overview details, character, recommendation, season, episode, or artwork background images",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "10-character Anikume ID or numeric ID (with tracker)" },
          { name: "data", in: "query", required: true, schema: { type: "string", enum: ["overview", "character", "recommendation", "season", "episode", "artwork"] }, description: "Required data view mode: overview, character, recommendation, season, episode, or artwork" },
          { name: "tracker", in: "query", required: false, schema: { type: "string", enum: ["anikume", "anilist", "mal"] }, description: "Tracker type of the given ID (required for numeric IDs)" },
          { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Maximum number of items to return" },
          { name: "fresh", in: "query", required: false, schema: { type: "boolean" }, description: "Purge and replace server RAM cache with fresh fetch" }
        ],
        responses: {
          200: { description: "Response containing singular data key ('overview', 'character', 'recommendation', 'season', 'episode', 'artwork'), total count, and results payload" },
          400: { description: "Numeric ID requires tracker or invalid parameter" },
          404: { description: "Anime not found" }
        }
      }
    },
    "/anime/watch/{id}/{ep}": {
      get: {
        tags: ["Anime"],
        summary: "Fetch direct streaming HLS streams, embeds, and subtitle tracks for an episode (supports megaplay and novuscloud)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "10-character Anikume ID only (no raw AniList IDs directly accepted)" },
          { name: "ep", in: "path", required: true, schema: { type: "string" }, description: "Episode number (e.g. 1, 2, ep-1)" },
          { name: "source", in: "query", required: false, schema: { type: "string", enum: ["megaplay", "novuscloud"], default: "megaplay" }, description: "Streaming source provider (defaults to 'megaplay', supports 'megaplay' and 'novuscloud')" }
        ],
        responses: {
          200: { description: "Streaming source response containing SUB and DUB HLS streams, embeds, intro/outro timestamps, and subtitle tracks" },
          400: { description: "Missing anime ID or unsupported source parameter" },
          404: { description: "Anikume ID not found or episode not found on provider" },
          500: { description: "Failed to extract streaming sources" }
        }
      }
    },
    "/anime/map/{id}": {
      get: {
        tags: ["Utility / Tools"],
        summary: "Batch or single resolve anime tracker IDs (supports comma-separated IDs e.g. /anime/map/21,199221?tracker=anilist)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Anime ID, comma-separated list of IDs (e.g. 21,199221), or Anikume ID" },
          { name: "tracker", in: "query", required: false, schema: { type: "string", enum: ["anikume", "anilist", "mal", "anidb", "kitsu", "simkl", "animeplanet", "anisearch", "livechart", "tvdb", "tmdb"] }, description: "Tracker of given ID(s) - defaults to anikume" }
        ],
        responses: {
          200: { description: "Single mapping object, or array of objects if comma-separated IDs supplied" },
          400: { description: "Invalid tracker" },
          404: { description: "Anime mapping not found" }
        }
      }
    },
    "/anime/sourcemap/{id}": {
      get: {
        tags: ["Utility / Tools"],
        summary: "Map anime ID to streaming site IDs as strings (all sites by default, or fast single-site mapping via ?source=anikoto)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Anime ID or Anikume ID" },
          { name: "source", in: "query", required: false, schema: { type: "string", enum: VALID_SOURCEMAP_SITES }, description: "Optional site name (e.g. anikoto, reanime, 2dhive, anizone, mkissa, etc.) to fast-map only that source ID. Omit to map all sources." },
          { name: "tracker", in: "query", required: false, schema: { type: "string", enum: ["anikume", "anilist", "mal"] }, description: "Tracker provider of given ID (defaults to anikume)" },
          { name: "fresh", in: "query", required: false, schema: { type: "boolean" }, description: "Purge and replace server RAM cache with fresh fetch" }
        ],
        responses: {
          200: { description: "Sourcemap mapping object with all mapped IDs formatted as strings" },
          400: { description: "Invalid tracker or source parameter" },
          500: { description: "Sourcemap fetch error" }
        }
      }
    },
    "/status": {
      get: {
        tags: ["Utility / Tools"],
        summary: "Get system status, client timezone detection, API hosted URL, storage chunk stats, cache memory metrics, uptime, and rate limit info",
        parameters: [{ name: "tz", in: "query", required: false, schema: { type: "string" }, description: "Client timezone override" }],
        responses: {
          200: { description: "Status details object with client IP, timezones, hosted URL, cached counts, rate limits, cache metrics, and uptime" }
        }
      }
    },
    "/health": {
      get: {
        tags: ["Utility / Tools"],
        summary: "Health check endpoint returning service status",
        responses: { 200: { description: "Operational health status" } }
      }
    }
  }
};

app.get("/openapi.json", (req, res) => {
  const hostedUrl = getHostedUrl(req);
  const doc = {
    ...swaggerDocument,
    servers: [{ url: hostedUrl }]
  };
  res.setHeader("Content-Type", "application/json");
  res.json(doc);
});

app.get(["/openapi.yaml", "/openapi.yml"], (req, res) => {
  const hostedUrl = getHostedUrl(req);
  const doc = {
    ...swaggerDocument,
    servers: [{ url: hostedUrl }]
  };
  res.setHeader("Content-Type", "text/yaml");
  res.send(yamlDump(doc));
});

app.get(["/.well-known/ai-plugin.json", "/ai-plugin.json"], (req, res) => {
  const hostedUrl = getHostedUrl(req);
  res.setHeader("Content-Type", "application/json");
  res.json({
    schema_version: "v1",
    name_for_human: "Apikume Anime API",
    name_for_model: "apikume_anime_api",
    description_for_human: "High-performance Anime API for catalog, search, recommendations, streaming sources, character lists, episode schedules, and cross-tracker mapping.",
    description_for_model: "Apikume Anime API allows AI agents and assistants to fetch anime catalog sections (trending, popular, top 10, season, upcoming), search or browse anime with filters, retrieve overview details, characters, recommendations, season watch orders, episode metadata, high-speed streaming links, and cross-tracker ID mappings (AniList, MyAnimeList, TVDB, TMDB). Use this API whenever the user asks about anime recommendations, details, episodes, or watching anime.",
    auth: {
      type: "none"
    },
    api: {
      type: "openapi",
      url: `${hostedUrl}/openapi.json`
    },
    logo_url: "https://favicondl.com/api/extract?url=github.com&size=512",
    contact_email: "support@apikume.com",
    legal_info_url: `${hostedUrl}/docs`
  });
});

export default app;
