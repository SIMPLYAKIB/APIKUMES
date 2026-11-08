import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = process.env.RATE_LIMIT_PER_MINUTE
  ? parseInt(process.env.RATE_LIMIT_PER_MINUTE, 10)
  : 90;

const ipStore = new Map<string, { count: number; resetTime: number }>();

export const requestContextStorage = new AsyncLocalStorage<{
  clientIp: string;
  userAgent?: string;
}>();

// Periodic cleanup of expired rate limit windows
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipStore.entries()) {
    if (now >= record.resetTime) {
      ipStore.delete(ip);
    }
  }
}, 2 * 60 * 1000);

function isPrivateOrLocalIp(ip: string): boolean {
  const trimmed = ip.trim();
  if (!trimmed || trimmed === "::1" || trimmed === "127.0.0.1" || trimmed === "localhost" || trimmed === "unknown") {
    return true;
  }
  return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|169\.254\.|fc00:|fe80:|::ffff:127\.|::ffff:10\.|::ffff:192\.168\.|::ffff:172\.(1[6-9]|2[0-9]|3[0-1])\.)/i.test(
    trimmed
  );
}

function cleanIpString(raw: string): string {
  return raw.trim().replace(/^::ffff:/i, "");
}

function getClientIp(req: any): string {
  const headerCandidates = [
    req.headers?.["cf-connecting-ip"],
    req.headers?.["true-client-ip"],
    req.headers?.["x-client-ip"],
    req.headers?.["x-real-ip"],
    req.headers?.["fastly-client-ip"],
    req.headers?.["x-cluster-client-ip"],
  ];

  for (const cand of headerCandidates) {
    if (typeof cand === "string" && cand.trim()) {
      const cleaned = cleanIpString(cand.split(",")[0]);
      if (cleaned && !isPrivateOrLocalIp(cleaned)) {
        return cleaned;
      }
    }
  }

  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const parts = forwarded
      .split(",")
      .map((p) => cleanIpString(p))
      .filter(Boolean);
    const firstPublic = parts.find((p) => !isPrivateOrLocalIp(p));
    if (firstPublic) return firstPublic;
    if (parts[0]) return parts[0];
  }

  for (const cand of headerCandidates) {
    if (typeof cand === "string" && cand.trim()) {
      return cleanIpString(cand.split(",")[0]);
    }
  }

  const reqIp = typeof req.ip === "string" && req.ip.trim() ? cleanIpString(req.ip) : "";
  if (reqIp && !isPrivateOrLocalIp(reqIp)) return reqIp;

  const sockIp = req.socket?.remoteAddress ? cleanIpString(String(req.socket.remoteAddress)) : "";
  return sockIp || reqIp || "127.0.0.1";
}

function getCurrentClientIp(explicitIp?: string | null): string {
  if (explicitIp && typeof explicitIp === "string" && explicitIp.trim()) {
    const cleaned = cleanIpString(explicitIp.split(",")[0]);
    if (cleaned && cleaned !== "127.0.0.1" && cleaned !== "::1") {
      return cleaned;
    }
  }
  const storeIp = requestContextStorage.getStore()?.clientIp;
  if (storeIp && typeof storeIp === "string" && storeIp.trim()) {
    return cleanIpString(storeIp);
  }
  return explicitIp ? cleanIpString(explicitIp) : "";
}

