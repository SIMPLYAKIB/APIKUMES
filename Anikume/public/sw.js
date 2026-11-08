// Service Worker Media Proxy for HLS (.m3u8), TS segments, and Subtitles
// Intercepts /sw-proxy/* requests to rewrite playlists and proxy media streams in-browser
// Zero requests to Cloudflare or local server - completely client-side in the browser engine

const SW_VERSION = "1.1.0";
const PROXY_PREFIX = "/sw-proxy";

function log(...args) {
  console.log(
    "%c[SW-Proxy]",
    "background: #df7426; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
    ...args
  );
}

function logError(...args) {
  console.error(
    "%c[SW-Proxy Error]",
    "background: #ef4444; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
    ...args
  );
}

// Immediately take control on install & activate
self.addEventListener("install", (event) => {
  log(`Service Worker v${SW_VERSION} installing...`);
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  log(`Service Worker v${SW_VERSION} activated. Claiming all clients.`);
  event.waitUntil(
    self.clients.claim().then(() => {
      log("All clients successfully claimed by Service Worker.");
    })
  );
});

// Helper to resolve relative or absolute URL against a base URL
function resolveUrl(relativeUrl, baseUrl) {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (e) {
    logError("Failed to resolve URL:", relativeUrl, "with base:", baseUrl, e);
    return relativeUrl;
  }
}

// Build a proxied URL for a target asset with proper file extension for MSE / Vidstack detection
function buildProxiedUrl(targetUrl, ref) {
  if (!targetUrl) return "";

  // If already proxied, do not double-wrap
  if (targetUrl.includes(PROXY_PREFIX) && targetUrl.includes("url=")) {
    return targetUrl;
  }

  const cleanUrl = targetUrl.split("?")[0].toLowerCase();
  let proxyEndpoint = `${PROXY_PREFIX}/segment.ts`;

  if (cleanUrl.endsWith(".m3u8") || targetUrl.includes(".m3u8") || targetUrl.includes("playlist")) {
    proxyEndpoint = `${PROXY_PREFIX}/playlist.m3u8`;
  } else if (cleanUrl.endsWith(".vtt") || targetUrl.includes(".vtt") || targetUrl.includes("subtitles")) {
    proxyEndpoint = `${PROXY_PREFIX}/subtitles.vtt`;
  } else if (cleanUrl.endsWith(".srt") || targetUrl.includes(".srt")) {
    proxyEndpoint = `${PROXY_PREFIX}/subtitles.srt`;
  } else if (cleanUrl.endsWith(".key") || targetUrl.includes(".key") || targetUrl.includes("key")) {
    proxyEndpoint = `${PROXY_PREFIX}/key.bin`;
  } else if (cleanUrl.endsWith(".m4s") || cleanUrl.endsWith(".mp4")) {
    proxyEndpoint = `${PROXY_PREFIX}/segment.mp4`;
  }

  const params = new URLSearchParams();
  params.set("url", targetUrl);
  if (ref) {
    params.set("ref", ref);
  }

  return `${proxyEndpoint}?${params.toString()}`;
}

// Parse and rewrite .m3u8 playlist text
function rewriteM3U8(content, baseUrl, ref) {
  const lines = content.split(/\r?\n/);
  const rewrittenLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      rewrittenLines.push(line);
      continue;
    }

    // Rewrite URI attributes in tags like #EXT-X-KEY, #EXT-X-MEDIA, #EXT-X-MAP, etc.
    if (trimmed.startsWith("#")) {
      if (
        trimmed.startsWith("#EXT-X-KEY") ||
        trimmed.startsWith("#EXT-X-MEDIA") ||
        trimmed.startsWith("#EXT-X-MAP") ||
        trimmed.startsWith("#EXT-X-PRELOAD-HINT") ||
        trimmed.startsWith("#EXT-X-RENDITION-REPORT") ||
        trimmed.startsWith("#EXT-X-SESSION-DATA") ||
        trimmed.startsWith("#EXT-X-SESSION-KEY") ||
        trimmed.startsWith("#EXT-X-I-FRAME-STREAM-INF")
      ) {
        // Match URI="value" with quotes
        line = line.replace(/URI=(["'])(.*?)\1/g, (match, quote, uriVal) => {
          const resolved = resolveUrl(uriVal, baseUrl);
          const proxied = buildProxiedUrl(resolved, ref);
          return `URI=${quote}${proxied}${quote}`;
        });
        // Match URI=value without quotes
        line = line.replace(/URI=([^,"'\s]+)/g, (match, uriVal) => {
          if (uriVal.startsWith('"') || uriVal.startsWith("'")) return match;
          const resolved = resolveUrl(uriVal, baseUrl);
          const proxied = buildProxiedUrl(resolved, ref);
          return `URI="${proxied}"`;
        });
      }

      rewrittenLines.push(line);
      continue;
    }

    // Non-comment line = Media segment or variant playlist URL
    const resolvedMediaUrl = resolveUrl(trimmed, baseUrl);
    const proxiedMediaUrl = buildProxiedUrl(resolvedMediaUrl, ref);
    rewrittenLines.push(proxiedMediaUrl);
  }

  return rewrittenLines.join("\n");
}

