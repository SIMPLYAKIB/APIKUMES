import React, { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  ExternalLink,
  Sparkles,
  Layers,
  Video,
  Radio,
  Copy,
  Check,
  Tv,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Code2,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MediaPlayer, MediaProvider, Gesture } from "@vidstack/react";
import { DefaultVideoLayout, DefaultTooltip } from "@vidstack/react/player/layouts/default";
import { customVidstackIcons } from "@/lib/vidstack-icons";
import { CameraIcon } from "@vidstack/react/icons";
import type { MediaPlayerElement } from "@vidstack/react";
import "@vidstack/react/player/styles/default/theme.css";

// Zod search params validator for /ads?vast=
const adsSearchSchema = z.object({
  vast: fallback(z.string().optional(), "").default(""),
  video: fallback(z.string().optional(), "").default(""),
  autoplay: fallback(z.boolean().optional(), true).default(true),
  mode: fallback(
    z.enum(["auto", "ima-proxied", "ima-direct", "native"]).optional(),
    "auto",
  ).default("auto"),
});

export const Route = createFileRoute("/ads")({
  validateSearch: zodValidator(adsSearchSchema),
  head: () => ({
    meta: [
      { title: "Vidstack VAST & HilltopAds Player · AniKume" },
      {
        name: "description",
        content:
          "Test Vidstack Player with HilltopAds, Google IMA & VAST Preroll Ads and HLS Video Streams.",
      },
    ],
  }),
  component: AdsPage,
});

/* ── Default Pre-configured URLs ── */
const DEFAULT_USER_VAST_1 =
  "https://loyal-product.com/dbm.FbzJdeGuNmvcZ-GBUS/ieUmq9WuHZSUOlukEP/TYcHzgNlD/kmxXOYTAcOtvNqzPM_0bOLToI/w/MbSMZTsHa/WC1SppdyDy0Ixw";

const DEFAULT_USER_VAST_2 =
  "https://loyal-product.com/dymbFUz/d.G-Ntv/ZmG/UO/OeMmY9SuvZ/UdlwkpPsTCcnzzNBDJkfxpOwT/cdttN/zPMu0dO/TvIJw-M-QW";

const GOOGLE_IMA_SKIPPABLE_VAST =
  "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=";

const GOOGLE_IMA_NON_SKIPPABLE_VAST =
  "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=";

const GOOGLE_IMA_VMAP_VAST =
  "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/vmap_ad_samples&sz=640x480&ciu_szs=300x250&correlator=&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1";

const SAMPLE_HLS_STREAMS = [
  {
    name: "Big Buck Bunny (HLS Multi-Bitrate)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80",
    description: "Adaptive Bitrate HLS Stream with AAC Audio",
  },
  {
    name: "Big Buck Bunny (HTML5 MP4)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80",
    description: "Direct HTML5 Video File (MP4 1080p)",
  },
  {
    name: "Sintel Open Movie (HLS 1080p)",
    url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    poster: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1280&q=80",
    description: "High Quality Animated Fantasy HLS Stream",
  },
  {
    name: "Tears of Steel (HTML5 MP4)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&q=80",
    description: "Direct HTML5 Video File (MP4 1080p)",
  },
  {
    name: "Tears of Steel (HLS HD)",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&q=80",
    description: "Sci-Fi Action Live-Action & VFX Stream",
  },
];

type LogEvent = {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "ad";
  message: string;
  detail?: string;
};

interface ParsedVastData {
  adSystem?: string;
  adTitle?: string;
  duration?: string;
  skipOffset?: string;
  clickThrough?: string | null;
  mediaFiles: Array<{
    type: string;
    url: string;
    bitrate?: string;
    width?: string;
    height?: string;
  }>;
  impressions: string[];
  rawXmlLength?: number;
}

// IMA Interfaces for type safety
interface ImaAdObject {
  getTitle: () => string;
  getDuration: () => number;
  isSkippable: () => boolean;
  getSkipTimeOffset: () => number;
}

interface ImaAdData {
  duration: number;
  currentTime: number;
}

interface ImaAdEvent {
  getAd: () => ImaAdObject;
  getAdData: () => ImaAdData | null;
}

interface ImaErrorObject {
  getMessage: () => string;
  getErrorCode: () => number;
}

interface ImaAdErrorEvent {
  getError: () => ImaErrorObject;
}

interface ImaAdsManager {
  init: (width: number, height: number, viewMode: unknown) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  destroy: () => void;
  setVolume: (volume: number) => void;
  addEventListener: (eventType: unknown, callback: (e: unknown) => void) => void;
}

interface ImaAdsManagerLoadedEvent {
  getAdsManager: (videoElement: unknown, settings: unknown) => ImaAdsManager;
}

interface ImaAdsLoader {
  addEventListener: (
    eventType: unknown,
    callback: (e: unknown) => void,
    useCapture?: boolean,
  ) => void;
  requestAds: (request: unknown) => void;
}

interface ImaDisplayContainer {
  initialize: () => void;
  destroy?: () => void;
}