function clientIpToUuid(clientIp?: string | null, salt: string = "anidub-v1"): string {
  const effectiveIp = getCurrentClientIp(clientIp) || "127.0.0.1";
  const hash = crypto.createHash("sha256").update(`${salt}:${effectiveIp}`).digest("hex");
  const p1 = hash.slice(0, 8);
  const p2 = hash.slice(8, 12);
  const p3 = "4" + hash.slice(13, 16);
  const variantNibble = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  const p4 = variantNibble + hash.slice(17, 20);
  const p5 = hash.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

function buildUserIpHeaders(clientIp?: string | null): Record<string, string> {
  const effectiveIp = getCurrentClientIp(clientIp);
  if (!effectiveIp || effectiveIp === "127.0.0.1" || effectiveIp === "::1") {
    return {};
  }
  return {
    "X-Forwarded-For": effectiveIp,
    "X-Real-IP": effectiveIp,
    "X-Client-IP": effectiveIp,
    Forwarded: `for=${effectiveIp}`,
  };
}

// Wrap globalThis.fetch once so all outbound server API calls forward the user's IP instead of the server IP
const ORIGINAL_FETCH_SYMBOL = Symbol.for("apikume.originalFetch");
if (!(globalThis as any)[ORIGINAL_FETCH_SYMBOL] && typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch.bind(globalThis);
  (globalThis as any)[ORIGINAL_FETCH_SYMBOL] = originalFetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request)?.url || "";

      const isGithubApi =
        urlStr.includes("api.github.com") || urlStr.includes("raw.githubusercontent.com");

      if (urlStr.startsWith("http") && !isGithubApi) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        // Never send Cloudflare-reserved internal headers on outbound requests (causes Cloudflare HTTP 403 error code 1000)
        headers.delete("cf-connecting-ip");
        headers.delete("true-client-ip");

        const existingForwarded = headers.get("x-forwarded-for");
        const activeIp = getCurrentClientIp(existingForwarded);

        if (activeIp && activeIp !== "127.0.0.1" && activeIp !== "::1") {
          if (!headers.has("X-Forwarded-For")) headers.set("X-Forwarded-For", activeIp);
          if (!headers.has("X-Real-IP")) headers.set("X-Real-IP", activeIp);
          if (!headers.has("X-Client-IP")) headers.set("X-Client-IP", activeIp);
          if (!headers.has("Forwarded")) headers.set("Forwarded", `for=${activeIp}`);
        }

        if (urlStr.includes("api.anidub.moe")) {
          if (!headers.has("X-Anidub-Install")) {
            headers.set("X-Anidub-Install", clientIpToUuid(activeIp));
          }
          if (!headers.has("X-Source")) {
            headers.set("X-Source", "extension");
          }
        }

        return await originalFetch(input, { ...init, headers });
      }
    } catch {}
    return originalFetch(input, init);
  };
}

function getRateLimitStatus(clientIp: string) {
  const now = Date.now();
  const record = ipStore.get(clientIp);

  if (!record || now >= record.resetTime) {
    return {
      limit: DEFAULT_MAX_REQUESTS,
      used: 0,
      remaining: DEFAULT_MAX_REQUESTS,
      reset_in_seconds: 60,
      window: "1 minute (60 seconds)",
      status: "active",
      message: `You have ${DEFAULT_MAX_REQUESTS} requests remaining in this 1-minute window.`
    };
  }

  const remaining = Math.max(0, DEFAULT_MAX_REQUESTS - record.count);
  const resetInSeconds = Math.max(0, Math.ceil((record.resetTime - now) / 1000));
  const isBlocked = remaining <= 0;

  return {
    limit: DEFAULT_MAX_REQUESTS,
    used: record.count,
    remaining,
    reset_in_seconds: resetInSeconds,
    window: "1 minute (60 seconds)",
    status: isBlocked ? "rate_limited" : "active",
    message: isBlocked
      ? `Rate limit exceeded! You have 0 requests remaining. Please wait ${resetInSeconds} seconds before making further requests.`
      : `You have ${remaining} requests remaining in this 1-minute window. Rate limit will reset in ${resetInSeconds} seconds.`
  };
}

function rateLimiterMiddleware(req: any, res: any, next: any) {
  const clientIp = getClientIp(req);
  const userAgent = typeof req.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  const now = Date.now();
  let record = ipStore.get(clientIp);

  if (!record || now >= record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    ipStore.set(clientIp, record);
  } else {
    record.count += 1;
  }

  const remaining = Math.max(0, DEFAULT_MAX_REQUESTS - record.count);
  const resetInSeconds = Math.max(0, Math.ceil((record.resetTime - now) / 1000));

  res.setHeader("X-RateLimit-Limit", DEFAULT_MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", resetInSeconds);

  if (record.count > DEFAULT_MAX_REQUESTS) {
    return res.status(429).json({
      error: true,
      code: "RATE_LIMIT_EXCEEDED",
      message: `Rate limit exceeded. Maximum ${DEFAULT_MAX_REQUESTS} requests allowed per minute. You have 0 requests remaining. Try again in ${resetInSeconds} seconds.`,
      limit: DEFAULT_MAX_REQUESTS,
      remaining: 0,
      reset_in_seconds: resetInSeconds,
      window: "1 minute (60 seconds)"
    });
  }

  requestContextStorage.run({ clientIp, userAgent }, () => {
    next();
  });
}

export {
  getClientIp,
  getCurrentClientIp,
  clientIpToUuid,
  buildUserIpHeaders,
  getRateLimitStatus,
  rateLimiterMiddleware,
};
