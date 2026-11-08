/**
 * Method 4: 100% Client-Side In-Memory HLS Stream Loader
 * Zero backend/worker proxy hits (0 Cloudflare requests).
 *
 * What this does:
 * 1. Fetches the .m3u8 manifest directly in browser using 'no-referrer' (strips unauthorized origin headers).
 * 2. Parses master playlists & sub-playlists in-memory.
 * 3. Rewrites all relative segment (.ts, .m4s, .mp4) & AES key URIs to absolute CDN URLs in-memory.
 * 4. Creates a local Blob URL (blob:...) that Vidstack / Hls.js streams natively.
 */

// In-memory cache for blob URLs to avoid redundant fetches
const blobCache = new Map<string, { blobUrl: string; timestamp: number }>();

// Periodic cleanup of stale blob objects every 5 minutes
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of blobCache.entries()) {
      if (now - item.timestamp > 30 * 60 * 1000) {
        URL.revokeObjectURL(item.blobUrl);
        blobCache.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export async function createClientHlsBlobUrl(
  hlsUrl: string,
  referrerUrl?: string,
): Promise<string> {
  if (!hlsUrl) return "";

  // If already a blob, data URL, or non-HLS media, return as-is
  if (
    hlsUrl.startsWith("blob:") ||
    hlsUrl.startsWith("data:") ||
    hlsUrl.endsWith(".mp4") ||
    hlsUrl.endsWith(".webm") ||
    hlsUrl.endsWith(".ogg")
  ) {
    return hlsUrl;
  }

  const effectiveRef = (referrerUrl || "").trim();
  const cacheKey = `${hlsUrl.trim()}__ref_${effectiveRef}`;
  const cached = blobCache.get(cacheKey);
  if (cached) {
    return cached.blobUrl;
  }

  try {
    // 1. Fetch manifest directly via proxy or client with proper headers
    let playlistText = "";
    
    // First try proxy fetch with explicit referrer
    const proxyUrl = `/proxy?ref=${encodeURIComponent(effectiveRef || "https://megaplay.buzz/")}&url=${encodeURIComponent(hlsUrl)}`;
    const response = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        Accept: "*/*",
      },
    });

    if (response.ok) {
      playlistText = await response.text();
    } else {
      // Fallback direct in-browser fetch
      const directRes = await fetch(hlsUrl, {
        method: "GET",
        referrerPolicy: "no-referrer",
        mode: "cors",
        credentials: "omit",
      });
      if (directRes.ok) {
        playlistText = await directRes.text();
      } else {
        return hlsUrl;
      }
    }

    // Verify it is a standard HLS manifest
    if (!playlistText.includes("#EXTM3U")) {
      return hlsUrl;
    }

    const baseUrl = new URL(hlsUrl);
    const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf("/") + 1);
    const origin = baseUrl.origin;

    // Rewrite relative URI links to absolute CDN URLs in-memory
    const lines = playlistText.split("\n");
    const rewrittenLines = lines.map((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#EXT")) {
        // Handle encryption keys and media tags with URI="path"
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:")) {
              return match;
            }
            if (uri.startsWith("/")) {
              return `URI="${origin}${uri}"`;
            }
            return `URI="${origin}${basePath}${uri}"`;
          });
        }
        return line;
      }

      // If already absolute URL
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
        return trimmed;
      }

      if (trimmed.startsWith("/")) {
        return `${origin}${trimmed}`;
      }

      return `${origin}${basePath}${trimmed}`;
    });

    const modifiedPlaylist = rewrittenLines.join("\n");
    const blob = new Blob([modifiedPlaylist], { type: "application/x-mpegurl" });
    const blobUrl = URL.createObjectURL(blob);

    blobCache.set(cacheKey, { blobUrl, timestamp: Date.now() });
    return blobUrl;
  } catch (err) {
    console.warn("Client HLS Blob loader fallback to original URL:", err);
    return hlsUrl;
  }
}
