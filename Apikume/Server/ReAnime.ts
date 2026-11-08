// @ts-nocheck
import { directProxyFetch } from "./Proxy.js";
import * as crypto from "crypto";

export const REANIME_BASE = "https://reanime.to";
export const FLIXCLOUD_BASE = "https://flixcloud.cc";

export function extractBalancedObject(str: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escape = false;
  let start = -1;

  for (let i = startIndex; i < str.length; i++) {
    const c = str[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === stringChar) {
        inString = false;
      }
    } else {
      if (c === '"' || c === "'" || c === "`") {
        inString = true;
        stringChar = c;
      } else if (c === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          return str.substring(start, i + 1);
        }
      }
    }
  }
  return null;
}

export function base64ToUint8Array(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export async function sha256Hex(str: string): Promise<string> {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveFlixFields(seed: string) {
  let e = seed;
  for (let s = 0; s < 3; s++) e = await sha256Hex(e + s.toString());
  let a = e;
  for (let s = 0; s < 3; s++) a = await sha256Hex(a + s.toString());
  return {
    videoField: `vf_${e.substring(0, 8)}`,
    keyField: `kf_${e.substring(8, 16)}`,
    ivField: `ivf_${e.substring(16, 24)}`,
    containerName: `cd_${e.substring(24, 32)}`,
    arrayName: `ad_${e.substring(32, 40)}`,
    objectName: `od_${e.substring(40, 48)}`,
    tokenField: `${e.substring(48, 64)}_${e.substring(56, 64)}`,
    keyFrag2Field: `${a.substring(0, 16)}_${a.substring(16, 24)}`,
  };
}

export function extractFlixCryptoFrags(obfData: any, fields: any): { frag1: string; iv: string } | null {
  try {
    if (!obfData) return null;
    let cdObj = obfData[fields.containerName];
    if (typeof cdObj === "string") cdObj = JSON.parse(cdObj);
    const adArr = cdObj[fields.arrayName];
    const odObj = adArr[0][fields.objectName];
    const keyFrag1 = odObj[fields.keyField];
    const iv = odObj[fields.ivField];
    return { frag1: keyFrag1, iv };
  } catch {
    return null;
  }
}

export async function executeFlixWasm(
  wasmBase64: string,
  keyFrag1: string,
  keyFrag2: string,
  tokenFrag: string,
  vidFrag: string
) {
  try {
    const wasmBytes = base64ToUint8Array(wasmBase64);
    let outBuf: Uint8Array | null = null;
    const mod = await WebAssembly.instantiate(wasmBytes, {
      env: {
        write_out: (ptr: number, len: number) => {
          if (!mod.instance.exports.memory) return;
          const mem = new Uint8Array((mod.instance.exports.memory as WebAssembly.Memory).buffer);
          outBuf = new Uint8Array(mem.slice(ptr, ptr + len));
        },
      },
    });

    const exports = mod.instance.exports as any;
    const mem = new Uint8Array(exports.memory.buffer);
    const wMem = (str: string) => {
      const p = exports.alloc(str.length);
      mem.set(new TextEncoder().encode(str), p);
      return p;
    };
    exports.compute(
      wMem(keyFrag1),
      keyFrag1.length,
      wMem(keyFrag2),
      keyFrag2.length,
      wMem(tokenFrag),
      tokenFrag.length,
      wMem(vidFrag),
      vidFrag.length
    );
    if (!outBuf) return null;
    return new TextDecoder().decode(outBuf);
  } catch (e) {
    return null;
  }
}

export async function extractFlixcloudStream(embedUrl: string): Promise<{
  hls?: string;
  tracks?: any[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
} | null> {
  try {
    const res = await directProxyFetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: `${REANIME_BASE}/`,
      },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!res || !res.ok) return null;
    const html = await res.text();
    const markerIdx = html.indexOf("window.__N_DATA =");
    if (markerIdx === -1) return null;

    const objStr = extractBalancedObject(html, markerIdx);
    if (!objStr) return null;

    const nData = JSON.parse(objStr);
    const fields = await deriveFlixFields(nData.obfuscation_seed);
    const frags = extractFlixCryptoFrags(nData.obfuscated_crypto_data, fields);
    if (!frags) return null;

    const vId = nData.obfuscated_crypto_data[fields.videoField];
    const tokFrag = nData.obfuscated_crypto_data[fields.tokenField];
    const kFrag2 = nData.obfuscated_crypto_data[fields.keyFrag2Field];

    if (!vId || !tokFrag || !kFrag2) return null;

    const R = await executeFlixWasm(nData.w_payload, frags.frag1, kFrag2, tokFrag, vId);
    if (!R) return null;

    const finalR = R.replace(/_$/, "");
    const tokenRef = Buffer.from(finalR, "hex").toString("utf8");
    const tokenApiUrl = `${FLIXCLOUD_BASE}/api/m3u8/${tokenRef}`;

    const apiRes = await directProxyFetch(tokenApiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: embedUrl,
      },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!apiRes || !apiRes.ok) return null;
    const streamData = await apiRes.json().catch(() => null);
    if (!streamData || !streamData.file) return null;

    return {
      hls: streamData.file,
      tracks: streamData.tracks || [],
      intro: streamData.intro,
      outro: streamData.outro,
    };
  } catch {
    return null;
  }
}

