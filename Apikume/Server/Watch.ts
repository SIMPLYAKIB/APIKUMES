// @ts-nocheck
import { directProxyFetch } from "./Proxy.js";
import * as crypto from "crypto";
import { REANIME_BASE, FLIXCLOUD_BASE, extractFlixcloudStream, fetchReanimeCandidates } from "./ReAnime.js";
import { getAnikotoCandidates } from "./AniKoto.js";
import { getAnizoneCandidates } from "./AniZone.js";
import { findByAnikumeId, findByTrackerId, mapAnilistToMal, mapMalToAnilist } from "../Ids.js";

import { getAnimeAllMap } from "./AllMap.js";

const MEGAVID_BASE = "https://megavid.buzz";
const MEGAPLAY_BASE = "https://megaplay.buzz";
const PROXY_BASE = "https://minky.anistream.one/fetch";
const WORKER_PROXY_BASE = "https://its.na9714152.workers.dev/";

function wrapWithWorkerProxy(url: string, ref?: string): string {
  if (!url) return "";
  if (url.startsWith(WORKER_PROXY_BASE)) return url;
  const encodedUrl = encodeURIComponent(url);
  if (ref) {
    return `${WORKER_PROXY_BASE}?url=${encodedUrl}&ref=${encodeURIComponent(ref)}`;
  }
  return `${WORKER_PROXY_BASE}?url=${encodedUrl}`;
}

const MEGAPLAY_KEY_SEED = "i?LMTAx0Q6,:}50U";
const MEGAPLAY_IV_SEED = "W0;27ToaUpl_P%'c";

function padBuffer(seed: string, len: number): Buffer {
  const enc = Buffer.from(seed, "utf8");
  const buf = Buffer.alloc(len);
  enc.copy(buf, 0, 0, Math.min(len, enc.length));
  return buf;
}

const megaplayKey = padBuffer(MEGAPLAY_KEY_SEED, 32);
const megaplayIv = padBuffer(MEGAPLAY_IV_SEED, 16);

function decryptMegaplayEnc(encStr: string): string {
  const b64 = encStr.replace(/-/g, "+").replace(/_/g, "/");
  const decipher = crypto.createDecipheriv("aes-256-cbc", megaplayKey, megaplayIv);
  let dec = decipher.update(b64, "base64", "utf8");
  dec += decipher.final("utf8");
  return dec;
}