// Helper to construct synthetic CORS headers
function createSyntheticHeaders(originalHeaders = null, contentType = null) {
  const headers = new Headers();

  // Permissive CORS for browser media elements and Web Workers
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type, Date");
  headers.set("Accept-Ranges", "bytes");

  if (originalHeaders) {
    const headersToCopy = [
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
      "cache-control",
      "date",
    ];
    for (const h of headersToCopy) {
      const val = originalHeaders.get(h);
      if (val) headers.set(h, val);
    }
  }

  if (contentType) {
    headers.set("Content-Type", contentType);
  } else if (originalHeaders && originalHeaders.get("content-type")) {
    headers.set("Content-Type", originalHeaders.get("content-type"));
  }

  return headers;
}

// Broadcast interception data to client tabs
async function broadcastInterception(data) {
  try {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({
        type: "SW_PROXY_INTERCEPT",
        payload: data,
      });
    }
  } catch (err) {
    // Non-fatal
  }
}

// Intercept fetch requests matching /sw-proxy/*
self.addEventListener("fetch", (event) => {
  const reqUrl = new URL(event.request.url);

  // Match /sw-proxy/ or /sw-proxy
  if (!reqUrl.pathname.startsWith(PROXY_PREFIX)) {
    return;
  }

  // Preflight OPTIONS support
  if (event.request.method === "OPTIONS") {
    event.respondWith(
      new Response(null, {
        status: 204,
        headers: createSyntheticHeaders(),
      })
    );
    return;
  }

  const targetUrl = reqUrl.searchParams.get("url");
  const ref = reqUrl.searchParams.get("ref") || "";

  if (!targetUrl) {
    logError("Missing 'url' parameter in proxy request:", reqUrl.href);
    event.respondWith(
      new Response("Error: Missing target 'url' parameter in query string.", {
        status: 400,
        headers: createSyntheticHeaders(null, "text/plain"),
      })
    );
    return;
  }

  event.respondWith(handleProxyRequest(event.request, targetUrl, ref));
});

