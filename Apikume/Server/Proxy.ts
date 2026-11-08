// @ts-nocheck
import { Hono } from "hono";
import crypto from "node:crypto";
import { ProxyAgent } from "undici";

export const CANDIDATE_ASCDN_HOSTS = [
  "as-cdn26.top",
  "as-cdn27.top",
  "as-cdn28.top",
  "as-cdn29.top",
  "as-cdn30.top",
  "as-cdn25.top",
  "as-cdn24.top",
  "as-cdn21.top",
  "as-cdn2.top",
  "animesalt.cx"
];

export const GREEK_LETTERS = [
  "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
  "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi",
  "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export function getProxyAgent(proxyUrl?: string): ProxyAgent | undefined {
  const p = proxyUrl || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (p && p.trim()) {
    try {
      return new ProxyAgent(p.trim());
    } catch (e) {
      console.warn("[proxy] Invalid ProxyAgent URL:", p);
    }
  }
  return undefined;
}

export function formatProxyUrl(
  originBase: string,
  ref: string,
  targetUrl: string,
  segProxy: boolean = true
): string {
  if (!targetUrl) return "";
  const cleanOrigin = originBase ? originBase.replace(/\/+$/, "") : "";
  let proxyPath = "";
  if (!cleanOrigin) {
    proxyPath = "/proxy";
  } else {
    proxyPath = cleanOrigin.endsWith("/proxy") ? cleanOrigin : `${cleanOrigin}/proxy`;
  }

  const cleanRef = (ref || "").trim();
  const cleanTarget = targetUrl.trim();

  const params = new URLSearchParams();
  if (cleanRef) {
    params.set("ref", cleanRef);
  }
  params.set("url", cleanTarget);
  if (!segProxy) {
    params.set("seg_proxy", "false");
  }

  return `${proxyPath}?${params.toString()}`;
}

export function getRequestOrigin(c: any): string {
  if (!c || !c.req) return "";
  const xHost = c.req.header("x-forwarded-host");
  const xProto = c.req.header("x-forwarded-proto");
  if (xHost && !xHost.includes("localhost") && !xHost.includes("127.0.0.1")) {
    const proto = xProto || "https";
    return `${proto}://${xHost}`;
  }
  const host = c.req.header("host") || "";
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    const proto = xProto || (host.startsWith("ais-") || host.endsWith(".run.app") ? "https" : "http");
    return `${proto}://${host}`;
  }
  const referer = c.req.header("referer") || c.req.header("origin") || "";
  if (referer) {
    try {
      const refObj = new URL(referer);
      if (refObj.host && !refObj.host.includes("localhost") && !refObj.host.includes("127.0.0.1")) {
        return refObj.origin;
      }
    } catch (e) {}
  }
  return "";
}

function safeDecodeURL(str: string): string {
  if (!str) return "";
  let decoded = str.trim();
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    return decoded;
  }
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        break;
      }
    } catch (e) {
      break;
    }
  }
  return decoded;
}

function extractTargetUrlAndReferrer(
  urlStr: string,
  defaultReferrer: string
): { target: string; referrer: string } {
  try {
    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      const parsed = new URL(urlStr);
      const innerUrl = parsed.searchParams.get("url");
      if (
        innerUrl &&
        (innerUrl.startsWith("http://") ||
          innerUrl.startsWith("https://") ||
          innerUrl.startsWith("%") ||
          innerUrl.includes("%3A%2F%2F"))
      ) {
        const decodedInner = safeDecodeURL(innerUrl);
        const innerRef =
          parsed.searchParams.get("ref") ||
          parsed.searchParams.get("red") ||
          parsed.searchParams.get("referrer") ||
          defaultReferrer;
        return extractTargetUrlAndReferrer(decodedInner, innerRef);
      }
    }
  } catch (e) {}
  return { target: urlStr, referrer: defaultReferrer };
}

export async function extractZephyrflickHls(embedUrlOrHash: string, reqOrigin: string = "") {
  if (!embedUrlOrHash) return null;
  let hash = embedUrlOrHash.trim();
  const match = hash.match(/([a-f0-9]{32})/i);
  if (match) {
    hash = match[1];
  } else {
    return null;
  }

  for (const host of CANDIDATE_ASCDN_HOSTS) {
    try {
      const url = `https://${host}/player/index.php?data=${hash}&do=getVideo`;
      const res = await directProxyFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `https://${host}/video/${hash}`,
          "User-Agent": UA
        },
        body: `hash=${hash}&r=https://animesalt.cx/`
      });
      if (res.ok) {
        const json = await res.json();
        const rawHls = json.videoSource || json.securedLink || json.file;
        if (rawHls && typeof rawHls === "string" && rawHls.startsWith("http")) {
          const proxiedHls = formatProxyUrl(reqOrigin, `https://${host}/`, rawHls);
          return {
            hls: proxiedHls,
            raw_hls: rawHls,
            embed: embedUrlOrHash.startsWith("http")
              ? embedUrlOrHash
              : `https://play.zephyrflick.top/video/${hash}`,
            videoImage: json.videoImage || "",
            host,
            hash
          };
        }
      }
    } catch (e) {}
  }
  return null;
}

