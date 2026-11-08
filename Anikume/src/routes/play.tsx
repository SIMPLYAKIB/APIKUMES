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
  Video,
  Info,
  Maximize2,
  Minimize2,
  Tv,
  Share2,
  Radio,
  FileVideo,
  AlertCircle,
  HelpCircle,
  Film,
  Cast,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { toast } from "sonner";
import {
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  Gesture,
  SeekButton,
  GoogleCastButton,
} from "@vidstack/react";
import type { MediaPlayerElement } from "@vidstack/react";
import { DefaultVideoLayout, DefaultTooltip } from "@vidstack/react/player/layouts/default";
import { customVidstackIcons } from "@/lib/vidstack-icons";
import {
  CameraIcon,
  SeekBackward10Icon,
  SeekForward10Icon,
} from "@vidstack/react/icons";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { createClientHlsBlobUrl } from "@/lib/client-hls-loader";

const playSearchSchema = z.object({
  url: fallback(z.string().optional(), "").default(""),
  ref: fallback(z.string().optional(), "").default(""),
  title: fallback(z.string().optional(), "").default(""),
  poster: fallback(z.string().optional(), "").default(""),
  sub: fallback(z.string().optional(), "").default(""),
  type: fallback(z.string().optional(), "").default(""),
  autoplay: fallback(z.boolean().optional(), true).default(true),
});

export const Route = createFileRoute("/play")({
  validateSearch: zodValidator(playSearchSchema),
  head: ({ search }) => ({
    meta: [
      {
        title: search?.title
          ? `${search.title} · HLS Vidstack Player`
          : "HLS Video Player · AniKume",
      },
      {
        name: "description",
        content:
          "Play any HLS (.m3u8), MP4, or video stream using the high-performance Vidstack player.",
      },
    ],
  }),
  component: PlayRoutePage,
});

const PRESET_STREAMS = [
  {
    name: "Kryntal HLS Anime (Megaplay.buzz)",
    url: "https://cdn.kryntal.top/anime/f899139df5e1059396431415e770c6dd/a016c4e5e68816993cb1e3d0a9aa5216/master.m3u8",
    ref: "https://megaplay.buzz/",
    poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80",
    desc: "Direct CDN Kryntal multi-quality master playlist with Megaplay.buzz referer.",
  },
  {
    name: "Big Buck Bunny (HLS Multi-Quality)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    ref: "",
    poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80",
    desc: "Adaptive bitrate master playlist with multiple video resolutions (1080p, 720p, 480p, 360p).",
  },
  {
    name: "Sintel Animated Short (HLS)",
    url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    ref: "",
    poster: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1280&q=80",
    desc: "High quality open-source fantasy short film with surround audio streams.",
  },
  {
    name: "Tears of Steel (HLS Multi-Audio)",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    ref: "",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&q=80",
    desc: "Sci-Fi short film with alternate audio tracks and multi-bitrate profiles.",
  },
  {
    name: "Apple BipBop Test Stream (HLS)",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
    ref: "",
    poster: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&q=80",
    desc: "Standard HLS test stream designed for testing latency and timecode accuracy.",
  },
];

function PlayRoutePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [inputUrl, setInputUrl] = useState(search.url || "");
  const [inputRef, setInputRef] = useState(search.ref || "");
  const [activeUrl, setActiveUrl] = useState(search.url || "");
  const [resolvedBlobUrl, setResolvedBlobUrl] = useState<string>(search.url || "");
  const [videoTitle, setVideoTitle] = useState(search.title || "");
  const [posterUrl, setPosterUrl] = useState(search.poster || "");
  const [subUrl, setSubUrl] = useState(search.sub || "");
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [useMethod4Blob, setUseMethod4Blob] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  // Method 4: In-Memory Client Blob Generation (0 Cloudflare requests)
  useEffect(() => {
    let isMounted = true;
    const clean = (activeUrl || "").trim();
    const cleanLower = clean.split("?")[0].toLowerCase();
    const isHls =
      cleanLower.endsWith(".m3u8") ||
      clean.includes(".m3u8") ||
      clean.includes("hls") ||
      clean.includes("playlist");

    if (useMethod4Blob && isHls && clean && !clean.startsWith("blob:")) {
      createClientHlsBlobUrl(clean, search.ref).then((blobUrl) => {
        if (isMounted) {
          setResolvedBlobUrl(blobUrl);
        }
      });
    } else {
      setResolvedBlobUrl(clean);
    }

    return () => {
      isMounted = false;
    };
  }, [activeUrl, useMethod4Blob, search.ref]);
  const [playerInfo, setPlayerInfo] = useState<{
    duration: number;
    currentTime: number;
    quality: string;
    qualities: string[];
    audioTracks: string[];
    paused: boolean;
  }>({
    duration: 0,
    currentTime: 0,
    quality: "Auto",
    qualities: [],
    audioTracks: [],
    paused: true,
  });

  const playerRef = useRef<MediaPlayerElement>(null);
  const isTakingScreenshot = useRef(false);

  // Sync state when query parameter changes
  useEffect(() => {
    if (search.url !== activeUrl) {
      setActiveUrl(search.url || "");
      setInputUrl(search.url || "");
    }
    if (search.ref !== inputRef) {
      setInputRef(search.ref || "");
    }
    if (search.title !== videoTitle) {
      setVideoTitle(search.title || "");
    }
    if (search.poster !== posterUrl) {
      setPosterUrl(search.poster || "");
    }
    if (search.sub !== subUrl) {
      setSubUrl(search.sub || "");
    }
  }, [search.url, search.ref, search.title, search.poster, search.sub]);

  // Volume and mute preference restoration
  const [volume, setVolume] = useState(() => {
    try {
      const val = localStorage.getItem("global_pref_volume");
      return val !== null ? parseFloat(val) : 1;
    } catch {
      return 1;
    }
  });

  const [muted, setMuted] = useState(() => {
    try {
      const val = localStorage.getItem("global_pref_muted");
      return val !== null ? JSON.parse(val) : false;
    } catch {
      return false;
    }
  });

  // Calculate MIME type and source object
  const mediaSrc = useMemo(() => {
    const target = resolvedBlobUrl || activeUrl;
    if (!target) return "";
    const clean = target.trim();
    if (search.type) {
      return { src: clean, type: search.type as `${string}/${string}` };
    }
    const cleanLower = clean.split("?")[0].toLowerCase();
    if (
      cleanLower.endsWith(".m3u8") ||
      clean.includes(".m3u8") ||
      clean.includes("hls") ||
      clean.includes("playlist") ||
      clean.startsWith("blob:")
    ) {
      return { src: clean, type: "application/x-mpegurl" as const };
    }
    if (cleanLower.endsWith(".mp4")) {
      return { src: clean, type: "video/mp4" as const };
    }
    if (cleanLower.endsWith(".webm")) {
      return { src: clean, type: "video/webm" as const };
    }
    if (cleanLower.endsWith(".ogg") || cleanLower.endsWith(".ogv")) {
      return { src: clean, type: "video/ogg" as const };
    }
    return clean;
  }, [resolvedBlobUrl, activeUrl, search.type]);

  // Handle URL Form Submission
  const handleSubmitUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = inputUrl.trim();
    if (!clean) {
      toast.error("Please enter a stream URL");
      return;
    }

    navigate({
      to: "/play",
      search: {
        url: clean,
        ref: inputRef.trim() || undefined,
        title: videoTitle || undefined,
        poster: posterUrl || undefined,
        sub: subUrl || undefined,
        autoplay: true,
      },
    });
    toast.success("Loading stream into player...");
  };

  const handleSelectPreset = (preset: (typeof PRESET_STREAMS)[0]) => {
    setInputUrl(preset.url);
    setVideoTitle(preset.name);
    setPosterUrl(preset.poster);
    navigate({
      to: "/play",
      search: {
        url: preset.url,
        ref: preset.ref || undefined,
        title: preset.name,
        poster: preset.poster,
        autoplay: true,
      },
    });
    toast.success(`Loaded preset: ${preset.name}`);
  };

  // Screenshot Capture
  const handleTakeScreenshot = useCallback(() => {
    if (isTakingScreenshot.current) return;
    isTakingScreenshot.current = true;
    setTimeout(() => {
      isTakingScreenshot.current = false;
    }, 400);

    try {
      const video =
        (playerRef.current?.el?.querySelector?.("video") as HTMLVideoElement | null) ||
        (playerRef.current?.querySelector?.("video") as HTMLVideoElement | null) ||
        (document.querySelector("media-player video") as HTMLVideoElement | null) ||
        (document.querySelector("video") as HTMLVideoElement | null);

      if (!video) {
        toast.error("Video element not found");
        return;
      }

      if (!video.videoWidth || !video.videoHeight) {
        toast.error("Video frame not ready. Please play the video first.");
        return;
      }

      // Shutter flash effect
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 200);

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        toast.error("Canvas 2D context not supported");
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const currentSec = Math.floor(playerRef.current?.currentTime || video.currentTime || 0);
      const mins = Math.floor(currentSec / 60);
      const secs = (currentSec % 60).toString().padStart(2, "0");
      const safeTitle = (videoTitle || "stream_screenshot")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      const filename = `${safeTitle}_${mins}m${secs}s.png`;

      const triggerDownload = (downloadUrl: string) => {
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      try {
        canvas.toBlob((blob) => {
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            triggerDownload(blobUrl);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            toast.success("Screenshot saved!", {
              description: `${filename} (${canvas.width}×${canvas.height})`,
            });
          } else {
            const dataUrl = canvas.toDataURL("image/png");
            triggerDownload(dataUrl);
            toast.success("Screenshot saved!", {
              description: `${filename} (${canvas.width}×${canvas.height})`,
            });
          }
        }, "image/png");
      } catch {
        try {
          const dataUrl = canvas.toDataURL("image/png");
          triggerDownload(dataUrl);
          toast.success("Screenshot saved!", {
            description: `${filename} (${canvas.width}×${canvas.height})`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "CORS restriction on canvas export";
          toast.error("Screenshot export error: " + msg);
        }
      }
    } catch (err) {
      console.error("Screenshot error:", err);
      toast.error("Failed to capture screenshot");
    }
  }, [videoTitle]);

  // Subscribe to Player State
  useEffect(() => {
    if (!playerRef.current) return;
    return playerRef.current.subscribe(({ currentTime, duration, quality, autoQuality, qualities, audioTracks, paused }: any) => {
      const qHint = quality && !autoQuality ? `${quality.height}p` : autoQuality && quality ? `Auto (${quality.height}p)` : "Auto";
      const qList = qualities ? Array.from(qualities).map((q: any) => `${q.height}p`) : [];
      const aList = audioTracks ? Array.from(audioTracks).map((a: any) => a.label || a.language || "Track") : [];

      setPlayerInfo({
        duration: duration || 0,
        currentTime: currentTime || 0,
        quality: qHint,
        qualities: qList,
        audioTracks: aList,
        paused: !!paused,
      });
    });
  }, [activeUrl]);

  // Copy shareable link
  const handleCopyShareLink = () => {
    if (typeof window === "undefined") return;
    const shareUrl = `${window.location.origin}/play?url=${encodeURIComponent(activeUrl)}${
      videoTitle ? `&title=${encodeURIComponent(videoTitle)}` : ""
    }${posterUrl ? `&poster=${encodeURIComponent(posterUrl)}` : ""}${
      subUrl ? `&sub=${encodeURIComponent(subUrl)}` : ""
    }`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleCopyRawUrl = () => {
    if (!activeUrl) return;
    navigator.clipboard.writeText(activeUrl).then(() => {
      setCopiedUrl(true);
      toast.success("Stream URL copied to clipboard!");
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0c10] text-slate-100">
      <Header />

      <main className="flex-1 pb-16 pt-20">
        <div
          className={`mx-auto px-4 sm:px-6 transition-all duration-300 ${
            isTheaterMode ? "max-w-7xl" : "max-w-6xl"
          }`}
        >
          {/* Top Bar / Breadcrumb Header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 to-orange-500 shadow-md shadow-rose-500/20">
                <Video className="size-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {videoTitle || "HLS Stream Player"}
                </h1>
                <p className="text-xs text-slate-400">
                  Vidstack Multi-Quality Adaptive HLS & Video Stream Engine
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Method 4 In-Memory Blob Engine Switcher */}
              <button
                type="button"
                onClick={() => {
                  const nextVal = !useMethod4Blob;
                  setUseMethod4Blob(nextVal);
                  toast.success(
                    nextVal
                      ? "Switched to Method 4: In-Memory Client Blob (0 Cloudflare requests)"
                      : "Switched to Direct Stream URL Mode",
                  );
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  useMethod4Blob
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-500/10"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
                title="Toggle Method 4 (In-Memory Blob URL / 0 Cloudflare Requests)"
              >
                <Sparkles className="size-3.5 text-emerald-400" />
                <span>Method 4: {useMethod4Blob ? "Active (Blob Memory)" : "Disabled (Direct)"}</span>
              </button>

              {activeUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsTheaterMode(!isTheaterMode)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                    title={isTheaterMode ? "Standard Width" : "Theater Mode"}
                  >
                    {isTheaterMode ? (
                      <>
                        <Minimize2 className="size-3.5" />
                        <span className="hidden sm:inline">Normal</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="size-3.5" />
                        <span className="hidden sm:inline">Theater</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                    title="Copy Shareable Link"
                  >
                    {copiedLink ? <Check className="size-3.5 text-emerald-400" /> : <Share2 className="size-3.5" />}
                    <span className="hidden sm:inline">{copiedLink ? "Copied" : "Share"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTakeScreenshot}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                    title="Capture Screenshot"
                  >
                    <CameraIcon className="size-3.5" />
                    <span className="hidden sm:inline">Snapshot</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Stream Input Card */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-xl backdrop-blur-md">
            <form onSubmit={handleSubmitUrl} className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Radio className="size-4 text-rose-500" />
                  </div>
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="Enter HLS (.m3u8) or video stream URL..."
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 outline-none transition focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                  {inputUrl && (
                    <button
                      type="button"
                      onClick={() => setInputUrl("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="relative md:w-72">
                  <input
                    type="text"
                    value={inputRef}
                    onChange={(e) => setInputRef(e.target.value)}
                    placeholder="Referer (e.g. https://megaplay.buzz/)"
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 px-3.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:brightness-110 active:scale-95"
                  >
                    <Play className="size-4 fill-white" />
                    <span>Play Stream</span>
                  </button>

                  {activeUrl && (
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                      title="Open stream in new tab"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* Player Display Section */}
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
            {activeUrl ? (
              <div
                className="relative aspect-video w-full select-none"
                style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
              >
                <MediaPlayer
                  key={`vidstack-stream-${activeUrl}`}
                  className="size-full overflow-hidden bg-black"
                  title={videoTitle || "Stream Player"}
                  poster={posterUrl || undefined}
                  src={mediaSrc as any}
                  autoPlay={search.autoplay}
                  playsInline={true}
                  volume={volume}
                  muted={muted}
                  load="eager"
                  crossOrigin="anonymous"
                  onVolumeChange={(detail) => {
                    const newMuted = !!detail.muted;
                    const newVolume = typeof detail.volume === "number" ? detail.volume : 1;
                    setMuted((prev: boolean) => (prev !== newMuted ? newMuted : prev));
                    setVolume((prev: number) => (prev !== newVolume ? newVolume : prev));
                    try {
                      localStorage.setItem("global_pref_muted", JSON.stringify(newMuted));
                      localStorage.setItem("global_pref_volume", newVolume.toString());
                    } catch {}
                  }}
                  ref={playerRef}
                >
                  <MediaProvider>
                    <Poster className="vds-poster absolute inset-0 block size-full object-cover bg-black" />
                    {subUrl && (
                      <Track
                        src={subUrl}
                        kind="subtitles"
                        label="English Subtitles"
                        lang="en"
                        type="vtt"
                        default
                      />
                    )}
                  </MediaProvider>

                  <Gesture className="vds-gesture" event="dblpointerup" action="seek:-10" />
                  <Gesture className="vds-gesture" event="dblpointerup" action="seek:10" />

                  {/* Flash Effect on Screenshot */}
                  {isFlashing && (
                    <div className="absolute inset-0 z-50 bg-white/40 pointer-events-none transition-opacity duration-200" />
                  )}

                  <DefaultVideoLayout
                    icons={customVidstackIcons}
                    hideQualityBitrate={false}
                    smallLayoutWhen={({ width, height, fullscreen }) =>
                      !fullscreen && (width < 576 || height < 380)
                    }
                    slots={{
                      largeLayout: {
                        topControlsGroupStart: (
                          <GoogleCastButton className="my-top-cast-btn vds-button pointer-events-auto cursor-pointer">
                            <Cast className="vds-icon size-7 sm:size-8" strokeWidth={2} />
                          </GoogleCastButton>
                        ),
                        beforeCaptionButton: (
                          <>
                            <DefaultTooltip content="Seek Backward 10s" placement="top">
                              <SeekButton
                                seconds={-10}
                                className="vds-seek-button vds-button"
                                aria-label="Seek Backward 10s"
                              >
                                <SeekBackward10Icon className="size-7 sm:size-8" />
                              </SeekButton>
                            </DefaultTooltip>
                            <DefaultTooltip content="Seek Forward 10s" placement="top">
                              <SeekButton
                                seconds={10}
                                className="vds-seek-button vds-button"
                                aria-label="Seek Forward 10s"
                              >
                                <SeekForward10Icon className="size-7 sm:size-8" />
                              </SeekButton>
                            </DefaultTooltip>
                          </>
                        ),
                        afterCaptionButton: (
                          <DefaultTooltip content="Take Screenshot" placement="top">
                            <button
                              type="button"
                              className="vds-button pointer-events-auto cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleTakeScreenshot();
                              }}
                              title="Take Screenshot"
                              aria-label="Take Screenshot"
                            >
                              <CameraIcon className="size-7 sm:size-8" />
                            </button>
                          </DefaultTooltip>
                        ),
                      },
                      smallLayout: {
                        topControlsGroupStart: (
                          <GoogleCastButton className="my-top-cast-btn vds-button pointer-events-auto cursor-pointer">
                            <Cast className="vds-icon size-7 sm:size-8" strokeWidth={2} />
                          </GoogleCastButton>
                        ),
                        afterCaptionButton: (
                          <button
                            type="button"
                            className="vds-button pointer-events-auto cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleTakeScreenshot();
                            }}
                            title="Take Screenshot"
                            aria-label="Take Screenshot"
                          >
                            <CameraIcon className="size-7 sm:size-8" />
                          </button>
                        ),
                      },
                    }}
                  />
                </MediaPlayer>
              </div>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-rose-500 shadow-inner">
                  <Film className="size-8" />
                </div>
                <h2 className="text-lg font-semibold text-white">No Stream URL Selected</h2>
                <p className="mt-1.5 max-w-md text-sm text-slate-400">
                  Enter an HLS stream URL in the input field above, or click one of the quick test presets below to start playback.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {PRESET_STREAMS.slice(0, 2).map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/20 active:scale-95"
                    >
                      <Play className="size-3.5 fill-current text-rose-400" />
                      {p.name.split(" ")[0]} Sample
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active Stream Metadata & Stats Dashboard */}
          {activeUrl && (
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="text-xs font-medium text-slate-400">Stream Status</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {playerInfo.paused ? "Paused / Ready" : "Playing"}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="text-xs font-medium text-slate-400">Position / Duration</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {formatTime(playerInfo.currentTime)} / {formatTime(playerInfo.duration)}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="text-xs font-medium text-slate-400">Active Quality</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {playerInfo.quality || "Auto Adaptive"}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="text-xs font-medium text-slate-400">Stream Engine</div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                  <Sparkles className="size-3.5" />
                  <span>{useMethod4Blob ? "Method 4 (Blob Memory)" : "Direct URL"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="text-xs font-medium text-slate-400">Stream Format</div>
                <div className="mt-1 truncate text-sm font-semibold text-rose-400">
                  {activeUrl.includes(".m3u8") ? "HLS (m3u8)" : "Video Stream"}
                </div>
              </div>
            </div>
          )}

          {/* Presets and Testing Section */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-amber-400" />
                <h3 className="text-base font-semibold text-white">Quick Test HLS Streams</h3>
              </div>
              <span className="text-xs text-slate-400">Click to instantly preview</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PRESET_STREAMS.map((preset) => {
                const isSelected = activeUrl === preset.url;
                return (
                  <div
                    key={preset.name}
                    onClick={() => handleSelectPreset(preset)}
                    className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all duration-200 ${
                      isSelected
                        ? "border-rose-500/50 bg-rose-500/[0.08] shadow-lg shadow-rose-500/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-white group-hover:text-rose-400 transition-colors">
                          {preset.name}
                        </h4>
                        {isSelected && (
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">{preset.desc}</p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-slate-500">
                      <span className="truncate max-w-[240px] font-mono text-[10px] opacity-70">
                        {preset.url}
                      </span>
                      <span className="font-medium text-rose-400 group-hover:underline">Load Stream →</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* URL Parameter Information */}
            <div className="mt-6 rounded-xl border border-white/5 bg-black/40 p-4">
              <div className="flex items-start gap-2.5">
                <Info className="size-4 shrink-0 text-slate-400 mt-0.5" />
                <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-slate-300">Query Parameters supported on /play:</p>
                  <p>
                    <code className="text-rose-400 font-mono">?url=</code>: The HLS (.m3u8) or video stream source URL (required).
                  </p>
                  <p>
                    <code className="text-rose-400 font-mono">?title=</code>: Optional title to display on the video overlay.
                  </p>
                  <p>
                    <code className="text-rose-400 font-mono">?poster=</code>: Optional image URL for the player poster/thumbnail.
                  </p>
                  <p>
                    <code className="text-rose-400 font-mono">?sub=</code>: Optional VTT/subtitle caption URL.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
