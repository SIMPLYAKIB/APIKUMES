import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createFileRoute, Link, notFound, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Info,
  MessageSquare,
  Star,
  X,
  Play,
  SkipBack,
  SkipForward,
  Cast,
  Subtitles,
  Mic,
  ExternalLink,
  Tv,
  PlayCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { stripHtml, getScoreColor, formatScore, formatStatus, getStatusColor } from "@/lib/utils";

import { SharedSelect } from "@/components/SharedSelect";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { createClientHlsBlobUrl } from "@/lib/client-hls-loader";
function sortRelations(relations: { relationType: string; node: AnilistMedia }[]) {
  // Sort priority: PREQUEL -> SEQUEL -> everything else based on averageScore or popularity
  return [...relations].sort((a, b) => {
    const typeA = a.relationType?.toUpperCase() || "";
    const typeB = b.relationType?.toUpperCase() || "";

    // Explicit priority
    const priority = (type: string) => {
      if (type === "SEQUEL") return 1;
      if (type === "PREQUEL") return 2;
      return 3;
    };

    const pA = priority(typeA);
    const pB = priority(typeB);

    if (pA !== pB) return pA - pB;

    // Fallback to popularity or score
    const scoreA = a.node.averageScore || a.node.meanScore || 0;
    const scoreB = b.node.averageScore || b.node.meanScore || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    return (b.node.popularity || 0) - (a.node.popularity || 0);
  });
}

import { AnimeCard } from "@/components/AnimeCard";
import { AnimeRowShell } from "@/components/AnimeRow";
import { CommentsSection } from "@/components/CommentsSection";
import {
  SortDescIcon,
  SortAscIcon,
  RefreshCwIcon,
  useContentSortOrder,
} from "@/components/SortIcons";
// Vidstack Imports
import {
  MediaPlayer,
  Poster,
  GoogleCastButton,
  MediaProvider,
  Track,
  Gesture,
  SeekButton,
  MuteButton,
  VolumeSlider,
  useMediaState,
} from "@vidstack/react";
import { DefaultVideoLayout, DefaultTooltip } from "@vidstack/react/player/layouts/default";
import { customVidstackIcons } from "@/lib/vidstack-icons";
import {
  CameraIcon,
  SeekBackward10Icon,
  SeekForward10Icon,
  MuteIcon,
  VolumeLowIcon,
  VolumeHighIcon,
} from "@vidstack/react/icons";
import { toast } from "sonner";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import { IframeAdBlockPlayer } from "@/components/IframeAdBlockPlayer";

type StreamSource = {
  server: string;
  hasquality: boolean;
  url: string;
  rawUrl?: string;
  embed?: string;
  type?: string;
  caption?: string;
  subtype?: "hard";
  isIframe?: boolean;
  language?: string;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
};
import {
  fetchAnimeById,
  fetchEpisodes,
  mapApikumeToAnilistMedia,
  titleOf,
  totalEpisodeCount,
  prettyFormat,
  type AnilistMedia,
  type Episode,
  fetchApikumeWatch,
  fetchApikumeData,
} from "@/lib/apikume";

export const Route = createFileRoute("/anime/watch/$id")({
  head: () => ({
    meta: [
      { title: `Watch Anime · AniKume` },
      { name: "description", content: `Watch anime on AniKume.` },
    ],
  }),
  component: WatchPage,
});

/* ── localStorage helpers ── */

/* ── Display helpers ── */
function langShort(lang: string) {
  return lang;
}

/* ========================= Main Page ========================= */

export function TimelineMarkers({
  intro,
  outro,
}: {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}) {
  const duration = useMediaState("duration");
  if (!duration || duration <= 0) return null;

  return (
    <style>{`
      .vds-time-slider::before {
        content: "";
        position: absolute;
        top: 50%;
        left: ${intro ? (intro.start / Math.max(duration, 1)) * 100 + "%" : "0%"};
        width: ${intro ? ((intro.end - intro.start) / Math.max(duration, 1)) * 100 + "%" : "0%"};
        height: var(--track-height, 5px);
        transform: translateY(-50%);
        background-color: #f97316;
        z-index: 1;
        pointer-events: none;
        border-radius: var(--media-slider-track-border-radius, 1px);
        display: ${intro ? "block" : "none"};
      }
      .vds-time-slider::after {
        content: "";
        position: absolute;
        top: 50%;
        left: ${outro ? (outro.start / Math.max(duration, 1)) * 100 + "%" : "0%"};
        width: ${outro ? ((outro.end - outro.start) / Math.max(duration, 1)) * 100 + "%" : "0%"};
        height: var(--track-height, 5px);
        transform: translateY(-50%);
        background-color: #f97316;
        z-index: 1;
        pointer-events: none;
        border-radius: var(--media-slider-track-border-radius, 1px);
        display: ${outro ? "block" : "none"};
      }
      @media (hover: hover) and (pointer: fine) {
        .vds-time-slider:hover::before, .vds-time-slider:hover::after {
          height: calc(var(--track-height, 5px) * 2);
          transition: transform 0.1s cubic-bezier(0.4, 0, 1, 1), height 0.1s cubic-bezier(0.4, 0, 1, 1);
        }
      }
    `}</style>
  );
}