export function formatZephyrflickAsAnikume(extracted: any, reqOrigin: string) {
  if (!extracted) {
    return { sub: [], dub: [], intro: { start: 0, end: 0 }, outro: { start: 0, end: 0 } };
  }
  const host = extracted.host || "as-cdn26.top";
  const refUrl = `https://${host}/`;
  const baseHls = extracted.raw_hls;
  const embedUrl = extracted.embed || `https://play.zephyrflick.top/video/${extracted.hash}`;

  const subSources = [
    {
      source: GREEK_LETTERS[0],
      embed: embedUrl,
      hls: formatProxyUrl(reqOrigin, refUrl, baseHls)
    }
  ];

  const dubLanguages = [
    { code: "eng", lang: "English" },
    { code: "hin", lang: "Hindi" },
    { code: "tam", lang: "Tamil" },
    { code: "tel", lang: "Telugu" },
    { code: "mal", lang: "Malayalam" },
    { code: "kan", lang: "Kannada" }
  ];

  const dubSources = dubLanguages.map((l, idx) => {
    const cleanOrigin = reqOrigin ? reqOrigin.replace(/\/+$/, "") : "";
    const proxyPath = cleanOrigin ? (cleanOrigin.endsWith("/proxy") ? cleanOrigin : `${cleanOrigin}/proxy`) : "/proxy";
    const proxiedDubHls = `${proxyPath}?al=${l.code}&ref=${encodeURIComponent(refUrl)}&url=${encodeURIComponent(baseHls)}`;
    return {
      source: GREEK_LETTERS[idx % GREEK_LETTERS.length],
      embed: embedUrl,
      hls: proxiedDubHls
    };
  });

  return {
    sub: subSources,
    dub: dubSources,
    intro: { start: 0, end: 0 },
    outro: { start: 0, end: 0 }
  };
}

function md5Hash(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

export async function resolveAbyssStream(embedUrl: string, reqOrigin: string = "") {
  try {
    let cleanUrl = embedUrl.trim();
    if (cleanUrl.includes("short.icu")) {
      cleanUrl = cleanUrl.replace("short.icu", "abyssplayer.com");
    }
    if (!cleanUrl.startsWith("http")) {
      cleanUrl = `https://abyssplayer.com/${cleanUrl}`;
    }
    const res = await directProxyFetch(cleanUrl, {
      headers: {
        Referer: "https://animelok.live/",
        "User-Agent": UA
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const dMatch = html.match(/const datas\s*=\s*"([^"]+)"/);
    if (!dMatch) return null;
    const payload = JSON.parse(Buffer.from(dMatch[1], "base64").toString("latin1"));
    const { user_id, slug, md5_id, media } = payload;
    if (!media) return null;

    const keyString = `${user_id}:${slug}:${md5_id}`;
    const hashHex = md5Hash(keyString);
    const keyBytes = new TextEncoder().encode(hashHex);
    const counterBytes = new Uint8Array(keyBytes.subarray(0, 16));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CTR" }, false, [
      "encrypt",
      "decrypt"
    ]);
    const cipherBytes = new Uint8Array((media.match(/[\s\S]/g) || []).map((c: string) => c.charCodeAt(0)));
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-CTR", counter: counterBytes, length: 128 },
      key,
      cipherBytes
    );
    const decryptedText = new TextDecoder().decode(decryptedBuf);
    const data = JSON.parse(decryptedText);

    if (data.hls && typeof data.hls === "string") {
      return {
        hls: formatProxyUrl(reqOrigin, "https://abyssplayer.com/", data.hls),
        raw_hls: data.hls,
        embed: cleanUrl,
        type: "hls"
      };
    }
    if (data.mp4) {
      const sources = Array.isArray(data.mp4.sources) ? data.mp4.sources : [];
      const fristDatas = Array.isArray(data.mp4.fristDatas) ? data.mp4.fristDatas : [];
      const domains = Array.isArray(data.mp4.domains) ? data.mp4.domains : [];
      const sortedSources = [...sources].sort((a: any, b: any) => (b.size || b.res_id || 0) - (a.size || a.res_id || 0));
      let streamUrl = "";
      for (const s of sortedSources) {
        if (s.url && s.path) {
          streamUrl = `${s.url}/${s.path}`;
          break;
        } else if (s.url) {
          streamUrl = s.url;
          break;
        } else if (s.sub && domains.length > 0) {
          const dom = domains.find((d: string) => d.includes(s.sub)) || domains[0];
          if (s.path) {
            streamUrl = `https://${dom}/${s.path}`;
            break;
          }
        }
      }
      if (!streamUrl && fristDatas.length > 0) {
        const playableFd = fristDatas.find((f: any) => f.url && (f.url.includes(".m3u8") || f.url.includes(".mp4")));
        if (playableFd) streamUrl = playableFd.url;
      }
      if (streamUrl && !streamUrl.endsWith(".fd")) {
        const isM3u8 = streamUrl.includes(".m3u8");
        return {
          hls: isM3u8
            ? formatProxyUrl(reqOrigin, "https://abyssplayer.com/", streamUrl)
            : `${reqOrigin}/proxy/wrap.m3u8?url=${encodeURIComponent(streamUrl)}`,
          raw_hls: streamUrl,
          embed: cleanUrl,
          type: "hls"
        };
      }
    }
    return { hls: "", raw_hls: "", embed: cleanUrl, type: "embed" };
  } catch (err) {
    return null;
  }
}