async function handleProxyRequest(originalRequest, targetUrl, ref) {
  const startTime = performance.now();
  const cleanUrl = targetUrl.split("?")[0].toLowerCase();

  const isPlaylist =
    cleanUrl.endsWith(".m3u8") ||
    targetUrl.includes(".m3u8") ||
    targetUrl.includes("playlist");

  const isSubtitle =
    cleanUrl.endsWith(".vtt") ||
    cleanUrl.endsWith(".srt") ||
    targetUrl.includes(".vtt") ||
    targetUrl.includes(".srt") ||
    targetUrl.includes("subtitles");

  log("Intercepting stream:", targetUrl, "| Ref:", ref || "none", "| Method:", originalRequest.method);

  // Prepare upstream fetch headers
  const fetchHeaders = new Headers();

  // Forward Range header for byte-range seek and TS buffering
  const rangeHeader = originalRequest.headers.get("Range");
  if (rangeHeader) {
    fetchHeaders.set("Range", rangeHeader);
  }

  const acceptHeader = originalRequest.headers.get("Accept");
  if (acceptHeader) {
    fetchHeaders.set("Accept", acceptHeader);
  }

  // Add custom referrer hints where allowed
  if (ref) {
    try {
      fetchHeaders.set("X-Referer", ref);
      fetchHeaders.set("X-Origin", ref);
    } catch (e) {
      // Ignored
    }
  }

  let upstreamResponse;
  let usedFallback = false;

  try {
    upstreamResponse = await fetch(targetUrl, {
      method: originalRequest.method,
      headers: fetchHeaders,
      mode: "cors",
      credentials: "omit",
    });

    if (!upstreamResponse.ok && upstreamResponse.status >= 400 && !targetUrl.includes("/proxy?")) {
      throw new Error(`Direct fetch status ${upstreamResponse.status}`);
    }
  } catch (directErr) {
    log("Direct SW fetch failed, attempting server proxy fallback for:", targetUrl, directErr?.message || directErr);
    try {
      const serverProxyUrl = `${self.location.origin}/proxy?url=${encodeURIComponent(targetUrl)}&ref=${encodeURIComponent(ref || "")}`;
      upstreamResponse = await fetch(serverProxyUrl, {
        method: originalRequest.method,
        headers: fetchHeaders,
      });
      usedFallback = true;
    } catch (fallbackErr) {
      logError("Fallback server proxy also failed:", targetUrl, fallbackErr);
    }
  }

  try {
    if (!upstreamResponse) {
      throw new Error("Failed to fetch stream from direct upstream and server proxy");
    }

    const duration = Math.round(performance.now() - startTime);

    broadcastInterception({
      url: targetUrl,
      ref,
      status: upstreamResponse.status,
      type: isPlaylist ? "m3u8" : isSubtitle ? "vtt" : "segment",
      duration,
      range: rangeHeader || null,
      timestamp: Date.now(),
      fallback: usedFallback,
    });

    // If server fallback was used and returned a playlist, server already handled rewrites or we can return it
    if (usedFallback) {
      const syntheticHeaders = createSyntheticHeaders(upstreamResponse.headers);
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: syntheticHeaders,
      });
    }

    // Case 1: .m3u8 HLS playlist -> Rewrite segment & key URIs
    if (isPlaylist || upstreamResponse.headers.get("content-type")?.includes("mpegurl")) {
      const playlistText = await upstreamResponse.text();
      const rewrittenM3U8 = rewriteM3U8(playlistText, targetUrl, ref);

      const syntheticHeaders = createSyntheticHeaders(
        upstreamResponse.headers,
        "application/vnd.apple.mpegurl; charset=utf-8"
      );
      syntheticHeaders.delete("content-length");

      log(`Rewrote playlist (${playlistText.length}b -> ${rewrittenM3U8.length}b):`, targetUrl);

      return new Response(rewrittenM3U8, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: syntheticHeaders,
      });
    }

    // Case 2: Subtitle (.vtt / .srt) -> Return with clean CORS
    if (isSubtitle || upstreamResponse.headers.get("content-type")?.includes("vtt")) {
      const subtitleText = await upstreamResponse.text();
      const syntheticHeaders = createSyntheticHeaders(
        upstreamResponse.headers,
        "text/vtt; charset=utf-8"
      );
      syntheticHeaders.delete("content-length");

      return new Response(subtitleText, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: syntheticHeaders,
      });
    }

    // Case 3: Binary Media chunk (.ts, .m4s, .mp4, keys) -> Stream pass-through with Range & CORS
    const defaultContentType = cleanUrl.endsWith(".ts")
      ? "video/mp2t"
      : cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".m4s")
      ? "video/mp4"
      : null;

    const syntheticHeaders = createSyntheticHeaders(upstreamResponse.headers, defaultContentType);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: syntheticHeaders,
    });
  } catch (error) {
    logError("Fetch upstream error:", targetUrl, error);

    broadcastInterception({
      url: targetUrl,
      ref,
      status: 0,
      error: error.message || "Network Error / CORS Failure",
      type: isPlaylist ? "m3u8" : isSubtitle ? "vtt" : "segment",
      duration: Math.round(performance.now() - startTime),
      timestamp: Date.now(),
    });

    return new Response(
      `SW-Proxy Fetch Error: ${error.message || "Upstream network error"}\nTarget: ${targetUrl}`,
      {
        status: 502,
        headers: createSyntheticHeaders(null, "text/plain"),
      }
    );
  }
}