function WatchPage() {
  const { id } = Route.useParams();
  const location = useLocation();
  const numEp = location.hash ? Number(location.hash.replace("#", "")) : 1;
  const resolvedId = String(id ?? "").trim();
  if (!resolvedId || Number.isNaN(numEp)) throw notFound();

  const queryClient = useQueryClient();

  const { data: m, isLoading } = useQuery({
    queryKey: ["anime", resolvedId],
    queryFn: () => fetchAnimeById(resolvedId),
    staleTime: 0,
  });

  const { data: episodesData } = useQuery({
    queryKey: ["episodes", resolvedId],
    queryFn: () => fetchEpisodes(resolvedId, m ?? undefined),
    enabled: true,
    staleTime: 0,
  });

  const {
    data: streams,
    isLoading: streamsInitialLoading,
    isFetching: streamsFetching,
    error: streamError,
  } = useQuery({
    queryKey: ["streams", id, numEp],
    queryFn: async () => {
      return await fetchApikumeWatch(id, numEp);
    },
    enabled: !!id && !!numEp,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const [initialStreamLoaded, setInitialStreamLoaded] = useState(false);

  useEffect(() => {
    if (!streamsInitialLoading) {
      setInitialStreamLoaded(true);
    }
  }, [streamsInitialLoading]);

  const isPageReady = !isLoading && !!m;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [resolvedId, numEp]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Header />
      {m ? (
        <main className="pb-0 pt-[68px]">
          <WatchBody
            key={m.id}
            m={m}
            episodes={episodesData ?? []}
            total={totalEpisodeCount(m, episodesData)}
            currentEp={numEp}
            streams={streams ?? null}
            streamsInitialLoading={streamsInitialLoading}
            streamsFetching={streamsFetching}
          />
        </main>
      ) : isLoading ? (
        <WatchPageSkeleton />
      ) : (
        <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
          Anime not found
        </div>
      )}
      <Footer />
    </div>
  );
}

/* ========================= Watch Body ========================= */

/* ========================= Desktop Related List ========================= */
function DesktopRelatedList({
  relations,
}: {
  relations: { relationType: string; node: AnilistMedia }[];
}) {
  if (!relations || relations.length === 0) return null;

  const sorted = sortRelations(relations);

  return (
    <div className="hidden lg:flex flex-col rounded-xl border border-white/5 bg-card/40 no-scrollbar overflow-hidden relative z-10 duration-300 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 rounded-t-xl z-20">
        <span className="text-[13px] font-bold tracking-wider text-white">Related</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[300px]">
        {sorted.map((r) => {
          const m = r.node as AnilistMedia;
          const relationName = r.relationType ? r.relationType.replace(/_/g, " ") : "RELATED";
          const epCount = m.episodes || 0;

          return (
            <Link
              key={m.id}
              to="/anime/$id"
              params={{ id: String(m.id) }}
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-card/40 p-2 pr-3 transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-card relative"
            >
              <div className="size-14 shrink-0 rounded-lg overflow-hidden ring-1 ring-white/5 sm:size-16 relative">
                <img
                  src={m.coverImage?.extraLarge || m.coverImage?.large}
                  alt={titleOf(m)}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 pr-1">
                <h3 className="block w-full truncate text-sm font-bold text-foreground transition group-hover:text-primary">
                  {titleOf(m)}
                </h3>
                <div className="mt-1 flex min-w-0 items-center gap-x-2 gap-y-0.5 overflow-hidden text-[11px] font-semibold text-muted-foreground">
                  <span className="shrink-0 uppercase tracking-wide text-muted-foreground">
                    {relationName}
                  </span>
                  {m.format && (
                    <>
                      <span aria-hidden className="shrink-0">
                        •
                      </span>
                      <span className="shrink-0 uppercase tracking-wide">
                        {m.format.replace(/_/g, " ")}
                      </span>
                    </>
                  )}
                  {epCount > 0 && (
                    <>
                      <span aria-hidden className="shrink-0">
                        •
                      </span>
                      <span className="shrink-0 uppercase tracking-wide">{epCount} EP</span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function WatchBody({
  m,
  episodes,
  total,
  currentEp,
  streams,
  streamsInitialLoading,
  streamsFetching,
}: {
  m: AnilistMedia;
  episodes: Episode[];
  total: number;
  currentEp: number;
  streams: any | null;
  streamsInitialLoading: boolean;
  streamsFetching: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const processedStreams = useMemo(() => {
    if (!streams) return null;
    const sourcesList: any[] = [];

    const processSourceList = (list: any[], language: string) => {
      if (!Array.isArray(list)) return;
      for (const s of list) {
        if (!s) continue;
        const rawEmbed = typeof s.embed === "string" ? s.embed.trim() : "";
        const rawHls = (s.hls || s.url || s.video || s.mp4 || s.file || s.src || "").toString().trim();
        const serverName = s.source || s.server || s.name || "Alpha";

        if (!rawHls && !rawEmbed) continue;

        // Dedicated handling for HINDI streams
        if (language === "HINDI") {
          const targetEmbed = rawEmbed || rawHls;
          // 1. Add Alpha server from our worker extractor (Auto-extracts and plays HLS directly via Vidstack)
          const extractedAlphaUrl = `https://api-for-anikume.na9714152.workers.dev/proxy?al=hin&ref=hindi&url=${encodeURIComponent(targetEmbed)}`;
          sourcesList.push({
            server: "Alpha",
            language: "HINDI",
            url: extractedAlphaUrl,
            rawUrl: extractedAlphaUrl,
            embed: targetEmbed,
            type: "application/x-mpegurl",
            caption: s.subtitle || s.caption,
            hasquality: true,
            isIframe: false,
            intro: streams.intro || s.intro || { start: 0, end: 0 },
            outro: streams.outro || s.outro || { start: 0, end: 0 },
          });

          // 2. The server from the API response (originally Alpha) is renamed to "Beta" (embed iframe fallback)
          const fallbackServerName = serverName === "Alpha" ? "Beta" : serverName;
          sourcesList.push({
            server: fallbackServerName,
            language: "HINDI",
            url: targetEmbed,
            embed: targetEmbed,
            rawUrl: rawHls || rawEmbed,
            caption: s.subtitle || s.caption,
            hasquality: false,
            isIframe: true,
            intro: streams.intro || s.intro || { start: 0, end: 0 },
            outro: streams.outro || s.outro || { start: 0, end: 0 },
          });
          continue;
        }

        const candidateUrl = (rawHls || rawEmbed).split("?")[0].toLowerCase();

        // Check if stream is direct playable media (.m3u8, .mp4, .webm, .ogg) vs an embed player webpage
        const isM3u8 =
          candidateUrl.endsWith(".m3u8") ||
          rawHls.includes(".m3u8") ||
          rawHls.includes("/hls/") ||
          rawHls.includes("playlist.m3u8") ||
          rawHls.includes("master.m3u8");
        const isMp4 = candidateUrl.endsWith(".mp4") || rawHls.includes(".mp4");
        const isWebm = candidateUrl.endsWith(".webm") || rawHls.includes(".webm");
        const isOgg = candidateUrl.endsWith(".ogg") || candidateUrl.endsWith(".ogv");
        const isDirectStream = isM3u8 || isMp4 || isWebm || isOgg;

        // If it's an embed / iframe source without direct video stream file (e.g. Hindi embed https://as-cdn26.top/video/...)
        if (!isDirectStream || s.isIframe || (rawEmbed && rawEmbed === rawHls && !isDirectStream)) {
          const iframeUrl = rawEmbed || rawHls;
          sourcesList.push({
            server: serverName,
            language,
            url: iframeUrl,
            embed: rawEmbed || iframeUrl,
            rawUrl: rawHls || rawEmbed,
            caption: s.subtitle || s.caption,
            hasquality: false,
            isIframe: true,
            intro: streams.intro || s.intro || { start: 0, end: 0 },
            outro: streams.outro || s.outro || { start: 0, end: 0 },
          });
        } else {
          // Playable HLS / MP4 Stream
          // Proxy the stream using the embed as 'ref' and 'hls' as 'url' while maintaining direct chunk fetch
          const effectiveReferrer = rawEmbed || "https://megavid.buzz";
          let streamPlayUrl = rawHls;

          if (!streamPlayUrl.startsWith("/proxy?") && !streamPlayUrl.startsWith("/sw-proxy/")) {
            streamPlayUrl = `/proxy?url=${encodeURIComponent(rawHls)}&ref=${encodeURIComponent(effectiveReferrer)}`;
          }

          let captionUrl = s.subtitle || s.caption;
          if (
            captionUrl &&
            typeof captionUrl === "string" &&
            captionUrl.startsWith("http") &&
            !captionUrl.startsWith("/proxy?")
          ) {
            captionUrl = `/proxy?url=${encodeURIComponent(captionUrl)}&ref=${encodeURIComponent(effectiveReferrer)}`;
          }

          const inferredType = isM3u8
            ? "application/x-mpegurl"
            : isMp4
              ? "video/mp4"
              : isWebm
                ? "video/webm"
                : isOgg
                  ? "video/ogg"
                  : s.type || "application/x-mpegurl";

          sourcesList.push({
            server: serverName,
            language,
            url: streamPlayUrl,
            rawUrl: rawHls,
            embed: effectiveReferrer,
            type: s.type || inferredType,
            caption: captionUrl,
            hasquality: true,
            isIframe: false,
            intro: streams.intro || s.intro || { start: 0, end: 0 },
            outro: streams.outro || s.outro || { start: 0, end: 0 },
          });
        }
      }
    };

    const nonLanguageKeys = new Set([
      "intro",
      "outro",
      "downloads",
      "sources",
      "status",
      "message",
      "success",
      "error",
    ]);
    if (typeof streams === "object") {
      for (const [key, val] of Object.entries(streams)) {
        if (nonLanguageKeys.has(key)) continue;
        if (Array.isArray(val) && val.length > 0) {
          processSourceList(val, key.toUpperCase());
        }
      }
    }

    if (streams.sources && Array.isArray(streams.sources)) {
      processSourceList(streams.sources, "SUB");
    }

    return {
      sources: sourcesList,
      downloads: streams.downloads || [],
      intro: streams.intro,
      outro: streams.outro,
    };
  }, [streams]);

  const languages = useMemo(() => {
    if (!processedStreams?.sources) return [];
    const seen = new Set<string>();
    const langs: string[] = [];
    for (const s of processedStreams.sources) {
      const l = s.language?.toUpperCase();
      if (l && !seen.has(l)) {
        seen.add(l);
        langs.push(l);
      }
    }
    return langs;
  }, [processedStreams?.sources]);

  const [selectedLang, setSelectedLang] = useState<string>(() => {
    try {
      return localStorage.getItem(`pref_lang_${m.id}`) ?? "";
    } catch {
      return "";
    }
  });
  const [selectedServer, setSelectedServer] = useState<string>(() => {
    try {
      return localStorage.getItem(`pref_server_${m.id}`) ?? "";
    } catch {
      return "";
    }
  });

  const [autoNext, setAutoNext] = useState(() => {
    try {
      const val = localStorage.getItem("global_pref_auto_next");
      return val !== null ? JSON.parse(val) : true;
    } catch {
      return true;
    }
  });

  const [autoSkip, setAutoSkip] = useState(() => {
    try {
      const val = localStorage.getItem("global_pref_auto_skip");
      return val !== null ? JSON.parse(val) : true;
    } catch {
      return true;
    }
  });

  // Auto-tracking removed

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<"Episodes" | "Details" | "Related">("Episodes");

  const handleSetAutoNext = (val: boolean) => {
    setAutoNext(val);
    try {
      localStorage.setItem("global_pref_auto_next", JSON.stringify(val));
    } catch {}
  };

  const handleSetAutoSkip = (val: boolean) => {
    setAutoSkip(val);
    try {
      localStorage.setItem("global_pref_auto_skip", JSON.stringify(val));
    } catch {}
  };

  useEffect(() => {
    if (languages.length === 0) return;
    if (selectedLang && languages.includes(selectedLang)) return;
    try {
      const savedLang = localStorage.getItem(`pref_lang_${m.id}`);
      if (savedLang && languages.includes(savedLang)) {
        setSelectedLang(savedLang);
        return;
      }
    } catch {}
    setSelectedLang(languages[0]);
  }, [languages, selectedLang, m.id]);

  const serverLabel = (source: StreamSource, lang: string) => {
    const name = source.server;
    // Just return the raw server name without soft/hard sub notation as it clutters the new pill UI
    if (name.toLowerCase() === "alpha") return "Alpha";
    return name;
  };

  const sources: StreamSource[] = useMemo(() => {
    if (!selectedLang || !processedStreams?.sources) return [];
    return processedStreams.sources
      .filter((s: any) => s.language?.toUpperCase() === selectedLang)
      .map((s: any) => ({
        server: s.server || "Alpha",
        url: s.url,
        type: s.type,
        caption: s.caption,
        hasquality: s.hasquality ?? true,
        isIframe: s.isIframe ?? false,
        intro: s.intro || processedStreams.intro || { start: 0, end: 0 },
        outro: s.outro || processedStreams.outro || { start: 0, end: 0 },
      }));
  }, [selectedLang, processedStreams?.sources, processedStreams?.intro, processedStreams?.outro]);

  const selectedServerIdx = useMemo(() => {
    if (!selectedServer || sources.length === 0) return 0;
    const idx = sources.findIndex((s) => s.server === selectedServer);
    return idx >= 0 ? idx : 0;
  }, [selectedServer, sources]);

  useEffect(() => {
    if (sources.length === 0) return;
    const exists = sources.some((s) => s.server === selectedServer);
    if (!exists) {
      try {
        const savedServer = localStorage.getItem(`pref_server_${m.id}`);
        if (savedServer && sources.some((s) => s.server === savedServer)) {
          setSelectedServer(savedServer);
          return;
        }
      } catch {}
      setSelectedServer(sources[0].server);
    }
  }, [sources, selectedServer, m.id]);

  useEffect(() => {
    if (selectedLang) {
      try {
        localStorage.setItem(`pref_lang_${m.id}`, selectedLang);
      } catch {}
    }
  }, [selectedLang, m.id]);

  useEffect(() => {
    if (selectedServer) {
      try {
        localStorage.setItem(`pref_server_${m.id}`, selectedServer);
      } catch {}
    }
  }, [selectedServer, m.id]);

  const activeSource: StreamSource | null = sources[selectedServerIdx] ?? null;

  const episodeMap = useMemo(() => {
    const map = new Map<number, any>();
    if (episodes) {
      for (let i = 0; i < episodes.length; i++) {
        map.set(episodes[i].episode, episodes[i]);
      }
    }
    return map;
  }, [episodes]);

  const getEpInfo = useCallback(
    (num: number) => {
      const ep = episodeMap.get(num);
      const fallback = m.streamingEpisodes?.[num - 1];
      return {
        num,
        title: ep?.title ?? fallback?.title ?? `Episode ${num}`,
        description: ep?.description ?? null,
        thumbnail: ep?.image ?? fallback?.thumbnail ?? m.coverImage.large,
        filler: Boolean(ep?.filler || ep?.is_filler),
      };
    },
    [episodeMap, m],
  );

  const goToEp = useCallback(
    (epNum: number) => {
      if (currentEp !== epNum) {
        try {
          localStorage.removeItem(`progress_${m.id}_ep_${currentEp}`);
        } catch {}
      }

      try {
        const listRaw = localStorage.getItem("continue_watching_list");
        let list: any[] = listRaw ? JSON.parse(listRaw) : [];

        list = list.filter((item: any) => item.animeId !== m.id);

        const newEpInfo = getEpInfo(epNum);
        list.unshift({
          animeId: m.id,
          animeTitle: titleOf(m),
          animeCover: m.coverImage.large,
          episodeThumbnail: newEpInfo?.thumbnail || m.coverImage.large,
          episodeNum: epNum,
          episodeTitle: newEpInfo?.title || `Episode ${epNum}`,
          currentTime: 0,
          duration: 0,
          updatedAt: Date.now(),
          isAdult:
            m.isAdult ||
            (m.genres || []).some(
              (g: string) => g.toLowerCase() === "hentai" || g.toLowerCase() === "adult",
            ),
        });

        if (list.length > 20) {
          list = list.slice(0, 20);
        }

        localStorage.setItem("continue_watching_list", JSON.stringify(list));
        window.dispatchEvent(new Event("anikume_continue_update"));
      } catch {}

      if (document.fullscreenElement) {
        try {
          sessionStorage.setItem("restore_fullscreen", "true");
        } catch {}
      }
      navigate({
        to: "/anime/watch/$id",
        params: { id: String(m.id) },
        hash: String(epNum),
      });
    },
    [navigate, m, currentEp, getEpInfo],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      if (key === "a") {
        if (currentEp > 1) goToEp(currentEp - 1);
      } else if (key === "d") {
        if (currentEp < total) goToEp(currentEp + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentEp, total, goToEp]);

  const handleVideoEnd = useCallback(() => {
    if (autoNext && currentEp < total) goToEp(currentEp + 1);
  }, [autoNext, currentEp, total, goToEp]);

  let epCount = total || episodes.length || m.episodes || 12;
  if (m.status === "RELEASING" && m.nextAiringEpisode) {
    epCount = Math.min(epCount, Math.max(0, m.nextAiringEpisode.episode - 1));
  }

  const [sortOrder, setSortOrder] = useContentSortOrder();
  const [isRefreshingEps, setIsRefreshingEps] = useState(false);

  const handleRefreshEpisodes = async () => {
    try {
      setIsRefreshingEps(true);
      queryClient.removeQueries({ queryKey: ["episodes", m.id] });
      await queryClient.fetchQuery({
        queryKey: ["episodes", m.id],
        queryFn: () => fetchEpisodes(m.id, m, true),
      });
    } finally {
      setIsRefreshingEps(false);
    }
  };

  const ranges = useMemo(() => {
    const r: { label: string; start: number; end: number; id: number }[] = [];
    for (let s = 1; s <= epCount; s += 50) {
      const e = Math.min(s + 49, epCount);
      r.push({ label: `${s} - ${e}`, start: s, end: e, id: s });
    }
    if (sortOrder === "desc") {
      return r
        .slice()
        .reverse()
        .map((chunk) => ({
          label: `${chunk.end} - ${chunk.start}`,
          start: chunk.start,
          end: chunk.end,
          id: chunk.id,
        }));
    }
    return r;
  }, [epCount, sortOrder]);

  const [rangeIdx, setRangeIdx] = useState(0);
  const prevEpRef = useRef(currentEp);

  // Sync range only when user navigates to a different episode
  useEffect(() => {
    if (prevEpRef.current !== currentEp) {
      prevEpRef.current = currentEp;
      const idx = ranges.findIndex((r) => currentEp >= r.start && currentEp <= r.end);
      if (idx >= 0) {
        setRangeIdx(idx);
      }
    }
  }, [currentEp, ranges]);

  // Reset to first range (1 for ASC, latest for DESC) on sort order change
  useEffect(() => {
    setRangeIdx(0);
  }, [sortOrder]);

  const visibleEps = useMemo(() => {
    const selected = ranges[rangeIdx] ?? ranges[0] ?? { start: 1, end: epCount };
    const raw = Array.from({ length: selected.end - selected.start + 1 }, (_, i) =>
      getEpInfo(selected.start + i),
    );
    if (sortOrder === "desc") {
      return raw.reverse();
    }
    return raw;
  }, [getEpInfo, ranges, rangeIdx, sortOrder, epCount]);

  const { data: seasonData } = useQuery({
    queryKey: ["anime-data", m.id, "season"],
    queryFn: () => fetchApikumeData(String(m.id), "season"),
    staleTime: 0,
  });

  const relations = useMemo(() => {
    const prio = (t: string) => {
      const upper = t?.toUpperCase() || "";
      if (upper === "PREQUEL") return 1;
      if (upper === "SEQUEL") return 2;
      return 3;
    };

    const res = seasonData?.results ?? seasonData;
    const rawRel = Array.isArray(res?.related)
      ? res.related
      : Array.isArray(res?.watch_order)
        ? res.watch_order
        : [];

    if (rawRel.length > 0) {
      return rawRel
        .map((r: any) => ({
          relationType: r.relation || r.relationType || r.season || "RELATED",
          node: mapApikumeToAnilistMedia(r),
        }))
        .sort((a: any, b: any) => prio(a.relationType) - prio(b.relationType));
    }

    return (m.relations?.edges ?? [])
      .filter(
        (r) =>
          r.node?.format !== "MANGA" && r.node?.format !== "NOVEL" && r.node?.format !== "ONE_SHOT",
      )
      .sort((a, b) => prio(a.relationType) - prio(b.relationType));
  }, [seasonData, m]);

  const currentEpInfo = useMemo(() => getEpInfo(currentEp), [getEpInfo, currentEp]);

  const handleProgress = useCallback(
    (currentTime: number, duration: number) => {
      try {
        const listRaw = localStorage.getItem("continue_watching_list");
        let list: any[] = listRaw ? JSON.parse(listRaw) : [];

        list = list.filter((item: any) => item.animeId !== m.id);

        list.unshift({
          animeId: m.id,
          animeTitle: titleOf(m),
          animeCover: m.coverImage.large,
          episodeThumbnail: currentEpInfo?.thumbnail || m.coverImage.large,
          episodeNum: currentEp,
          episodeTitle: currentEpInfo?.title || `Episode ${currentEp}`,
          currentTime,
          duration,
          updatedAt: Date.now(),
          isAdult:
            m.isAdult ||
            (m.genres || []).some(
              (g: string) => g.toLowerCase() === "hentai" || g.toLowerCase() === "adult",
            ),
        });

        if (list.length > 20) {
          list = list.slice(0, 20);
        }

        localStorage.setItem("continue_watching_list", JSON.stringify(list));
      } catch {}
    },
    [m, currentEp, currentEpInfo],
  );

  return (
    <div className="mx-auto max-w-[1500px] px-2 sm:px-3 lg:px-5 pb-16">
      <div className="lg:grid lg:grid-cols-[1fr_400px] lg:gap-3">
        <div className="min-w-0">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            {streamsInitialLoading ? (
              <div className="relative size-full overflow-hidden flex items-center justify-center bg-black">
                {currentEpInfo?.thumbnail ? (
                  <img
                    src={currentEpInfo.thumbnail}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110"
                  />
                ) : null}
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-[var(--brand)] shadow-[0_0_15px_var(--brand)]" />
                  <p className="text-xs font-bold text-white/80 animate-pulse tracking-wide">
                    LOADING STREAM
                  </p>
                </div>
              </div>
            ) : activeSource ? (
              activeSource.isIframe ? (
                <IframeAdBlockPlayer
                  key={`iframe-${selectedLang}-${activeSource.server}-${activeSource.url}-${currentEp}`}
                  src={activeSource.url}
                  server={activeSource.server}
                  language={selectedLang}
                  episodeNum={currentEp}
                  episodeTitle={currentEpInfo?.title || `Episode ${currentEp}`}
                  animeId={m.id}
                  animeTitle={titleOf(m)}
                  animeCover={m.coverImage.large}
                  episodeThumbnail={currentEpInfo?.thumbnail || m.coverImage.large}
                  isAdult={
                    m.isAdult ||
                    (m.genres || []).some(
                      (g: string) => g.toLowerCase() === "hentai" || g.toLowerCase() === "adult",
                    )
                  }
                  onEnded={handleVideoEnd}
                  onNextEp={currentEp < total ? () => goToEp(currentEp + 1) : undefined}
                  onPrevEp={currentEp > 1 ? () => goToEp(currentEp - 1) : undefined}
                  autoNext={autoNext}
                  onProgress={handleProgress}
                />
              ) : (
                <VidstackPlayer
                  key={`player-${selectedLang}-${activeSource.server}-${activeSource.url}-${currentEp}`}
                  m={m}
                  source={activeSource}
                  onEnded={handleVideoEnd}
                  episodeNum={currentEp}
                  episodeTitle={currentEpInfo?.title || `Episode ${currentEp}`}
                  posterUrl={currentEpInfo?.thumbnail || m.coverImage.large}
                  onProgress={handleProgress}
                  autoSkip={autoSkip}
                  onNextEp={currentEp < total ? () => goToEp(currentEp + 1) : undefined}
                  onPrevEp={currentEp > 1 ? () => goToEp(currentEp - 1) : undefined}
                  isLoadingStream={streamsFetching}
                />
              )
            ) : (
              <div className="grid size-full place-items-center text-sm text-muted-foreground">
                {streams ? "No sources available" : "Waiting for stream…"}
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:block relative h-full z-10 duration-300 animate-in fade-in slide-in-from-bottom-4">
          <div className="absolute inset-0 flex flex-col rounded-xl border border-white/5 bg-card/40 no-scrollbar">
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-2 py-2.5 rounded-t-xl z-20 gap-2">
              <div className="flex items-center gap-1.5 min-w-0"></div>
              <div className="flex items-center gap-1.5 shrink-0">
                {ranges.length > 1 && (
                  <div className="relative shrink-0 min-w-[95px]">
                    <SharedSelect
                      value={String(rangeIdx)}
                      options={ranges.map((r, i) => ({
                        value: String(i),
                        display: r.label,
                      }))}
                      onChange={(v) => setRangeIdx(Number(v))}
                      triggerClassName="py-1 px-2.5 text-xs font-semibold text-white bg-card/60 border border-white/10"
                    />
                  </div>
                )}
                <button
                  onClick={() => setSortOrder((v) => (v === "desc" ? "asc" : "desc"))}
                  className="flex items-center justify-center p-1.5 rounded-lg border border-white/10 bg-card/60 hover:bg-card text-white text-xs font-bold transition active:scale-95"
                  title={
                    sortOrder === "desc"
                      ? "Order: Descending (Newest first)"
                      : "Order: Ascending (Oldest first)"
                  }
                  aria-label={sortOrder === "desc" ? "Sort descending" : "Sort ascending"}
                >
                  {sortOrder === "desc" ? (
                    <SortDescIcon className="size-3.5 text-white" />
                  ) : (
                    <SortAscIcon className="size-3.5 text-white" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar rounded-b-xl">
              {isRefreshingEps ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-xl border border-white/5 bg-card/40 p-1.5"
                    >
                      <div className="aspect-video w-20 shrink-0 rounded-lg skeleton-box" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-3/4 skeleton-text" />
                        <div className="h-2.5 w-1/2 skeleton-text opacity-70" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EpisodeList
                  items={visibleEps}
                  currentEp={currentEp}
                  animeId={m.id}
                  animeDesc={m.description}
                  nextAiringEpisode={m.nextAiringEpisode}
                  banner={m.bannerImage || m.coverImage.extraLarge || m.coverImage.large}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 lg:grid lg:grid-cols-[1fr_400px] lg:gap-3 lg:items-start">
        <div className="min-w-0">
          <div className="relative z-20 rounded-2xl border border-white/5 bg-card/40 p-3 sm:p-4 flex flex-col">
            <div className="mb-4 pb-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <button
                  onClick={() => handleSetAutoSkip(!autoSkip)}
                  className="flex items-center gap-2 text-xs font-semibold text-foreground/90 transition hover:text-foreground"
                >
                  <span
                    className={
                      "grid size-4 shrink-0 place-items-center rounded border-2 transition " +
                      (autoSkip
                        ? "border-white bg-white text-black"
                        : "border-white/40 bg-transparent")
                    }
                  >
                    {autoSkip && <Check className="size-2.5" strokeWidth={4} />}
                  </span>
                  Auto Skip
                </button>

                <button
                  onClick={() => handleSetAutoNext(!autoNext)}
                  className="flex items-center gap-2 text-xs font-semibold text-foreground/90 transition hover:text-foreground"
                >
                  <span
                    className={
                      "grid size-4 shrink-0 place-items-center rounded border-2 transition " +
                      (autoNext
                        ? "border-white bg-white text-black"
                        : "border-white/40 bg-transparent")
                    }
                  >
                    {autoNext && <Check className="size-2.5" strokeWidth={4} />}
                  </span>
                  Auto Next
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  disabled={currentEp <= 1}
                  onClick={() => goToEp(currentEp - 1)}
                  className="flex items-center justify-center text-white transition-all duration-200 hover:text-white disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:hover:text-muted-foreground/30 active:scale-95"
                  title="Previous Episode"
                  aria-label="Previous Episode"
                >
                  <SkipBack className="size-5" fill="currentColor" />
                </button>
                <button
                  disabled={currentEp >= total}
                  onClick={() => goToEp(currentEp + 1)}
                  className="flex items-center justify-center text-white transition-all duration-200 hover:text-white disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:hover:text-muted-foreground/30 active:scale-95"
                  title="Next Episode"
                  aria-label="Next Episode"
                >
                  <SkipForward className="size-5" fill="currentColor" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 shrink-0">
                <Subtitles className="size-4 text-white" />
                <span className="text-white font-semibold text-sm">Servers</span>
              </div>

              <div className="flex items-center justify-end w-full max-w-[200px]">
                {streamsFetching && languages.length === 0 ? (
                  <div className="h-7 w-28 rounded-full skeleton-box" />
                ) : languages.length > 0 ? (
                  <div className="relative flex w-full rounded-full bg-card/60 p-1 ring-1 ring-white/10 backdrop-blur-md">
                    <div
                      className="absolute bottom-1 top-1 left-1 rounded-full bg-white transition-transform duration-300 ease-out shadow-sm"
                      style={{
                        width: `calc((100% - 8px) / ${languages.length})`,
                        transform: `translateX(calc(${languages.indexOf(selectedLang)} * 100%))`,
                      }}
                    />
                    {languages.map((lang) => {
                      const isSub = lang === "SUB" || lang === "JAPANESE";
                      const isDub = lang === "DUB" || lang === "ENGLISH";
                      const isHindi = lang === "HINDI";

                      const Icon = isSub ? Subtitles : Mic;
                      let label = lang;
                      if (isSub) label = "SUB";
                      else if (isDub) label = "DUB";
                      else if (isHindi) label = "HINDI";

                      return (
                        <button
                          key={lang}
                          onClick={() => setSelectedLang(lang)}
                          className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold uppercase transition-colors duration-300 ${
                            selectedLang === lang
                              ? "text-black"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="size-3" strokeWidth={2.5} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {streamsFetching ? (
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <div className="h-7 w-20 rounded-full skeleton-box" />
                <div className="h-7 w-24 rounded-full skeleton-box" />
                <div className="h-7 w-16 rounded-full skeleton-box" />
              </div>
            ) : sources.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {sources.map((src) => (
                  <button
                    key={src.server}
                    onClick={() => setSelectedServer(src.server)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      selectedServer === src.server
                        ? "bg-white text-black shadow-sm"
                        : "bg-card/60 text-muted-foreground ring-1 ring-white/10 hover:text-foreground hover:bg-white/5"
                    }`}
                  >
                    {serverLabel(src, selectedLang)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/50 py-2">No servers available</div>
            )}
          </div>
          <div className="mt-4 hidden lg:block duration-300 animate-in fade-in slide-in-from-bottom-4">
            <AnimeDetails m={m} />
          </div>
          {/* Comments section for desktop layout, aligns with video player */}
          <div className="mt-4 hidden lg:block">
            <CommentsSection
              mediaId={m.id}
              mediaType="anime"
              currentEp={currentEp}
              title={currentEpInfo?.title || `Episode ${currentEp}`}
            />
          </div>
        </div>

        <DesktopRelatedList relations={relations} />
      </div>

      <div className="mt-6 lg:hidden">
        <div className="relative flex w-full items-center rounded-full border border-white/5 bg-zinc-950/60 p-1">
          <div
            className="absolute bottom-1 top-1 left-1 rounded-full bg-white transition-transform duration-300 ease-out shadow-md"
            style={{
              width: `calc((100% - 8px) / 3)`,
              transform: `translateX(calc(${
                mobileTab === "Episodes" ? 0 : mobileTab === "Details" ? 1 : 2
              } * 100%))`,
            }}
          />
          {(["Episodes", "Details", "Related"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={
                "relative z-10 flex-1 rounded-full py-2 text-xs font-bold transition-colors duration-300 text-center " +
                (mobileTab === t ? "text-black" : "text-muted-foreground hover:text-foreground")
              }
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {mobileTab === "Episodes" && (
            <div key="episodes" className="duration-300 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3 px-2 gap-2">
                <div className="flex items-center gap-1.5 min-w-0"></div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {ranges.length > 1 && (
                    <div className="relative shrink-0 min-w-[95px]">
                      <SharedSelect
                        value={String(rangeIdx)}
                        options={ranges.map((r, i) => ({
                          value: String(i),
                          display: r.label,
                        }))}
                        onChange={(v) => setRangeIdx(Number(v))}
                        triggerClassName="py-1 px-2.5 text-xs font-semibold text-white bg-card/60 border border-white/10"
                      />
                    </div>
                  )}
                  <button
                    onClick={() => setSortOrder((v) => (v === "desc" ? "asc" : "desc"))}
                    className="flex items-center justify-center p-1.5 rounded-lg border border-white/10 bg-card/60 hover:bg-card text-white text-xs font-bold transition active:scale-95"
                    title={
                      sortOrder === "desc"
                        ? "Order: Descending (Newest first)"
                        : "Order: Ascending (Oldest first)"
                    }
                    aria-label={sortOrder === "desc" ? "Sort descending" : "Sort ascending"}
                  >
                    {sortOrder === "desc" ? (
                      <SortDescIcon className="size-3.5 text-white" />
                    ) : (
                      <SortAscIcon className="size-3.5 text-white" />
                    )}
                  </button>
                </div>
              </div>
              <div className="no-scrollbar overflow-y-auto max-h-[400px]">
                {isRefreshingEps ? (
                  <div className="space-y-1 p-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-xl border border-white/5 bg-card/40 p-1.5"
                      >
                        <div className="aspect-video w-20 shrink-0 rounded-lg skeleton-box" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-3/4 skeleton-text" />
                          <div className="h-2.5 w-1/2 skeleton-text opacity-70" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EpisodeList
                    items={visibleEps}
                    currentEp={currentEp}
                    animeId={m.id}
                    animeDesc={m.description}
                    nextAiringEpisode={m.nextAiringEpisode}
                    banner={m.bannerImage || m.coverImage.extraLarge || m.coverImage.large}
                  />
                )}
              </div>
            </div>
          )}
          {mobileTab === "Details" && (
            <div key="details" className="duration-300 animate-in fade-in slide-in-from-bottom-4">
              <AnimeDetails m={m} />
            </div>
          )}
          {mobileTab === "Related" && (
            <div key="related" className="duration-300 animate-in fade-in slide-in-from-bottom-4">
              <RelatedRow relations={relations} />
            </div>
          )}
        </div>
      </div>

      {/* Mobile Comments Box */}
      <div className="mt-4 lg:hidden">
        <CommentsSection
          mediaId={m.id}
          mediaType="anime"
          currentEp={currentEp}
          title={currentEpInfo?.title || `Episode ${currentEp}`}
        />
      </div>

      {showDownloadModal && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-4 shadow-2xl animate-in zoom-in-95">
            <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-lg font-bold">Downloads</h3>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="rounded-full p-1 hover:bg-white/10 transition"
              >
                <X className="size-5 text-white/70" />
              </button>
            </div>
            <div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar">
              {streams?._downloads?.length > 0 ? (
                streams._downloads.map((dl: any, idx: number) => (
                  <a
                    key={idx}
                    href={dl.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/5 bg-card/40 p-3 transition hover:border-[var(--brand)]/40 hover:bg-card/70"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-bold text-foreground capitalize">
                        {dl.lang}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--brand)]">
                        {dl.quality}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{dl.server}</p>
                    </div>
                    <Download className="size-4 shrink-0 text-white/50" />
                  </a>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No downloads available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= Vidstack Player ========================= */
const EQ_CSS = `
@keyframes eq-bounce {
  0%, 100% { height: 4px; }
  50% { height: 18px; }
}
.eq-bar {
  width: 3px;
  background: white;
  animation: eq-bounce 0.9s ease-in-out infinite;
  border-radius: 2px;
}
.eq-bar:nth-child(1){ animation-delay: 0s; }
.eq-bar:nth-child(2){ animation-delay: 0.15s; }
.eq-bar:nth-child(3){ animation-delay: 0.3s; }
`;

function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatVttTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00:00.000";
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((totalSecs % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSecs % 60).toString().padStart(2, "0");
  const ms = Math.floor((seconds - totalSecs) * 1000)
    .toString()
    .padStart(3, "0");
  return `${hrs}:${mins}:${secs}.${ms}`;
}

function seekPlayer(player: any, targetTime: number) {
  if (!player || typeof targetTime !== "number" || isNaN(targetTime)) return;
  try {
    if (typeof player.seek === "function") {
      player.seek(targetTime);
    } else if (player.remote && typeof player.remote.seek === "function") {
      player.remote.seek(targetTime);
    } else {
      player.currentTime = targetTime;
    }
  } catch {
    try {
      player.currentTime = targetTime;
    } catch {}
  }
}

function SkipSegmentOverlay({
  intro,
  outro,
  autoSkip,
  playerRef,
}: {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  autoSkip: boolean;
  playerRef: React.RefObject<any>;
}) {
  const currentTime = useMediaState("currentTime");
  const duration = useMediaState("duration");
  const canPlay = useMediaState("canPlay");
  const lastSkippedIntro = useRef(false);
  const lastSkippedOutro = useRef(false);

  useEffect(() => {
    if (intro && currentTime < intro.start - 2) {
      lastSkippedIntro.current = false;
    }
    if (outro && currentTime < outro.start - 2) {
      lastSkippedOutro.current = false;
    }
  }, [currentTime, intro, outro]);

  const isInsideIntro = Boolean(
    intro &&
    typeof intro.start === "number" &&
    typeof intro.end === "number" &&
    intro.end > intro.start &&
    currentTime >= intro.start &&
    currentTime < intro.end,
  );
  const isInsideOutro = Boolean(
    outro &&
    typeof outro.start === "number" &&
    typeof outro.end === "number" &&
    outro.end > outro.start &&
    currentTime >= outro.start &&
    currentTime < outro.end,
  );

  useEffect(() => {
    if (!autoSkip || duration <= 0 || !playerRef.current || !canPlay) return;

    if (isInsideIntro && !lastSkippedIntro.current && intro) {
      lastSkippedIntro.current = true;
      seekPlayer(playerRef.current, intro.end);
    } else if (isInsideOutro && !lastSkippedOutro.current && outro) {
      lastSkippedOutro.current = true;
      seekPlayer(playerRef.current, outro.end);
    }
  }, [isInsideIntro, isInsideOutro, autoSkip, duration, intro, outro, playerRef, canPlay]);

  const handleManualSkipIntro = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playerRef.current && intro) {
      seekPlayer(playerRef.current, intro.end);
    }
  };

  const handleManualSkipOutro = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playerRef.current && outro) {
      seekPlayer(playerRef.current, outro.end);
    }
  };

  if (autoSkip || !canPlay) return null;

  return (
    <>
      {isInsideIntro && intro && (
        <div className="absolute bottom-16 sm:bottom-20 right-4 sm:right-6 z-40 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto select-none">
          <button
            type="button"
            onClick={handleManualSkipIntro}
            onPointerDown={(e) => e.stopPropagation()}
            className="group flex items-center gap-2 rounded-lg bg-black/80 hover:bg-neutral-900/90 text-white border border-white/20 hover:border-white/40 backdrop-blur-md px-3.5 py-2 text-xs font-semibold shadow-2xl transition active:scale-95 cursor-pointer"
            title={`Skip Intro to ${formatTimestamp(intro.end)}`}
          >
            <SkipForward className="size-3.5 fill-current text-white/90 group-hover:text-white" />
            <span>Skip Intro</span>
          </button>
        </div>
      )}

      {isInsideOutro && outro && (
        <div className="absolute bottom-16 sm:bottom-20 right-4 sm:right-6 z-40 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto select-none">
          <button
            type="button"
            onClick={handleManualSkipOutro}
            onPointerDown={(e) => e.stopPropagation()}
            className="group flex items-center gap-2 rounded-lg bg-black/80 hover:bg-neutral-900/90 text-white border border-white/20 hover:border-white/40 backdrop-blur-md px-3.5 py-2 text-xs font-semibold shadow-2xl transition active:scale-95 cursor-pointer"
            title={`Skip Outro to ${formatTimestamp(outro.end)}`}
          >
            <SkipForward className="size-3.5 fill-current text-white/90 group-hover:text-white" />
            <span>Skip Outro</span>
          </button>
        </div>
      )}
    </>
  );
}

function VidstackPlayer({
  m,
  source,
  onEnded,
  episodeNum,
  episodeTitle,
  posterUrl,
  onProgress,
  autoSkip,
  onNextEp,
  onPrevEp,
  isLoadingStream,
}: {
  m: AnilistMedia;
  source: StreamSource;
  onEnded: () => void;
  episodeNum: number;
  episodeTitle: string;
  posterUrl: string;
  onProgress: (currentTime: number, duration: number) => void;
  autoSkip: boolean;
  onNextEp?: () => void;
  onPrevEp?: () => void;
  isLoadingStream?: boolean;
}) {
  const playerRef = useRef<any>(null);
  const [resolvedSourceUrl, setResolvedSourceUrl] = useState<string>(source.url);
  const lastSavedTime = useRef(0);
  const hasRestoredTime = useRef(false);
  const hasRestoredPrefs = useRef(false);

  // Method 4: In-Memory Client Blob Generation for HLS streams (0 Cloudflare requests)
  useEffect(() => {
    let isMounted = true;
    const cleanUrl = (source.url || "").split("?")[0].toLowerCase();
    const isHls =
      cleanUrl.endsWith(".m3u8") ||
      source.url.includes(".m3u8") ||
      source.type === "application/x-mpegurl" ||
      source.type?.includes("mpegurl");

    if (isHls && source.url && !source.url.startsWith("blob:")) {
      createClientHlsBlobUrl(source.url).then((blobUrl) => {
        if (isMounted) {
          setResolvedSourceUrl(blobUrl);
        }
      });
    } else {
      setResolvedSourceUrl(source.url);
    }

    return () => {
      isMounted = false;
    };
  }, [source.url, source.type]);
  useEffect(() => {
    hasRestoredTime.current = false;
    lastSavedTime.current = 0;
  }, [source.url, episodeNum]);
  const [qualityState, setQualityState] = useState({ hint: "", autoLabel: "" });

  const autoSkipRef = useRef(autoSkip);
  useEffect(() => {
    autoSkipRef.current = autoSkip;
  }, [autoSkip]);

  useEffect(() => {
    if (isLoadingStream && playerRef.current) {
      playerRef.current.pause();
    }
  }, [isLoadingStream]);

  const lastForcedHindiRef = useRef<number>(0);
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    if (!playerRef.current) return;
    return playerRef.current.subscribe(
      ({ textTrack, quality, autoQuality, audioTrack, audioTracks }: any) => {
        try {
          if (playerRef.current?.audioTracks) {
            const tracks = Array.from(playerRef.current.audioTracks) as any[];
            const hindiTrack = tracks.find(
              (t) =>
                t.label?.toLowerCase().includes("hindi") ||
                t.language?.toLowerCase().includes("hi") ||
                t.label?.toLowerCase().includes("hin"),
            );
            const now = Date.now();
            if (hindiTrack && !hindiTrack.selected && now - lastForcedHindiRef.current > 1000) {
              lastForcedHindiRef.current = now;
              hindiTrack.selected = true;
            }
          }
        } catch {}

        let menuHint = "";
        let autoLabel = "";
        if (quality && !autoQuality) {
          menuHint = quality.height + "p";
        } else if (autoQuality) {
          const autoQ = quality ? quality.height + "p" : "";
          menuHint = autoQ ? `Auto (${autoQ})` : "Auto";
          autoLabel = autoQ ? `(${autoQ})` : "";
        }
        setQualityState({ hint: menuHint, autoLabel });

        if (!hasRestoredPrefs.current) return;

        try {
          if (textTrack !== undefined) {
            localStorage.setItem("global_pref_captions", textTrack ? "true" : "false");
          }
        } catch {}

        try {
          if (quality && !autoQuality) {
            localStorage.setItem("global_pref_quality", quality.height + "p");
          } else if (autoQuality) {
            localStorage.setItem("global_pref_quality", "auto");
          }
        } catch {}
      },
    );
  }, []);

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

  const handleTimeUpdate = () => {
    if (!playerRef.current) return;
    const t = playerRef.current.currentTime || 0;
    const d = playerRef.current.duration || 0;

    const currentSource = sourceRef.current;

    if (autoSkipRef.current && d > 0 && currentSource) {
      if (currentSource.intro && currentSource.intro.end > currentSource.intro.start) {
        if (t >= currentSource.intro.start && t < currentSource.intro.end) {
          seekPlayer(playerRef.current, currentSource.intro.end);
        }
      }
      if (currentSource.outro && currentSource.outro.end > currentSource.outro.start) {
        if (t >= currentSource.outro.start && t < currentSource.outro.end) {
          seekPlayer(playerRef.current, currentSource.outro.end);
        }
      }
    }

    // Save watch progress to localStorage every 2 seconds
    const currentSec = Math.floor(t);
    const lastSavedSec = Math.floor(lastSavedTime.current);
    if (d > 0 && Math.abs(currentSec - lastSavedSec) >= 2) {
      lastSavedTime.current = t;
      try {
        localStorage.setItem(`progress_${m.id}_ep_${episodeNum}`, t.toString());
        onProgress(t, d);
      } catch {}
    }
  };

  const handleCanPlay = (e?: any) => {
    if (!hasRestoredPrefs.current && playerRef.current) {
      hasRestoredPrefs.current = true;
      try {
        const captionsPref = localStorage.getItem("global_pref_captions");
        // default to true unless explicitly disabled
        const shouldShow = captionsPref !== "false";
        if (playerRef.current.textTracks) {
          const tracks = Array.from(playerRef.current.textTracks);
          for (const track of tracks) {
            if (track.kind === "subtitles" || track.kind === "captions") {
              track.mode = shouldShow ? "showing" : "disabled";
            }
          }
        }
      } catch {}

      try {
        if (playerRef.current.audioTracks) {
          const audioTracks = Array.from(playerRef.current.audioTracks) as any[];
          const hindiTrack = audioTracks.find(
            (t) =>
              t.label?.toLowerCase().includes("hindi") ||
              t.language?.toLowerCase().includes("hi") ||
              t.label?.toLowerCase().includes("hin"),
          );
          if (hindiTrack) {
            hindiTrack.selected = true;
          } else if (audioTracks.length > 0) {
            audioTracks[0].selected = true;
          }
        }
      } catch {}

      try {
        const qualityPref = localStorage.getItem("global_pref_quality");
        if (qualityPref && qualityPref !== "auto" && playerRef.current.qualities) {
          const h = parseInt(qualityPref);
          const q = playerRef.current.qualities.find((q: any) => q.height === h);
          if (q) q.selected = true;
        }
      } catch {}
    }

    if (!hasRestoredTime.current && playerRef.current) {
      hasRestoredTime.current = true;
      try {
        const savedTimeStr = localStorage.getItem(`progress_${m.id}_ep_${episodeNum}`);
        if (savedTimeStr) {
          const savedTime = parseFloat(savedTimeStr);
          if (savedTime > 0 && savedTime < (playerRef.current.duration || Infinity) - 10) {
            playerRef.current.currentTime = savedTime;
            lastSavedTime.current = savedTime;
          }
        }
      } catch {}
    }

    // Restore fullscreen automatically if transitioned to next episode
    if (sessionStorage.getItem("restore_fullscreen") === "true" && playerRef.current) {
      sessionStorage.removeItem("restore_fullscreen");
      try {
        playerRef.current.enterFullscreen();
      } catch (err) {
        console.error("Failed to restore fullscreen mode:", err);
      }
    }

    // Always trigger programmatic play to override browser autoplay blocks
    if (playerRef.current) {
      playerRef.current.play().catch(() => {});
    }
  };

  const [isFlashing, setIsFlashing] = useState(false);
  const isTakingScreenshot = useRef(false);

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
        toast.error("Video player not found");
        return;
      }

      if (!video.videoWidth || !video.videoHeight) {
        toast.error("Video frame is loading, please try again in a moment");
        return;
      }

      // Trigger shutter flash effect
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 200);

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        toast.error("Canvas context not supported");
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const currentSec = Math.floor(playerRef.current?.currentTime || video.currentTime || 0);
      const mins = Math.floor(currentSec / 60);
      const secs = (currentSec % 60).toString().padStart(2, "0");
      const safeTitle = (
        episodeTitle ||
        m?.title?.english ||
        m?.title?.romaji ||
        "anime_screenshot"
      )
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      const filename = `${safeTitle}_${mins}m${secs}s.png`;

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
            toast.success("Screenshot saved!", {
              description: `${filename} (${canvas.width}x${canvas.height})`,
            });
          } else {
            const dataUrl = canvas.toDataURL("image/png");
            triggerDownload(dataUrl);
            toast.success("Screenshot saved!", {
              description: `${filename} (${canvas.width}x${canvas.height})`,
            });
          }
        }, "image/png");
      } catch (blobErr) {
        try {
          const dataUrl = canvas.toDataURL("image/png");
          triggerDownload(dataUrl);
          toast.success("Screenshot saved!", {
            description: `${filename} (${canvas.width}x${canvas.height})`,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "CORS restriction";
          console.error("Screenshot export error:", err);
          toast.error("Failed to export screenshot: " + message);
        }
      }
    } catch (err) {
      console.error("Screenshot capture error:", err);
      toast.error("Failed to capture screenshot");
    }
  }, [episodeTitle, m]);

  const mediaSrc = useMemo(() => {
    const streamTarget = resolvedSourceUrl || source.url;
    if (!streamTarget) return "";
    if (source.type) {
      return { src: streamTarget, type: source.type as `${string}/${string}` };
    }
    const cleanUrl = streamTarget.split("?")[0].toLowerCase();
    if (cleanUrl.endsWith(".m3u8") || streamTarget.startsWith("blob:")) {
      return { src: streamTarget, type: "application/x-mpegurl" as const };
    }
    if (cleanUrl.endsWith(".mp4")) {
      return { src: streamTarget, type: "video/mp4" as const };
    }
    if (cleanUrl.endsWith(".webm")) {
      return { src: streamTarget, type: "video/webm" as const };
    }
    if (cleanUrl.endsWith(".ogg") || cleanUrl.endsWith(".ogv")) {
      return { src: streamTarget, type: "video/ogg" as const };
    }
    return streamTarget;
  }, [resolvedSourceUrl, source.url, source.type]);

  useEffect(() => {
    const el = playerRef.current?.el || playerRef.current;
    if (!el) return;
    const preventMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    el.addEventListener("contextmenu", preventMenu, { capture: true });
    return () => {
      el.removeEventListener("contextmenu", preventMenu, { capture: true });
    };
  }, [source.url]);

  return (
    <div
      className="relative w-full aspect-video rounded-[12px] bg-black/20 select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
    >
      {/* Overrides for timeline and menu */}
      <style>{`
        `}</style>
      <MediaPlayer
        key={`media-${source.server}-${source.language || ""}-${source.url}-${episodeNum}`}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={
          {
            "--media-brand": "white",
            "--video-brand": "white",
            "--media-slider-track-bg": "rgba(255, 255, 255, 0.3)",
            "--media-slider-track-fill-bg": "white",
            "--media-slider-thumb-bg": "white",
            "--media-slider-focused-thumb-shadow": "none",
            "--vds-quality-hint": JSON.stringify(qualityState.hint || "Auto"),
            "--vds-audio-hint": JSON.stringify("Default"),
          } as React.CSSProperties & { [key: string]: string }
        }
        className="w-full h-full rounded-[12px] overflow-hidden bg-black"
        title={episodeTitle}
        poster={posterUrl}
        src={mediaSrc as any}
        autoPlay={true}
        playsInline={true}
        volume={volume}
        muted={muted}
        load="eager"
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {}}
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
        onEnded={onEnded}
        onCanPlay={handleCanPlay}
        ref={playerRef}
      >
        {isLoadingStream && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
            {posterUrl && (
              <img
                src={posterUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110"
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-[var(--brand)] shadow-[0_0_15px_var(--brand)]" />
              <p className="text-xs font-bold text-white/80 animate-pulse tracking-wide">
                LOADING STREAM
              </p>
            </div>
          </div>
        )}
        <MediaProvider>
          <Poster className="vds-poster absolute inset-0 block h-full w-full object-cover bg-black" />
          <TimelineMarkers intro={source.intro} outro={source.outro} />
          {source.caption && (
            <Track
              src={source.caption}
              kind="subtitles"
              label="English"
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
          <div className="absolute inset-0 bg-white/40 pointer-events-none z-50 transition-opacity duration-200" />
        )}
        {/* Skip Segment Overlay & Auto-skip Notification */}
        <SkipSegmentOverlay
          intro={source.intro}
          outro={source.outro}
          autoSkip={autoSkip}
          playerRef={playerRef}
        />
        <DefaultVideoLayout
          icons={customVidstackIcons}
          hideQualityBitrate={true}
          noGestures={true}
          smallLayoutWhen={({ width, height, fullscreen }) =>
            !fullscreen && (width < 576 || height < 380)
          }
          slots={{
            gestures: null,
            googleCastButton: null,
            muteButton: null,
            volumeSlider: null,
            chaptersMenu: null,
            largeLayout: {
              topControlsGroupStart: (
                <GoogleCastButton className="my-top-cast-btn vds-button pointer-events-auto cursor-pointer">
                  <Cast className="vds-icon size-7 sm:size-8" strokeWidth={2} />
                </GoogleCastButton>
              ),
              muteButton: null,
              volumeSlider: null,
              chaptersMenu: null,
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
                <>
                  <DefaultTooltip content="Take Screenshot" placement="top">
                    <button
                      type="button"
                      className="vds-button pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTakeScreenshot();
                      }}
                      onPointerUp={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTakeScreenshot();
                      }}
                      onTouchEnd={(e) => {
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
                </>
              ),
            },
            smallLayout: {
              topControlsGroupStart: (
                <GoogleCastButton className="my-top-cast-btn vds-button pointer-events-auto cursor-pointer">
                  <Cast className="vds-icon size-7 sm:size-8" strokeWidth={2} />
                </GoogleCastButton>
              ),
              muteButton: null,
              volumeSlider: null,
              chaptersMenu: null,
              afterCaptionButton: (
                <>
                  <button
                    type="button"
                    className="vds-button pointer-events-auto cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTakeScreenshot();
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTakeScreenshot();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTakeScreenshot();
                    }}
                    title="Take Screenshot"
                    aria-label="Take Screenshot"
                  >
                    <CameraIcon className="size-7 sm:size-8" />
                  </button>
                </>
              ),
            },
          }}
        />
      </MediaPlayer>
    </div>
  );
}

function NextEpisodeCountdown({
  nextEp,
  banner,
}: {
  nextEp: { episode: number; airingAt: number };
  banner: string | null;
}) {
  const [timeLeft, setTimeLeft] = useState(() => nextEp.airingAt - Math.floor(Date.now() / 1000));

  useEffect(() => {
    setTimeLeft(nextEp.airingAt - Math.floor(Date.now() / 1000));
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextEp]);

  if (timeLeft <= 0) return null;

  const d = Math.floor(timeLeft / (3600 * 24));
  const h = Math.floor((timeLeft % (3600 * 24)) / 3600);
  const m = Math.floor((timeLeft % 3600) / 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);

  return (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-white/5 bg-card/40 p-2 animate-in fade-in duration-300">
      <div className="relative grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-black sm:w-36">
        {banner ? (
          <img
            src={banner}
            alt=""
            referrerPolicy="no-referrer"
            decoding="async"
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="text-xs font-bold text-muted-foreground">EP {nextEp.episode}</span>
        )}
        <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
          EP {nextEp.episode}
        </span>
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <p className="truncate text-sm font-bold">Soon in {parts.join(" ")}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground sm:text-xs">
          {new Date(nextEp.airingAt * 1000).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

/* ========================= Episode List ========================= */
function EpisodeList({
  items,
  currentEp,
  animeId,
  animeDesc,
  nextAiringEpisode,
  banner,
}: {
  items: { num: number; title: string; description: string | null; thumbnail: string; filler?: boolean }[];
  currentEp: number;
  animeId: number | string;
  animeDesc?: string | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  banner?: string | null;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  return (
    <>
      <style>{EQ_CSS}</style>
      <div className="grid gap-2 p-2">
        {items.map((ep) => {
          const isActive = ep.num === currentEp;
          return (
            <Link
              key={ep.num}
              ref={
                isActive
                  ? (el: HTMLAnchorElement | null) => {
                      activeRef.current = el;
                    }
                  : undefined
              }
              to="/anime/watch/$id"
              params={{ id: String(animeId) }}
              hash={String(ep.num)}
              className={
                "group flex min-w-0 items-stretch gap-3 overflow-hidden rounded-xl border transition " +
                (isActive
                  ? "border-[var(--brand)]/50 bg-white/[0.06]"
                  : "border-white/[0.1] bg-[#121212] hover:border-[var(--brand)]/40 hover:bg-white/[0.04]")
              }
            >
              <div className="relative grid aspect-video w-24 shrink-0 self-stretch place-items-center overflow-hidden rounded-xl bg-black sm:w-32">
                {ep.thumbnail ? (
                  <img
                    src={ep.thumbnail}
                    alt=""
                    loading="lazy"
                    className={
                      "size-full rounded-xl object-cover transition duration-300 group-hover:scale-110 " +
                      (isActive ? "blur-[1.5px] scale-105" : "")
                    }
                  />
                ) : (
                  <span className="text-[10px] font-bold text-muted-foreground">EP {ep.num}</span>
                )}
                {isActive && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40">
                    <div className="flex items-center gap-1">
                      <div className="eq-bar" />
                      <div className="eq-bar" />
                      <div className="eq-bar" />
                    </div>
                  </div>
                )}
                <span className="pointer-events-none absolute bottom-1 left-1 z-10 flex items-center rounded-md bg-white/10 ring-1 ring-white/15 backdrop-blur-md px-1.5 py-0.5 text-[9.5px] font-bold text-white shadow-sm">
                  EP {ep.num}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center py-1.5 pr-2.5">
                <p
                  className={
                    "truncate text-[11px] sm:text-xs font-bold " +
                    (ep.filler ? "text-amber-400" : "text-foreground")
                  }
                >
                  {ep.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground sm:text-[11px]">
                  {ep.description || stripHtml(animeDesc || "")?.slice(0, 120) || "—"}
                </p>
              </div>
            </Link>
          );
        })}
        {nextAiringEpisode && (
          <NextEpisodeCountdown nextEp={nextAiringEpisode} banner={banner ?? null} />
        )}
      </div>
    </>
  );
}

/* ========================= Related Row ========================= */
/* ========================= Anime Details ========================= */
function AnimeDetails({ m }: { m: AnilistMedia }) {
  const [expanded, setExpanded] = useState(false);

  const poster = m.coverImage.extraLarge || m.coverImage.large;
  const score = m.averageScore ?? m.meanScore;
  const epCount = m.episodes || totalEpisodeCount(m);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40">
      <div className="relative z-10 p-4 sm:p-5 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
        {/* Poster */}
        <div className="relative shrink-0 h-[180px] w-[120px] sm:h-[220px] sm:w-[150px] overflow-hidden rounded-xl shadow-2xl shadow-black/50 border border-white/5">
          <img src={poster} alt="" className="h-full w-full object-cover" />
        </div>

        <div className="flex flex-col w-full min-w-0">
          {/* Title & Show Info button */}
          <div className="flex w-full items-start justify-between gap-4 mb-2">
            <h2 className="text-[17px] sm:text-[22px] font-bold text-white line-clamp-2 leading-tight">
              {titleOf(m)}
            </h2>
            <Link
              to="/anime/$id"
              params={{ id: String(m.id) }}
              className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-all duration-300 hover:border-white/20 hover:bg-white/10"
              title="Show details"
            >
              <ExternalLink className="size-4 shrink-0 text-white/70 transition-transform duration-300 group-hover:scale-110 group-hover:text-white" />
            </Link>
          </div>

          {/* Stats - using exactly the original styles from anime.$id.tsx */}
          <div className="flex w-full flex-wrap items-center gap-2 text-xs font-semibold text-white mb-4">
            {score != null && (
              <span
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 ring-1 ring-white/10"
                style={{ color: getScoreColor(score) }}
              >
                <Star className="size-3.5 fill-current" />
                {formatScore(score)}
              </span>
            )}
            {m.status && (
              <span
                className={`rounded-xl bg-white/5 px-3 py-1.5 uppercase tracking-wider ring-1 ring-white/10 ${getStatusColor(m.status)}`}
              >
                {formatStatus(m.status)}
              </span>
            )}

            {m.format && (
              <span className="rounded-xl bg-white/5 px-3 py-1.5 uppercase tracking-wider ring-1 ring-white/10 text-foreground/90">
                {m.format.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {/* Genres - using the exact green styling from original */}
          {m.genres && m.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {m.genres.slice(0, 4).map((g) => (
                <Link
                  key={g}
                  to="/anime/browse"
                  search={{ genre: g }}
                  className="rounded-full border border-[var(--success,#14b8a6)]/40 bg-transparent px-3 py-1 text-[11px] font-semibold text-[var(--success,#14b8a6)] transition hover:bg-[var(--success,#14b8a6)]/10"
                >
                  {g}
                </Link>
              ))}
            </div>
          )}

          {/* Description */}
          {m.description && (
            <div className="relative mt-1">
              <div
                className={`relative overflow-hidden transition-[max-height] duration-300 ease-in-out ${
                  expanded ? "max-h-[1200px]" : "max-h-[70px]"
                }`}
              >
                <div
                  className="text-[13px] leading-relaxed text-white/70"
                  dangerouslySetInnerHTML={{ __html: m.description }}
                />
                {!expanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card/90 via-card/50 to-transparent pointer-events-none" />
                )}
              </div>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-white/80 hover:text-white transition-colors"
              >
                <span>{expanded ? "SHOW LESS" : "READ MORE"}</span>
                <ChevronDown
                  className={`size-3 transition-transform duration-300 ${
                    expanded ? "rotate-180" : ""
                  }`}
                  strokeWidth={2.5}
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RelatedRow({ relations }: { relations: { relationType: string; node: AnilistMedia }[] }) {
  const seenIds = new Set<string | number>();
  const all: { media: AnilistMedia; label: string }[] = [];

  for (const r of sortRelations(relations)) {
    if (r.node && !seenIds.has(r.node.id)) {
      seenIds.add(r.node.id);
      all.push({ media: r.node, label: r.relationType.replace(/_/g, " ") });
    }
  }

  if (all.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No related content.</div>
    );
  }

  return (
    <div className="-mt-6">
      <AnimeRowShell>
        {all.map((item) => (
          <div
            key={item.media.id}
            className="group/badge relative shrink-0 snap-start w-[130px] sm:w-[165px] lg:w-[190px]"
          >
            <AnimeCard media={item.media} badge={null} />
            <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur transition-transform duration-300 group-hover/badge:-translate-y-1">
              {item.label}
            </span>
          </div>
        ))}
      </AnimeRowShell>
    </div>
  );
}

/* ========================= Comments ========================= */
function CommentsPlaceholder() {
  return (
    <div className="rounded-2xl border border-white/5 bg-card/40 p-4">
      <div className="flex items-center gap-2 text-sm font-bold">
        <MessageSquare className="size-4" />
        Comments
      </div>
      <p className="mt-3 text-left text-xs text-muted-foreground">Comments coming soon.</p>
      <div className="pointer-events-none mt-3 opacity-40">
        <div className="flex items-center gap-3">
          <div className="size-8 shrink-0 rounded-full bg-white/10" />
          <div className="flex-1 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 text-xs text-muted-foreground text-left">
            Write a comment…
          </div>
        </div>
      </div>
    </div>
  );
}

function WatchPageSkeleton() {
  return (
    <main className="pb-0 pt-[68px]">
      <div className="mx-auto max-w-[1500px] px-2 sm:px-3 lg:px-5 pb-16">
        <div className="lg:grid lg:grid-cols-[1fr_400px] lg:gap-3">
          <div className="min-w-0">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <div className="relative size-full overflow-hidden flex items-center justify-center bg-black">
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-[var(--brand)] shadow-[0_0_15px_var(--brand)]" />
                  <p className="text-xs font-bold text-white/80 animate-pulse tracking-wide">
                    LOADING STREAM
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="hidden lg:block relative h-full z-10">
            <div className="absolute inset-0 flex flex-col rounded-xl border border-white/5 bg-card/40 no-scrollbar">
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-2 py-2.5 rounded-t-xl z-20 gap-2">
                <div className="h-4 w-24 skeleton-text" />
                <div className="h-6 w-16 skeleton-text" />
              </div>
              <div className="flex-1 overflow-y-hidden p-2 space-y-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl border border-white/5 bg-card/40 p-1.5"
                  >
                    <div className="aspect-video w-20 shrink-0 rounded-lg skeleton-box" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 skeleton-text" />
                      <div className="h-2.5 w-1/2 skeleton-text opacity-70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 lg:grid lg:grid-cols-[1fr_400px] lg:gap-3 lg:items-start">
          <div className="min-w-0">
            <div className="relative z-20 rounded-2xl border border-white/5 bg-card/40 p-3 sm:p-4 flex flex-col">
              <div className="mb-4 pb-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                  <div className="h-4 w-20 skeleton-text" />
                  <div className="h-4 w-20 skeleton-text" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="size-5 skeleton-box rounded" />
                  <div className="size-5 skeleton-box rounded" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="h-4 w-16 skeleton-text" />
                <div className="h-8 w-32 rounded-full skeleton-box" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="h-4 w-20 skeleton-text" />
                <div className="flex gap-2">
                  <div className="h-8 w-24 rounded-full skeleton-box" />
                  <div className="h-8 w-24 rounded-full skeleton-box" />
                </div>
              </div>
            </div>

            {/* Mobile Tabs Skeleton */}
            <div className="lg:hidden mt-3 rounded-2xl border border-white/5 bg-card/40 p-1.5 flex items-center justify-between relative">
              <div className="h-8 flex-1 skeleton-box rounded-xl mx-1" />
              <div className="h-8 flex-1 skeleton-box rounded-xl mx-1" />
              <div className="h-8 flex-1 skeleton-box rounded-xl mx-1" />
            </div>

            <div className="mt-4">
              <div className="flex gap-3">
                <div className="hidden sm:block w-[140px] shrink-0">
                  <div className="aspect-[2/3] w-full rounded-xl skeleton-box" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="h-6 w-3/4 skeleton-text" />
                  <div className="h-4 w-1/3 skeleton-text" />
                  <div className="flex gap-2 mt-2">
                    <div className="h-6 w-16 rounded-full skeleton-box" />
                    <div className="h-6 w-16 rounded-full skeleton-box" />
                  </div>
                  <div className="h-20 w-full skeleton-text mt-4" />
                </div>
              </div>
            </div>
          </div>
          <div className="hidden lg:flex flex-col gap-3">
            <div className="flex flex-col rounded-xl border border-white/5 bg-card/40 no-scrollbar overflow-hidden relative z-10">
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 rounded-t-xl z-20">
                <div className="h-4 w-16 skeleton-text" />
              </div>
              <div className="flex-1 p-2 space-y-1.5 min-h-[300px]">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-transparent p-2 pr-3"
                  >
                    <div className="size-14 shrink-0 rounded-lg skeleton-box sm:size-16" />
                    <div className="min-w-0 flex-1 pr-1 space-y-2">
                      <div className="h-3.5 w-full skeleton-text" />
                      <div className="h-2.5 w-2/3 skeleton-text opacity-70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