function extractBalancedObject(str: string, startIndex: number): string | null {
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

function base64ToUint8Array(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function sha256Hex(str: string): Promise<string> {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function extractMegaplayStream(embedUrl: string): Promise<{
  hls?: string;
  tracks?: any[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
} | null> {
  try {
    const proxiedEmbed = wrapWithWorkerProxy(embedUrl);
    let htmlRes: Response | null = await fetch(proxiedEmbed, {
      headers: {
        Referer: `${MEGAPLAY_BASE}/`,
        "User-Agent": UA,
      },
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);

    if (!htmlRes?.ok) {
      htmlRes = await directProxyFetch(embedUrl, {
        headers: {
          Referer: `${MEGAPLAY_BASE}/`,
          "User-Agent": UA,
        },
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);
    }

    if (!htmlRes?.ok) return null;
    const html = await htmlRes.text();
    const dataIdMatch =
      html.match(/id=["']megaplay-player["'][^>]*data-id=["'](\d+)["']/i) ||
      html.match(/data-id=["'](\d+)["'][^>]*id=["']megaplay-player["']/i) ||
      html.match(/data-id=["'](\d+)["']/i);

    if (!dataIdMatch) return null;
    const dataId = dataIdMatch[1];

    const sourcesApiUrl = `${MEGAPLAY_BASE}/stream/getSources?id=${dataId}`;
    const proxiedSources = wrapWithWorkerProxy(sourcesApiUrl);
    let sourcesRes: Response | null = await fetch(proxiedSources, {
      headers: {
        Referer: embedUrl,
        "User-Agent": UA,
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);

    if (!sourcesRes?.ok) {
      sourcesRes = await directProxyFetch(sourcesApiUrl, {
        headers: {
          Referer: embedUrl,
          "User-Agent": UA,
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);
    }

    if (!sourcesRes?.ok) return null;
    const json = await sourcesRes.json().catch(() => null);
    if (!json) return null;

    let rawHls: string | null = null;
    if (json.enc && typeof json.enc === "string") {
      try {
        const dec = decryptMegaplayEnc(json.enc);
        const parsed = JSON.parse(dec);
        rawHls = parsed.file;
      } catch (e) {
        console.error("Failed to decrypt or parse Megaplay enc", e);
      }
    } else if (json.file && typeof json.file === "string") {
      rawHls = json.file;
    } else if (Array.isArray(json.sources) && json.sources[0]?.file) {
      rawHls = json.sources[0].file;
    }

    if (!rawHls) return null;

    return {
      hls: rawHls,
      tracks: Array.isArray(json.tracks) ? json.tracks : [],
      intro: json.intro && typeof json.intro === "object" ? json.intro : undefined,
      outro: json.outro && typeof json.outro === "object" ? json.outro : undefined,
    };
  } catch (e) {
    return null;
  }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const GREEK_LETTERS = [
  "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
  "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi",
  "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"
];

export interface CaptionTrack {
  vtt: string;
  label: string;
  default: boolean;
}

export interface HlsStream {
  source: string;
  refer: string;
  hls?: string;
  mp4?: string;
  caption?: CaptionTrack[];
}

export interface EmbedStream {
  source: string;
  embed: string;
}

export interface AudioStreams {
  hls?: HlsStream[];
  mp4?: HlsStream[];
  embed: EmbedStream[];
  download?: Record<string, Record<string, string>>;
}

export interface DownloadSection {
  sub: Record<string, Record<string, string>>;
  dub: Record<string, Record<string, string>>;
}

export interface WatchResponse {
  sub: AudioStreams;
  dub: AudioStreams;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}
function formatCaptions(tracks: any[]): CaptionTrack[] {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const results: CaptionTrack[] = [];
  for (const t of tracks) {
    if (!t || typeof t !== "object") continue;
    if (t.kind === "thumbnails") continue;
    const file = t.file || t.vtt || t.src || t.url;
    if (file && typeof file === "string") {
      const label = t.label || t.name || t.language || t.srclang || "English";
      const cleanVtt = file.trim();
      const proxiedVtt = wrapWithWorkerProxy(cleanVtt);
      results.push({
        vtt: proxiedVtt,
        label: String(label).trim(),
        default: false,
      });
    }
  }
  if (results.length > 0) {
    results[0].default = true;
  }
  return results;
}

const NOVUS_BASE = "https://novuscloud.buzz";
const NOVUS_SERVERS = ["hd-1", "hd-2", "hd-3", "hd-4"];

function formatNovusCaptions(tracks: any[]): CaptionTrack[] {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const results: CaptionTrack[] = [];
  for (const t of tracks) {
    if (!t || typeof t !== "object") continue;
    if (t.kind === "thumbnails") continue;
    const file = t.file || t.vtt || t.src || t.url;
    if (file && typeof file === "string") {
      const label = t.label || t.name || t.language || t.srclang || "English";
      const cleanVtt = file.trim();
      const fullVtt = cleanVtt.startsWith("http")
        ? cleanVtt
        : `${NOVUS_BASE}${cleanVtt.startsWith("/") ? "" : "/"}${cleanVtt}`;
      results.push({
        vtt: fullVtt,
        label: String(label).trim(),
        default: false,
      });
    }
  }
  if (results.length > 0) {
    results[0].default = true;
  }
  return results;
}

async function extractSingleNovus(
  server: string,
  tracker: string,
  id: number | string,
  ep: string,
  audio: "sub" | "dub"
) {
  const embedUrl = `${NOVUS_BASE}/embed/${server}/${tracker}/${id}/${ep}/${audio}?k=1`;
  const res = await fetch(embedUrl, {
    headers: {
      "User-Agent": UA,
      Referer: `${NOVUS_BASE}/`,
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/var sourcesUrl\s*=\s*['"]([^'"]+)['"]/i);
  if (!match) throw new Error("No sourcesUrl");
  const sourcesUrl = match[1].startsWith("http") ? match[1] : `${NOVUS_BASE}${match[1]}`;
  const sRes = await fetch(sourcesUrl, {
    headers: {
      "User-Agent": UA,
      Referer: embedUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!sRes.ok) throw new Error(`Sources HTTP ${sRes.status}`);
  const json = await sRes.json();
  const rawFile = json.sources?.[0]?.file || json.file;
  if (!rawFile) throw new Error("No file");
  const hls = rawFile.startsWith("http")
    ? rawFile
    : `${NOVUS_BASE}${rawFile.startsWith("/") ? "" : "/"}${rawFile}`;
  return {
    server,
    hls,
    tracks: Array.isArray(json.tracks) ? json.tracks : [],
    intro: json.intro && typeof json.intro === "object" ? json.intro : undefined,
    outro: json.outro && typeof json.outro === "object" ? json.outro : undefined,
    embed: embedUrl,
  };
}

async function extractFastestNovus(
  tracker: string,
  id: number | string,
  ep: string,
  audio: "sub" | "dub"
) {
  try {
    return await Promise.any(
      NOVUS_SERVERS.map((srv) => extractSingleNovus(srv, tracker, id, ep, audio))
    );
  } catch (e) {
    return null;
  }
}

function getDirectEnglishSubtitle(captions?: CaptionTrack[]): string | null {
  if (!captions || captions.length === 0) return null;
  const def = captions.find((c) => c.default);
  if (def) return def.vtt;
  const eng = captions.find((c) => c.label.toLowerCase().includes("english") || c.label.toLowerCase().includes("eng"));
  if (eng) return eng.vtt;
  return captions[0]?.vtt || null;
}

async function resolveAniZipMappings(numericId: number): Promise<{ anilistId?: number; malId?: number }> {
  let anilistId: number | undefined;
  let malId: number | undefined;

  try {
    const [resZipAni, resZipMal] = await Promise.allSettled([
      fetch(`https://api.ani.zip/mappings?anilist_id=${numericId}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(4000),
      }),
      fetch(`https://api.ani.zip/mappings?mal_id=${numericId}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(4000),
      }),
    ]);

    if (resZipAni.status === "fulfilled" && resZipAni.value?.ok) {
      const data = await resZipAni.value.json().catch(() => null);
      if (data?.mappings) {
        if (!anilistId && data.mappings.anilist_id) anilistId = Number(data.mappings.anilist_id);
        if (!malId && data.mappings.mal_id) malId = Number(data.mappings.mal_id);
      }
    }
    if ((!anilistId || !malId) && resZipMal.status === "fulfilled" && resZipMal.value?.ok) {
      const data = await resZipMal.value.json().catch(() => null);
      if (data?.mappings) {
        if (!anilistId && data.mappings.anilist_id) anilistId = Number(data.mappings.anilist_id);
        if (!malId && data.mappings.mal_id) malId = Number(data.mappings.mal_id);
      }
    }
  } catch (e) {}

  if (!anilistId) anilistId = numericId;
  if (!malId) malId = numericId;
  return { anilistId, malId };
}

interface CandidateStream {
  embed: string;
  sourceName?: string;
  fetchHls?: () => Promise<{
    hls?: string;
    tracks?: any[];
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  } | null>;
}

function getStreamDedupeKey(url: string): string {
  try {
    const raw = url.trim();
    const u = new URL(raw);
    const uuidMatch = u.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      return `uuid:${uuidMatch[0].toLowerCase()}`;
    }
    const normalizedHost = u.hostname.replace(/^(fetch|srv|cdn|node|edge|stream)\d+\./i, "");
    return `${normalizedHost}${u.pathname.toLowerCase()}`;
  } catch (e) {
    return url.trim().split("?")[0].toLowerCase();
  }
}

async function fetchMegavidSingleHls(apiUrl: string): Promise<{
  hls: string;
  tracks: any[];
} | null> {
  try {
    let res = await fetch(apiUrl, {
      headers: {
        Referer: `${MEGAVID_BASE}/`,
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);

    if (!res?.ok) {
      res = await directProxyFetch(apiUrl, {
        headers: {
          Referer: `${MEGAVID_BASE}/`,
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);
    }

    if (!res?.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;

    const rawHls = json.source || json.hls || json.file;
    if (rawHls && typeof rawHls === "string") {
      return {
        hls: rawHls.trim(),
        tracks: Array.isArray(json.tracks) ? json.tracks : [],
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function getMegavidCandidates(
  anilistId: number | undefined,
  malId: number | undefined,
  ep: string,
  audio: "sub" | "dub"
): CandidateStream[] {
  const candidates: CandidateStream[] = [];
  if (anilistId) {
    const embed = `${MEGAVID_BASE}/ani/${anilistId}/${ep}/${audio}`;
    candidates.push({
      embed,
      fetchHls: () => fetchMegavidSingleHls(`${MEGAVID_BASE}/ani/${anilistId}/${ep}/${audio}/source`),
    });
  }
  if (malId) {
    const embed = `${MEGAVID_BASE}/mal/${malId}/${ep}/${audio}`;
    candidates.push({
      embed,
      fetchHls: () => fetchMegavidSingleHls(`${MEGAVID_BASE}/mal/${malId}/${ep}/${audio}/source`),
    });
  }
  if (anilistId) {
    const embed = `${MEGAVID_BASE}/aniwave/al/${anilistId}/${ep}/${audio}`;
    candidates.push({
      embed,
      fetchHls: () => fetchMegavidSingleHls(`${MEGAVID_BASE}/aniwave/al/${anilistId}/${ep}/${audio}/source`),
    });
  }
  if (malId) {
    const embed = `${MEGAVID_BASE}/aniwave/mal/${malId}/${ep}/${audio}`;
    candidates.push({
      embed,
      fetchHls: () => fetchMegavidSingleHls(`${MEGAVID_BASE}/aniwave/mal/${malId}/${ep}/${audio}/source`),
    });
  }
  return candidates;
}

const anikotoSeriesCache = new Map<string, { data: any; expiresAt: number }>();

export async function fetchAnikotoSeries(anikotoId: string) {
  const cleanId = String(anikotoId).trim();
  if (!cleanId) return null;
  const cached = anikotoSeriesCache.get(cleanId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  try {
    let res = await fetch(`https://anikotoapi.site/series/${cleanId}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(4500),
    }).catch(() => null);

    if (!res?.ok) {
      res = await directProxyFetch(`https://anikotoapi.site/series/${cleanId}`, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(4500),
      }).catch(() => null);
    }

    if (!res?.ok) return null;
    const json = await res.json().catch(() => null);
    if (json?.ok && json?.data) {
      anikotoSeriesCache.set(cleanId, {
        data: json.data,
        expiresAt: Date.now() + 3600 * 1000,
      });
      return json.data;
    }
  } catch (e) {}
  return null;
}

export function getAnikotoSeriesCandidate(
  seriesData: any,
  ep: string,
  audio: "sub" | "dub"
): CandidateStream | null {
  if (!seriesData?.episodes || !Array.isArray(seriesData.episodes)) return null;
  const cleanEp = String(ep).replace(/^ep-?/i, "").replace(/^anikoto-/i, "").trim();
  const num = parseInt(cleanEp, 10);
  const targetEp =
    seriesData.episodes.find((e: any) => String(e.number) === cleanEp || e.number === num) ||
    seriesData.episodes[num - 1] ||
    null;

  if (!targetEp?.embed_url) return null;
  const embedUrl = audio === "sub" ? targetEp.embed_url.sub : targetEp.embed_url.dub || targetEp.embed_url.sub;
  if (!embedUrl || typeof embedUrl !== "string") return null;

  return {
    sourceName: "E-Gamma",
    embed: embedUrl,
    fetchHls: () => extractMegaplayStream(embedUrl),
  };
}

function getMegaplayCandidates(
  anilistId: number | undefined,
  malId: number | undefined,
  ep: string,
  audio: "sub" | "dub",
  anikotoCandidate?: CandidateStream | null
): CandidateStream[] {
  const candidates: CandidateStream[] = [];
  if (anilistId) {
    const embed = `${MEGAPLAY_BASE}/stream/ani/${anilistId}/${ep}/${audio}`;
    candidates.push({
      sourceName: "E-Alpha",
      embed,
      fetchHls: () => extractMegaplayStream(embed),
    });
  }
  if (malId) {
    const embed = `${MEGAPLAY_BASE}/stream/mal/${malId}/${ep}/${audio}`;
    candidates.push({
      sourceName: "E-Beta",
      embed,
      fetchHls: () => extractMegaplayStream(embed),
    });
  }
  if (anikotoCandidate && anikotoCandidate.embed) {
    candidates.push(anikotoCandidate);
  }
  return candidates;
}

async function processAudioGroup(
  candidates: CandidateStream[],
  referUrl: string,
  audio: "sub" | "dub"
): Promise<{
  hls?: HlsStream[];
  mp4?: HlsStream[];
  embed: EmbedStream[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}> {
  const embedStreams: EmbedStream[] = candidates
    .filter(cand => cand.embed && cand.embed.trim() !== "")
    .map((cand, idx) => ({
    source: cand.sourceName || `E-${GREEK_LETTERS[idx % GREEK_LETTERS.length]}`,
    embed: cand.embed,
  }));

  const hlsResults = await Promise.all(
    candidates.map((cand) => (cand.fetchHls ? cand.fetchHls() : Promise.resolve(null)))
  );

  const finalHls: HlsStream[] = [];
  const finalMp4: HlsStream[] = [];
  const seenUrls = new Set<string>();
  let streamIntro: { start: number; end: number } | undefined;
  let streamOutro: { start: number; end: number } | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const res = hlsResults[i];
    if (!res || !res.hls || typeof res.hls !== "string" || !res.hls.trim()) continue;

    if (!streamIntro && res.intro) streamIntro = res.intro;
    if (!streamOutro && res.outro) streamOutro = res.outro;

    const correspondingEmbed = embedStreams[i];
    const baseSourceName = correspondingEmbed
      ? correspondingEmbed.source.replace(/^E-/, "").replace(/^[HS]-/, "")
      : GREEK_LETTERS[(finalHls.length + finalMp4.length) % GREEK_LETTERS.length];

    const rawUrl = res.hls.trim();
    const dedupeKey = `${baseSourceName}:${getStreamDedupeKey(rawUrl)}`;
    const normUrl = `${baseSourceName}:${rawUrl.split("?")[0].toLowerCase()}`;
    if (seenUrls.has(dedupeKey) || seenUrls.has(normUrl)) continue;

    seenUrls.add(dedupeKey);
    seenUrls.add(normUrl);

    let finalSourceName = baseSourceName;
    let isHardsub = false;

    if (audio === "sub") {
      const captions = formatCaptions(res.tracks || []);
      if (captions.length > 0) {
        finalSourceName = "S-" + baseSourceName;
      } else {
        finalSourceName = "H-" + baseSourceName;
        isHardsub = true;
      }
      if (correspondingEmbed) {
        correspondingEmbed.source = "E-" + baseSourceName;
      }
    } else {
      if (correspondingEmbed) {
        correspondingEmbed.source = "E-" + baseSourceName;
      }
    }

    const isMp4 = rawUrl.toLowerCase().includes(".mp4");
    const streamObj: HlsStream & { _isHardsub?: boolean } = {
      source: finalSourceName,
      refer: referUrl,
      ...(isMp4 ? { mp4: rawUrl } : { hls: rawUrl }),
      _isHardsub: isHardsub
    };

    if (audio === "sub" && !isHardsub) {
      const captions = formatCaptions(res.tracks || []);
      if (captions.length > 0) {
        streamObj.caption = captions;
      }
    }

    if (isMp4) {
      finalMp4.push(streamObj);
    } else {
      finalHls.push(streamObj);
    }
  }

  const sortByHardsub = (a: any, b: any) => {
    if (a._isHardsub && !b._isHardsub) return -1;
    if (!a._isHardsub && b._isHardsub) return 1;
    return 0;
  };

  finalHls.sort(sortByHardsub);
  finalMp4.sort(sortByHardsub);

  embedStreams.sort((a, b) => {
    const aIsH = a.source.startsWith("E-H-");
    const bIsH = b.source.startsWith("E-H-");
    if (aIsH && !bIsH) return -1;
    if (!aIsH && bIsH) return 1;
    return 0;
  });

  finalHls.forEach(s => delete s._isHardsub);
  finalMp4.forEach(s => delete s._isHardsub);

  const result: any = {
    embed: embedStreams,
    intro: streamIntro,
    outro: streamOutro,
  };

  if (finalMp4.length > 0 && finalHls.length === 0) {
    result.mp4 = finalMp4;
  } else {
    result.hls = finalHls;
    if (finalMp4.length > 0) {
      result.mp4 = finalMp4;
    }
  }

  return result;
}

async function fetchAniSkipTimes(
  malId: number | undefined,
  ep: string
): Promise<{ intro: { start: number; end: number }; outro: { start: number; end: number } }> {
  if (!malId) {
    return { intro: { start: 0, end: 0 }, outro: { start: 0, end: 0 } };
  }

  try {
    const cleanEpNum = parseInt(ep, 10) || 1;
    const url = `https://api.aniskip.com/v2/skip-times/${malId}/${cleanEpNum}?types=op&types=ed&episodeLength=0`;
    const res = await directProxyFetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (json?.found && Array.isArray(json.results)) {
        let intro = { start: 0, end: 0 };
        let outro = { start: 0, end: 0 };

        for (const item of json.results) {
          if (item?.skipType === "op" && item?.interval) {
            intro = {
              start: Math.round(Number(item.interval.startTime)) || 0,
              end: Math.round(Number(item.interval.endTime)) || 0,
            };
          } else if (item?.skipType === "ed" && item?.interval) {
            outro = {
              start: Math.round(Number(item.interval.startTime)) || 0,
              end: Math.round(Number(item.interval.endTime)) || 0,
            };
          }
        }
        return { intro, outro };
      }
    }
  } catch (e) {}

  return { intro: { start: 0, end: 0 }, outro: { start: 0, end: 0 } };
}

function extractDownloadQualities(subOrDubObj: any): Record<string, string> | null {
  if (!subOrDubObj) return null;
  const target = subOrDubObj.download || subOrDubObj;
  if (typeof target !== "object" || target === null) return null;
  const qualities: Record<string, string> = {};
  for (const [key, val] of Object.entries(target)) {
    if (typeof val === "string" && val.startsWith("http")) {
      qualities[key] = val;
    }
  }
  return Object.keys(qualities).length > 0 ? qualities : null;
}

/**
 * Downloads from animedl in exact format: { "720p": "...", "1080p": "..." }
 */
async function fetchAnimedlDownloads(
  anilistId: number | undefined,
  malId: number | undefined,
  ep: string
): Promise<DownloadSection> {
  const subDownloads: Record<string, Record<string, string>> = {};
  const dubDownloads: Record<string, Record<string, string>> = {};

  const urlsToTry: string[] = [];
  if (anilistId) urlsToTry.push(`https://animedl.to/api/anilist/${anilistId}/${ep}`);
  if (malId) urlsToTry.push(`https://animedl.to/api/mal/${malId}/${ep}`);

  const tasks = urlsToTry.map(async (url) => {
    try {
      let res: Response | null = null;
      try {
        res = await fetch(url, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json, text/plain, */*",
          },
          signal: AbortSignal.timeout(3500),
        });
      } catch (e) {
        res = null;
      }

      if (!res?.ok) {
        res = await directProxyFetch(url, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json, text/plain, */*",
          },
          signal: AbortSignal.timeout(3500),
        }).catch(() => null);
      }

      if (!res?.ok) return;
      const json = await res.json().catch(() => null);
      if (!json || typeof json !== "object") return;

      for (const [groupKey, groupVal] of Object.entries(json)) {
        if (groupKey === "status" || !groupVal || typeof groupVal !== "object") continue;

        const sDl = extractDownloadQualities((groupVal as any).sub);
        if (sDl && Object.keys(sDl).length > 0) {
          subDownloads[groupKey] = { ...(subDownloads[groupKey] || {}), ...sDl };
        }
        const dDl = extractDownloadQualities((groupVal as any).dub);
        if (dDl && Object.keys(dDl).length > 0) {
          dubDownloads[groupKey] = { ...(dubDownloads[groupKey] || {}), ...dDl };
        }
      }
    } catch (e) {}
  });

  await Promise.allSettled(tasks);

  async function resolveAnimedlLink(url: string) {
    if (url.includes("animedl.to/download/")) {
      const goUrl = url.replace("/download/", "/go/");
      try {
        const fetchRes = await fetch(goUrl, { redirect: "manual" }).catch((e) => {
          console.error("Fetch error:", e.message);
          return null;
        });
        if (fetchRes) {
           const loc = fetchRes.headers.get("location");
           console.log("Resolved", goUrl, "to", loc, "or url", fetchRes.url);
           if (loc) return loc;
           if (fetchRes.url && fetchRes.url !== goUrl) return fetchRes.url;
        }
      } catch (e) {}
    }
    return url;
  }

  const resolveRecord = async (rec: Record<string, Record<string, string>>) => {
    const promises: Promise<void>[] = [];
    for (const group of Object.values(rec)) {
      for (const [quality, url] of Object.entries(group)) {
        promises.push(
          resolveAnimedlLink(url).then((resolved) => {
            group[quality] = resolved;
          })
        );
      }
    }
    await Promise.allSettled(promises);
  };

  await Promise.allSettled([resolveRecord(subDownloads), resolveRecord(dubDownloads)]);

  return { sub: subDownloads, dub: dubDownloads };
}

async function fetchWatchStreams(
  idParam: string,
  epParam: string,
  reqSource?: string
): Promise<WatchResponse> {
  const cleanEp = String(epParam || "1").replace(/^ep-?/i, "").replace(/^anikoto-/i, "").trim() || "1";
  const idStr = String(idParam || "").trim();

  if (!idStr) {
    const err: any = new Error("Missing anime ID parameter.");
    err.status = 400;
    err.code = "MISSING_ID";
    throw err;
  }

  // Strictly default to Anikume ID only - no raw AniList IDs directly accepted
  const dbRecord = await findByAnikumeId(idStr).catch(() => null);
  if (!dbRecord) {
    const err: any = new Error("Anime not found. Only valid Anikume IDs are accepted.");
    err.status = 404;
    err.code = "ANIME_NOT_FOUND";
    throw err;
  }

  const cleanSource = (reqSource || "megaplay").toLowerCase().trim();
  if (cleanSource !== "megaplay" && cleanSource !== "novuscloud") {
    const err: any = new Error("Currently only 'megaplay' and 'novuscloud' sources are available.");
    err.status = 400;
    err.code = "UNSUPPORTED_SOURCE";
    throw err;
  }

  let anilistId: number | undefined = dbRecord.anilist_id ? Number(dbRecord.anilist_id) : undefined;
  let malId: number | undefined = dbRecord.mal_id ? Number(dbRecord.mal_id) : undefined;

  if (anilistId && !malId) {
    const mappedMal = await mapAnilistToMal(String(anilistId)).catch(() => null);
    if (mappedMal) malId = Number(mappedMal);
  } else if (!anilistId && malId) {
    const mappedAni = await mapMalToAnilist(String(malId)).catch(() => null);
    if (mappedAni) anilistId = Number(mappedAni);
  }

  if (cleanSource === "novuscloud") {
    let subStream: any = null;
    let dubStream: any = null;
    let usedTracker: "ani" | "mal" | null = null;

    // 1. Fetch directly with AniList first (fastest way via Promise.any across hd-1 to hd-4)
    if (anilistId) {
      const [aniSub, aniDub] = await Promise.all([
        extractFastestNovus("ani", anilistId, cleanEp, "sub"),
        extractFastestNovus("ani", anilistId, cleanEp, "dub"),
      ]);

      const hasHls = Boolean(aniSub?.hls || aniDub?.hls);
      if (hasHls) {
        subStream = aniSub;
        dubStream = aniDub;
        usedTracker = "ani";
      }
    }

    // 2. If no AniList found or AniList returned no HLS, fall back to MAL
    if (!usedTracker && malId) {
      const [malSub, malDub] = await Promise.all([
        extractFastestNovus("mal", malId, cleanEp, "sub"),
        extractFastestNovus("mal", malId, cleanEp, "dub"),
      ]);

      subStream = malSub;
      dubStream = malDub;
      usedTracker = "mal";
    }

    const trackerToUseForEmbed = usedTracker || (anilistId ? "ani" : "mal");
    const idToUseForEmbed = usedTracker === "mal" ? malId : (anilistId || malId || 0);

    const NOVUS_SERVER_NAMES: Record<string, string> = {
      "hd-1": "NC-1",
      "hd-2": "NC-2",
      "hd-3": "NC-3",
      "hd-4": "NC-4",
    };

    const subEmbedList: EmbedStream[] = NOVUS_SERVERS.map((srv) => {
      const code = NOVUS_SERVER_NAMES[srv] || srv.toUpperCase();
      return {
        source: `E${code}`,
        embed: `${NOVUS_BASE}/embed/${srv}/${trackerToUseForEmbed}/${idToUseForEmbed}/${cleanEp}/sub?k=1`,
      };
    });

    const dubEmbedList: EmbedStream[] = NOVUS_SERVERS.map((srv) => {
      const code = NOVUS_SERVER_NAMES[srv] || srv.toUpperCase();
      return {
        source: `E${code}`,
        embed: `${NOVUS_BASE}/embed/${srv}/${trackerToUseForEmbed}/${idToUseForEmbed}/${cleanEp}/dub?k=1`,
      };
    });

    const subHlsList: HlsStream[] = [];
    if (subStream?.hls) {
      const captions = formatNovusCaptions(subStream.tracks || []);
      const srvKey = (subStream.server || "hd-1").toLowerCase();
      const sourceName = NOVUS_SERVER_NAMES[srvKey] || "NC-1";
      const item: HlsStream = {
        source: sourceName,
        refer: `${NOVUS_BASE}/`,
        hls: wrapWithWorkerProxy(subStream.hls, `${NOVUS_BASE}/`),
      };
      if (captions.length > 0) {
        item.caption = captions;
      }
      subHlsList.push(item);
    }

    const dubHlsList: HlsStream[] = [];
    if (dubStream?.hls) {
      const srvKey = (dubStream.server || "hd-1").toLowerCase();
      const sourceName = NOVUS_SERVER_NAMES[srvKey] || "NC-1";
      dubHlsList.push({
        source: sourceName,
        refer: `${NOVUS_BASE}/`,
        hls: wrapWithWorkerProxy(dubStream.hls, `${NOVUS_BASE}/`),
      });
    }

    const skipTimes = await fetchAniSkipTimes(malId, cleanEp).catch(() => ({
      intro: { start: 0, end: 0 },
      outro: { start: 0, end: 0 },
    }));

    const finalIntro =
      skipTimes.intro && skipTimes.intro.end > 0
        ? skipTimes.intro
        : subStream?.intro || { start: 0, end: 0 };

    const finalOutro =
      skipTimes.outro && skipTimes.outro.end > 0
        ? skipTimes.outro
        : subStream?.outro || { start: 0, end: 0 };

    return {
      sub: {
        hls: subHlsList,
        embed: subEmbedList,
      },
      dub: {
        hls: dubHlsList,
        embed: dubEmbedList,
      },
      intro: finalIntro,
      outro: finalOutro,
    };
  }

  let subStream: any = null;
  let dubStream: any = null;
  let usedTracker: "ani" | "mal" | null = null;

  // 1. Fetch directly with AniList first (no Anikoto)
  if (anilistId) {
    const [aniSub, aniDub] = await Promise.all([
      extractMegaplayStream(`${MEGAPLAY_BASE}/stream/ani/${anilistId}/${cleanEp}/sub`),
      extractMegaplayStream(`${MEGAPLAY_BASE}/stream/ani/${anilistId}/${cleanEp}/dub`),
    ]);

    const hasHls = Boolean(aniSub?.hls || aniDub?.hls);
    if (hasHls) {
      subStream = aniSub;
      dubStream = aniDub;
      usedTracker = "ani";
    }
  }

  // 2. If no AniList found or AniList returned no HLS, fall back to MAL
  if (!usedTracker && malId) {
    const [malSub, malDub] = await Promise.all([
      extractMegaplayStream(`${MEGAPLAY_BASE}/stream/mal/${malId}/${cleanEp}/sub`),
      extractMegaplayStream(`${MEGAPLAY_BASE}/stream/mal/${malId}/${cleanEp}/dub`),
    ]);

    subStream = malSub;
    dubStream = malDub;
    usedTracker = "mal";
  }

  const trackerToUseForEmbed = usedTracker || (anilistId ? "ani" : "mal");
  const idToUseForEmbed = usedTracker === "mal" ? malId : (anilistId || malId || 0);

  const subEmbedUrl = `${MEGAPLAY_BASE}/stream/${trackerToUseForEmbed}/${idToUseForEmbed}/${cleanEp}/sub`;
  const dubEmbedUrl = `${MEGAPLAY_BASE}/stream/${trackerToUseForEmbed}/${idToUseForEmbed}/${cleanEp}/dub`;

  const subHlsList: HlsStream[] = [];
  if (subStream?.hls) {
    const captions = formatCaptions(subStream.tracks || []);
    const item: HlsStream = {
      source: "MG-1",
      refer: `${MEGAPLAY_BASE}/`,
      hls: wrapWithWorkerProxy(subStream.hls, `${MEGAPLAY_BASE}/`),
    };
    if (captions.length > 0) {
      item.caption = captions;
    }
    subHlsList.push(item);
  }

  const dubHlsList: HlsStream[] = [];
  if (dubStream?.hls) {
    const item: HlsStream = {
      source: "MG-1",
      refer: `${MEGAPLAY_BASE}/`,
      hls: wrapWithWorkerProxy(dubStream.hls, `${MEGAPLAY_BASE}/`),
    };
    dubHlsList.push(item);
  }

  const subEmbedList: EmbedStream[] = [
    {
      source: "EMG-1",
      embed: subEmbedUrl,
    },
  ];

  const dubEmbedList: EmbedStream[] = [
    {
      source: "EMG-1",
      embed: dubEmbedUrl,
    },
  ];

  const skipTimes = await fetchAniSkipTimes(malId, cleanEp).catch(() => ({
    intro: { start: 0, end: 0 },
    outro: { start: 0, end: 0 },
  }));

  const finalIntro =
    skipTimes.intro && skipTimes.intro.end > 0
      ? skipTimes.intro
      : subStream?.intro || { start: 0, end: 0 };

  const finalOutro =
    skipTimes.outro && skipTimes.outro.end > 0
      ? skipTimes.outro
      : subStream?.outro || { start: 0, end: 0 };

  return {
    sub: {
      hls: subHlsList,
      embed: subEmbedList,
    },
    dub: {
      hls: dubHlsList,
      embed: dubEmbedList,
    },
    intro: finalIntro,
    outro: finalOutro,
  };
}

export { extractMegaplayStream,
  MEGAVID_BASE,
  MEGAPLAY_BASE,
  REANIME_BASE,
  FLIXCLOUD_BASE,
  PROXY_BASE,
  directProxyFetch,
  extractFlixcloudStream,
  fetchAniSkipTimes,
  fetchAnimedlDownloads,
  fetchReanimeCandidates,
  fetchWatchStreams,
  getDirectEnglishSubtitle,
  resolveAniZipMappings,
};