export interface CandidateStream {
  embed: string;
  sourceName?: string;
  fetchHls?: () => Promise<{
    hls?: string;
    tracks?: any[];
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  } | null>;
}

export async function fetchReanimeCandidates(
  anilistId: number | undefined,
  ep: string
): Promise<{
  subCandidates: CandidateStream[];
  dubCandidates: CandidateStream[];
  subDownloads: Record<string, Record<string, string>>;
  dubDownloads: Record<string, Record<string, string>>;
}> {
  if (!anilistId) {
    return { subCandidates: [], dubCandidates: [], subDownloads: {}, dubDownloads: {} };
  }

  const url = `${REANIME_BASE}/api/flix/${anilistId}/${ep}`;

  try {
    const res = await directProxyFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: `${REANIME_BASE}/`,
      },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!res?.ok) return { subCandidates: [], dubCandidates: [], subDownloads: {}, dubDownloads: {} };
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.servers)) {
      return { subCandidates: [], dubCandidates: [], subDownloads: {}, dubDownloads: {} };
    }

    const processServers = (dataType: "sub" | "dub") => {
      const servers = data.servers.filter(
        (s: any) => s && s.dataLink && typeof s.dataLink === "string" && s.dataType === dataType
      );

      const v1Servers = servers.filter((s: any) => !s.dataLink.includes("v=2"));
      const v2Servers = servers.filter((s: any) => s.dataLink.includes("v=2"));

      const candidates: CandidateStream[] = [];
      const downloads: Record<string, Record<string, string>> = {};
      const seenDl = new Set<string>();

      let dlIndex = 1;

      // Only fetch v=1 for HLS, and take v=1 only for download
      for (const s of v1Servers) {
        const embedUrl = s.dataLink.trim();

        candidates.push({
          embed: embedUrl,
          fetchHls: () => extractFlixcloudStream(embedUrl),
        });

        // Take v1 url only, remove query string (?v=1) and replace /e/ with /d/
        const cleanDlUrl = embedUrl.split("?")[0].replace(/\/e\//, "/d/");
        if (!seenDl.has(cleanDlUrl)) {
          seenDl.add(cleanDlUrl);
          const dlLabel = `HD-${dlIndex++}`;
          downloads[dlLabel] = { multi: cleanDlUrl };
        }
      }

      // v2 is ONLY added to embed (not fetched for HLS, not added to download)
      for (const s of v2Servers) {
        const embedUrl = s.dataLink.trim();

        candidates.push({
          embed: embedUrl,
        });
      }

      return { candidates, downloads };
    };

    const subRes = processServers("sub");
    const dubRes = processServers("dub");

    return {
      subCandidates: subRes.candidates,
      dubCandidates: dubRes.candidates,
      subDownloads: subRes.downloads,
      dubDownloads: dubRes.downloads,
    };
  } catch {
    return { subCandidates: [], dubCandidates: [], subDownloads: {}, dubDownloads: {} };
  }
}
