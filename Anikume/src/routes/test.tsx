import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Play,
  Copy,
  Check,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Info,
  Radio,
  FileVideo,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Trash2,
  Sliders,
  Terminal,
  ArrowRight,
  RefreshCw,
  Cpu,
  Zap,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { toast } from "sonner";
import {
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  isHLSProvider,
} from "@vidstack/react";
import type { MediaPlayerElement, MediaProviderAdapter } from "@vidstack/react";
import { DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import { customVidstackIcons } from "@/lib/vidstack-icons";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

const testSearchSchema = z.object({
  url: fallback(z.string().optional(), "").default(""),
  ref: fallback(z.string().optional(), "").default(""),
  sub: fallback(z.string().optional(), "").default(""),
  autoplay: fallback(z.boolean().optional(), true).default(true),
  proxy: fallback(z.boolean().optional(), true).default(true),
});

export const Route = createFileRoute("/test")({
  validateSearch: zodValidator(testSearchSchema),
  head: ({ search }) => ({
    meta: [
      {
        title: "Service Worker HLS Stream Proxy Test · AniKume",
      },
      {
        name: "description",
        content:
          "In-browser client-side Service Worker media proxy tester for HLS streams (.m3u8), TS segments, and subtitles with zero server requests.",
      },
    ],
  }),
  component: TestProxyRoutePage,
});

interface InterceptLog {
  id: string;
  url: string;
  ref: string;
  type: "m3u8" | "vtt" | "segment";
  status: number;
  duration: number;
  range?: string | null;
  error?: string;
  timestamp: number;
}

const PRESET_TEST_STREAMS = [
  {
    name: "Big Buck Bunny (M3U8 Multi-Quality)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    ref: "https://mux.com/player-demo",
    sub: "",
    desc: "Adaptive master playlist with multiple video resolutions and TS segments.",
  },
  {
    name: "Sintel Animated Short (M3U8)",
    url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    ref: "https://bitmovin.com/demos",
    sub: "",
    desc: "Akamai CDN stream testing playlist rewrite and direct segment piping.",
  },
  {
    name: "Tears of Steel (M3U8 + Audio Tracks)",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    ref: "https://unified-streaming.com/demo",
    sub: "",
    desc: "Unified Streaming test stream with audio track playlists and range seek.",
  },
  {
    name: "Apple BipBop (16x9 HLS Stream)",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
    ref: "https://developer.apple.com/streaming",
    sub: "",
    desc: "Apple reference stream for latency and buffer seek validation.",
  },
];

function TestProxyRoutePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/test" });

  const playerRef = useRef<MediaPlayerElement>(null);

  // Form State
  const [inputUrl, setInputUrl] = useState(search.url || "");
  const [inputRef, setInputRef] = useState(search.ref || "");
  const [inputSub, setInputSub] = useState(search.sub || "");
  const [useProxy, setUseProxy] = useState(search.proxy !== false);
  const [autoplay, setAutoplay] = useState(search.autoplay !== false);

  // Service Worker State
  const [swStatus, setSwStatus] = useState<"checking" | "registered" | "unsupported" | "error">("checking");
  const [swControllerActive, setSwControllerActive] = useState(false);
  const [swReadyForPlayback, setSwReadyForPlayback] = useState(false);
  const [swMessage, setSwMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Video Handler & Engine State
  const [hlsHandlerActive, setHlsHandlerActive] = useState(false);
  const [hlsEngineStats, setHlsEngineStats] = useState({
    quality: "Auto",
    qualities: [] as string[],
    audioTracks: [] as string[],
    buffered: 0,
    currentTime: 0,
    duration: 0,
    bandwidth: 0,
    live: false,
  });

  // Player error state
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Intercept logs
  const [logs, setLogs] = useState<InterceptLog[]>([]);

  // Register and verify Service Worker on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator)) {
      setSwStatus("unsupported");
      setSwMessage("Service Workers are not supported in this browser environment.");
      setSwReadyForPlayback(true);
      return;
    }

    let isMounted = true;

    async function initServiceWorker() {
      try {
        setSwStatus("checking");
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (isMounted) {
          setSwStatus("registered");
          setSwMessage(`Service Worker registered (Scope: ${registration.scope})`);
        }

        // Wait for ready
        await navigator.serviceWorker.ready;
        if (isMounted) {
          setSwControllerActive(!!navigator.serviceWorker.controller);
          setSwReadyForPlayback(true);
        }

        // If controller changed or newly claimed, update state
        const onControllerChange = () => {
          if (isMounted) {
            setSwControllerActive(!!navigator.serviceWorker.controller);
            setSwReadyForPlayback(true);
            toast.success("Service Worker active and controlling requests!");
          }
        };

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        return () => {
          navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        };
      } catch (err: any) {
        if (isMounted) {
          setSwStatus("error");
          setSwMessage(`Registration error: ${err.message || String(err)}`);
          setSwReadyForPlayback(true);
        }
      }
    }

    initServiceWorker();

    // Listen for messages from sw.js
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "SW_PROXY_INTERCEPT") {
        const item: InterceptLog = {
          id: Math.random().toString(36).substring(2, 9),
          ...event.data.payload,
        };
        setLogs((prev) => [item, ...prev].slice(0, 120));
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSwMessage);

    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, []);

  // Synchronize inputs when query params change
  useEffect(() => {
    setInputUrl(search.url || "");
    setInputRef(search.ref || "");
    setInputSub(search.sub || "");
    setUseProxy(search.proxy !== false);
    setAutoplay(search.autoplay !== false);
    setPlayerError(null);
  }, [search.url, search.ref, search.sub, search.proxy, search.autoplay]);

  // Construct proxied or direct source object with explicit HLS mime type
  const mediaSource = useMemo(() => {
    if (!search.url) return null;
    const cleanUrl = search.url.trim();

    if (!search.proxy) {
      // Direct Mode
      const isM3U8 =
        cleanUrl.endsWith(".m3u8") ||
        cleanUrl.includes(".m3u8") ||
        cleanUrl.includes("playlist");

      return {
        src: cleanUrl,
        type: isM3U8 ? ("application/x-mpegurl" as const) : ("video/mp4" as const),
      };
    }

    // Service Worker Media Proxy Mode
    const cleanLower = cleanUrl.split("?")[0].toLowerCase();
    const isM3U8 =
      cleanLower.endsWith(".m3u8") ||
      cleanUrl.includes(".m3u8") ||
      cleanUrl.includes("playlist");

    let proxyPath = "/sw-proxy/playlist.m3u8";
    if (!isM3U8 && (cleanLower.endsWith(".mp4") || cleanLower.endsWith(".m4s"))) {
      proxyPath = "/sw-proxy/segment.mp4";
    }

    const params = new URLSearchParams();
    params.set("url", cleanUrl);
    if (search.ref) {
      params.set("ref", search.ref.trim());
    }

    const fullProxySrc = `${proxyPath}?${params.toString()}`;

    return {
      src: fullProxySrc,
      type: isM3U8 ? ("application/x-mpegurl" as const) : ("video/mp4" as const),
      rawSrc: fullProxySrc,
    };
  }, [search.url, search.ref, search.proxy]);

  // Client-Side Video Handler for Vidstack & HLS.js
  const handleProviderChange = useCallback(
    (provider: MediaProviderAdapter | null) => {
      if (!provider) {
        setHlsHandlerActive(false);
        return;
      }

      if (isHLSProvider(provider)) {
        setHlsHandlerActive(true);
        logVideoHandler("HLS Provider attached to Vidstack MediaPlayer");

        // Configure client-side video handler & HLS engine
        provider.config = {
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          maxBufferSize: 60 * 1000 * 1000,
          progressive: true,
          // Custom client-side request handler hook
          xhrSetup: (xhr: XMLHttpRequest, requestUrl: string) => {
            // If custom referer exists and is safe, attach client header hint
            if (search.ref) {
              try {
                xhr.setRequestHeader("X-Referer", search.ref);
                xhr.setRequestHeader("X-Origin", search.ref);
              } catch (e) {
                // Ignore restricted header warning
              }
            }
          },
        };
      } else {
        setHlsHandlerActive(false);
      }
    },
    [search.ref]
  );

  // Subscribe to Player telemetry
  useEffect(() => {
    if (!playerRef.current) return;
    return playerRef.current.subscribe(
      ({
        currentTime,
        duration,
        quality,
        autoQuality,
        qualities,
        audioTracks,
        buffered,
        bufferedEnd,
        live,
      }: any) => {
        const qHint =
          quality && !autoQuality
            ? `${quality.height}p`
            : autoQuality && quality
            ? `Auto (${quality.height}p)`
            : "Auto";
        const qList = qualities ? Array.from(qualities).map((q: any) => `${q.height}p`) : [];
        const aList = audioTracks
          ? Array.from(audioTracks).map((a: any) => a.label || a.language || "Track")
          : [];

        let safeBuffered = 0;
        try {
          if (typeof bufferedEnd === "number" && !isNaN(bufferedEnd)) {
            safeBuffered = bufferedEnd;
          } else if (buffered && typeof buffered.length === "number" && buffered.length > 0) {
            safeBuffered = buffered.end(buffered.length - 1);
          }
        } catch {
          safeBuffered = 0;
        }

        setHlsEngineStats({
          quality: qHint,
          qualities: qList,
          audioTracks: aList,
          buffered: safeBuffered,
          currentTime: currentTime || 0,
          duration: duration || 0,
          bandwidth: 0,
          live: !!live,
        });
      }
    );
  }, [mediaSource]);

  const handleLoadStream = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmedUrl = inputUrl.trim();
      if (!trimmedUrl) {
        toast.error("Please enter a valid stream URL");
        return;
      }

      setPlayerError(null);
      navigate({
        search: {
          url: trimmedUrl,
          ref: inputRef.trim(),
          sub: inputSub.trim(),
          proxy: useProxy,
          autoplay: autoplay,
        },
      });

      toast.success("Stream configuration loaded!");
    },
    [inputUrl, inputRef, inputSub, useProxy, autoplay, navigate]
  );

  const handleSelectPreset = (preset: (typeof PRESET_TEST_STREAMS)[0]) => {
    setInputUrl(preset.url);
    setInputRef(preset.ref);
    setInputSub(preset.sub);
    setUseProxy(true);
    setPlayerError(null);

    navigate({
      search: {
        url: preset.url,
        ref: preset.ref,
        sub: preset.sub,
        proxy: true,
        autoplay: true,
      },
    });

    toast.info(`Loaded preset: ${preset.name}`);
  };

  const handleCopyProxyUrl = () => {
    if (!mediaSource?.src) return;
    const fullUrl =
      typeof mediaSource.src === "string"
        ? `${window.location.origin}${mediaSource.src}`
        : `${window.location.origin}${mediaSource.src.src}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success("Copied proxied stream link to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleForceSwClaim = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          toast.success("Service Worker updated! Claiming clients...");
          setSwControllerActive(!!navigator.serviceWorker.controller);
          setSwReadyForPlayback(true);
        }
      }
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
  };

  const hasActiveStream = Boolean(search.url);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-[var(--brand,#df7426)] selection:text-white">
      <Header />

      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 mx-auto max-w-7xl w-full">
        {/* Header Title & Status Bar */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--brand,#df7426)]/10 text-[var(--brand,#df7426)] border border-[var(--brand,#df7426)]/20">
                <Radio className="size-3 animate-pulse" /> Client-Side Media Engine
              </span>
              <span className="text-xs text-muted-foreground font-mono">0 Cloudflare Requests · 100% In-Browser</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">HLS Client-Side Media Proxy Lab</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browser Service Worker intercepts <code className="text-xs px-1.5 py-0.5 rounded bg-card border border-border">/sw-proxy/*</code>, rewrites <code className="text-xs px-1.5 py-0.5 rounded bg-card border border-border">.m3u8</code> segment graphs, and streams directly into Vidstack.
            </p>
          </div>

          {/* Diagnostics Status Badge */}
          <div className="flex items-center gap-3 bg-card/60 border border-border/80 rounded-xl p-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              {swStatus === "registered" && swControllerActive ? (
                <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
              ) : swStatus === "error" || swStatus === "unsupported" ? (
                <ShieldAlert className="size-5 text-rose-400 shrink-0" />
              ) : (
                <RefreshCw className="size-5 text-amber-400 animate-spin shrink-0" />
              )}
              <div className="text-xs">
                <div className="font-semibold flex items-center gap-1.5">
                  SW Proxy:{" "}
                  <span
                    className={
                      swStatus === "registered" && swControllerActive
                        ? "text-emerald-400"
                        : swStatus === "error"
                        ? "text-rose-400"
                        : "text-amber-400"
                    }
                  >
                    {swControllerActive ? "ACTIVE & CONTROLLING" : swStatus.toUpperCase()}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span className={`size-1.5 rounded-full ${hlsHandlerActive ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                  Video Handler: {hlsHandlerActive ? "Vidstack HLS Connected" : "Awaiting Media"}
                </div>
              </div>
            </div>

            <button
              onClick={handleForceSwClaim}
              title="Update & Sync Service Worker"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors ml-1"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Column: Player + Details */}
          <div className="lg:col-span-8 space-y-6">
            {/* Player Container */}
            <div className="relative rounded-2xl overflow-hidden bg-black/95 border border-border shadow-xl aspect-video flex items-center justify-center">
              {hasActiveStream && mediaSource ? (
                !swReadyForPlayback && useProxy ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-center p-6">
                    <RefreshCw className="size-8 text-[var(--brand,#df7426)] animate-spin" />
                    <div className="text-sm font-semibold text-foreground">Initializing Client-Side Video Handler...</div>
                    <div className="text-xs text-muted-foreground">Synchronizing Service Worker interceptor thread</div>
                  </div>
                ) : (
                  <MediaPlayer
                    key={`vidstack-proxy-${search.url}-${search.proxy}`}
                    ref={playerRef}
                    src={mediaSource as any}
                    autoPlay={autoplay}
                    crossOrigin="anonymous"
                    playsInline
                    className="w-full h-full"
                    onProviderChange={handleProviderChange}
                    onError={(err: any) => {
                      const msg =
                        typeof err === "string"
                          ? err
                          : err?.message || (err?.detail?.message ?? "Failed to decode/load video stream");
                      console.error("[Vidstack Player Error]", msg);
                      setPlayerError(msg);
                    }}
                  >
                    <MediaProvider>
                      <Poster
                        className="vds-poster"
                        src="https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80"
                        alt="Stream Poster"
                      />
                      {search.sub && (
                        <Track
                          src={
                            search.proxy
                              ? `/sw-proxy/subtitles.vtt?url=${encodeURIComponent(search.sub)}&ref=${encodeURIComponent(
                                  search.ref || ""
                                )}`
                              : search.sub
                          }
                          kind="subtitles"
                          label="Default Subtitles"
                          lang="en"
                          type="vtt"
                          default
                        />
                      )}
                    </MediaProvider>

                    <DefaultVideoLayout
                      icons={customVidstackIcons}
                      hideQualityBitrate={false}
                      smallLayoutWhen={({ width, height, fullscreen }) =>
                        !fullscreen && (width < 576 || height < 380)
                      }
                    />
                  </MediaPlayer>
                )
              ) : (
                <div className="text-center p-8 max-w-md">
                  <FileVideo className="size-16 mx-auto text-muted-foreground/40 mb-3" />
                  <h3 className="text-lg font-semibold text-foreground">No Stream Loaded</h3>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Enter a target .m3u8 playlist URL or pick a preset stream below to test the zero-server client-side media proxy.
                  </p>
                  <button
                    onClick={() => handleSelectPreset(PRESET_TEST_STREAMS[0])}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--brand,#df7426)] text-white hover:opacity-90 shadow-md transition-all cursor-pointer"
                  >
                    <Play className="size-3.5 fill-current" /> Load Preset Stream
                  </button>
                </div>
              )}
            </div>

            {/* Error Banner if any */}
            {playerError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>Playback issue: {playerError}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setPlayerError(null);
                      navigate({ search: { ...search, proxy: !useProxy } });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold transition-colors"
                  >
                    Try {useProxy ? "Direct Mode" : "SW Proxy Mode"}
                  </button>
                </div>
              </div>
            )}

            {/* Stream Diagnostics Bar */}
            {hasActiveStream && (
              <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      {useProxy ? "Proxied Client-Side via Service Worker" : "Direct Stream (No Proxy)"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {useProxy && (
                      <button
                        onClick={handleCopyProxyUrl}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
                      >
                        {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                        {copied ? "Copied" : "Copy Proxied URL"}
                      </button>
                    )}
                    <a
                      href={search.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="size-3" /> Raw Target
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Effective Player Source:</span>
                    <div className="font-mono text-[11px] p-2 rounded-lg bg-background/80 border border-border/60 break-all select-all">
                      {typeof mediaSource?.src === "string" ? mediaSource.src : mediaSource?.src?.src || "None"}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Original Target URL:</span>
                    <div className="font-mono text-[11px] p-2 rounded-lg bg-background/80 border border-border/60 break-all select-all">
                      {search.url}
                    </div>
                  </div>
                </div>

                {search.ref && (
                  <div className="text-xs space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Spoofed Referer / Context:</span>
                    <div className="font-mono text-[11px] p-2 rounded-lg bg-background/80 border border-border/60 break-all select-all text-amber-400/90">
                      {search.ref}
                    </div>
                  </div>
                )}

                {/* HLS Engine Realtime Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/40 text-xs">
                  <div className="p-2 rounded-lg bg-background/50 border border-border/40">
                    <span className="text-[10px] text-muted-foreground block">Active Quality</span>
                    <span className="font-semibold text-foreground">{hlsEngineStats.quality}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-background/50 border border-border/40">
                    <span className="text-[10px] text-muted-foreground block">Available Tracks</span>
                    <span className="font-semibold text-foreground">
                      {hlsEngineStats.qualities.length > 0 ? `${hlsEngineStats.qualities.length} Resolutions` : "Single Stream"}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-background/50 border border-border/40">
                    <span className="text-[10px] text-muted-foreground block">Buffer Ahead</span>
                    <span className="font-semibold text-foreground">
                      {Math.max(0, hlsEngineStats.buffered - hlsEngineStats.currentTime).toFixed(1)}s
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-background/50 border border-border/40">
                    <span className="text-[10px] text-muted-foreground block">Server Hits</span>
                    <span className="font-semibold text-emerald-400 font-mono">0 (All in Browser)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Live Interception Log Console */}
            <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-[var(--brand,#df7426)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Service Worker Media Traffic Inspector</h3>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted font-mono text-muted-foreground">
                    {logs.length} events
                  </span>
                </div>

                {logs.length > 0 && (
                  <button
                    onClick={() => setLogs([])}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  >
                    <Trash2 className="size-3" /> Clear
                  </button>
                )}
              </div>

              {logs.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
                  No requests intercepted yet. Play the video to capture live playlist rewrites and segment chunks.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded-lg bg-background/90 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            log.type === "m3u8"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : log.type === "vtt"
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {log.type.toUpperCase()}
                        </span>

                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            log.status >= 200 && log.status < 300
                              ? "text-emerald-400"
                              : log.status === 0
                              ? "text-rose-400"
                              : "text-amber-400"
                          }`}
                        >
                          {log.status === 0 ? "BLOCKED/FAIL" : log.status}
                        </span>

                        <span className="truncate text-muted-foreground" title={log.url}>
                          {log.url}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0 sm:self-auto self-end">
                        {log.range && <span className="text-amber-400/80">Range: {log.range}</span>}
                        <span>{log.duration}ms</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Architecture Details */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-2 leading-relaxed text-muted-foreground">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Info className="size-4 text-[var(--brand,#df7426)]" />
                Zero-Server Client-Side Video Architecture:
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>
                  <strong>Direct In-Browser Interception:</strong> All requests to <code className="text-foreground">/sw-proxy/*</code> are captured locally inside the browser's Service Worker before touching any server network.
                </li>
                <li>
                  <strong>HLS Manifest Graph Rewriter:</strong> The Service Worker fetches <code className="text-foreground">.m3u8</code> playlists, resolves all relative paths, sub-playlists, and segment URIs, and transparently routes each segment back through the in-browser interceptor.
                </li>
                <li>
                  <strong>Synthetic CORS & Byte Seeking:</strong> Synthetic <code className="text-foreground">Access-Control-Allow-Origin: *</code> and <code className="text-foreground">Accept-Ranges: bytes</code> headers are generated to satisfy Vidstack's Media Source Extensions (MSE) pipeline.
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Configuration Form & Presets */}
          <div className="lg:col-span-4 space-y-6">
            {/* Stream Config Card */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                <Sliders className="size-4 text-[var(--brand,#df7426)]" />
                <h2 className="text-sm font-bold">Stream Configuration</h2>
              </div>

              <form onSubmit={handleLoadStream} className="space-y-4">
                {/* Target URL Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold flex items-center justify-between text-foreground">
                    Target Stream URL (.m3u8 / .mp4)
                    <span className="text-[10px] text-[var(--brand,#df7426)]">*Required</span>
                  </label>
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://source.com/master.m3u8"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-[var(--brand,#df7426)] focus:outline-hidden transition-colors"
                  />
                </div>

                {/* Referer / Embed URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    Spoofed Referer / Origin
                    <span className="text-[10px] text-muted-foreground">Optional</span>
                  </label>
                  <input
                    type="text"
                    value={inputRef}
                    onChange={(e) => setInputRef(e.target.value)}
                    placeholder="https://original-embed.com/play"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-[var(--brand,#df7426)] focus:outline-hidden transition-colors"
                  />
                </div>

                {/* Subtitles URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    Subtitles URL (.vtt)
                    <span className="text-[10px] text-muted-foreground">Optional</span>
                  </label>
                  <input
                    type="url"
                    value={inputSub}
                    onChange={(e) => setInputSub(e.target.value)}
                    placeholder="https://source.com/subtitles.vtt"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-[var(--brand,#df7426)] focus:outline-hidden transition-colors"
                  />
                </div>

                {/* Toggles */}
                <div className="pt-2 border-t border-border/40 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer text-xs">
                    <span className="text-muted-foreground">Route through Service Worker</span>
                    <input
                      type="checkbox"
                      checked={useProxy}
                      onChange={(e) => setUseProxy(e.target.checked)}
                      className="rounded accent-[var(--brand,#df7426)] size-4 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer text-xs">
                    <span className="text-muted-foreground">Auto-start Playback</span>
                    <input
                      type="checkbox"
                      checked={autoplay}
                      onChange={(e) => setAutoplay(e.target.checked)}
                      className="rounded accent-[var(--brand,#df7426)] size-4 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--brand,#df7426)] hover:opacity-90 text-white shadow-md transition-all active:scale-[0.99] cursor-pointer"
                >
                  <Play className="size-3.5 fill-current" /> Load Stream in Vidstack
                </button>
              </form>
            </div>

            {/* Presets List */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                <Sparkles className="size-4 text-[var(--brand,#df7426)]" />
                <h2 className="text-sm font-bold">Quick Presets</h2>
              </div>

              <div className="space-y-2">
                {PRESET_TEST_STREAMS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className="w-full text-left p-3 rounded-xl bg-background/60 hover:bg-muted/70 border border-border/60 hover:border-[var(--brand,#df7426)]/40 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground group-hover:text-[var(--brand,#df7426)]">
                      <span>{preset.name}</span>
                      <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-tight">
                      {preset.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function logVideoHandler(...args: any[]) {
  console.log(
    "%c[Video-Handler]",
    "background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
    ...args
  );
}