export const handleProxyRoute = async (c: any) => {
  try {
    const rawReq = c.req.raw;
    const urlObj = new URL(rawReq.url);

    // Handle CORS preflight options
    if (rawReq.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, Accept-Ranges",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // Read both 'ref' and 'red' (plus 'referer' and 'referrer') for additional ref support
    let refVal =
      urlObj.searchParams.get("ref") ||
      urlObj.searchParams.get("red") ||
      urlObj.searchParams.get("referrer") ||
      urlObj.searchParams.get("referer") ||
      "";

    let urlVal = urlObj.searchParams.get("url") || "";
    let alVal = urlObj.searchParams.get("al") || "";

    // Support ?seg_proxy=false (default is true)
    // Also support aliases: direct_seg=true, no_seg_proxy=true, proxy_seg=false
    const segProxyParam = urlObj.searchParams.get("seg_proxy");
    const directSegParam =
      urlObj.searchParams.get("direct_seg") ||
      urlObj.searchParams.get("direct_segments") ||
      urlObj.searchParams.get("no_seg_proxy") ||
      urlObj.searchParams.get("raw_seg") ||
      urlObj.searchParams.get("direct");
    const proxySegParam = urlObj.searchParams.get("proxy_seg") || urlObj.searchParams.get("proxy_segments");

    let isSegmentProxyEnabled = true;
    if (
      segProxyParam === "false" ||
      segProxyParam === "0" ||
      segProxyParam === "off" ||
      directSegParam === "true" ||
      directSegParam === "1" ||
      proxySegParam === "false" ||
      proxySegParam === "0"
    ) {
      isSegmentProxyEnabled = false;
    }

    // Check if target URL is passed directly in the path (e.g. /proxy/https://...)
    if (!urlVal) {
      const pathname = urlObj.pathname;
      const proxyPrefixes = ["/proxy/"];
      for (const prefix of proxyPrefixes) {
        if (pathname.startsWith(prefix)) {
          const rest = pathname.slice(prefix.length);
          if (rest.startsWith("http://") || rest.startsWith("https://")) {
            urlVal = rest + urlObj.search;
            break;
          }
        }
      }
    }

    // If query string had unencoded URL with additional query params
    const rawUrlStr = rawReq.url;
    const urlIndex = rawUrlStr.indexOf("url=");
    const refIndex = rawUrlStr.indexOf("ref=");
    const redIndex = rawUrlStr.indexOf("red=");
    const activeRefIndex = refIndex !== -1 ? refIndex : redIndex;
    const refPrefixLen = refIndex !== -1 ? 4 : 4;

    const cleanAppendedParams = (str: string) => {
      let s = str;
      for (const p of ["&al=", "&raw=", "&seg_proxy=", "&direct_seg=", "&direct_segments=", "&no_seg_proxy="]) {
        const idx = s.indexOf(p);
        if (idx !== -1) s = s.substring(0, idx);
      }
      return s;
    };

    if ((!urlVal || !urlVal.includes("?")) && urlIndex !== -1 && rawUrlStr.substring(urlIndex).includes("&")) {
      if (activeRefIndex !== -1) {
        if (urlIndex > activeRefIndex) {
          const parsedRef = rawUrlStr.substring(activeRefIndex + refPrefixLen, urlIndex - 1);
          const parsedUrl = cleanAppendedParams(rawUrlStr.substring(urlIndex + 4));
          if (!refVal && parsedRef) refVal = parsedRef;
          if (parsedUrl.length > urlVal.length) urlVal = parsedUrl;
        } else {
          const parsedUrl = cleanAppendedParams(rawUrlStr.substring(urlIndex + 4, activeRefIndex - 1));
          const parsedRef = cleanAppendedParams(rawUrlStr.substring(activeRefIndex + refPrefixLen));
          if (parsedUrl.length > urlVal.length) urlVal = parsedUrl;
          if (!refVal && parsedRef) refVal = parsedRef;
        }
      } else {
        const parsedUrl = cleanAppendedParams(rawUrlStr.substring(urlIndex + 4));
        if (parsedUrl.length > urlVal.length) urlVal = parsedUrl;
      }
    }

    // PREVENT MISSING URL ERROR:
    // If no URL is provided, return a clean friendly 200 JSON status instead of a 400 error!
    if (!urlVal || !urlVal.trim()) {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "Apikume High-Speed HLS Streaming Proxy",
          usage: "/proxy?url=TARGET_URL&ref=REFERRER_URL&seg_proxy=true",
          parameters: {
            url: "Target video stream or manifest URL (required for proxying)",
            ref: "Custom Referer header to send upstream (supports 'red' as alias)",
            red: "Alias for 'ref'",
            seg_proxy: "Optional. 'true' (default: proxy segments) or 'false' (direct remote segment URLs)"
          }
        }, null, 2),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60"
          }
        }
      );
    }

    const { target: cleanTargetUrl, referrer: cleanReferrer } = extractTargetUrlAndReferrer(
      safeDecodeURL(urlVal).trim(),
      safeDecodeURL(refVal).trim()
    );

    let targetUrl = cleanTargetUrl;
    let referrer = cleanReferrer;
    const workerOrigin = getRequestOrigin(c);
    const formatParam = c.req.query("format") || "";
    const isAnikumeFormat = formatParam.toLowerCase() === "anikume" || urlObj.pathname.includes("/anikume");

    const isHexHash = /^[a-f0-9]{32}$/i.test(targetUrl.trim());
    const isZephyrOrAsCdnEmbed = targetUrl.includes("zephyrflick") || targetUrl.includes("as-cdn") || isHexHash;
    const isAbyssEmbed =
      (targetUrl.includes("abyssplayer.com") || targetUrl.includes("short.icu")) &&
      !targetUrl.includes(".m3u8") &&
      !targetUrl.includes(".mp4");
    const isDirectStream =
      targetUrl.includes(".m3u8") ||
      targetUrl.includes(".mp4") ||
      targetUrl.includes(".ts") ||
      targetUrl.includes("/p/") ||
      targetUrl.includes("/hls/");

    if (isZephyrOrAsCdnEmbed && !isDirectStream) {
      const extracted = await extractZephyrflickHls(targetUrl, workerOrigin);
      if (extracted) {
        if (isAnikumeFormat) {
          const anikumeData = formatZephyrflickAsAnikume(extracted, workerOrigin);
          return c.json(anikumeData);
        }
        targetUrl = extracted.raw_hls;
        referrer = `https://${extracted.host}/`;
      }
    } else if (isAbyssEmbed && !isDirectStream) {
      const abyss = await resolveAbyssStream(targetUrl, workerOrigin);
      if (abyss && abyss.raw_hls) {
        targetUrl = abyss.raw_hls;
        referrer = "https://abyssplayer.com/";
      }
    }

    if (targetUrl.startsWith("//")) {
      targetUrl = "https:" + targetUrl;
    } else if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    if (targetUrl.includes("akirax.buzz") || targetUrl.includes("norami.top")) {
      targetUrl = targetUrl.replace(/https?:\/\/(megap\.)?(akirax\.buzz|norami\.top)\//i, "https://fxpy7.watching.onl/anime/");
    }

    const parsedTargetUrl = new URL(targetUrl);
    const forwardHeaders = new Headers();
    const hostname = parsedTargetUrl.hostname.toLowerCase();

    let targetReferrer = "";
    let targetOrigin = "";

    if (referrer) {
      targetReferrer = referrer;
      if (!targetReferrer.startsWith("http://") && !targetReferrer.startsWith("https://")) {
        targetReferrer = "https://" + targetReferrer;
      }
      try {
        const refUrlObj = new URL(targetReferrer);
        targetOrigin = refUrlObj.origin;
        if (targetReferrer === targetOrigin) {
          targetReferrer = targetOrigin + "/";
        }
      } catch (e) {
        targetOrigin = targetReferrer;
      }
    } else if (
      hostname.includes("streamindia.co.in") ||
      hostname.includes("streamable.cloud") ||
      hostname.includes("data.streamindia") ||
      hostname.includes("extract.streamindia")
    ) {
      targetReferrer = "https://animerulzx.net/";
      targetOrigin = "https://animerulzx.net";
    } else if (hostname.includes("as-cdn") || hostname.includes("animesalt")) {
      targetReferrer = "https://animesalt.cx/";
      targetOrigin = "https://animesalt.cx";
    } else if (
      hostname.includes("megaplay") ||
      hostname.includes("megap.") ||
      hostname.includes("akirax") ||
      hostname.includes("norami") ||
      hostname.includes("watching.onl") ||
      hostname.includes("lostproject.club") ||
      hostname.includes("vidwish")
    ) {
      targetReferrer = "https://megaplay.buzz/";
      targetOrigin = "https://megaplay.buzz";
    } else if (hostname.includes("novuscloud")) {
      targetReferrer = "https://novuscloud.buzz/";
      targetOrigin = "https://novuscloud.buzz";
    } else if (hostname.includes("vidtube") || hostname.includes("vidtub.") || hostname.includes("shiora")) {
      targetReferrer = "https://vidtube.site/";
      targetOrigin = "https://vidtube.site";
    } else if (hostname.includes("anidb.net")) {
      targetReferrer = "https://anidb.net/";
      targetOrigin = "https://anidb.net";
    } else if (hostname.includes("anikage.cc")) {
      targetReferrer = "https://anikage.cc/";
      targetOrigin = "https://anikage.cc";
    } else if (hostname.includes("senshi.live")) {
      targetReferrer = "https://senshi.live/";
      targetOrigin = "https://senshi.live";
    } else if (hostname.includes("mega-cloud.top") || hostname.includes("megacloud")) {
      targetReferrer = "https://megacloud.tv/";
      targetOrigin = "https://megacloud.tv";
    } else if (hostname.includes("animeverse.to")) {
      targetReferrer = "https://animeverse.to/";
      targetOrigin = "https://animeverse.to";
    } else if (hostname.includes("allmanga")) {
      targetReferrer = "https://allmanga.to/";
      targetOrigin = "https://allmanga.to";
    } else if (hostname.includes("anikoto") || hostname.includes("anikototv")) {
      targetReferrer = "https://anikototv.to/";
      targetOrigin = "https://anikototv.to";
    } else if (hostname.includes("hianimes")) {
      targetReferrer = "https://hianimes.re/";
      targetOrigin = "https://hianimes.re";
    } else if (
      hostname.includes("cdn-centaurus") ||
      hostname.includes("premilkyway") ||
      hostname.includes("mountainpathventures") ||
      hostname.includes("streamhg") ||
      hostname.includes("otakuhg")
    ) {
      targetReferrer = "https://otakuhg.site/";
      targetOrigin = "https://otakuhg.site";
    } else if (
      hostname.includes("dramiyos") ||
      hostname.includes("acek-cdn") ||
      hostname.includes("healthfoodmarket") ||
      hostname.includes("earnvids") ||
      hostname.includes("otakuvid")
    ) {
      targetReferrer = "https://otakuvid.online/";
      targetOrigin = "https://otakuvid.online";
    } else if (hostname.includes("vibevibe.workers.dev") || hostname.includes("bibiemb")) {
      targetReferrer = "https://bibiemb.xyz/";
      targetOrigin = "https://bibiemb.xyz";
    } else if (hostname.includes("vivibebe")) {
      targetReferrer = "https://vivibebe.site/";
      targetOrigin = "https://vivibebe.site";
    } else if (hostname.includes("anizara") || hostname.includes("cimovix") || hostname.includes("anineko")) {
      targetReferrer = "https://anineko.to/";
      targetOrigin = "https://anineko.to";
    } else if (hostname.includes("animeparadise")) {
      targetReferrer = "https://www.animeparadise.moe/";
      targetOrigin = "https://www.animeparadise.moe";
    } else if (hostname.includes("piratexplay")) {
      targetReferrer = "https://piratexplay.cc/";
      targetOrigin = "https://piratexplay.cc";
    } else if (hostname.includes("sssrr.org") || hostname.includes("abyssplayer") || hostname.includes("short.icu")) {
      targetReferrer = "https://abyssplayer.com/";
      targetOrigin = "https://abyssplayer.com";
    } else if (hostname.includes("animelok") || hostname.includes("zephyrflick")) {
      targetReferrer = "https://animelok.live/";
      targetOrigin = "https://animelok.live";
    } else if (hostname.includes("dood") || hostname.includes("playmogo") || hostname.includes("ds2play")) {
      targetReferrer = "https://dood.to/";
      targetOrigin = "https://dood.to";
    } else if (hostname.includes("anilist.co")) {
      targetReferrer = "https://anilist.co/search/anime/trending";
      targetOrigin = "https://anilist.co";
    } else {
      targetReferrer = parsedTargetUrl.origin + "/";
      targetOrigin = parsedTargetUrl.origin;
    }

    const safeHeadersToForward = ["range", "content-type", "cookie", "x-cookie", "x-cf-clearance", "authorization"];
    for (const [key, val] of rawReq.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (safeHeadersToForward.includes(lowerKey)) {
        forwardHeaders.set(key, val);
      }
    }

    const incomingCookie =
      rawReq.headers.get("cookie") ||
      rawReq.headers.get("x-cookie") ||
      rawReq.headers.get("x-cf-clearance") ||
      urlObj.searchParams.get("cookie") ||
      urlObj.searchParams.get("cf_clearance");
    if (incomingCookie) {
      const formattedCookie = incomingCookie.includes("=") ? incomingCookie : `cf_clearance=${incomingCookie}`;
      forwardHeaders.set("Cookie", formattedCookie);
    }

    const isAjax =
      targetUrl.includes("/api") ||
      targetUrl.includes("/ajax") ||
      targetUrl.includes("/graphql") ||
      rawReq.headers.get("x-requested-with");
    const incomingUserAgent =
      rawReq.headers.get("user-agent") ||
      rawReq.headers.get("x-user-agent") ||
      urlObj.searchParams.get("user_agent");
    if (incomingUserAgent && !incomingUserAgent.includes("node-fetch") && !incomingUserAgent.includes("undici")) {
      forwardHeaders.set("User-Agent", incomingUserAgent);
    } else {
      forwardHeaders.set(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
      );
    }

    forwardHeaders.set("Accept-Language", "en-US,en;q=0.9");
    forwardHeaders.set("sec-ch-ua", '"Chromium";v="130", "Google Chrome";v="130", "Not-A.Brand";v="99"');
    forwardHeaders.set("sec-ch-ua-mobile", "?0");
    forwardHeaders.set("sec-ch-ua-platform", '"Windows"');
    forwardHeaders.set("Connection", "keep-alive");
    forwardHeaders.set("Accept-Encoding", "identity");

    if (isAjax) {
      forwardHeaders.set("Accept", "application/json, text/javascript, */*; q=0.01");
      forwardHeaders.set("X-Requested-With", "XMLHttpRequest");
      forwardHeaders.set("Sec-Fetch-Dest", "empty");
      forwardHeaders.set("Sec-Fetch-Mode", "cors");
      forwardHeaders.set("Sec-Fetch-Site", "same-origin");
    } else {
      forwardHeaders.set("Accept", "*/*");
      forwardHeaders.set("Sec-Fetch-Dest", "empty");
      forwardHeaders.set("Sec-Fetch-Mode", "cors");
      forwardHeaders.set("Sec-Fetch-Site", "cross-site");
    }

    if (targetReferrer) forwardHeaders.set("Referer", targetReferrer);
    if (targetOrigin) forwardHeaders.set("Origin", targetOrigin);

    urlObj.searchParams.forEach((val, key) => {
      if (key.toLowerCase().startsWith("header_")) {
        forwardHeaders.set(key.slice(7), val);
      }
    });

    const proxyTraceHeaders = [
      "x-forwarded-for",
      "x-forwarded-proto",
      "x-forwarded-host",
      "x-forwarded-port",
      "x-real-ip",
      "via",
      "forwarded",
      "cf-connecting-ip",
      "cf-worker",
      "cf-ray",
      "cf-visitor",
      "x-cloud-trace-context",
      "x-appengine-country"
    ];
    proxyTraceHeaders.forEach((h) => forwardHeaders.delete(h));

    const range = rawReq.headers.get("Range");
    if (range) {
      forwardHeaders.set("Range", range);
    }

    const requestMethod = rawReq.method;
    const hasBody = ["POST", "PUT", "PATCH", "DELETE"].includes(requestMethod);
    let requestBody: any = null;
    if (hasBody) {
      try {
        requestBody = await rawReq.arrayBuffer();
      } catch (e) {}
    }

    const customProxy =
      urlObj.searchParams.get("proxy") ||
      urlObj.searchParams.get("upstream_proxy") ||
      rawReq.headers.get("x-proxy") ||
      rawReq.headers.get("x-upstream-proxy");
    const dispatcher = getProxyAgent(customProxy);

    if (hostname.includes("anilist.co") && parsedTargetUrl.pathname.includes("/graphql")) {
      let bodyText: string | undefined = undefined;
      if (requestBody && requestBody.byteLength > 0) {
        bodyText = new TextDecoder().decode(requestBody);
      } else {
        const queryParam = urlObj.searchParams.get("query") || parsedTargetUrl.searchParams.get("query");
        const variablesParam = urlObj.searchParams.get("variables") || parsedTargetUrl.searchParams.get("variables");
        const limitParam = Number(urlObj.searchParams.get("limit") || parsedTargetUrl.searchParams.get("limit") || 20);
        let parsedVars: any = { page: 1, perPage: Math.min(Math.max(limitParam || 20, 1), 50) };
        if (variablesParam) {
          try {
            parsedVars = JSON.parse(variablesParam);
          } catch {}
        }
        bodyText = JSON.stringify({
          query: queryParam || DEFAULT_ANILIST_GRAPHQL_QUERY,
          variables: parsedVars
        });
      }

      const anilistRes = await proxyAnilistGraphQL(targetUrl, {
        method: "POST",
        headers: forwardHeaders,
        body: bodyText,
        dispatcher
      });

      const anilistCorsHeaders = new Headers(anilistRes.headers);
      anilistCorsHeaders.set("Access-Control-Allow-Origin", "*");
      anilistCorsHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS");
      anilistCorsHeaders.set("Access-Control-Allow-Headers", "*");
      anilistCorsHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return new Response(anilistRes.body, {
        status: anilistRes.status,
        headers: anilistCorsHeaders
      });
    }

    const fetchOptions: any = {
      method: requestMethod,
      headers: forwardHeaders,
      redirect: "follow",
      body: requestBody || undefined
    };
    if (dispatcher) {
      fetchOptions.dispatcher = dispatcher;
    }

    let response = await fetch(targetUrl, fetchOptions);
    if (response.status === 403 || response.status === 500) {
      forwardHeaders.set("Referer", `https://${parsedTargetUrl.host}/`);
      forwardHeaders.set("Origin", `https://${parsedTargetUrl.host}`);
      forwardHeaders.set("X-Requested-With", "XMLHttpRequest");
      response = await fetch(targetUrl, { ...fetchOptions, headers: forwardHeaders });
    }

    const finalTargetUrl = response.url || targetUrl;
    const corsHeaders = new Headers();
    corsHeaders.set("Access-Control-Allow-Origin", "*");
    corsHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS");
    corsHeaders.set("Access-Control-Allow-Headers", "*");
    corsHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Type, Accept-Ranges");

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const isCloudflareBlocked =
      response.status === 403 && response.headers.get("cf-mitigated") === "challenge";
    if (
      isCloudflareBlocked &&
      (isAjax ||
        contentType.includes("json") ||
        (rawReq.headers.get("accept") && rawReq.headers.get("accept").includes("application/json")))
    ) {
      return c.json(
        {
          error: true,
          code: "CLOUDFLARE_CHALLENGE",
          status: 403,
          message: "Cloudflare Turnstile challenge active. A cf_clearance cookie or upstream proxy is required.",
          target_url: targetUrl
        },
        403,
        {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      );
    }

    let isM3u8 =
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      contentType.includes("hls") ||
      finalTargetUrl.toLowerCase().includes(".m3u8");

    const responseHeadersTransfer = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
      "cache-control"
    ];
    for (const h of responseHeadersTransfer) {
      if (h === "content-length" && isM3u8) continue;
      if (response.headers.has(h)) {
        corsHeaders.set(h, response.headers.get(h)!);
      }
    }
    corsHeaders.delete("content-disposition");
    corsHeaders.set("Content-Disposition", "inline");
    corsHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    const acceptHeader = c.req.header("accept") || "";
    const isRaw = c.req.query("raw") === "true";

    if (isM3u8 || contentType.includes("text/plain") || contentType.includes("application/octet-stream")) {
      const resClone = response.clone();
      try {
        const sampleText = await resClone.text();
        if (sampleText.trim().startsWith("#EXTM3U")) {
          isM3u8 = true;
          response = new Response(sampleText, {
            status: response.status,
            headers: response.headers
          });
        }
      } catch (e) {}
    }

    if (isM3u8) {
      const manifestText = await response.text();
      const effectiveReferrer = targetReferrer || referrer || new URL(finalTargetUrl).origin;

      if (acceptHeader.includes("text/html") && !isRaw) {
        const htmlPlayer = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Stream Player</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background-color: #050505; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; color: #fff; overflow: hidden; }
        .player-container { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: #000; }
        video { width: 100%; height: 100%; max-height: 100vh; outline: none; object-fit: contain; }
    </style>
</head>
<body>
    <div class="player-container">
        <video id="video" controls autoplay playsinline></video>
    </div>
    <script>
        const video = document.getElementById('video');
        const rawUrl = new URL(window.location.href);
        rawUrl.searchParams.set('raw', 'true');
        if (Hls.isSupported()) {
            const hls = new Hls({ 
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });
            hls.loadSource(rawUrl.toString());
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play().catch(() => {}); });
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = rawUrl.toString();
            video.addEventListener('loadedmetadata', function() { video.play().catch(() => {}); });
        }
    </script>
</body>
</html>`;
        corsHeaders.set("Content-Type", "text/html; charset=utf-8");
        return new Response(htmlPlayer, { status: 200, headers: corsHeaders });
      }

      if (manifestText.trim().startsWith("#EXTM3U")) {
        const lines = manifestText.split("\n");
        let modifiedLines = lines;
        const LANG_MAP: Record<string, string> = {
          english: "eng", hindi: "hin", japanese: "jpn", tamil: "tam",
          telugu: "tel", malayalam: "mal", kannada: "kan",
          eng: "eng", hin: "hin", jpn: "jpn", tam: "tam",
          tel: "tel", mal: "mal", kan: "kan"
        };
        const targetLangCode = alVal ? LANG_MAP[alVal.toLowerCase()] || alVal.toLowerCase() : "";
        if (targetLangCode) {
          modifiedLines = lines.map((line) => {
            if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
              const matchLang = line.match(/LANGUAGE="([^"]+)"/i);
              const matchName = line.match(/NAME="([^"]+)"/i);
              const langCode = matchLang ? matchLang[1].toLowerCase() : "";
              const langName = matchName ? matchName[1].toLowerCase() : "";
              const isMatch =
                langCode === targetLangCode ||
                langName.includes(targetLangCode) ||
                LANG_MAP[langName] === targetLangCode;
              if (isMatch) {
                return line.replace(/DEFAULT=NO/gi, "DEFAULT=YES").replace(/AUTOSELECT=NO/gi, "AUTOSELECT=YES");
              } else {
                return line.replace(/DEFAULT=YES/gi, "DEFAULT=NO").replace(/AUTOSELECT=YES/gi, "AUTOSELECT=NO");
              }
            }
            return line;
          });
        }

        let lastTag = "";
        const rewrittenLines: string[] = [];

        for (let i = 0; i < modifiedLines.length; i++) {
          const line = modifiedLines[i];
          const trimmedLine = line.trim();
          if (!trimmedLine) {
            rewrittenLines.push(trimmedLine);
            continue;
          }

          const makeAbsoluteUrl = (refPath: string) => {
            if (refPath.startsWith("http://") || refPath.startsWith("https://")) return refPath;
            try {
              return new URL(refPath, finalTargetUrl).toString();
            } catch (e) {
              return refPath;
            }
          };

          if (trimmedLine.startsWith("#")) {
            lastTag = trimmedLine.split(":")[0].toUpperCase();
            if (trimmedLine.includes('URI="')) {
              const rewrittenTag = trimmedLine.replace(/URI="(.*?)"/g, (match, uri) => {
                const absUrl2 = makeAbsoluteUrl(uri);
                const { target: cleanTargetUrl3, referrer: cleanReferrer3 } = extractTargetUrlAndReferrer(
                  absUrl2,
                  effectiveReferrer
                );
                if (cleanTargetUrl3.includes("/proxy?")) return match;

                const isChildPlaylist =
                  cleanTargetUrl3.toLowerCase().includes(".m3u8") ||
                  trimmedLine.includes("TYPE=AUDIO") ||
                  trimmedLine.includes("TYPE=SUBTITLES") ||
                  trimmedLine.includes("TYPE=CLOSED-CAPTIONS");

                if (isChildPlaylist) {
                  let extraParams = "";
                  if (alVal) extraParams += `&al=${encodeURIComponent(alVal)}`;
                  if (!isSegmentProxyEnabled) extraParams += `&seg_proxy=false`;
                  const proxied = formatProxyUrl("", cleanReferrer3, cleanTargetUrl3, isSegmentProxyEnabled);
                  return `URI="${proxied}${extraParams}"`;
                }

                // If segment proxy is turned off, write remote URL directly!
                if (!isSegmentProxyEnabled) {
                  return `URI="${absUrl2}"`;
                }
                return `URI="${formatProxyUrl("", cleanReferrer3, cleanTargetUrl3, true)}"`;
              });
              rewrittenLines.push(rewrittenTag);
              continue;
            }
            rewrittenLines.push(trimmedLine);
            continue;
          }

          const absUrl = makeAbsoluteUrl(trimmedLine);
          const { target: cleanTargetUrl2, referrer: cleanReferrer2 } = extractTargetUrlAndReferrer(
            absUrl,
            effectiveReferrer
          );
          if (cleanTargetUrl2.includes("/proxy?")) {
            rewrittenLines.push(trimmedLine);
            continue;
          }

          const isPlaylistUrl =
            lastTag === "#EXT-X-STREAM-INF" ||
            lastTag === "#EXT-X-I-FRAME-STREAM-INF" ||
            cleanTargetUrl2.toLowerCase().includes(".m3u8") ||
            cleanTargetUrl2.toLowerCase().includes("/m3u8");

          if (isPlaylistUrl) {
            let extraParams = "";
            if (alVal) extraParams += `&al=${encodeURIComponent(alVal)}`;
            if (!isSegmentProxyEnabled) extraParams += `&seg_proxy=false`;
            const proxied = formatProxyUrl("", cleanReferrer2, cleanTargetUrl2, isSegmentProxyEnabled);
            rewrittenLines.push(`${proxied}${extraParams}`);
          } else {
            // Video / audio media segment line (.ts, .m4s, .mp4, etc.)
            if (!isSegmentProxyEnabled) {
              // User requested ?seg_proxy=false: DO NOT PROXY THE SEGMENT!
              rewrittenLines.push(absUrl);
            } else {
              // Default: proxy the segment
              rewrittenLines.push(formatProxyUrl("", cleanReferrer2, cleanTargetUrl2, true));
            }
          }
        }

        corsHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
        corsHeaders.set("Cache-Control", "public, max-age=5");
        return new Response(rewrittenLines.join("\n"), {
          status: response.status,
          headers: corsHeaders
        });
      } else {
        return new Response(manifestText, { status: response.status, headers: corsHeaders });
      }
    }

    const upstreamContentType = (corsHeaders.get("Content-Type") || "").toLowerCase();
    if (!isM3u8) {
      if (finalTargetUrl.includes(".vtt") || finalTargetUrl.includes(".srt")) {
        corsHeaders.set("Content-Type", "text/vtt; charset=utf-8");
      } else if (
        finalTargetUrl.includes("as-cdn") ||
        finalTargetUrl.includes("/p/") ||
        finalTargetUrl.includes(".ts") ||
        finalTargetUrl.includes("/hls2/") ||
        finalTargetUrl.includes("/hls/") ||
        finalTargetUrl.includes("/1080p/") ||
        finalTargetUrl.includes("/720p/") ||
        finalTargetUrl.includes("/360p/") ||
        finalTargetUrl.includes("seg-") ||
        finalTargetUrl.includes("segment") ||
        finalTargetUrl.includes("cloudvideo") ||
        finalTargetUrl.includes("watching.onl") ||
        finalTargetUrl.includes("akirax") ||
        finalTargetUrl.includes("megaplay") ||
        upstreamContentType.includes("video/mp2t") ||
        upstreamContentType.includes("octet-stream") ||
        upstreamContentType.includes("javascript") ||
        upstreamContentType.includes("css")
      ) {
        if (finalTargetUrl.includes(".mp4")) {
          corsHeaders.set("Content-Type", "video/mp4");
        } else if (finalTargetUrl.includes(".aac") || finalTargetUrl.includes(".mp3")) {
          corsHeaders.set("Content-Type", "audio/aac");
        } else {
          corsHeaders.set("Content-Type", "video/mp2t");
        }
      }
    }

    return new Response(response.body, {
      status: response.status,
      headers: corsHeaders
    });
  } catch (err: any) {
    return new Response(`Proxy Connection Failure: ${err.message}`, {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
};

const DEFAULT_ANILIST_GRAPHQL_QUERY = `
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

let cachedAnilistCookies = "";
let cachedAnilistCookieTime = 0;

async function warmAnilistSessionCookies(dispatcher?: any): Promise<string> {
  const now = Date.now();
  if (cachedAnilistCookies && now - cachedAnilistCookieTime < 5 * 60 * 1000) {
    return cachedAnilistCookies;
  }
  try {
    const cfg: any = {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(3000)
    };
    if (dispatcher) cfg.dispatcher = dispatcher;
    const res = await fetch("https://anilist.co/search/anime/trending", cfg);
    const setCookies: string[] =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")!]
        : [];
    const cookiePairs = setCookies
      .map((c) => c.split(";")[0]?.trim())
      .filter(Boolean);
    if (cookiePairs.length > 0) {
      cachedAnilistCookies = cookiePairs.join("; ");
      cachedAnilistCookieTime = now;
    }
  } catch {}
  return cachedAnilistCookies;
}

export const proxyAnilistGraphQL = async (targetUrl: string, options: any = {}): Promise<Response> => {
  const strictTargetUrl = "https://anilist.co/graphql";
  const baseHeaders = new Headers(options.headers || {});
  baseHeaders.set("Content-Type", "application/json");
  baseHeaders.set("Accept", "application/json, text/plain, */*");
  baseHeaders.set("Accept-Language", "en-US,en;q=0.9");
  baseHeaders.set("Origin", "https://anilist.co");
  baseHeaders.set("Referer", "https://anilist.co/search/anime/trending");
  baseHeaders.set("X-Requested-With", "XMLHttpRequest");
  baseHeaders.set("Sec-Fetch-Site", "same-origin");
  baseHeaders.set("Sec-Fetch-Mode", "cors");
  baseHeaders.set("Sec-Fetch-Dest", "empty");
  baseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
  baseHeaders.set("Pragma", "no-cache");
  if (!baseHeaders.has("User-Agent")) {
    baseHeaders.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
  }

  const bodyPayload =
    options.body ||
    JSON.stringify({
      query: DEFAULT_ANILIST_GRAPHQL_QUERY,
      variables: { page: 1, perPage: 20 }
    });

  const dispatcher = options.dispatcher || getProxyAgent(options.proxy || options.upstream_proxy);

  if (!baseHeaders.has("Cookie")) {
    const sessionCookies = await warmAnilistSessionCookies(dispatcher);
    if (sessionCookies) {
      baseHeaders.set("Cookie", sessionCookies);
    }
  }

  const directCfg: any = {
    method: "POST",
    headers: baseHeaders,
    body: bodyPayload,
    redirect: "follow",
    signal: options.signal || AbortSignal.timeout(6000)
  };
  if (dispatcher) directCfg.dispatcher = dispatcher;

  const res = await fetch(strictTargetUrl, directCfg);
  const outHeaders = new Headers(res.headers);
  outHeaders.set("x-proxied-target", strictTargetUrl);
  outHeaders.set("x-anilist-proxy-mode", "strict-anilist-co-graphql");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: outHeaders
  });
};