declare global {
  interface Window {
    google?: {
      ima?: {
        AdDisplayContainer: new (
          container: HTMLElement,
          videoEl?: HTMLVideoElement,
        ) => ImaDisplayContainer;
        AdsLoader: new (container: ImaDisplayContainer) => ImaAdsLoader;
        AdsRequest: new () => {
          adTagUrl: string;
          linearAdSlotWidth: number;
          linearAdSlotHeight: number;
          nonLinearAdSlotWidth: number;
          nonLinearAdSlotHeight: number;
        };
        AdsRenderingSettings: new () => {
          restoreCustomPlaybackStateOnFocus: boolean;
        };
        ViewMode: {
          NORMAL: unknown;
          FULLSCREEN: unknown;
        };
        AdEvent: {
          Type: {
            LOADED: unknown;
            STARTED: unknown;
            AD_PROGRESS: unknown;
            FIRST_QUARTILE: unknown;
            MIDPOINT: unknown;
            THIRD_QUARTILE: unknown;
            SKIPPED: unknown;
            COMPLETE: unknown;
            ALL_ADS_COMPLETED: unknown;
            PAUSED: unknown;
            RESUMED: unknown;
          };
        };
        AdErrorEvent: {
          Type: {
            AD_ERROR: unknown;
          };
        };
        AdsManagerLoadedEvent: {
          Type: {
            ADS_MANAGER_LOADED: unknown;
          };
        };
      };
    };
  }
}

function parseDurationToSeconds(durationStr?: string): number {
  if (!durationStr) return 15;
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 3) {
    return Math.max(1, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
  }
  if (parts.length === 2) {
    return Math.max(1, Math.round(parts[0] * 60 + parts[1]));
  }
  const num = Number(durationStr);
  return isNaN(num) || num <= 0 ? 15 : Math.max(1, Math.round(num));
}

function AdsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  // Determine initial VAST URL from query params or fallback
  const initialVast = search.vast ? search.vast : DEFAULT_USER_VAST_1;
  const [vastTagUrl, setVastTagUrl] = useState(initialVast);
  const [selectedHls, setSelectedHls] = useState(search.video || SAMPLE_HLS_STREAMS[0].url);
  const [engineMode, setEngineMode] = useState<"auto" | "ima-proxied" | "ima-direct" | "native">(
    (search.mode as "auto" | "ima-proxied" | "ima-direct" | "native") || "auto",
  );

  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const [parsedVast, setParsedVast] = useState<ParsedVastData | null>(null);
  const [isRawXmlOpen, setIsRawXmlOpen] = useState(false);
  const [rawXmlText, setRawXmlText] = useState<string>("");

  // Player & Ad States
  const [adState, setAdState] = useState<
    "idle" | "requesting" | "playing" | "completed" | "skipped" | "error"
  >("idle");
  const [adTimeRemaining, setAdTimeRemaining] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const [skipOffsetSeconds, setSkipOffsetSeconds] = useState(5);
  const [skipCountdown, setSkipCountdown] = useState(5);
  const [adTitle, setAdTitle] = useState("Sponsor Video Ad");
  const [clickThroughUrl, setClickThroughUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isAdPaused, setIsAdPaused] = useState(false);
  const [adBlockDetected, setAdBlockDetected] = useState(false);

  // References
  const playerRef = useRef<MediaPlayerElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const adVideoRef = useRef<HTMLVideoElement>(null);
  const imaAdsLoaderRef = useRef<ImaAdsLoader | null>(null);
  const imaAdsManagerRef = useRef<ImaAdsManager | null>(null);
  const imaDisplayContainerRef = useRef<ImaDisplayContainer | null>(null);
  const isImaReadyRef = useRef(false);
  const adCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((type: LogEvent["type"], message: string, detail?: string) => {
    const timeStr = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: timeStr,
        type,
        message,
        detail,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Update query params when vast URL or mode changes
  const applyVastUrl = (url: string, modeOverride?: typeof engineMode) => {
    const newMode = modeOverride || engineMode;
    setVastTagUrl(url);
    if (modeOverride) setEngineMode(modeOverride);
    navigate({
      to: "/ads",
      search: {
        vast: url,
        video: selectedHls,
        autoplay: true,
        mode: newMode,
      },
    });
    addLog("info", `Updated VAST Ad Tag URL (${newMode.toUpperCase()})`, url);
  };

  // Load Google IMA SDK Script dynamically
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.google?.ima) {
      isImaReadyRef.current = true;
      addLog("info", "Google IMA SDK ready.");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
    script.async = true;
    script.onload = () => {
      isImaReadyRef.current = true;
      addLog("success", "Google IMA SDK v3 loaded successfully.");
    };
    script.onerror = () => {
      setAdBlockDetected(true);
      addLog(
        "warning",
        "Google IMA SDK blocked by browser ad blocker. Native VAST engine activated.",
      );
    };
    document.head.appendChild(script);

    return () => {
      if (adCountdownIntervalRef.current) clearInterval(adCountdownIntervalRef.current);
    };
  }, [addLog]);

  // Clean up any existing IMA AdsManager
  const destroyIma = () => {
    if (adCountdownIntervalRef.current) {
      clearInterval(adCountdownIntervalRef.current);
      adCountdownIntervalRef.current = null;
    }
    if (imaAdsManagerRef.current) {
      try {
        imaAdsManagerRef.current.destroy();
      } catch (err) {
        console.warn("Error destroying ima manager:", err);
      }
      imaAdsManagerRef.current = null;
    }
  };

  // Start Playing Main Video Content
  const playMainContent = useCallback(() => {
    destroyIma();
    setAdState("completed");
    addLog("success", "Preroll ad finished / bypassed. Starting main HLS stream in Vidstack.");

    if (playerRef.current) {
      try {
        playerRef.current.play().catch((err: unknown) => {
          console.warn("Vidstack play interrupted:", err);
        });
      } catch (err) {
        console.warn("Vidstack play error:", err);
      }
    }
  }, [addLog]);

  // Native VAST Player Engine (Parses HilltopAds / VAST 3.0 on server & plays direct MP4 creative)
  const runNativeVast = useCallback(
    async (tagUrl: string) => {
      addLog("info", "Running Native Smart VAST Handler", tagUrl);
      setAdState("requesting");

      try {
        // Fetch parsed VAST metadata from server-side endpoint
        const parseRes = await fetch(`/api/vast-parse?url=${encodeURIComponent(tagUrl)}`);
        if (!parseRes.ok) {
          throw new Error(`Server returned HTTP ${parseRes.status}`);
        }

        const data: ParsedVastData & { success: boolean; error?: string } = await parseRes.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to parse VAST XML");
        }

        setParsedVast(data);
        addLog(
          "success",
          `VAST Parsed: System '${data.adSystem || "HilltopAds"}', Title '${data.adTitle || "Ad"}', ${data.mediaFiles.length} MediaFiles`,
        );

        // Fetch raw XML text for developer inspection
        fetch(`/api/vast-proxy?url=${encodeURIComponent(tagUrl)}`)
          .then((r) => r.text())
          .then((txt) => setRawXmlText(txt))
          .catch(() => {});

        // Fire impression tracking beacons
        if (data.impressions && data.impressions.length > 0) {
          data.impressions.forEach((impUrl) => {
            try {
              const beaconImg = new Image();
              beaconImg.src = impUrl;
            } catch (bErr) {
              console.warn("Impression beacon ping:", bErr);
            }
          });
          addLog("ad", `Fired ${data.impressions.length} VAST Impression beacon(s).`);
        }

        // Determine best playable media file (prefer MP4, fallback to WebM)
        let chosenMedia = data.mediaFiles.find(
          (m) => m.type.includes("mp4") || m.url.endsWith(".mp4"),
        );
        if (!chosenMedia && data.mediaFiles.length > 0) {
          chosenMedia = data.mediaFiles[0];
        }

        if (!chosenMedia || !chosenMedia.url) {
          throw new Error("No playable MediaFile found in VAST payload.");
        }

        const totalDurationSec = parseDurationToSeconds(data.duration);
        const skipOffsetSec = parseDurationToSeconds(data.skipOffset);

        setAdTitle(data.adTitle || (data.adSystem ? `${data.adSystem} Ad` : "Sponsor Video Ad"));
        setClickThroughUrl(data.clickThrough || tagUrl);
        setSkipOffsetSeconds(skipOffsetSec);
        setSkipCountdown(skipOffsetSec);
        setCanSkip(skipOffsetSec === 0);
        setAdTimeRemaining(totalDurationSec);
        setAdState("playing");

        // Load video creative into the ad video element
        if (adVideoRef.current) {
          adVideoRef.current.src = chosenMedia.url;
          adVideoRef.current.muted = isMuted;
          adVideoRef.current.currentTime = 0;
          try {
            await adVideoRef.current.play();
            addLog("ad", `Playing creative: ${chosenMedia.url.substring(0, 70)}...`);
          } catch (playErr) {
            console.warn("Ad Video autoplay restricted, user click required:", playErr);
          }
        }

        // Start countdown timer
        let currentRemaining = totalDurationSec;
        let currentSkip = skipOffsetSec;

        if (adCountdownIntervalRef.current) clearInterval(adCountdownIntervalRef.current);
        adCountdownIntervalRef.current = setInterval(() => {
          currentRemaining -= 1;
          setAdTimeRemaining(Math.max(0, currentRemaining));

          if (currentSkip > 0) {
            currentSkip -= 1;
            setSkipCountdown(currentSkip);
            if (currentSkip <= 0) {
              setCanSkip(true);
              addLog("info", "Skip Ad button is now active.");
            }
          }

          if (currentRemaining <= 0) {
            if (adCountdownIntervalRef.current) clearInterval(adCountdownIntervalRef.current);
            playMainContent();
          }
        }, 1000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog("error", `Native VAST Error: ${msg}`, "Proceeding to main HLS stream.");
        playMainContent();
      }
    },
    [addLog, isMuted, playMainContent],
  );

  // Request & Play VAST Preroll Ad via Google IMA SDK
  const requestGoogleIma = useCallback(
    (tagUrl: string, useProxy: boolean) => {
      // Determine effective tag URL (proxied through backend to bypass CORS and domain blocklists)
      const effectiveAdTag = useProxy
        ? `${window.location.origin}/api/vast-proxy?url=${encodeURIComponent(tagUrl)}`
        : tagUrl;

      addLog("ad", `Google IMA: Requesting VAST Tag (${useProxy ? "Proxied" : "Direct"})`);

      if (
        typeof window === "undefined" ||
        !window.google ||
        !window.google.ima ||
        !adContainerRef.current
      ) {
        addLog(
          "warning",
          "Google IMA SDK not ready or ad container not found. Running Native VAST engine.",
        );
        runNativeVast(tagUrl);
        return;
      }

      try {
        destroyIma();

        const ima = window.google.ima;

        // 1. AdDisplayContainer
        if (!imaDisplayContainerRef.current) {
          imaDisplayContainerRef.current = new ima.AdDisplayContainer(
            adContainerRef.current,
            adVideoRef.current || undefined,
          );
        }
        imaDisplayContainerRef.current.initialize();

        // 2. AdsLoader
        const adsLoader = new ima.AdsLoader(imaDisplayContainerRef.current);
        imaAdsLoaderRef.current = adsLoader;

        adsLoader.addEventListener(
          ima.AdErrorEvent.Type.AD_ERROR,
          (adErrorEvent: unknown) => {
            const err = (adErrorEvent as ImaAdErrorEvent).getError?.();
            addLog(
              "warning",
              `Google IMA Error: ${err?.getMessage?.() || "Ad Request Failed"} (Code ${err?.getErrorCode?.() || 0})`,
              "Switching to Native VAST Engine for guaranteed playback.",
            );
            runNativeVast(tagUrl);
          },
          false,
        );

        adsLoader.addEventListener(
          ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (adsManagerLoadedEvent: unknown) => {
            addLog("success", "VAST Ad Response Loaded by Google IMA AdsLoader.");

            const adsRenderingSettings = new ima.AdsRenderingSettings();
            adsRenderingSettings.restoreCustomPlaybackStateOnFocus = true;

            const adsManager = (adsManagerLoadedEvent as ImaAdsManagerLoadedEvent).getAdsManager(
              adVideoRef.current || playerRef.current || {},
              adsRenderingSettings,
            );
            imaAdsManagerRef.current = adsManager;

            adsManager.addEventListener(ima.AdEvent.Type.LOADED, (e: unknown) => {
              const ad = (e as ImaAdEvent).getAd();
              addLog(
                "ad",
                `Ad Loaded: ${ad.getTitle() || "Video Ad"} (${ad.getDuration()}s, skippable: ${ad.isSkippable()})`,
              );
              setAdTitle(ad.getTitle() || "Sponsor Video Ad");
              setAdTimeRemaining(ad.getDuration() || 15);
            });

            adsManager.addEventListener(ima.AdEvent.Type.STARTED, (e: unknown) => {
              const ad = (e as ImaAdEvent).getAd();
              setAdState("playing");
              addLog("ad", `Preroll Ad Started playing via Google IMA.`);

              if (ad.isSkippable()) {
                const skipOffset = ad.getSkipTimeOffset();
                setSkipOffsetSeconds(skipOffset > 0 ? skipOffset : 5);
                setSkipCountdown(skipOffset > 0 ? Math.ceil(skipOffset) : 5);
              }
            });

            adsManager.addEventListener(ima.AdEvent.Type.AD_PROGRESS, (e: unknown) => {
              const adData = (e as ImaAdEvent).getAdData?.();
              if (adData) {
                const remaining = adData.duration - adData.currentTime;
                setAdTimeRemaining(Math.max(0, Math.ceil(remaining)));

                if (skipCountdown > 0) {
                  const remainingToSkip = Math.max(0, skipOffsetSeconds - adData.currentTime);
                  setSkipCountdown(Math.ceil(remainingToSkip));
                  if (remainingToSkip <= 0) {
                    setCanSkip(true);
                  }
                }
              }
            });

            adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, () => {
              addLog("info", "Ad was skipped by user.");
              setAdState("skipped");
              playMainContent();
            });

            adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, () => {
              addLog("success", "Preroll Ad completed.");
              setAdState("completed");
              playMainContent();
            });

            adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
              addLog("success", "All Ads completed.");
              playMainContent();
            });

            adsManager.addEventListener(ima.AdEvent.Type.PAUSED, () => {
              setIsAdPaused(true);
            });

            adsManager.addEventListener(ima.AdEvent.Type.RESUMED, () => {
              setIsAdPaused(false);
            });

            adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
              runNativeVast(tagUrl);
            });

            try {
              const width = adContainerRef.current?.clientWidth || 800;
              const height = adContainerRef.current?.clientHeight || 450;
              adsManager.init(width, height, ima.ViewMode.NORMAL);
              adsManager.start();
            } catch (initErr: unknown) {
              const msg = initErr instanceof Error ? initErr.message : String(initErr);
              addLog("error", "Error initiating AdsManager:", msg);
              runNativeVast(tagUrl);
            }
          },
          false,
        );

        // 3. AdsRequest
        const adsRequest = new ima.AdsRequest();
        adsRequest.adTagUrl = effectiveAdTag;
        adsRequest.linearAdSlotWidth = adContainerRef.current.clientWidth || 800;
        adsRequest.linearAdSlotHeight = adContainerRef.current.clientHeight || 450;
        adsRequest.nonLinearAdSlotWidth = adContainerRef.current.clientWidth || 800;
        adsRequest.nonLinearAdSlotHeight = 150;

        adsLoader.requestAds(adsRequest);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog("error", "Exception in Google IMA request:", msg);
        runNativeVast(tagUrl);
      }
    },
    [addLog, playMainContent, runNativeVast, skipCountdown, skipOffsetSeconds],
  );

  // Unified Request & Play Handler based on active mode
  const executeAdPlayback = useCallback(() => {
    if (!vastTagUrl) {
      addLog("warning", "No VAST Tag URL provided. Playing main stream directly.");
      playMainContent();
      return;
    }

    // Pause main player
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch (err) {
        console.warn("Pause error:", err);
      }
    }

    setAdState("requesting");

    if (engineMode === "native") {
      runNativeVast(vastTagUrl);
    } else if (engineMode === "ima-proxied") {
      requestGoogleIma(vastTagUrl, true);
    } else if (engineMode === "ima-direct") {
      requestGoogleIma(vastTagUrl, false);
    } else {
      // Auto Mode: HilltopAds & ExoClick/magsrv tags work best with Smart Native VAST or Proxied IMA
      const isThirdPartyNetwork =
        vastTagUrl.includes("loyal-product") ||
        vastTagUrl.includes("hilltop") ||
        vastTagUrl.includes("magsrv") ||
        vastTagUrl.includes("exoclick");

      if (isThirdPartyNetwork) {
        runNativeVast(vastTagUrl);
      } else {
        requestGoogleIma(vastTagUrl, true);
      }
    }
  }, [vastTagUrl, engineMode, addLog, playMainContent, runNativeVast, requestGoogleIma]);

  // Initial trigger on component mount or mode change
  useEffect(() => {
    const timer = setTimeout(() => {
      executeAdPlayback();
    }, 500);
    return () => clearTimeout(timer);
  }, [executeAdPlayback]);

  // Ad Controls
  const handleSkipAd = () => {
    addLog("info", "User clicked 'Skip Ad'.");
    if (imaAdsManagerRef.current) {
      try {
        imaAdsManagerRef.current.skip();
        return;
      } catch (err) {
        console.warn("Skip error:", err);
      }
    }
    playMainContent();
  };

  const handleToggleAdPlay = () => {
    if (imaAdsManagerRef.current) {
      try {
        if (isAdPaused) {
          imaAdsManagerRef.current.resume();
        } else {
          imaAdsManagerRef.current.pause();
        }
        return;
      } catch (err) {
        console.warn("Toggle play error:", err);
      }
    }
    if (adVideoRef.current) {
      if (adVideoRef.current.paused) {
        adVideoRef.current.play().catch(() => {});
        setIsAdPaused(false);
      } else {
        adVideoRef.current.pause();
        setIsAdPaused(true);
      }
    }
  };

  const handleToggleAdMute = () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    if (imaAdsManagerRef.current) {
      try {
        imaAdsManagerRef.current.setVolume(newMute ? 0 : 1);
      } catch (err) {
        console.warn("Toggle mute error:", err);
      }
    }
    if (adVideoRef.current) {
      adVideoRef.current.muted = newMute;
    }
  };

  const handleReplayAd = () => {
    addLog("info", `Restarting VAST Preroll Ad (${engineMode.toUpperCase()})`);
    executeAdPlayback();
  };

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}/ads?vast=${encodeURIComponent(vastTagUrl)}&mode=${engineMode}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0c10] text-[#e0e2ec]">
      <Header />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Top Title & Info Banner */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary tracking-wide uppercase mb-2">
              <Sparkles className="size-3.5" />
              Vidstack + HilltopAds & Google IMA VAST Engine
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              VAST Video Ads Player & Debugger
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Seamlessly test and play HilltopAds and Google Interactive Media Ads (IMA) VAST 2.0 /
              3.0 / 4.0 prerolls with Vidstack Player and adaptive HLS video streams.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="copy-vast-link-btn"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold hover:bg-white/10 hover:border-white/20 transition active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-green-400" />
                  Copied /ads?vast= URL
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-muted-foreground" />
                  Share /ads?vast= link
                </>
              )}
            </button>

            <button
              id="replay-ad-btn"
              onClick={handleReplayAd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition active:scale-95 shadow-sm shadow-primary/20"
            >
              <RotateCcw className="size-3.5" />
              Re-run Preroll Ad
            </button>
          </div>
        </div>

        {/* Ad Blocker & CORS Diagnostic Alert (Friendly & Actionable) */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 text-xs">
          <div className="flex items-start gap-3">
            <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">
                  Why HilltopAds tags need Server-Side Proxy / Smart Engine:
                </span>
                <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-mono text-[10px] font-bold">
                  Active
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Direct client-side requests to ad servers (such as{" "}
                <code className="text-white font-mono">loyal-product.com</code> &{" "}
                <code className="text-white font-mono">silent-basis.pro</code>) are routinely
                blocked by browser ad-blockers (uBlock Origin, Brave Shield) and CORS policies.
                AniKume automatically uses <strong>Server-Side VAST Proxying</strong> to fetch the
                genuine VAST 3.0 payload, extract the high-quality MP4 creative, skip offset, and
                impression beacons so ads load 100% reliably.
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid: Player + Controls & Console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Video & Ad Container Column */}
          <div className="lg:col-span-8 space-y-4">
            <div
              id="vidstack-ad-player-wrapper"
              className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl group"
            >
              {/* Main Content: Vidstack Player */}
              <MediaPlayer
                id="main-vidstack-player"
                ref={playerRef}
                src={
                  selectedHls.endsWith(".mp4")
                    ? { src: selectedHls, type: "video/mp4" }
                    : selectedHls.endsWith(".webm")
                      ? { src: selectedHls, type: "video/webm" }
                      : selectedHls.endsWith(".m3u8")
                        ? { src: selectedHls, type: "application/x-mpegurl" }
                        : selectedHls
                }
                title="Example Video (HLS / HTML5 Stream)"
                poster="https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80"
                load="eager"
                playsInline
                crossOrigin="anonymous"
                className="w-full h-full"
              >
                <MediaProvider />
                <Gesture className="vds-gesture" event="dblpointerup" action="seek:-10" />
                <Gesture className="vds-gesture" event="dblpointerup" action="seek:10" />
                <DefaultVideoLayout
                  icons={customVidstackIcons}
                  hideQualityBitrate={true}
                  smallLayoutWhen={({ width, height, fullscreen }) =>
                    !fullscreen && (width < 576 || height < 380)
                  }
                  slots={{
                    beforeCaptionButton: (
                      <DefaultTooltip content="Take Screenshot" placement="top">
                        <button
                          type="button"
                          className="vds-button pointer-events-auto cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              const video =
                                (playerRef.current?.el?.querySelector?.(
                                  "video",
                                ) as HTMLVideoElement | null) ||
                                (playerRef.current?.querySelector?.(
                                  "video",
                                ) as HTMLVideoElement | null) ||
                                (document.querySelector(
                                  "#main-vidstack-player video",
                                ) as HTMLVideoElement | null) ||
                                (document.querySelector("video") as HTMLVideoElement | null);
                              if (!video || !video.videoWidth || !video.videoHeight) return;
                              const canvas = document.createElement("canvas");
                              canvas.width = video.videoWidth;
                              canvas.height = video.videoHeight;
                              const ctx = canvas.getContext("2d");
                              if (!ctx) return;
                              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                              const currentSec = Math.floor(
                                playerRef.current?.currentTime || video.currentTime || 0,
                              );
                              const filename = `screenshot_${currentSec}s.png`;
                              const triggerDownload = (url: string) => {
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              };
                              try {
                                canvas.toBlob((blob) => {
                                  if (blob) {
                                    const url = URL.createObjectURL(blob);
                                    triggerDownload(url);
                                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                                  } else {
                                    const dataUrl = canvas.toDataURL("image/png");
                                    triggerDownload(dataUrl);
                                  }
                                }, "image/png");
                              } catch {
                                const dataUrl = canvas.toDataURL("image/png");
                                triggerDownload(dataUrl);
                              }
                            } catch (err) {
                              console.error("Screenshot error:", err);
                            }
                          }}
                          title="Take Screenshot"
                          aria-label="Take Screenshot"
                        >
                          <CameraIcon className="size-7 sm:size-8" />
                        </button>
                      </DefaultTooltip>
                    ),
                  }}
                />
              </MediaPlayer>

              {/* VAST / IMA Ad Overlay Container */}
              <div
                id="ima-ad-container"
                ref={adContainerRef}
                className={`absolute inset-0 z-30 transition-all duration-300 ${
                  adState === "playing" || adState === "requesting"
                    ? "opacity-100 pointer-events-auto bg-black/90"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                {/* Internal Video tag for Fallback / IMA attachment */}
                <video
                  ref={adVideoRef}
                  playsInline
                  className="w-full h-full object-contain"
                  style={{
                    display: adState === "playing" || adState === "requesting" ? "block" : "none",
                  }}
                />

                {/* Loading / Requesting Ad State */}
                {adState === "requesting" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm z-40 p-4 text-center">
                    <div className="relative mb-4">
                      <div className="size-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                      <Tv className="size-5 text-primary absolute inset-0 m-auto" />
                    </div>
                    <p className="text-base font-bold text-white">Loading VAST Preroll Ad...</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm truncate font-mono">
                      {vastTagUrl}
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-primary/90 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                      <Cpu className="size-3.5" />
                      <span>Engine: {engineMode.toUpperCase()}</span>
                    </div>
                  </div>
                )}

                {/* Active Ad UI Controls (Overlays) */}
                {adState === "playing" && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-40">
                    {/* Top Ad Bar */}
                    <div className="flex items-center justify-between pointer-events-auto">
                      <div className="flex items-center gap-2 rounded-xl bg-black/75 backdrop-blur-md px-3.5 py-2 border border-white/15 text-xs font-semibold text-white shadow-lg">
                        <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="font-bold text-amber-400 uppercase tracking-wider">
                          Ad
                        </span>
                        <span className="text-white/40">•</span>
                        <span className="text-white/90 max-w-[180px] sm:max-w-xs truncate">
                          {adTitle}
                        </span>
                        {adTimeRemaining > 0 && (
                          <>
                            <span className="text-white/40">•</span>
                            <span className="text-amber-300 font-mono font-bold">
                              0:{adTimeRemaining.toString().padStart(2, "0")}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Click-Through Learn More */}
                      {clickThroughUrl && (
                        <a
                          href={clickThroughUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-3.5 py-2 text-xs shadow-lg transition active:scale-95"
                        >
                          <span>Visit Sponsor</span>
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>

                    {/* Bottom Ad Controls & Skip Button */}
                    <div className="flex items-center justify-between pointer-events-auto">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleToggleAdPlay}
                          className="p-2.5 rounded-xl bg-black/80 hover:bg-black/95 border border-white/15 text-white transition active:scale-95 shadow-md"
                          title={isAdPaused ? "Play Ad" : "Pause Ad"}
                        >
                          {isAdPaused ? (
                            <Play className="size-4 fill-white" />
                          ) : (
                            <Pause className="size-4" />
                          )}
                        </button>
                        <button
                          onClick={handleToggleAdMute}
                          className="p-2.5 rounded-xl bg-black/80 hover:bg-black/95 border border-white/15 text-white transition active:scale-95 shadow-md"
                          title={isMuted ? "Unmute Ad" : "Mute Ad"}
                        >
                          {isMuted ? (
                            <VolumeX className="size-4 text-red-400" />
                          ) : (
                            <Volume2 className="size-4" />
                          )}
                        </button>
                      </div>

                      {/* Skip Ad Button */}
                      <div>
                        {canSkip ? (
                          <button
                            id="skip-ad-active-btn"
                            onClick={handleSkipAd}
                            className="flex items-center gap-2 rounded-xl bg-white text-black font-bold px-4 py-2.5 text-xs shadow-2xl hover:bg-white/90 transition active:scale-95 cursor-pointer"
                          >
                            <span>Skip Ad</span>
                            <span className="text-black font-bold">→</span>
                          </button>
                        ) : (
                          <div className="rounded-xl bg-black/80 backdrop-blur-md px-3.5 py-2 border border-white/15 text-xs font-semibold text-white/90 shadow-md">
                            Skip in{" "}
                            <span className="text-amber-400 font-bold">{skipCountdown}s</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stream & Player Meta Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Video className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Active HLS Content Stream</h3>
                  <p className="text-xs text-muted-foreground truncate max-w-md">{selectedHls}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    adState === "playing"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : adState === "completed"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  Status: {adState.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Parsed VAST Creative Info Card (if available) */}
            {parsedVast && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Extracted Creative Metadata (HilltopAds VAST)
                    </h3>
                  </div>
                  {rawXmlText && (
                    <button
                      onClick={() => setIsRawXmlOpen(!isRawXmlOpen)}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <Code2 className="size-3" />
                      {isRawXmlOpen ? "Hide Raw XML" : "View Raw XML"}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">
                      Ad System
                    </span>
                    <span className="font-bold text-white truncate block">
                      {parsedVast.adSystem || "HilltopAds"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">
                      Skip Offset
                    </span>
                    <span className="font-bold text-amber-400 truncate block">
                      {parsedVast.skipOffset || "00:00:05"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">
                      Duration
                    </span>
                    <span className="font-bold text-white truncate block">
                      {parsedVast.duration || "00:00:15"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">
                      Impressions
                    </span>
                    <span className="font-bold text-emerald-400 truncate block">
                      {parsedVast.impressions.length} Beacons
                    </span>
                  </div>
                </div>

                {parsedVast.mediaFiles.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Playable Video MediaFile URL:
                    </span>
                    <a
                      href={parsedVast.mediaFiles[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono text-[11px] truncate block"
                    >
                      {parsedVast.mediaFiles[0].url}
                    </a>
                  </div>
                )}

                {isRawXmlOpen && rawXmlText && (
                  <div className="mt-2">
                    <div className="h-44 overflow-y-auto rounded-xl bg-black p-3 font-mono text-[10px] text-white/70 border border-white/10 whitespace-pre">
                      {rawXmlText}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar: VAST Tag Configuration, Engine Selector, Presets & Live Events */}
          <div className="lg:col-span-4 space-y-5">
            {/* VAST URL Input & Engine Box */}
            <div className="rounded-2xl border border-white/10 bg-card/40 p-4 sm:p-5 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <h2 className="text-sm font-bold text-white">VAST Tag Settings</h2>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">?vast=</span>
              </div>

              {/* Engine Mode Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground block">
                  Playback Engine Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      setEngineMode("auto");
                      applyVastUrl(vastTagUrl, "auto");
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition border text-center ${
                      engineMode === "auto"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                    }`}
                  >
                    Auto (Smart)
                  </button>

                  <button
                    onClick={() => {
                      setEngineMode("native");
                      applyVastUrl(vastTagUrl, "native");
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition border text-center ${
                      engineMode === "native"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                    }`}
                  >
                    Native VAST
                  </button>

                  <button
                    onClick={() => {
                      setEngineMode("ima-proxied");
                      applyVastUrl(vastTagUrl, "ima-proxied");
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition border text-center ${
                      engineMode === "ima-proxied"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                    }`}
                  >
                    IMA (Proxied)
                  </button>

                  <button
                    onClick={() => {
                      setEngineMode("ima-direct");
                      applyVastUrl(vastTagUrl, "ima-direct");
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition border text-center ${
                      engineMode === "ima-direct"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                    }`}
                  >
                    IMA (Direct)
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  VAST Tag / Ad Server URL
                </label>
                <div className="relative">
                  <input
                    id="vast-tag-input"
                    type="text"
                    value={vastTagUrl}
                    onChange={(e) => setVastTagUrl(e.target.value)}
                    placeholder="https://example.com/vast.xml"
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="load-play-vast-btn"
                  onClick={() => applyVastUrl(vastTagUrl)}
                  className="flex-1 rounded-xl bg-primary py-2.5 px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition text-center shadow-sm shadow-primary/20"
                >
                  Apply & Play
                </button>
              </div>

              {/* Quick Presets for HilltopAds and Google IMA */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Tested Presets
                </span>

                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    onClick={() => applyVastUrl(DEFAULT_USER_VAST_1, "native")}
                    className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 p-2.5 text-xs transition border border-white/5 flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-white/95 truncate">
                        HilltopAds Tag #1 (loyal-product)
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate font-mono">
                        .../dbm.FbzJdeGuNmvcZ-GBUS...
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20 shrink-0">
                      Hilltop
                    </span>
                  </button>

                  <button
                    onClick={() => applyVastUrl(DEFAULT_USER_VAST_2, "native")}
                    className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 p-2.5 text-xs transition border border-white/5 flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-white/95 truncate">
                        HilltopAds Tag #2 (loyal-product)
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate font-mono">
                        .../dymbFUz/d.G-Ntv...
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20 shrink-0">
                      Hilltop
                    </span>
                  </button>

                  <button
                    onClick={() => applyVastUrl(GOOGLE_IMA_SKIPPABLE_VAST, "auto")}
                    className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 p-2.5 text-xs transition border border-white/5 flex items-center justify-between"
                  >
                    <span className="font-semibold text-white/90 truncate mr-2">
                      Google IMA Skippable Preroll
                    </span>
                    <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold">
                      IMA Demo
                    </span>
                  </button>

                  <button
                    onClick={() => applyVastUrl(GOOGLE_IMA_NON_SKIPPABLE_VAST, "auto")}
                    className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 p-2.5 text-xs transition border border-white/5 flex items-center justify-between"
                  >
                    <span className="font-semibold text-white/90 truncate mr-2">
                      Google IMA Standard Preroll
                    </span>
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">
                      IMA Demo
                    </span>
                  </button>

                  <button
                    onClick={() => applyVastUrl(GOOGLE_IMA_VMAP_VAST, "auto")}
                    className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 p-2.5 text-xs transition border border-white/5 flex items-center justify-between"
                  >
                    <span className="font-semibold text-white/90 truncate mr-2">
                      Google IMA VMAP Pod Ad
                    </span>
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">
                      VMAP
                    </span>
                  </button>
                </div>
              </div>

              {/* Video Stream Selector */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Example Video (HLS)
                </span>
                <div className="space-y-1">
                  {SAMPLE_HLS_STREAMS.map((s) => (
                    <button
                      key={s.url}
                      onClick={() => {
                        setSelectedHls(s.url);
                        addLog("info", "Switched content stream to", s.name);
                      }}
                      className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition border ${
                        selectedHls === s.url
                          ? "bg-primary/15 border-primary/40 text-primary font-bold"
                          : "bg-white/5 border-transparent text-white/80 hover:bg-white/10"
                      }`}
                    >
                      <div className="truncate">{s.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Events & Debug Log Console */}
            <div className="rounded-2xl border border-white/10 bg-card/40 p-4 sm:p-5 backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="size-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Ad & Player Events</h3>
                </div>
                <button
                  onClick={() => setLogs([])}
                  className="text-[11px] text-muted-foreground hover:text-white transition"
                >
                  Clear
                </button>
              </div>

              <div className="h-56 overflow-y-auto space-y-2 rounded-xl bg-black/60 p-3 border border-white/5 font-mono text-[11px]">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground/60 text-center py-6">
                    Waiting for ad & playback events...
                  </p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 leading-tight">
                      <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                      <span
                        className={`shrink-0 font-bold ${
                          log.type === "success"
                            ? "text-emerald-400"
                            : log.type === "error"
                              ? "text-rose-400"
                              : log.type === "warning"
                                ? "text-amber-400"
                                : log.type === "ad"
                                  ? "text-primary"
                                  : "text-blue-400"
                        }`}
                      >
                        [{log.type.toUpperCase()}]
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-white/90">{log.message}</span>
                        {log.detail && (
                          <span className="text-muted-foreground block truncate">{log.detail}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
