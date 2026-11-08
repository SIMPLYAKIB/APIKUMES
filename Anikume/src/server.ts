import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  handleSignup,
  handleLogin,
  handleGetMe,
  handleSaveContinue,
  handleSaveList,
  handleSaveSettings,
  handleChangeUsername,
  handleChangeEmail,
  handleChangePassword,
  handleChangeProfile,
  handleDeleteAccount,
} from "./lib/auth-service";
import {
  handleGetComments,
  handleAddComment,
  handleReactComment,
  handleDeleteComment,
  handleEditComment,
} from "./lib/comments-service";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // Auth endpoints
    if (url.pathname.startsWith("/api/auth/")) {
      const corsHeaders = {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      try {
        const clientIp =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for") ||
          undefined;

        if (url.pathname === "/api/auth/signup" && request.method === "POST") {
          const body = await request.json();
          const result = await handleSignup(body, clientIp);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/login" && request.method === "POST") {
          const body = await request.json();
          const result = await handleLogin(body, clientIp);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/me" && request.method === "GET") {
          const authHeader = request.headers.get("authorization");
          const result = await handleGetMe(authHeader);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/save-continue" && request.method === "POST") {
          const body = await request.json();
          const result = await handleSaveContinue(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/save-list" && request.method === "POST") {
          const body = await request.json();
          const result = await handleSaveList(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/save-settings" && request.method === "POST") {
          const body = await request.json();
          const result = await handleSaveSettings(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/change-username" && request.method === "POST") {
          const body = await request.json();
          const result = await handleChangeUsername(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/change-email" && request.method === "POST") {
          const body = await request.json();
          const result = await handleChangeEmail(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/change-password" && request.method === "POST") {
          const body = await request.json();
          const result = await handleChangePassword(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/change-profile" && request.method === "POST") {
          const body = await request.json();
          const result = await handleChangeProfile(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        if (url.pathname === "/api/auth/delete-account" && request.method === "POST") {
          const body = await request.json();
          const result = await handleDeleteAccount(body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        return new Response(JSON.stringify({ error: "Auth endpoint not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      } catch (authErr: any) {
        return new Response(JSON.stringify({ error: authErr?.message || "Auth server error" }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Comments endpoints
    if (url.pathname.startsWith("/api/comments")) {
      const corsHeaders = {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      try {
        const authHeader = request.headers.get("authorization");

        // GET /api/comments/:mediaId or /api/comments?id=...&ep=...
        if (request.method === "GET") {
          let mediaId = url.searchParams.get("id") || "";
          const epNumStr = url.searchParams.get("ep");
          const epNum = epNumStr ? Number(epNumStr) : undefined;

          if (!mediaId) {
            const parts = url.pathname.replace(/^\/api\/comments\/?/, "").split("/");
            if (parts.length > 0 && parts[0]) {
              mediaId = decodeURIComponent(parts[0]);
            }
          }

          const result = await handleGetComments(mediaId, epNum);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        // POST /api/comments/add
        if (url.pathname === "/api/comments/add" && request.method === "POST") {
          const body = await request.json();
          const result = await handleAddComment(authHeader, body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        // POST /api/comments/react
        if (url.pathname === "/api/comments/react" && request.method === "POST") {
          const body = await request.json();
          const result = await handleReactComment(authHeader, body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        // POST /api/comments/edit
        if (url.pathname === "/api/comments/edit" && request.method === "POST") {
          const body = await request.json();
          const result = await handleEditComment(authHeader, body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        // POST /api/comments/delete
        if (url.pathname === "/api/comments/delete" && request.method === "POST") {
          const body = await request.json();
          const result = await handleDeleteComment(authHeader, body);
          return new Response(JSON.stringify(result.data || { error: result.error }), {
            status: result.status,
            headers: corsHeaders,
          });
        }

        return new Response(JSON.stringify({ error: "Comments endpoint not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      } catch (comErr: any) {
        return new Response(JSON.stringify({ error: comErr?.message || "Comments server error" }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    const isDirectHomeApi = url.pathname === "/anime" && url.searchParams.has("section");
    const isDirectDetailApi =
      /^\/anime\/[^/]+$/.test(url.pathname) &&
      url.searchParams.has("data") &&
      !(request.headers.get("accept") || "").includes("text/html");

    if (
      url.pathname.startsWith("/api/anime") ||
      url.pathname.startsWith("/api/apikume") ||
      isDirectHomeApi ||
      isDirectDetailApi
    ) {
      try {
        if (request.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
              "Access-Control-Allow-Headers": "*",
            },
          });
        }

        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-real-ip") ||
          request.headers.get("forwarded") ||
          request.headers.get("true-client-ip") ||
          "";

        let targetPath = url.pathname;
        if (targetPath.startsWith("/api/apikume")) {
          targetPath = targetPath.replace(/^\/api\/apikume/, "") || "/anime";
        } else if (targetPath.startsWith("/api/anime")) {
          targetPath = targetPath.replace(/^\/api\/anime/, "/anime");
        }
        if (!targetPath.startsWith("/")) {
          targetPath = "/" + targetPath;
        }

        const targetUrl = `https://apikume.onrender.com${targetPath}${url.search}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const proxyHeaders: Record<string, string> = {
          "User-Agent": "AniKume/1.0",
          Accept: "application/json",
        };

        if (clientIp) {
          proxyHeaders["X-Forwarded-For"] = clientIp;
          proxyHeaders["X-Real-IP"] = clientIp;
        }

        const userAgent = request.headers.get("user-agent");
        if (userAgent) {
          proxyHeaders["User-Agent"] = userAgent;
        }

        const apiRes = await fetch(targetUrl, {
          method: "GET",
          headers: proxyHeaders,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (
          apiRes.status === 404 &&
          targetPath === "/anime" &&
          !url.searchParams.has("section")
        ) {
          const fetchSec = async (sec: string, lim: number) => {
            try {
              const r = await fetch(
                `https://apikume.onrender.com/anime?section=${sec}&limit=${lim}`,
                { method: "GET", headers: proxyHeaders },
              );
              if (!r.ok) return [];
              const j: any = await r.json();
              return Array.isArray(j?.results) ? j.results : [];
            } catch {
              return [];
            }
          };
          const [hero, trending, season, popular, top10, upcoming] = await Promise.all([
            fetchSec("hero_slider", 6),
            fetchSec("trending", 20),
            fetchSec("season", 15),
            fetchSec("popular", 15),
            fetchSec("top_10", 10),
            fetchSec("upcoming", 20),
          ]);
          const combinedPayload = {
            heroslider: { total: hero.length, use: "anilist", results: hero },
            trendingnow: { total: trending.length, use: "anilist", results: trending },
            thisseason: { total: season.length, use: "anilist", results: season },
            popular: { total: popular.length, use: "anilist", results: popular },
            top10: { total: top10.length, use: "anilist", results: top10 },
            upcoming: { total: upcoming.length, use: "anilist", results: upcoming },
          };
          return new Response(JSON.stringify(combinedPayload), {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          });
        }

        const data = await apiRes.text();

        return new Response(data, {
          status: apiRes.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || "AniKume API Failed" }), {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    if (url.pathname === "/api/vast" || url.pathname === "/api/vast-proxy") {
      try {
        const rawReq = request;
        if (rawReq.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
              "Access-Control-Allow-Headers": "*",
            },
          });
        }

        const urlObj = new URL(rawReq.url);
        const targetVastUrl =
          urlObj.searchParams.get("url") || urlObj.searchParams.get("tag") || "";

        if (!targetVastUrl) {
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"><Error><![CDATA[Missing url parameter]]></Error></VAST>`,
            {
              status: 400,
              headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
              },
            },
          );
        }

        const decodedTarget = decodeURIComponent(targetVastUrl);
        const clientIp =
          request.headers.get("x-forwarded-for") ||
          request.headers.get("cf-connecting-ip") ||
          "185.220.101.5";
        const clientUa =
          request.headers.get("user-agent") ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

        // Ad networks (such as magsrv.com/ExoClick) block ad calls if Referer is the ad network domain or localhost
        let reqReferer =
          request.headers.get("referer") || request.headers.get("origin") || "https://anikume.cc/";
        if (
          reqReferer.includes("localhost") ||
          reqReferer.includes("127.0.0.1") ||
          reqReferer.includes("magsrv.com") ||
          reqReferer.includes("loyal-product")
        ) {
          reqReferer = "https://anikume.cc/";
        }

        const vastRes = await fetch(decodedTarget, {
          method: "GET",
          headers: {
            "User-Agent": clientUa,
            Accept: "application/xml,text/xml,application/json,text/html,*/*",
            Referer: reqReferer,
            Origin: new URL(reqReferer).origin,
            "X-Forwarded-For": clientIp,
          },
        });

        const vastXmlText = await vastRes.text();

        return new Response(vastXmlText, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      } catch (err: any) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"><Error><![CDATA[${err?.message || "VAST Fetch Failed"}]]></Error></VAST>`,
          {
            status: 500,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
    }

    if (url.pathname === "/api/vast-parse") {
      try {
        const urlObj = new URL(request.url);
        const targetVastUrl = urlObj.searchParams.get("url") || "";

        if (!targetVastUrl) {
          return new Response(JSON.stringify({ success: false, error: "Missing url parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const clientIp =
          request.headers.get("x-forwarded-for") ||
          request.headers.get("cf-connecting-ip") ||
          "185.220.101.5";
        const clientUa =
          request.headers.get("user-agent") ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

        let reqReferer =
          request.headers.get("referer") || request.headers.get("origin") || "https://anikume.cc/";
        if (
          reqReferer.includes("localhost") ||
          reqReferer.includes("127.0.0.1") ||
          reqReferer.includes("magsrv.com") ||
          reqReferer.includes("loyal-product")
        ) {
          reqReferer = "https://anikume.cc/";
        }

        // Fetch recursive VAST resolver (up to 3 hops for Wrappers)
        let currentUrl = decodeURIComponent(targetVastUrl);
        let xmlText = "";
        let finalStatus = 200;
        const impressions: string[] = [];
        const trackingEvents: Record<string, string[]> = {};
        let hops = 0;

        while (currentUrl && hops < 4) {
          hops++;
          const res = await fetch(currentUrl, {
            method: "GET",
            headers: {
              "User-Agent": clientUa,
              Accept: "application/xml,text/xml,application/json,text/html,*/*",
              Referer: reqReferer,
              Origin: new URL(reqReferer).origin,
              "X-Forwarded-For": clientIp,
            },
          });

          finalStatus = res.status;
          xmlText = await res.text();

          // Extract wrapper impressions
          const impRegex = /<Impression[^>]*>([\s\S]*?)<\/Impression>/gi;
          let impM;
          while ((impM = impRegex.exec(xmlText)) !== null) {
            let impUrl = impM[1]
              .replace(/<!\[CDATA\[/g, "")
              .replace(/\]\]>/g, "")
              .trim();
            if (impUrl.includes("http")) {
              impUrl = impUrl.substring(impUrl.indexOf("http"));
              if (!impressions.includes(impUrl)) impressions.push(impUrl);
            }
          }

          // Extract wrapper tracking events
          const trRegex = /<Tracking\s+event="([^"]+)"[^>]*>([\s\S]*?)<\/Tracking>/gi;
          let trM;
          while ((trM = trRegex.exec(xmlText)) !== null) {
            const eventName = trM[1].trim();
            let trUrl = trM[2]
              .replace(/<!\[CDATA\[/g, "")
              .replace(/\]\]>/g, "")
              .trim();
            if (trUrl.includes("http")) {
              trUrl = trUrl.substring(trUrl.indexOf("http"));
              if (!trackingEvents[eventName]) trackingEvents[eventName] = [];
              if (!trackingEvents[eventName].includes(trUrl)) trackingEvents[eventName].push(trUrl);
            }
          }

          // Check if this is a VAST Wrapper
          const wrapperMatch = xmlText.match(/<VASTAdTagURI[^>]*>([\s\S]*?)<\/VASTAdTagURI>/i);
          if (wrapperMatch) {
            let nextUri = wrapperMatch[1]
              .replace(/<!\[CDATA\[/g, "")
              .replace(/\]\]>/g, "")
              .trim();
            if (nextUri.includes("http")) {
              nextUri = nextUri.substring(nextUri.indexOf("http"));
              currentUrl = nextUri;
              continue;
            }
          }

          // If not wrapper or no more hops, break
          break;
        }

        const cleanField = (val?: string) => {
          if (!val) return "";
          return val
            .replace(/<!\[CDATA\[/g, "")
            .replace(/\]\]>/g, "")
            .trim();
        };

        // Extract metadata
        const adSystemMatch = xmlText.match(/<AdSystem[^>]*>([\s\S]*?)<\/AdSystem>/i);
        const adTitleMatch = xmlText.match(/<AdTitle[^>]*>([\s\S]*?)<\/AdTitle>/i);
        const durationMatch = xmlText.match(/<Duration[^>]*>([\s\S]*?)<\/Duration>/i);
        const skipOffsetMatch = xmlText.match(/skipoffset="([^"]+)"/i);
        const clickThroughMatch = xmlText.match(/<ClickThrough[^>]*>([\s\S]*?)<\/ClickThrough>/i);

        // MediaFiles
        const mediaFiles: Array<{
          type: string;
          url: string;
          bitrate?: string;
          width?: string;
          height?: string;
        }> = [];
        const mediaFileRegex = /<MediaFile([^>]*)>([\s\S]*?)<\/MediaFile>/gi;
        let mMatch;
        while ((mMatch = mediaFileRegex.exec(xmlText)) !== null) {
          const attrs = mMatch[1];
          let mediaUrl = cleanField(mMatch[2]);
          if (mediaUrl.includes("http")) {
            mediaUrl = mediaUrl.substring(mediaUrl.indexOf("http"));
          }

          const typeMatch = attrs.match(/type="([^"]+)"/i);
          const bitrateMatch = attrs.match(/bitrate="([^"]+)"/i);
          const widthMatch = attrs.match(/width="([^"]+)"/i);
          const heightMatch = attrs.match(/height="([^"]+)"/i);

          if (mediaUrl.startsWith("http")) {
            mediaFiles.push({
              type: typeMatch ? typeMatch[1] : "video/mp4",
              url: mediaUrl,
              bitrate: bitrateMatch ? bitrateMatch[1] : undefined,
              width: widthMatch ? widthMatch[1] : undefined,
              height: heightMatch ? heightMatch[1] : undefined,
            });
          }
        }

        const adSystem = cleanField(adSystemMatch?.[1]) || "ExoClick / HilltopAds";
        const adTitle = cleanField(adTitleMatch?.[1]) || "Video Ad";
        const duration = cleanField(durationMatch?.[1]) || "00:00:15";
        const skipOffset = skipOffsetMatch ? skipOffsetMatch[1] : "00:00:05";
        const clickThrough = cleanField(clickThroughMatch?.[1]) || null;

        const isEmpty = mediaFiles.length === 0;

        return new Response(
          JSON.stringify({
            success: true,
            isEmpty,
            status: finalStatus,
            adSystem,
            adTitle,
            duration,
            skipOffset,
            clickThrough,
            mediaFiles,
            impressions,
            trackingEvents,
            rawXmlLength: xmlText.length,
            message: isEmpty
              ? "The VAST tag currently returned 0 active media creatives (Ad network returned empty inventory for this geo/device)."
              : undefined,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      } catch (parseErr: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: parseErr?.message || "Failed to parse VAST",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          },
        );
      }
    }

    if (url.pathname === "/proxy") {
      function getRequestOrigin(req: any) {
        const host =
          req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
        if (host.includes("localhost") || host.includes("127.0.0.1")) {
          return `http://${host}`;
        }
        return `https://${host}`;
      }

      try {
        const rawReq = request;
        const urlObj = new URL(rawReq.url);

        // 1. Handle OPTIONS preflight request for CORS headers
        if (rawReq.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS",
              "Access-Control-Allow-Headers": "*",
              "Access-Control-Expose-Headers":
                "Content-Length, Content-Range, Content-Type, Accept-Ranges",
            },
          });
        }

        // 2. Extra robust extraction of 'url' and 'ref' query parameters.
        let refVal = "";
        let urlVal = "";
        let alVal = "";

        try {
          refVal = urlObj.searchParams.get("ref") || "";
          urlVal = urlObj.searchParams.get("url") || "";
          alVal = urlObj.searchParams.get("al") || "";
        } catch (e) {}

        const rawUrlStr = rawReq.url;
        const urlIndex = rawUrlStr.indexOf("url=");
        const refIndex = rawUrlStr.indexOf("ref=");

        if (urlIndex !== -1) {
          if (refIndex !== -1) {
            if (urlIndex > refIndex) {
              const parsedRef = rawUrlStr.substring(refIndex + 4, urlIndex - 1);
              let parsedUrl = rawUrlStr.substring(urlIndex + 4);
              const alIndex = parsedUrl.indexOf("&al=");
              if (alIndex !== -1) {
                parsedUrl = parsedUrl.substring(0, alIndex);
              }
              if (parsedRef) refVal = parsedRef;
              if (parsedUrl) urlVal = parsedUrl;
            } else {
              let parsedUrl = rawUrlStr.substring(urlIndex + 4, refIndex - 1);
              const alIndex = parsedUrl.indexOf("&al=");
              if (alIndex !== -1) {
                parsedUrl = parsedUrl.substring(0, alIndex);
              }
              let parsedRef = rawUrlStr.substring(refIndex + 4);
              const refAlIndex = parsedRef.indexOf("&al=");
              if (refAlIndex !== -1) {
                parsedRef = parsedRef.substring(0, refAlIndex);
              }
              if (parsedUrl) urlVal = parsedUrl;
              if (parsedRef) refVal = parsedRef;
            }
          } else {
            let parsedUrl = rawUrlStr.substring(urlIndex + 4);
            const alIndex = parsedUrl.indexOf("&al=");
            if (alIndex !== -1) {
              parsedUrl = parsedUrl.substring(0, alIndex);
            }
            if (parsedUrl) urlVal = parsedUrl;
          }
        }

        const safeDecodeURL = (str: any) => {
          if (!str) return "";
          let decoded = str;
          for (let i = 0; i < 5; i++) {
            try {
              const next = decodeURIComponent(decoded);
              if (next === decoded) break;
              decoded = next;
            } catch (e) {
              break;
            }
          }
          return decoded;
        };

        const extractTargetUrlAndReferrer = (urlStr: any, defaultReferrer: any): any => {
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
                const innerRef = parsed.searchParams.get("ref") || defaultReferrer;
                return extractTargetUrlAndReferrer(decodedInner, innerRef);
              }
            }
          } catch (e) {}
          return { target: urlStr, referrer: defaultReferrer };
        };

        const { target: cleanTargetUrl, referrer: cleanReferrer } = extractTargetUrlAndReferrer(
          safeDecodeURL(urlVal).trim(),
          safeDecodeURL(refVal).trim(),
        );

        let targetUrl = cleanTargetUrl;
        const referrer = cleanReferrer;

        if (!targetUrl) {
          return new Response("Missing 'url' parameter. Usage: ?ref=REFERRER_URL&url=TARGET_URL", {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }

        if (targetUrl.startsWith("//")) {
          targetUrl = "https:" + targetUrl;
        } else if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
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
        } else {
          if (
            hostname.includes("streamindia.co.in") ||
            hostname.includes("streamable.cloud") ||
            hostname.includes("as-cdn") ||
            hostname.includes("data.streamindia") ||
            hostname.includes("extract.streamindia")
          ) {
            targetReferrer = "https://animerulzx.net/";
            targetOrigin = "https://animerulzx.net";
          } else if (hostname.includes("animeverse.to")) {
            targetReferrer = "https://animeverse.to/";
            targetOrigin = "https://animeverse.to";
          } else if (hostname.includes("allmanga")) {
            targetReferrer = "https://allmanga.to/";
            targetOrigin = "https://allmanga.to";
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
          } else if (
            hostname.includes("kryntal.top") ||
            hostname.includes("kryntal") ||
            hostname.includes("trycloud.pro") ||
            hostname.includes("trycloud") ||
            hostname.includes("megaplay")
          ) {
            targetReferrer = "https://megaplay.buzz/";
            targetOrigin = "https://megaplay.buzz";
          } else if (hostname.includes("megavid")) {
            targetReferrer = "https://megavid.buzz/";
            targetOrigin = "https://megavid.buzz";
          } else {
            targetReferrer = parsedTargetUrl.origin + "/";
            targetOrigin = parsedTargetUrl.origin;
          }
        }

        const safeHeadersToForward = [
          "user-agent",
          "accept",
          "accept-language",
          "sec-ch-ua",
          "sec-ch-ua-mobile",
          "sec-ch-ua-platform",
          "range",
          "content-type",
        ];

        for (const [key, val] of rawReq.headers.entries()) {
          const lowerKey = key.toLowerCase();
          if (safeHeadersToForward.includes(lowerKey)) {
            forwardHeaders.set(key, val);
          }
        }

        if (!forwardHeaders.has("User-Agent")) {
          forwardHeaders.set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

        if (forwardHeaders.get("User-Agent")?.includes("Windows")) {
          if (!forwardHeaders.has("sec-ch-ua")) {
            forwardHeaders.set(
              "sec-ch-ua",
              '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            );
          }
          if (!forwardHeaders.has("sec-ch-ua-mobile")) {
            forwardHeaders.set("sec-ch-ua-mobile", "?0");
          }
          if (!forwardHeaders.has("sec-ch-ua-platform")) {
            forwardHeaders.set("sec-ch-ua-platform", '"Windows"');
          }
        }

        if (targetReferrer) forwardHeaders.set("Referer", targetReferrer);

        // Fix: Only send Origin on state-changing requests, as sending it on GET can trigger 403s
        if (targetOrigin && !["GET", "HEAD"].includes(rawReq.method)) {
          forwardHeaders.set("Origin", targetOrigin);
        }

        // ----------------------------------------------------------------------
        // HIGH-SECURITY NGINX WAF BYPASS
        // Many strict CDNs (like as-cdn21.top) block Cloudflare Workers unless they PERFECTLY mimic a browser's internal video player.
        // ----------------------------------------------------------------------
        if (hostname.includes("as-cdn")) {
          forwardHeaders.set("Sec-Fetch-Site", "same-origin");
          forwardHeaders.set("Sec-Fetch-Mode", "cors");
          forwardHeaders.set("Sec-Fetch-Dest", "empty");
          // Use the provided referer (which comes from the ref parameter)
          if (targetReferrer) {
            forwardHeaders.set("Referer", targetReferrer);
          } else {
            forwardHeaders.set("Referer", `https://${hostname}/`);
          }
        } else {
          forwardHeaders.delete("sec-fetch-site");
          forwardHeaders.delete("sec-fetch-mode");
          forwardHeaders.delete("sec-fetch-dest");
          forwardHeaders.delete("sec-fetch-user");
        }

        const range = rawReq.headers.get("Range");
        if (range) {
          forwardHeaders.set("Range", range);
        }

        const requestMethod = rawReq.method;
        const hasBody = ["POST", "PUT", "PATCH", "DELETE"].includes(requestMethod);
        let requestBody = null;
        if (hasBody) {
          try {
            requestBody = await rawReq.arrayBuffer();
          } catch (e) {}
        }

        // 4. Fetch the target media stream or manifest
        const response = await fetch(targetUrl, {
          method: requestMethod,
          headers: forwardHeaders,
          redirect: "follow",
          body: requestBody || undefined,
        });

        const finalTargetUrl = response.url || targetUrl;

        const corsHeaders = new Headers();
        corsHeaders.set("Access-Control-Allow-Origin", "*");
        corsHeaders.set(
          "Access-Control-Allow-Methods",
          "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS",
        );
        corsHeaders.set("Access-Control-Allow-Headers", "*");
        corsHeaders.set(
          "Access-Control-Expose-Headers",
          "Content-Length, Content-Range, Content-Type, Accept-Ranges",
        );

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        const isM3u8 =
          contentType.includes("mpegurl") || finalTargetUrl.split("?")[0].endsWith(".m3u8");

        const responseHeadersTransfer = [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "last-modified",
          "etag",
          "cache-control",
        ];
        for (const h of responseHeadersTransfer) {
          if (h === "content-length" && isM3u8) {
            continue;
          }
          if (response.headers.has(h)) {
            corsHeaders.set(h, response.headers.get(h) as string);
          }
        }

        // 6. Rewrite HLS Playback manifest (.m3u8)
        if (isM3u8) {
          const manifestText = await response.text();
          const workerOrigin = getRequestOrigin(rawReq);
          const effectiveReferrer = targetReferrer || referrer || new URL(finalTargetUrl).origin;
          const proxyPrefix = `${workerOrigin}/proxy?ref=${encodeURIComponent(effectiveReferrer)}&url=`;

          if (manifestText.startsWith("#EXTM3U")) {
            const lines = manifestText.split("\n");
            let filteredLines = lines;
            if (alVal) {
              filteredLines = lines
                .filter((line) => {
                  if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
                    const matchLang = line.match(/LANGUAGE="([^"]+)"/i);
                    if (matchLang && matchLang[1].toLowerCase() !== alVal.toLowerCase()) {
                      return false;
                    }
                  }
                  return true;
                })
                .map((line) => {
                  if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
                    const matchLang = line.match(/LANGUAGE="([^"]+)"/i);
                    if (matchLang && matchLang[1].toLowerCase() === alVal.toLowerCase()) {
                      return line
                        .replace(/DEFAULT=NO/i, "DEFAULT=YES")
                        .replace(/AUTOSELECT=NO/i, "AUTOSELECT=YES");
                    }
                  }
                  return line;
                });
            }
            const isStrictReferrerCdn =
              finalTargetUrl.includes("trycloud") ||
              finalTargetUrl.includes("kryntal") ||
              finalTargetUrl.includes("as-cdn") ||
              finalTargetUrl.includes("megaplay");
            const proxyAllSegments =
              url.searchParams.get("proxy_segments") === "true" || isStrictReferrerCdn;
            const isSubPlaylist = (u: string) => {
              const clean = u.split("?")[0].toLowerCase();
              return clean.endsWith(".m3u8") || u.includes(".m3u8") || u.includes("playlist");
            };

            const modifiedLines = filteredLines.map((line) => {
              const trimmedLine = line.trim();
              if (!trimmedLine) return trimmedLine;

              const makeAbsoluteUrl = (refPath: string) => {
                if (refPath.startsWith("http://") || refPath.startsWith("https://")) return refPath;
                return new URL(refPath, finalTargetUrl).toString();
              };

              if (trimmedLine.startsWith("#")) {
                if (trimmedLine.includes('URI="')) {
                  return trimmedLine.replace(/URI="(.*?)"/g, (match, uri) => {
                    const absUrl = makeAbsoluteUrl(uri);
                    const { target: cleanTargetUrl, referrer: cleanReferrer } =
                      extractTargetUrlAndReferrer(absUrl, effectiveReferrer);
                    if (cleanTargetUrl.includes(workerOrigin) && cleanTargetUrl.includes("/proxy?"))
                      return match;

                    const isPlaylistOrKey =
                      isSubPlaylist(cleanTargetUrl) ||
                      trimmedLine.includes("#EXT-X-KEY") ||
                      trimmedLine.includes("#EXT-X-MEDIA");

                    if (isPlaylistOrKey || proxyAllSegments) {
                      const segmentProxyPrefix = `${workerOrigin}/proxy?ref=${encodeURIComponent(cleanReferrer)}&url=`;
                      return `URI="${segmentProxyPrefix}${encodeURIComponent(cleanTargetUrl)}"`;
                    }
                    return `URI="${cleanTargetUrl}"`;
                  });
                }
                return trimmedLine;
              }

              const absUrl = makeAbsoluteUrl(trimmedLine);
              const { target: cleanTargetUrl, referrer: cleanReferrer } =
                extractTargetUrlAndReferrer(absUrl, effectiveReferrer);
              if (cleanTargetUrl.includes(workerOrigin) && cleanTargetUrl.includes("/proxy?"))
                return trimmedLine;

              // Only proxy sub-playlists (.m3u8) or when proxy_segments=true is explicitly requested.
              // Direct video segments (.ts, .m4s, .mp4) go directly to the CDN, eliminating 1,000+ Worker invocations.
              if (isSubPlaylist(cleanTargetUrl) || proxyAllSegments) {
                const segmentProxyPrefix = `${workerOrigin}/proxy?ref=${encodeURIComponent(cleanReferrer)}&url=`;
                return `${segmentProxyPrefix}${encodeURIComponent(cleanTargetUrl)}`;
              }

              return cleanTargetUrl;
            });

            corsHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
            corsHeaders.set("Cache-Control", "public, max-age=5");
            return new Response(modifiedLines.join("\n"), {
              status: response.status,
              headers: corsHeaders,
            });
          } else {
            return new Response(manifestText, {
              status: response.status,
              headers: corsHeaders,
            });
          }
        }

        return new Response(response.body, {
          status: response.status,
          headers: corsHeaders,
        });
      } catch (outerErr: any) {
        console.error("OUTER PROXY ERROR:", outerErr);
        return new Response(`Outer Proxy Error: ${outerErr.message}\nStack: ${outerErr.stack}`, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