const proxyApp = new Hono();
proxyApp.all("/proxy", handleProxyRoute);
proxyApp.all("/proxy/*", handleProxyRoute);
proxyApp.all("/", handleProxyRoute);
proxyApp.all("/*", handleProxyRoute);

export const directProxyFetch = async (targetUrl: string, options: any = {}) => {
  let cleanUrl = targetUrl;
  if (cleanUrl.includes("akirax.buzz") || cleanUrl.includes("norami.top")) {
    cleanUrl = cleanUrl.replace(/https?:\/\/(megap\.)?(akirax\.buzz|norami\.top)\//i, "https://fxpy7.watching.onl/anime/");
  }

  if (cleanUrl.includes("anilist.co/graphql")) {
    return proxyAnilistGraphQL(cleanUrl, options);
  }

  const requestMethod = options.method || "GET";
  const forwardHeaders = new Headers(options.headers || {});

  const proxyTraceHeaders = [
    "x-forwarded-for",
    "x-forwarded-proto",
    "x-forwarded-host",
    "x-forwarded-port",
    "x-real-ip",
    "via",
    "forwarded",
    "cf-connecting-ip",
    "cf-worker",
    "cf-ray",
    "cf-visitor",
    "x-cloud-trace-context",
    "x-appengine-country"
  ];
  proxyTraceHeaders.forEach((h) => forwardHeaders.delete(h));

  if (!forwardHeaders.has("User-Agent")) {
    const customUa = options.userAgent || (options.headers && options.headers["User-Agent"]);
    forwardHeaders.set(
      "User-Agent",
      customUa ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    );
  }
  if (!forwardHeaders.has("Accept")) {
    forwardHeaders.set("Accept", "*/*");
  }
  if (!forwardHeaders.has("Accept-Language")) {
    forwardHeaders.set("Accept-Language", "en-US,en;q=0.9");
  }

  forwardHeaders.set("Connection", "keep-alive");
  forwardHeaders.set("Accept-Encoding", "identity");
  forwardHeaders.set("sec-ch-ua", '"Chromium";v="130", "Google Chrome";v="130", "Not-A.Brand";v="99"');
  forwardHeaders.set("sec-ch-ua-mobile", "?0");
  forwardHeaders.set("sec-ch-ua-platform", '"Windows"');
  forwardHeaders.set("Sec-Fetch-Site", "same-origin");
  forwardHeaders.set("Sec-Fetch-Mode", "cors");
  forwardHeaders.set("Sec-Fetch-Dest", "empty");

  if (options.cookie && !forwardHeaders.has("Cookie")) {
    forwardHeaders.set("Cookie", options.cookie);
  }

  const customProxy = options.proxy || options.upstream_proxy;
  const dispatcher = options.dispatcher || getProxyAgent(customProxy);

  const fetchConfig: any = {
    method: requestMethod,
    headers: forwardHeaders,
    redirect: "follow",
    body: options.body || undefined,
    signal: options.signal || undefined
  };
  if (dispatcher) {
    fetchConfig.dispatcher = dispatcher;
  }

  return fetch(cleanUrl, fetchConfig);
};

export default proxyApp;
