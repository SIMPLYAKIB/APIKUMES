import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, useIsFetching } from "@tanstack/react-query";
import {
  Play,
  Share2,
  Bookmark,
  Calendar,
  Star,
  Clock,
  LayoutGrid,
  ChevronRight,
  TrendingUp,
  Award,
  Video,
  ChevronDown,
  Loader2,
  Plus,
  Check,
  MoreHorizontal,
  Info,
  Layers,
  ChevronLeft,
  ChevronUp,
  Link2,
  Leaf,
  Gamepad2,
  Building2,
  ArrowRight,
  Shapes,
  X,
  Bell,
} from "lucide-react";

import { SharedSelect } from "@/components/SharedSelect";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
function sortRelations(relations: { relationType: string; node: AnilistMedia }[]) {
  return [...relations].sort((a, b) => {
    const typeA = a.relationType?.toUpperCase() || "";
    const typeB = b.relationType?.toUpperCase() || "";

    const priority = (type: string) => {
      if (type === "SEQUEL") return 1;
      if (type === "PREQUEL") return 2;
      return 3;
    };

    const pA = priority(typeA);
    const pB = priority(typeB);

    if (pA !== pB) return pA - pB;

    const scoreA = a.node.averageScore || a.node.meanScore || 0;
    const scoreB = b.node.averageScore || b.node.meanScore || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    return (b.node.popularity || 0) - (a.node.popularity || 0);
  });
}

import { AnimeCard, AnimeCardSkeleton } from "@/components/AnimeCard";
import { useAuth } from "@/lib/auth";
import { AnimeRowShell } from "@/components/AnimeRow";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { LinksPopup } from "@/components/LinksPopup";
import {
  SortDescIcon,
  SortAscIcon,
  RefreshCwIcon,
  useContentSortOrder,
} from "@/components/SortIcons";
import {
  fetchAnimeById,
  fetchEpisodes,
  fetchApikumeEpisodes,
  stripHtml,
  titleOf,
  totalEpisodeCount,
  prettyFormat,
  type AnilistMedia,
  type Episode,
  fetchApikumeData,
} from "@/lib/apikume";
import { getScoreColor, formatScore, formatStatus, getStatusColor, cn } from "@/lib/utils";

export const Route = createFileRoute("/anime/$id")({
  validateSearch: (search: Record<string, unknown>): { data?: string } => ({
    data: typeof search.data === "string" ? search.data : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Anime · AniKume` },
      { name: "description", content: `Watch anime ${params.id} on AniKume.` },
    ],
  }),
  component: AnimeDetail,
});

function AnimeDetail() {
  const { id } = Route.useParams();
  const resolvedId = String(id ?? "").trim();
  const [selectorIsHeader, setSelectorIsHeader] = useState(false);
  const delayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleStickyChange = useCallback((stuck: boolean) => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }

    if (stuck) {
      // Instantly hide original header when selector becomes sticky header
      setSelectorIsHeader(true);
    } else {
      const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      if (y <= 60) {
        setSelectorIsHeader(false);
      } else {
        // 1-second delay before allowing original site header to reappear when mid-page
        delayTimerRef.current = setTimeout(() => {
          setSelectorIsHeader(false);
        }, 1000);
      }
    }
  }, []);

  useEffect(() => {
    const onScrollTopCheck = () => {
      const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      if (y <= 60) {
        if (delayTimerRef.current) {
          clearTimeout(delayTimerRef.current);
          delayTimerRef.current = null;
        }
        setSelectorIsHeader(false);
      }
    };
    window.addEventListener("scroll", onScrollTopCheck, { passive: true });
    return () => window.removeEventListener("scroll", onScrollTopCheck);
  }, []);

  // Only scroll to top when the route anime id changes, never on tab click or data arrival
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevIdRef.current !== resolvedId) {
      prevIdRef.current = resolvedId;
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      setSelectorIsHeader(false);
      window.scrollTo(0, 0);
    }
  }, [resolvedId]);

  // Overview via Overview.ts directly
  const {
    data: m,
    isLoading: overviewLoading,
    error,
  } = useQuery({
    queryKey: ["anime", resolvedId],
    queryFn: () => fetchAnimeById(resolvedId),
    staleTime: 0,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header forceHidden={selectorIsHeader} />
      <main className="pb-2">
        {(overviewLoading || (!m && !error)) && <DetailSkeleton />}
        {error && !overviewLoading && (
          <p className="px-6 pt-32 text-center text-sm text-destructive">Failed to load anime.</p>
        )}
        {!overviewLoading && m && (
          <DetailBody m={m} onStickyChange={handleStickyChange} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function getContrastTextColor(hex: string | null | undefined): "black" | "white" {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return "white";
  const n = parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 130 ? "black" : "white";
}

export function getExternalLinkColor(site?: string, color?: string | null): string | undefined {
  if (color) return color;
  const s = (site || "").toLowerCase();
  if (s.includes("anilist")) return "#02a9ff";
  if (s.includes("mal") || s.includes("myanimelist")) return "#2e51a2";
  if (s.includes("crunchyroll")) return "#f47521";
  if (s.includes("twitter") || s.includes("x")) return "#000000";
  if (s.includes("youtube")) return "#ff0000";
  if (s.includes("netflix")) return "#e50914";
  return undefined;
}

function extractPosterAccentColor(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    let bestColor = "";
    let bestScore = -1;

    // Bucket colors to find the most vibrant warm/orange accent
    const buckets: { [key: string]: { r: number; g: number; b: number; count: number; score: number } } = {};

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const sat = max === 0 ? 0 : d / max;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Skip dark or dull gray pixels
      if (sat < 0.22 || lum < 25 || lum > 240) continue;

      // Calculate hue (0-360)
      let hue = 0;
      if (d !== 0) {
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) hue = ((b - r) / d + 2) * 60;
        else hue = ((r - g) / d + 4) * 60;
      }

      // Strong preference for orange/amber/warm tones (12° to 50°)
      let hueBonus = 1;
      if (hue >= 14 && hue <= 48) {
        hueBonus = 3.2; // strong orange/amber multiplier
      } else if (hue >= 5 && hue <= 68) {
        hueBonus = 2.0; // warm red-orange or gold
      }

      const score = sat * (1 + hueBonus) * (lum > 40 && lum < 210 ? 1.4 : 1.0);
      const bucketKey = `${Math.round(r / 28) * 28},${Math.round(g / 28) * 28},${Math.round(b / 28) * 28}`;

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { r, g, b, count: 1, score };
      } else {
        buckets[bucketKey].count++;
        buckets[bucketKey].score += score;
      }
    }

    for (const key in buckets) {
      const b = buckets[key];
      const totalScore = b.score * Math.log10(b.count + 1);
      if (totalScore > bestScore) {
        bestScore = totalScore;
        let { r, g, b: blue } = b;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * blue;
        if (lum < 48) {
          const boost = 48 / Math.max(lum, 10);
          r = Math.min(255, Math.round(r * boost));
          g = Math.min(255, Math.round(g * boost));
          blue = Math.min(255, Math.round(blue * boost));
        }
        const toHex = (v: number) => v.toString(16).padStart(2, "0");
        bestColor = `#${toHex(r)}${toHex(g)}${toHex(blue)}`;
      }
    }

    return bestColor || null;
  } catch {
    return null;
  }
}

function LazyFadeImg({
  src,
  alt = "",
  className,
  onColorExtracted,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  onColorExtracted?: (hex: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const onColorExtractedRef = useRef(onColorExtracted);

  useEffect(() => {
    onColorExtractedRef.current = onColorExtracted;
  }, [onColorExtracted]);

  // Check immediately if image is already cached/complete, using rAF so fade-in always plays
  useEffect(() => {
    setLoaded(false);
    if (imgRef.current && (imgRef.current.complete || imgRef.current.naturalWidth > 0)) {
      const raf = requestAnimationFrame(() => setLoaded(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [src]);

  // Extract color dynamically when src changes without re-running on callback changes
  useEffect(() => {
    if (!onColorExtractedRef.current || !src) return;
    let cancelled = false;
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      if (cancelled) return;
      const color = extractPosterAccentColor(probe);
      if (color && onColorExtractedRef.current) {
        onColorExtractedRef.current(color);
      }
    };
    probe.onerror = () => {
      // CORS fallback handled gracefully
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) return null;

  return (
    <div className="relative size-full flex items-center justify-center select-none shrink-0 overflow-hidden">
      <div
        className={cn(
          "absolute inset-0 skeleton-box pointer-events-none transition-opacity duration-500 ease-out",
          loaded ? "opacity-0" : "opacity-100",
        )}
      />
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        decoding="async"
        loading="eager"
        onLoad={() => requestAnimationFrame(() => setLoaded(true))}
        onError={() => setLoaded(true)}
        className={cn(
          "size-full object-cover object-center select-none transition-opacity duration-500 ease-out",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="w-full max-w-[1500px] mx-auto pt-16 relative flex flex-col gap-4 animate-in fade-in duration-200 overflow-x-clip">
      <div className="flex flex-col gap-4 w-full px-2.5 md:px-6 animate-pulse">
        {/* Banner Skeleton */}
        <div className="flex aspect-[16/4] lg:aspect-auto lg:h-36 rounded-[12px] bg-white/5 w-full overflow-hidden skeleton-box" />

        {/* Poster + Info Row Skeleton */}
        <div className="flex items-end w-full gap-4">
          <div className="flex aspect-[1/1.45] h-[8.5rem] sm:h-44 shrink-0 rounded-[12px] bg-white/10 skeleton-box" />
          <div className="flex flex-col justify-end gap-3 grow">
            <div className="h-5 w-20 bg-white/10 rounded-[6px] skeleton-box" />
            <div className="h-6 sm:h-7 w-5/6 bg-white/10 rounded skeleton-text" />
            <div className="flex gap-2">
              <div className="h-6 w-14 bg-white/10 rounded-[6px] skeleton-box" />
              <div className="h-6 w-14 bg-white/10 rounded-[6px] skeleton-box" />
              <div className="h-6 w-14 bg-white/10 rounded-[6px] skeleton-box" />
            </div>
          </div>
        </div>

        {/* Synopsis Skeleton */}
        <div className="w-full sm:order-last space-y-1.5">
          <div className="h-3.5 w-full bg-white/10 rounded skeleton-text" />
          <div className="h-3.5 w-4/5 bg-white/10 rounded skeleton-text" />
        </div>

        {/* Buttons Row Skeleton */}
        <div className="flex items-center gap-2.5 w-full">
          <div className="w-32 h-9 rounded-full bg-white/10 skeleton-box shrink-0" />
          <div className="size-9 rounded-full bg-white/10 skeleton-box shrink-0" />
          <div className="size-9 rounded-full bg-white/10 skeleton-box shrink-0" />
          <div className="size-9 rounded-full bg-white/10 skeleton-box shrink-0" />
          <div className="size-9 rounded-full bg-white/10 skeleton-box shrink-0" />
        </div>
      </div>

      {/* Tab Selector Skeleton: Matches page background */}
      <div className="sticky top-0 z-40 w-full bg-background px-2.5 md:px-4">
        <div className="flex gap-4 h-11 items-center">
          <div className="h-4 w-16 rounded skeleton-text" />
          <div className="h-4 w-16 rounded skeleton-text" />
          <div className="h-4 w-16 rounded skeleton-text" />
          <div className="h-4 w-20 rounded skeleton-text" />
        </div>
      </div>
    </div>
  );
}

const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "episode", label: "Episodes" },
  { id: "season", label: "Related" },
  { id: "character", label: "Characters" },
  { id: "artwork", label: "Artwork" },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]["id"];

function TabSelectorBar({
  tabs = DETAIL_TABS,
  activeTab,
  onTabChange,
  className,
  containerRef,
}: {
  tabs?: readonly { id: DetailTab; label: string }[];
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  className?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const tabContentRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [carouselApi, setCarouselApi] = useState<any>(null);
  const [canScrollTabs, setCanScrollTabs] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  useEffect(() => {
    const updateLayoutAndIndicator = () => {
      const container = tabContentRef.current;
      if (!container) return;

      const totalTabsWidth = tabs.reduce((sum, t) => {
        const el = tabRefs.current[t.id];
        return sum + (el ? el.offsetWidth : 0);
      }, 0);

      const viewportEl = container.parentElement;
      const viewportWidth = viewportEl?.clientWidth || container.clientWidth || window.innerWidth;
      const style = window.getComputedStyle(container);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const overflow = viewportWidth < 1024 && totalTabsWidth > viewportWidth - padX + 2;

      setCanScrollTabs((prev) => {
        if (prev !== overflow && !overflow && carouselApi) {
          carouselApi.scrollTo(0, true);
        }
        return overflow;
      });

      requestAnimationFrame(() => {
        const btn = tabRefs.current[activeTab];
        const cont = tabContentRef.current;
        if (btn && cont) {
          const btnRect = btn.getBoundingClientRect();
          const contRect = cont.getBoundingClientRect();
          setIndicator({
            left: btnRect.left - contRect.left,
            width: btnRect.width,
          });
        }
      });
    };

    updateLayoutAndIndicator();
    const raf = requestAnimationFrame(updateLayoutAndIndicator);
    window.addEventListener("resize", updateLayoutAndIndicator);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateLayoutAndIndicator);
    };
  }, [activeTab, tabs, carouselApi]);

  return (
    <div ref={containerRef} className={className}>
      <Carousel
        setApi={setCarouselApi}
        opts={{
          align: "start",
          dragFree: true,
          duration: 35,
          skipSnaps: true,
          watchDrag: canScrollTabs,
          slidesToScroll: "auto" as any,
          slides: "[role='group']",
        }}
        className="w-full relative select-none max-w-[1500px] mx-auto"
      >
        <CarouselContent
          ref={tabContentRef}
          className={cn(
            "relative -ml-0 px-2.5 md:px-6",
            canScrollTabs ? "justify-start" : "justify-center lg:justify-start",
          )}
        >
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <CarouselItem key={t.id} className="basis-auto pl-0">
                <button
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  className="relative shrink-0 h-11 text-sm px-3 sm:px-4 cursor-pointer select-none inline-grid place-items-center"
                >
                  <span
                    className="invisible col-start-1 row-start-1 font-bold whitespace-nowrap select-none"
                    aria-hidden="true"
                  >
                    {t.label}
                  </span>
                  <span
                    className={cn(
                      "col-start-1 row-start-1 whitespace-nowrap transition-all duration-200 ease-out",
                      isActive
                        ? "font-bold text-white opacity-100"
                        : "font-medium text-muted-foreground opacity-75 hover:opacity-100 hover:text-white",
                    )}
                  >
                    {t.label}
                  </span>
                </button>
              </CarouselItem>
            );
          })}
          {/* Smoothly moving bottom line (same movement animation style as Home selector) */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-white rounded-full transition-all duration-250 ease-out"
            style={{
              width: `${indicator.width}px`,
              transform: `translateX(${indicator.left}px)`,
              opacity: indicator.width > 0 ? 1 : 0,
            }}
          />
        </CarouselContent>
      </Carousel>
    </div>
  );
}

function DetailBody({
  m,
  initialRawEpData,
  onStickyChange,
}: {
  m: AnilistMedia;
  initialRawEpData?: any;
  onStickyChange?: (stuck: boolean) => void;
}) {
  const { toggleWatchlist, isInWatchlist } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const selectorRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const posterColor = "#f27822";

  useEffect(() => {
    let lastStuck: boolean | null = null;
    const check = () => {
      const el = selectorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const stuck = rect.top <= 1;
      if (stuck !== lastStuck) {
        lastStuck = stuck;
        setIsStuck(stuck);
        onStickyChange?.(stuck);
      }
    };

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    check();

    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [onStickyChange]);

  const isBookmarked = isInWatchlist(m.id, "anime");
  const notReleased = m.status === "NOT_YET_RELEASED" || m.status?.toUpperCase() === "UPCOMING";

  const visibleTabs = useMemo(
    () => (notReleased ? DETAIL_TABS.filter((t) => t.id !== "episode") : DETAIL_TABS),
    [notReleased],
  );

  const activeTab: DetailTab = useMemo(() => {
    const raw = (search.data || "").toLowerCase();
    let resolved: DetailTab = "overview";
    if (DETAIL_TABS.some((t) => t.id === raw)) {
      resolved = raw as DetailTab;
    } else if (raw === "characters") {
      resolved = "character";
    } else if (raw === "related" || raw === "seasons") {
      resolved = "season";
    } else if (raw === "episodes") {
      resolved = "episode";
    } else if (raw === "artworks") {
      resolved = "artwork";
    }
    if (notReleased && resolved === "episode") {
      return "overview";
    }
    return resolved;
  }, [search.data, notReleased]);

  const handleTabChange = (newTab: DetailTab) => {
    navigate({
      search: (prev: any) => ({
        ...prev,
        data: newTab,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const [linksOpen, setLinksOpen] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    let handled = false;
    if (navigator.share) {
      try {
        await navigator.share({
          title: titleOf(m),
          text: `Watch ${titleOf(m)} on AniKume`,
          url: shareUrl,
        });
        handled = true;
      } catch {}
    }
    if (!handled) {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {}
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const isAdultTag =
    m.isAdult ||
    (m.genres || []).some(
      (g: string) => g.toLowerCase() === "hentai" || g.toLowerCase() === "adult",
    );

  const [continueWatchingItem, setContinueWatchingItem] = useState<any>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("continue_watching_list");
      if (raw) {
        const list = JSON.parse(raw);
        setContinueWatchingItem(list.find((item: any) => item.animeId === m.id) || null);
      } else {
        setContinueWatchingItem(null);
      }
    } catch {
      setContinueWatchingItem(null);
    }
  }, [m.id]);

  const continueEpNum = continueWatchingItem?.episodeNum;

  const queryClient = useQueryClient();
  const [isRefreshingEps, setIsRefreshingEps] = useState(false);

  const {
    data: episodesData,
    isLoading: epLoading,
    isFetching: epFetching,
  } = useQuery({
    queryKey: ["episodes", m.id],
    queryFn: () => fetchEpisodes(m.id, m),
    staleTime: 0,
    enabled: !notReleased,
  });

  const handleRefreshEpisodes = async () => {
    try {
      setIsRefreshingEps(true);
      queryClient.removeQueries({ queryKey: ["episodes", m.id] });
      queryClient.removeQueries({ queryKey: ["apikume-episodes-raw", m.id] });
      await Promise.all([
        queryClient.fetchQuery({
          queryKey: ["apikume-episodes-raw", m.id],
          queryFn: () => fetchApikumeEpisodes(m.id, true),
        }),
        queryClient.fetchQuery({
          queryKey: ["episodes", m.id],
          queryFn: () => fetchEpisodes(m.id, m, true),
        }),
      ]);
    } finally {
      setIsRefreshingEps(false);
    }
  };

  const total = totalEpisodeCount(m, episodesData);

  const firstEpisodeNum = useMemo(() => {
    if (!episodesData || episodesData.length === 0) return "1";
    const minEp = Math.min(
      ...episodesData.map((e: any) =>
        typeof e.episode === "number" ? e.episode : Number(e.number) || 1,
      ),
    );
    return Number.isFinite(minEp) && minEp > 0 ? String(minEp) : "1";
  }, [episodesData]);

  const firstExtLink = m.externalLinks?.[0];
  const primaryExtUrl = firstExtLink?.url || null;
  const primaryExtName = firstExtLink?.site || "External Link";
  const primaryExtIcon = firstExtLink?.icon || null;
  const primaryExtColor = getExternalLinkColor(firstExtLink?.site, (firstExtLink as any)?.color);

  const synopsis = stripHtml(m.description) || "";
  const displayTitle = titleOf(m);
  const badgeTextColor = getContrastTextColor(posterColor);
  const posterUrl =
    m.coverImage?.extraLarge ||
    m.coverImage?.large ||
    (m as any).poster ||
    "";

  return (
    <article className="w-full max-w-[1500px] mx-auto pt-16 relative flex flex-col gap-4 animate-in fade-in duration-300">
      {/* Upper Part: Exact animetsu.site layout, sizes, shapes, and dynamic banner center color */}
      <div className="flex flex-col gap-4 w-full px-2.5 md:px-6">
        {/* 1. Banner (aspect-16/4 original size on mobile, cropped height on PC, radius-xl, lazy fade-in) */}
        {(m.bannerImage || posterUrl) && (
          <div className="flex aspect-[16/4] lg:aspect-auto lg:h-36 rounded-[12px] overflow-hidden bg-white/5 w-full">
            <LazyFadeImg
              src={m.bannerImage ?? posterUrl}
              alt=""
              className="lg:scale-105"
            />
          </div>
        )}

        {/* 2. Poster + Info Row */}
        <div className="flex items-end w-full gap-4">
          {/* Poster (aspect-cover 1/1.45, h-34 on mobile, sm:h-44 on PC, radius-xl) */}
          <div className="relative flex aspect-[1/1.45] h-[8.5rem] sm:h-44 shrink-0 bg-white/5 rounded-[12px] overflow-hidden">
            <LazyFadeImg
              src={posterUrl}
              alt={displayTitle}
            />
            {isAdultTag && (
              <span className="pointer-events-none absolute top-2 right-2 z-10 rounded-xs bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                18+
              </span>
            )}
          </div>

          {/* Info Column next to poster */}
          <div className="flex flex-col font-medium justify-end gap-3 grow min-w-0">
            {/* Status Tag (with distinct background color and text color per status) */}
            {m.status && (
              <div className="flex items-center text-xs gap-2">
                <span
                  className={cn(
                    "text-xs px-2.5 py-0.5 rounded-[6px] overflow-hidden font-medium backdrop-blur-sm transition-colors",
                    m.status === "RELEASING"
                      ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                      : m.status === "NOT_YET_RELEASED" || m.status?.toUpperCase() === "UPCOMING"
                        ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
                        : m.status === "FINISHED" || m.status === "COMPLETED"
                          ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/30"
                          : "bg-white/15 text-zinc-100 ring-1 ring-white/20",
                  )}
                >
                  {formatStatus(m.status)}
                </span>
              </div>
            )}

            {/* Title */}
            <div
              className={cn(
                "flex sm:text-xl font-medium leading-tight text-white",
                displayTitle.length > 55 ? "text-base" : "text-[1.2rem]",
              )}
            >
              <span className="line-clamp-2">{displayTitle}</span>
            </div>

            {/* Format, Season, Year tags (bigger than status, square/rounded-[6px], dynamically colored from poster orange/accent) */}
            <div
              style={{ color: posterColor }}
              className="flex items-center flex-wrap font-medium text-xs sm:text-sm gap-2"
            >
              {m.format && (
                <span
                  style={{
                    backgroundColor: posterColor,
                    color: badgeTextColor,
                  }}
                  className="px-2.5 py-1 rounded-[6px] shrink-0 transition-colors duration-300"
                >
                  {prettyFormat(m)}
                </span>
              )}
              {m.season && (
                <span
                  style={{
                    backgroundColor: posterColor,
                    color: badgeTextColor,
                  }}
                  className="px-2.5 py-1 rounded-[6px] shrink-0 uppercase transition-colors duration-300"
                >
                  {m.season}
                </span>
              )}
              {(m.seasonYear || m.startDate?.year) && (
                <span
                  style={{
                    backgroundColor: posterColor,
                    color: badgeTextColor,
                  }}
                  className="px-2.5 py-1 rounded-[6px] shrink-0 transition-colors duration-300"
                >
                  {m.seasonYear || m.startDate?.year}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3. Synopsis (w-full sm:order-last, smooth expand animation on tap) */}
        {synopsis && (
          <div
            onClick={() => setSynopsisExpanded((v) => !v)}
            className="w-full sm:order-last cursor-pointer select-none"
            title="Tap to expand or collapse"
          >
            <div
              className={cn(
                "relative overflow-hidden transition-all duration-500 ease-in-out",
                synopsisExpanded ? "max-h-[800px]" : "max-h-10 sm:max-h-11",
              )}
            >
              <p className="whitespace-pre-line text-muted-foreground font-light text-xs sm:text-sm leading-relaxed">
                {synopsis}
              </p>
            </div>
          </div>
        )}

        {/* 4. Action Buttons Row (reduced vertical height h-9 = 36px, exact animetsu sizes) */}
        <div className="flex items-center overflow-x-auto no-scrollbar gap-2.5 w-full">
          {/* Watch Now / Continue (h-9 reduced vertical height) */}
          {notReleased ? (
            <button
              disabled
              title="Not yet released"
              className="bg-white text-black font-semibold gap-2 w-32 h-9 text-sm flex items-center justify-center rounded-full shrink-0 opacity-50 cursor-not-allowed"
            >
              <Play className="size-4 fill-black" /> Watch Now
            </button>
          ) : isRefreshingEps ? (
            <button
              disabled
              className="bg-white text-black font-semibold gap-2 w-32 h-9 text-sm flex items-center justify-center rounded-full shrink-0 opacity-90 cursor-not-allowed"
            >
              <Loader2 className="size-4 animate-spin" /> Updating...
            </button>
          ) : !episodesData && (epLoading || epFetching) ? (
            <button
              disabled
              className="bg-white text-black font-semibold gap-2 w-32 h-9 text-sm flex items-center justify-center rounded-full shrink-0 opacity-50 cursor-not-allowed"
            >
              <Loader2 className="size-4 animate-spin" /> Loading...
            </button>
          ) : continueEpNum ? (
            <Link
              to="/anime/watch/$id"
              params={{ id: String(m.id) }}
              hash={String(continueEpNum)}
              className="bg-white text-black font-semibold gap-2 min-w-32 px-4 h-9 text-sm flex items-center justify-center rounded-full shrink-0 transition-all duration-100 ease-out active:scale-95 hover:brightness-90"
            >
              <Play className="size-4 fill-black" /> Watch Ep {continueEpNum}
            </Link>
          ) : (
            <Link
              to="/anime/watch/$id"
              params={{ id: String(m.id) }}
              hash={firstEpisodeNum}
              className="bg-white text-black font-semibold gap-2 w-32 h-9 text-sm flex items-center justify-center rounded-full shrink-0 transition-all duration-100 ease-out active:scale-95 hover:brightness-90"
            >
              <Play className="size-4 fill-black" /> Watch Now
            </Link>
          )}

          {/* Save / Bookmark button (same bg-white/10 background always; only white fill inside toggles) */}
          <button
            type="button"
            onClick={() => toggleWatchlist(m, "anime")}
            aria-label={isBookmarked ? "Remove from Watchlist" : "Save to Watchlist"}
            title={isBookmarked ? "Tap to unsave" : "Tap to save"}
            className="bg-white/10 font-semibold size-9 flex items-center justify-center rounded-full shrink-0 transition-all duration-100 ease-out active:scale-95 cursor-pointer text-white"
          >
            <Bookmark
              strokeWidth={1.5}
              className="size-5 text-white transition-colors"
              fill={isBookmarked ? "white" : "transparent"}
            />
          </button>

          {/* Share button */}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share anime"
            title={copiedShare ? "Copied link!" : "Share"}
            className="bg-white/10 font-semibold size-9 flex items-center justify-center rounded-full shrink-0 transition-all duration-100 ease-out active:scale-95 cursor-pointer text-white"
          >
            {copiedShare ? (
              <Check strokeWidth={1.8} className="size-[18px] text-emerald-400" />
            ) : (
              <Share2 strokeWidth={1.5} className="size-[18px]" />
            )}
          </button>

          {/* First External Link (5% ring space, site color background for favicon/text) */}
          {primaryExtUrl && (
            <a
              href={primaryExtUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={primaryExtName}
              title={primaryExtName}
              className="bg-white/10 font-semibold size-9 flex items-center justify-center rounded-full shrink-0 transition-all duration-100 ease-out active:scale-95 cursor-pointer text-white p-[2px]"
            >
              {primaryExtIcon ? (
                <span
                  className="size-[32px] rounded-full flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: primaryExtColor }}
                >
                  <img
                    src={primaryExtIcon}
                    alt={primaryExtName}
                    className="size-full object-cover rounded-full"
                  />
                </span>
              ) : (
                <span
                  className="size-[32px] rounded-full flex items-center justify-center text-[11px] font-bold tracking-tight text-white"
                  style={{ backgroundColor: primaryExtColor || "#2e51a2" }}
                >
                  {primaryExtName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </a>
          )}

          {/* External links popup button (exact same size and background as share & save) */}
          <button
            type="button"
            onClick={() => setLinksOpen(true)}
            aria-label="All external links"
            title="All external links"
            className="bg-white/10 font-semibold size-9 flex items-center justify-center rounded-full shrink-0 transition-all duration-100 ease-out active:scale-95 cursor-pointer text-white"
          >
            <Link2 strokeWidth={1.5} className="size-[18px] text-white" />
          </button>
        </div>
      </div>

      {/* Tab Selector: Native hardware-accelerated sticky top-0; merges with page background until stuck as header */}
      <TabSelectorBar
        tabs={visibleTabs}
        containerRef={selectorRef}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        className={cn(
          "sticky top-0 z-40 w-full transition-colors duration-200 border-b",
          isStuck
            ? "bg-black/70 backdrop-blur-md border-white/10"
            : "bg-transparent border-transparent",
        )}
      />

      {/* Tab Content Container */}
      <div className="mx-auto max-w-[1500px] px-2.5 sm:px-6 w-full">
        <div key={activeTab} className="mt-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeTab === "overview" && <OverviewTab m={m} initialRawEpData={initialRawEpData} />}
          {activeTab === "character" && <CharactersTab m={m} />}
          {activeTab === "season" && <SeasonsTab m={m} />}
          {activeTab === "episode" &&
            (notReleased ? (
              <div className="rounded-2xl border border-white/5 bg-card/30 p-10 text-center text-sm text-muted-foreground">
                Not yet released.
              </div>
            ) : (
              <EpisodesTab
                m={m}
                episodes={episodesData ?? []}
                total={total}
                onRefresh={handleRefreshEpisodes}
                isRefreshing={isRefreshingEps || epFetching}
              />
            ))}
          {activeTab === "artwork" && <ArtworkTab m={m} episodes={episodesData ?? []} />}
        </div>

        {/* Global Recommendations Section across all tabs */}
        <RecommendationsSection anikumeId={m.id} />
      </div>

      <LinksPopup
        open={linksOpen}
        onClose={() => setLinksOpen(false)}
        anilistId={m.id}
        extraLinks={m.externalLinks || []}
      />
    </article>
  );
}

/* ---------------------- Recommendations Section (Original Size & Place) ---------------------- */
function RecommendationsSection({ anikumeId }: { anikumeId: string | number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["anime-data", anikumeId, "recommendation"],
    queryFn: () => fetchApikumeData(String(anikumeId), "recommendation"),
    staleTime: 0,
  });

  const recommendations = useMemo(() => {
    const raw = data?.results ?? data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  if (!isLoading && recommendations.length === 0) return null;

  return (
    <div className="-mx-2.5 sm:-mx-6 -mt-3">
      <AnimeRowShell title="Recommendations">
        {isLoading
          ? Array.from({ length: 8 }).map((_, idx) => <AnimeCardSkeleton key={idx} />)
          : recommendations.map((rec: any, idx: number) => (
              <AnimeCard
                key={rec.anikume_id ?? rec.id ?? idx}
                item={rec}
                badge={null}
              />
            ))}
      </AnimeRowShell>
    </div>
  );
}

/* ---------------------- Recommendations Tab (More like this) ---------------------- */
function RecommendationsTab({ anikumeId }: { anikumeId: string | number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["anime-data", anikumeId, "recommendation"],
    queryFn: () => fetchApikumeData(String(anikumeId), "recommendation"),
    staleTime: 0,
  });

  const recommendations = useMemo(() => {
    const raw = data?.results ?? data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {Array.from({ length: 12 }).map((_, idx) => (
          <AnimeCardSkeleton key={idx} />
        ))}
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-card/30 p-10 text-center text-sm text-muted-foreground">
        No recommendations available for this anime.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
      {recommendations.map(
        (rec: Record<string, unknown> & { anikume_id?: string; id?: string }, idx: number) => (
          <AnimeCard key={rec.anikume_id ?? rec.id ?? idx} item={rec} badge={null} />
        ),
      )}
    </div>
  );
}

/* ---------------------- Artwork ---------------------- */
function ArtworkTab({
  m,
}: {
  m: AnilistMedia;
  episodes?: Episode[];
}) {
  const [selectedImg, setSelectedImg] = useState<{
    url: string;
    title: string;
    category: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["anime-data", m.id, "artwork"],
    queryFn: () => fetchApikumeData(String(m.id), "artwork"),
    staleTime: 0,
  });

  const artworks = useMemo(() => {
    const list: {
      url: string;
      title: string;
      category: string;
      aspect: "poster" | "banner" | "square";
    }[] = [];
    const seen = new Set<string>();

    const add = (
      url: string | null | undefined,
      title: string,
      category: string,
      aspect: "poster" | "banner" | "square" = "poster",
    ) => {
      if (!url || typeof url !== "string" || seen.has(url)) return;
      seen.add(url);
      list.push({ url, title, category, aspect });
    };

    const rawResults = data?.results ?? data;
    const groups = Array.isArray(rawResults) ? rawResults : rawResults ? [rawResults] : [];

    for (const group of groups) {
      if (!group || typeof group !== "object") continue;

      if (Array.isArray(group.posters)) {
        group.posters.forEach((item: any, idx: number) => {
          const u = typeof item === "string" ? item : item?.url;
          add(u, `Poster #${idx + 1}`, "Poster", "poster");
        });
      }

      if (Array.isArray(group.backdrops)) {
        group.backdrops.forEach((item: any, idx: number) => {
          const u = typeof item === "string" ? item : item?.url;
          add(u, `Backdrop #${idx + 1}`, "Backdrop", "banner");
        });
      }

      if (Array.isArray(group.banner)) {
        group.banner.forEach((item: any, idx: number) => {
          const u = typeof item === "string" ? item : item?.url;
          add(u, `Banner #${idx + 1}`, "Banner", "banner");
        });
      }

      if (Array.isArray(group.clearlogo)) {
        group.clearlogo.forEach((item: any, idx: number) => {
          const u = typeof item === "string" ? item : item?.url;
          add(u, `Clear Logo #${idx + 1}`, "Clear Logo", "banner");
        });
      }

      if (Array.isArray(group.logos)) {
        group.logos.forEach((item: any, idx: number) => {
          const u = typeof item === "string" ? item : item?.url;
          add(u, `Logo #${idx + 1}`, "Logo", "banner");
        });
      }

      // If group itself is a single artwork object with a direct url
      if (typeof group.url === "string") {
        add(group.url, group.title || `Artwork`, group.type || "Artwork", "banner");
      }
    }

    return list;
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
        {Array.from({ length: 10 }).map((_, idx) => (
          <div
            key={idx}
            className="overflow-hidden rounded-xl border border-white/5 bg-card/40"
          >
            <div className="aspect-[2/3] w-full skeleton-box" />
            <div className="p-2.5 space-y-1.5">
              <div className="h-3 w-14 skeleton-text" />
              <div className="h-3.5 w-24 skeleton-text" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (artworks.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/30 p-10 text-center text-sm text-muted-foreground">
        No artwork available for this anime.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {artworks.length} {artworks.length === 1 ? "Artwork" : "Artworks"} Available
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
        {artworks.map((art, idx) => (
          <div
            key={idx}
            onClick={() => setSelectedImg(art)}
            className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-card/40 transition hover:border-white/20 hover:scale-[1.02]"
          >
            <div
              className={`relative w-full overflow-hidden ${
                art.aspect === "banner" ? "aspect-video" : "aspect-[2/3]"
              }`}
            >
              <img
                src={art.url}
                alt={art.title}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </div>

            <div className="p-2 sm:p-2.5">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90">
                {art.category}
              </span>
              <p className="mt-1 truncate text-xs font-semibold text-foreground/90">{art.title}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox / Modal for zoomed artwork preview */}
      {selectedImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedImg(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImg.url}
              alt={selectedImg.title}
              className="max-h-[75vh] w-auto rounded-xl object-contain mx-auto"
            />
            <div className="mt-3 flex items-center justify-between gap-4 px-2 pb-1">
              <div className="min-w-0 flex-1">
                <span className="rounded bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {selectedImg.category}
                </span>
                <p className="mt-1 truncate text-sm font-bold text-foreground">{selectedImg.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImg(null)}
                className="shrink-0 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------- Overview ---------------------- */
function formatReleaseDate(d?: { year: number | null; month: number | null; day: number | null } | null) {
  if (!d || !d.year) return null;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mo = d.month && d.month >= 1 && d.month <= 12 ? months[d.month - 1] : "";
  if (!mo) return `${d.year}`;
  if (!d.day) return `${mo} ${d.year}`;
  return `${mo} ${d.day}, ${d.year}`;
}

function formatCompactMetric(val: number, withHash: boolean = false): string {
  let formatted: string;
  if (val >= 1_000_000) {
    formatted = `${(val / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  } else if (val >= 1_000) {
    formatted = `${(val / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  } else {
    formatted = String(val);
  }
  return withHash ? `#${formatted}` : formatted;
}

function toTitleCaseWords(str: string): string {
  return str
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function OverviewTab({ m, initialRawEpData }: { m: AnilistMedia; initialRawEpData?: any }) {
  const [showMore, setShowMore] = useState(false);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollTop, setCanScrollTop] = useState(false);
  const [canScrollBottom, setCanScrollBottom] = useState(true);

  const updatePopupScrollFeather = useCallback(() => {
    const el = popupScrollRef.current;
    if (!el) return;
    setCanScrollTop(el.scrollTop > 4);
    setCanScrollBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  const openMorePopup = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setShowMore(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPopupVisible(true);
        updatePopupScrollFeather();
      });
    });
  }, [updatePopupScrollFeather]);

  const closeMorePopup = useCallback(() => {
    setIsPopupVisible(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setShowMore(false);
      closeTimerRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showMore) return;

    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        startY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const scrollEl = popupScrollRef.current;
      const target = e.target as Node | null;

      if (!scrollEl || !target || !scrollEl.contains(target)) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      const currentY = e.touches[0].clientY;
      const deltaY = startY - currentY;
      const atTop = scrollEl.scrollTop <= 0;
      const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

      if ((atTop && deltaY < 0) || (atBottom && deltaY > 0)) {
        if (e.cancelable) e.preventDefault();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const scrollEl = popupScrollRef.current;
      const target = e.target as Node | null;

      if (!scrollEl || !target || !scrollEl.contains(target)) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      const atTop = scrollEl.scrollTop <= 0;
      const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        if (e.cancelable) e.preventDefault();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMorePopup();
        return;
      }
      const scrollKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
      if (scrollKeys.includes(e.key)) {
        const scrollEl = popupScrollRef.current;
        const target = e.target as Node | null;
        if (!scrollEl || !target || !scrollEl.contains(target)) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(updatePopupScrollFeather);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKey);
    };
  }, [showMore, closeMorePopup, updatePopupScrollFeather]);

  // 1. Average Score (AniList averageScore is out of 100, formatted e.g. 8.4)
  const scoreDisplay = useMemo(() => {
    if (typeof m.averageScore === "number" && m.averageScore > 0) {
      return (m.averageScore / 10).toFixed(1);
    }
    if (typeof m.meanScore === "number" && m.meanScore > 0) {
      return (m.meanScore / 10).toFixed(1);
    }
    const anyRating = (m as any).rating || (m as any).score;
    if (typeof anyRating === "number" && anyRating > 0) {
      return anyRating > 10 ? (anyRating / 10).toFixed(1) : anyRating.toFixed(1);
    }
    return "N/A";
  }, [m]);

  const numericScore100 = useMemo(() => {
    if (typeof m.averageScore === "number" && m.averageScore > 0) return m.averageScore;
    if (typeof m.meanScore === "number" && m.meanScore > 0) return m.meanScore;
    const anyRating = Number((m as any).rating || (m as any).score);
    if (!Number.isNaN(anyRating) && anyRating > 0) {
      return anyRating <= 10 ? Math.round(anyRating * 10) : Math.round(anyRating);
    }
    return null;
  }, [m]);

  const scoreColor = useMemo(() => getScoreColor(numericScore100), [numericScore100]);

  // 2. Type (e.g. ONA, TV, MOVIE)
  const typeDisplay = useMemo(() => {
    if (m.format) {
      const upper = m.format.replace(/_/g, " ").toUpperCase().trim();
      if (upper === "TV SHOW") return "TV";
      return upper;
    }
    return "TV";
  }, [m.format]);

  // 3. Rating / Age Rating (e.g. R, PG-13, G)
  const ratingDisplay = useMemo(() => {
    const raw =
      (m as any).age_rating ||
      (m as any).ageRating ||
      (m as any).rating_desc ||
      "";
    if (raw && typeof raw === "string") {
      const upper = raw.toUpperCase().trim();
      if (upper.startsWith("R")) return "R";
      if (upper.startsWith("PG-13")) return "PG-13";
      if (upper.startsWith("PG")) return "PG";
      if (upper.startsWith("G")) return "G";
      return upper.split(" ")[0];
    }
    if (m.isAdult) return "R";
    return "PG-13";
  }, [m]);

  // 4. Release Date (Formatted e.g. "Oct 20, 2026", without end date)
  const releaseDisplay = useMemo(() => {
    return formatReleaseDate(m.startDate) || m.rawDate || "TBA";
  }, [m.startDate, m.rawDate]);

  // 5. Season (e.g. "FALL")
  const seasonDisplay = useMemo(() => {
    if (m.season) return String(m.season).toUpperCase();
    if (m.seasonYear) return String(m.seasonYear);
    return "N/A";
  }, [m.season, m.seasonYear]);

  // 6. Status (e.g. "FINISHED")
  const statusDisplay = useMemo(() => {
    if (m.status) return String(m.status).toUpperCase().replace(/_/g, " ");
    return "N/A";
  }, [m.status]);

  // 7. Source (e.g. "VIDEO GAME")
  const sourceDisplay = useMemo(() => {
    if (m.source) return String(m.source).toUpperCase().replace(/_/g, " ");
    return "ORIGINAL";
  }, [m.source]);

  // 8. Studio (e.g. "Studio Pierrot")
  const studioDisplay = useMemo(() => {
    if (Array.isArray(m.rawStudios) && m.rawStudios.length > 0) {
      return m.rawStudios[0];
    }
    const nodeStudio = m.studios?.nodes?.[0]?.name;
    if (nodeStudio) return nodeStudio;
    return "N/A";
  }, [m.rawStudios, m.studios]);

  const synonyms = m.synonyms ?? [];
  const genres = m.genres ?? [];
  const tagItems = m.tags ?? [];

  const isUpcomingStatus =
    m.status === "NOT_YET_RELEASED" ||
    m.status?.toUpperCase() === "UPCOMING" ||
    statusDisplay === "UPCOMING" ||
    statusDisplay === "NOT YET RELEASED";

  const detailStatusLabel = useMemo(() => {
    if (!m.status || statusDisplay === "N/A") return null;
    if (isUpcomingStatus) return "Upcoming";
    const upper = statusDisplay;
    if (upper === "RELEASING") return "Airing";
    if (upper === "FINISHED") return "Finished";
    return toTitleCaseWords(upper);
  }, [m.status, isUpcomingStatus, statusDisplay]);

  const detailSourceLabel = useMemo(() => {
    if (!m.source) return null;
    const cleaned = String(m.source).trim();
    if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
    return toTitleCaseWords(cleaned);
  }, [m.source]);

  const detailRatingLabel = useMemo(() => {
    const raw =
      (m as any).age_rating ||
      (m as any).ageRating ||
      (m as any).rating_desc ||
      "";
    if (raw && typeof raw === "string") {
      const upper = raw.toUpperCase().trim();
      if (upper === "N/A" || upper === "NONE" || upper === "UNKNOWN") return null;
      if (upper.startsWith("R")) return "R";
      if (upper.startsWith("PG-13")) return "PG-13";
      if (upper.startsWith("PG")) return "PG";
      if (upper.startsWith("G")) return "G";
      return upper.split(" ")[0];
    }
    if (m.isAdult) return "R";
    return null;
  }, [m]);

  const episodeLengthDisplay = useMemo(() => {
    const dur = m.duration ?? (m as any).episode_duration;
    if (typeof dur === "number" && dur > 0) {
      return `${dur} min`;
    }
    return null;
  }, [m]);

  const totalRuntimeDisplay = useMemo(() => {
    const rawTotal =
      m.totalRuntime ??
      (m as any).total_runtime ??
      (typeof m.episodes === "number" &&
      m.episodes > 0 &&
      typeof m.duration === "number" &&
      m.duration > 0
        ? m.episodes * m.duration
        : null);
    if (typeof rawTotal === "number" && rawTotal > 0) {
      if (rawTotal >= 60) {
        const hrs = Math.floor(rawTotal / 60);
        const mins = rawTotal % 60;
        return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
      }
      return `${rawTotal} min`;
    }
    return null;
  }, [m]);

  const hasAnyScoreBox =
    scoreDisplay !== "N/A" ||
    (typeof m.rank === "number" && m.rank > 0) ||
    (typeof m.popularity === "number" && m.popularity > 0) ||
    (typeof m.members === "number" && m.members > 0) ||
    (typeof m.favourites === "number" && m.favourites > 0);

  const hasAnyDetailBox = Boolean(
    detailStatusLabel ||
      detailSourceLabel ||
      detailRatingLabel ||
      episodeLengthDisplay ||
      totalRuntimeDisplay,
  );

  const { data: queriedEpisodeApiData } = useQuery({
    queryKey: ["apikume-episodes-raw", m.id],
    queryFn: () => fetchApikumeEpisodes(m.id),
    staleTime: 0,
    retry: 2,
  });

  const episodeApiData = queriedEpisodeApiData ?? initialRawEpData;

  const nextEpisodeBanner = useMemo(() => {
    const rawNext =
      episodeApiData?.next_episodes ??
      (episodeApiData as any)?.next_episode ??
      initialRawEpData?.next_episodes ??
      (m as any)?.next_episodes;
    const nextList = Array.isArray(rawNext)
      ? rawNext
      : rawNext && typeof rawNext === "object"
        ? [rawNext]
        : [];
    const nextItem = nextList.length > 0 ? nextList[0] : null;
    const epNum =
      nextItem?.episode ??
      nextItem?.episode_number ??
      nextItem?.EpisodeNumber ??
      nextItem?.number ??
      nextItem?.ep ??
      m.nextAiringEpisode?.episode ??
      (nextItem && Array.isArray(episodeApiData?.episodes)
        ? episodeApiData.episodes.length + 1
        : null);

    if (epNum == null || String(epNum).trim() === "") return null;

    const formatUnit = (val: number, singular: string) => {
      const n = Math.max(1, Math.floor(val));
      return n === 1 ? `1 ${singular}` : `${n} ${singular}s`;
    };

    const rawTimeStr =
      typeof (nextItem?.time ?? nextItem?.airtime ?? nextItem?.countdown) === "string"
        ? String(nextItem?.time ?? nextItem?.airtime ?? nextItem?.countdown).trim()
        : "";
    if (/\b(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months)\b/i.test(rawTimeStr)) {
      const cleaned = rawTimeStr
        .replace(/^in\s+/i, "")
        .trim()
        .replace(/\b1\s+(seconds|minutes|hours|days|weeks|months)\b/gi, (_, u) => `1 ${u.slice(0, -1).toLowerCase()}`);
      return {
        epNum,
        unitText: cleaned,
      };
    }

    const timeMatch = rawTimeStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    let hh = timeMatch ? parseInt(timeMatch[1], 10) : 0;
    const mm = timeMatch ? parseInt(timeMatch[2], 10) : 0;
    const ss = timeMatch && timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    if (/\bpm\b/i.test(rawTimeStr) && hh < 12) hh += 12;
    if (/\bam\b/i.test(rawTimeStr) && hh === 12) hh = 0;

    const parseDateWithTime = (dateRaw: string): Date | null => {
      const s = dateRaw
        .trim()
        .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, "")
        .replace(/(\d+)(st|nd|rd|th)\b/gi, "$1")
        .replace(/\s+/g, " ");
      if (!s) return null;

      const monthMap: Record<string, number> = {
        jan: 0, january: 0,
        feb: 1, february: 1,
        mar: 2, march: 2,
        apr: 3, april: 3,
        may: 4,
        jun: 5, june: 5,
        jul: 6, july: 6,
        aug: 7, august: 7,
        sep: 8, sept: 8, september: 8,
        oct: 9, october: 9,
        nov: 10, november: 10,
        dec: 11, december: 11,
      };

      // e.g. "3 January 2027"
      const dmy = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
      if (dmy) {
        const day = parseInt(dmy[1], 10);
        const mo = monthMap[dmy[2].toLowerCase()];
        const year = parseInt(dmy[3], 10);
        if (mo !== undefined) {
          return new Date(year, mo, day, hh, mm, ss);
        }
      }

      // e.g. "January 3, 2027"
      const mdy = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
      if (mdy) {
        const mo = monthMap[mdy[1].toLowerCase()];
        const day = parseInt(mdy[2], 10);
        const year = parseInt(mdy[3], 10);
        if (mo !== undefined) {
          return new Date(year, mo, day, hh, mm, ss);
        }
      }

      // e.g. "3 January" or "January 3" (without year)
      const dmNoYear = s.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
      if (dmNoYear) {
        const day = parseInt(dmNoYear[1], 10);
        const mo = monthMap[dmNoYear[2].toLowerCase()];
        if (mo !== undefined) {
          const curYear = new Date().getFullYear();
          return new Date(curYear, mo, day, hh, mm, ss);
        }
      }
      const mdNoYear = s.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
      if (mdNoYear) {
        const mo = monthMap[mdNoYear[1].toLowerCase()];
        const day = parseInt(mdNoYear[2], 10);
        if (mo !== undefined) {
          const curYear = new Date().getFullYear();
          return new Date(curYear, mo, day, hh, mm, ss);
        }
      }

      // e.g. "2027-01-03" or "2027/01/03"
      const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (ymd) {
        return new Date(
          parseInt(ymd[1], 10),
          parseInt(ymd[2], 10) - 1,
          parseInt(ymd[3], 10),
          hh,
          mm,
          ss,
        );
      }

      const cleanTime = timeMatch ? timeMatch[0] : "";
      const fallback = new Date(`${s} ${cleanTime}`.trim());
      if (!Number.isNaN(fallback.getTime())) {
        return fallback;
      }

      const dateOnly = new Date(s);
      if (!Number.isNaN(dateOnly.getTime())) {
        dateOnly.setHours(hh, mm, ss, 0);
        return dateOnly;
      }

      return null;
    };

    const now = new Date();
    const nowMs = now.getTime();
    let targetDate: Date | null = null;

    const rawTimestamp = nextItem?.airing_at ?? nextItem?.airingAt ?? nextItem?.timestamp;
    const rawDateField =
      nextItem?.date ?? nextItem?.airdate ?? nextItem?.aired ?? nextItem?.release_date;
    if (typeof rawTimestamp === "number" && rawTimestamp > 0) {
      targetDate = new Date(rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp);
    } else if (rawDateField) {
      const dateStr = String(rawDateField).trim();
      if (/\b(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months)\b/i.test(dateStr)) {
        const cleaned = dateStr.replace(/^in\s+/i, "").trim();
        return { epNum, unitText: cleaned };
      }
      targetDate = parseDateWithTime(dateStr);
    }

    if (!targetDate && rawTimeStr) {
      if (m.startDate?.year && m.startDate?.month && m.startDate?.day) {
        const baseDate = new Date(
          m.startDate.year,
          m.startDate.month - 1,
          m.startDate.day,
          hh,
          mm,
          ss,
        );
        const epNumberVal = Math.max(1, Number(epNum) || 1);
        const scheduledMs =
          baseDate.getTime() + (epNumberVal - 1) * 7 * 24 * 60 * 60 * 1000;

        if (scheduledMs > nowMs) {
          targetDate = new Date(scheduledMs);
        } else {
          const targetWeekday = baseDate.getDay();
          const candidate = new Date(nowMs);
          candidate.setHours(hh, mm, ss, 0);
          let daysAhead = (targetWeekday - candidate.getDay() + 7) % 7;
          if (daysAhead === 0 && candidate.getTime() <= nowMs) {
            daysAhead = 7;
          }
          candidate.setDate(candidate.getDate() + daysAhead);
          targetDate = candidate;
        }
      } else {
        const candidate = new Date(nowMs);
        candidate.setHours(hh, mm, ss, 0);
        if (candidate.getTime() <= nowMs) {
          candidate.setDate(candidate.getDate() + 1);
        }
        targetDate = candidate;
      }
    }

    if (!targetDate && m.nextAiringEpisode?.airingAt) {
      targetDate = new Date(m.nextAiringEpisode.airingAt * 1000);
    }

    if (!targetDate) {
      if (rawDateField && String(rawDateField).trim()) {
        return { epNum, unitText: String(rawDateField).trim() };
      }
      return null;
    }

    const targetMs = targetDate.getTime();
    const diffMs = Math.max(0, targetMs - nowMs);

    const isSameCalendarDay =
      targetDate.getFullYear() === now.getFullYear() &&
      targetDate.getMonth() === now.getMonth() &&
      targetDate.getDate() === now.getDate();

    let unitText: string;

    // If the date is the same day (or less than 24 hours away), calculate from time
    if (isSameCalendarDay || diffMs < 24 * 60 * 60 * 1000) {
      if (diffMs >= 60 * 60 * 1000) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        unitText = formatUnit(hours, "hour");
      } else if (diffMs >= 60 * 1000) {
        const minutes = Math.floor(diffMs / (1000 * 60));
        unitText = formatUnit(minutes, "minute");
      } else {
        const seconds = Math.max(1, Math.floor(diffMs / 1000));
        unitText = formatUnit(seconds, "second");
      }
    } else {
      const totalDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      if (totalDays >= 30) {
        const months = Math.floor(totalDays / 30);
        unitText = formatUnit(months, "month");
      } else if (totalDays >= 7) {
        const weeks = Math.floor(totalDays / 7);
        unitText = formatUnit(weeks, "week");
      } else {
        unitText = formatUnit(totalDays, "day");
      }
    }

    return { epNum, unitText };
  }, [episodeApiData, initialRawEpData, m]);

  const bannerUrl = m.bannerImage || m.coverImage?.extraLarge || m.coverImage?.large || "";
  const posterUrl = m.coverImage?.extraLarge || m.coverImage?.large || (m as any).poster || "";
  const popupSubtitle = m.title?.english || m.title?.romaji || m.title?.native || "";

  return (
    <div className={cn("mx-auto w-full max-w-xl", m.trailer?.id && "lg:max-w-none")}>
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-stretch lg:gap-4">
        {/* LEFT COLUMN (40% on PC when trailer exists): Overview boxes */}
        <div
          className={cn(
            "flex w-full flex-col gap-2.5",
            m.trailer?.id ? "lg:w-[40%] lg:shrink-0" : "w-full",
          )}
        >
          {/* Top Next Episode Box (with Bell icon, centered, and green duration text) */}
          {nextEpisodeBanner && (
            <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-white/[0.1] bg-[#121212] px-3.5 sm:px-4 py-2.5 text-center">
              <Bell className="size-3.5 shrink-0 text-neutral-400" />
              <span className="text-xs font-normal text-neutral-100">
                Next episode {nextEpisodeBanner.epNum} in{" "}
                <span className="font-medium text-emerald-400">{nextEpisodeBanner.unitText}</span>
              </span>
            </div>
          )}

          {/* Top 3-column stats card: Average Score, Type, Rating */}
          <div className="grid grid-cols-3 divide-x divide-white/[0.1] rounded-2xl border border-white/[0.1] bg-[#121212] py-3 px-2">
            <div className="flex flex-col items-center justify-center text-center px-1">
              <span className="text-[11px] font-normal text-neutral-400">Average Score</span>
              <span className="mt-1 text-[15px] font-semibold tracking-tight text-white whitespace-nowrap">
                {scoreDisplay}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center text-center px-1">
              <span className="text-[11px] font-normal text-neutral-400">Type</span>
              <span className="mt-1 text-[15px] font-semibold tracking-tight text-white whitespace-nowrap">
                {typeDisplay}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center text-center px-1">
              <span className="text-[11px] font-normal text-neutral-400">Rating</span>
              <span className="mt-1 text-[15px] font-semibold tracking-tight text-white whitespace-nowrap">
                {ratingDisplay}
              </span>
            </div>
          </div>

          {/* Bottom list card: Genres on top, then Release, Season, Status, Source, Studio, More information */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#121212] divide-y divide-white/[0.1]">
            {/* Genres */}
            {genres.length > 0 && (
              <div className="px-3.5 sm:px-4 py-3">
                <div className="flex items-center gap-2.5 text-neutral-400">
                  <Shapes className="size-3.5 shrink-0" />
                  <span className="text-xs font-normal">Genres</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <Link
                      key={g}
                      to="/anime/browse"
                      search={{ genre: g }}
                      className="rounded-full border border-white/[0.1] bg-[#121212] px-2.5 py-0.5 text-[11px] font-normal text-neutral-200 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
                    >
                      {g}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Release */}
            <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5">
              <div className="flex items-center gap-2.5 text-neutral-400">
                <Calendar className="size-3.5 shrink-0" />
                <span className="text-xs font-normal">Release</span>
              </div>
              <span className="text-xs font-normal text-neutral-100">{releaseDisplay}</span>
            </div>

            {/* Season */}
            <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5">
              <div className="flex items-center gap-2.5 text-neutral-400">
                <Leaf className="size-3.5 shrink-0" />
                <span className="text-xs font-normal">Season</span>
              </div>
              <span className="text-xs font-normal text-neutral-100">{seasonDisplay}</span>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5">
              <div className="flex items-center gap-2.5 text-neutral-400">
                <Star className="size-3.5 shrink-0" />
                <span className="text-xs font-normal">Status</span>
              </div>
              <span
                className={cn(
                  "text-xs font-normal",
                  isUpcomingStatus ? "text-red-500 font-medium" : "text-neutral-100",
                )}
              >
                {statusDisplay}
              </span>
            </div>

            {/* Source */}
            <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5">
              <div className="flex items-center gap-2.5 text-neutral-400">
                <Gamepad2 className="size-3.5 shrink-0" />
                <span className="text-xs font-normal">Source</span>
              </div>
              <span className="text-xs font-normal text-neutral-100">{sourceDisplay}</span>
            </div>

            {/* Studio */}
            <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5">
              <div className="flex items-center gap-2.5 text-neutral-400">
                <Building2 className="size-3.5 shrink-0" />
                <span className="text-xs font-normal">Studio</span>
              </div>
              <span className="text-xs font-normal text-neutral-100 truncate max-w-[180px] sm:max-w-xs text-right">
                {studioDisplay}
              </span>
            </div>

            {/* More information button (inside the box on both Mobile and PC) */}
            <button
              type="button"
              onClick={openMorePopup}
              className="flex w-full items-center justify-between px-3.5 sm:px-4 py-2.5 text-left text-neutral-300 hover:text-white transition-colors cursor-pointer group"
            >
              <span className="text-xs font-normal">More information</span>
              <ArrowRight className="size-3.5 text-neutral-400 group-hover:text-white transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN (60% on PC): Trailer Video dynamically equalized to match left column height */}
        {m.trailer?.id && (
          <div className="w-full lg:w-[60%] lg:min-w-0 lg:flex-1 lg:flex lg:flex-col">
            <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#121212] lg:flex-1 lg:flex lg:flex-col">
              <div className="aspect-video w-full lg:aspect-auto lg:flex-1 lg:h-full">
                <iframe
                  src={`https://www.youtube.com/embed/${m.trailer.id}?rel=0`}
                  title={`${titleOf(m)} Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  className="size-full border-0"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* More info modal popup:
          - Mobile (< 1024px): Bottom sheet with bottom-to-top slide animation, NO banner/poster header
          - PC (>= 1024px, lg:): Centered modal with pop-up & pop-out animation + Banner & Poster Header */}
      {showMore &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={cn(
              "fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm overscroll-none transition-opacity duration-300 ease-out will-change-[opacity] lg:items-center lg:bg-black/65 lg:p-4 lg:duration-200",
              isPopupVisible ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            onClick={closeMorePopup}
          >
            <div
              className={cn(
                "relative flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-t border-x border-white/[0.1] bg-[#121212] pt-3 pb-5 shadow-2xl transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:max-w-lg lg:rounded-3xl lg:border lg:pt-0 lg:pb-0 lg:will-change-[transform,opacity] lg:transition-all lg:duration-200 lg:ease-[cubic-bezier(0.16,1,0.3,1)]",
                isPopupVisible
                  ? "translate-y-0 lg:scale-100 lg:opacity-100"
                  : "translate-y-full lg:translate-y-0 lg:scale-90 lg:opacity-0",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile Header (< 1024px): Clean title + Close button, NO banner/poster */}
              <div className="mb-2.5 flex items-center justify-between px-4 shrink-0 lg:hidden">
                <h3 className="text-sm font-bold text-white">More info</h3>
                <button
                  type="button"
                  onClick={closeMorePopup}
                  aria-label="Close"
                  className="flex size-7 items-center justify-center rounded-full bg-white/[0.08] text-neutral-300 hover:bg-white/[0.15] hover:text-white transition-colors cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* PC Header (>= 1024px): Top Banner + Overlapping Poster Header */}
              <div className="relative shrink-0 hidden lg:block">
                <div className="relative h-40 w-full overflow-hidden bg-zinc-900">
                  {bannerUrl && (
                    <img
                      src={bannerUrl}
                      alt={popupSubtitle}
                      referrerPolicy="no-referrer"
                      decoding="async"
                      className="size-full object-cover object-center"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/45 to-black/15" />
                  <button
                    type="button"
                    onClick={closeMorePopup}
                    aria-label="Close"
                    className="absolute right-3 top-3 z-20 flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                {/* Overlapping Poster + "More info" & Title */}
                <div className="relative z-10 -mt-16 flex items-end gap-3.5 px-4 pb-2">
                  {posterUrl && (
                    <div className="aspect-[1/1.45] w-[74px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-800 shadow-xl">
                      <img
                        src={posterUrl}
                        alt={popupSubtitle}
                        referrerPolicy="no-referrer"
                        decoding="async"
                        className="size-full object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 pb-0.5">
                    <h3 className="text-lg font-bold text-white leading-tight">
                      More info
                    </h3>
                    {popupSubtitle && (
                      <p className="mt-0.5 truncate text-xs font-normal text-neutral-300">
                        {popupSubtitle}
                      </p>
                    )}
                  </div>
                </div>
              </div>

            {/* Scrollable Modal Body with Vertical Top & Bottom Feather */}
            <div
              ref={popupScrollRef}
              onScroll={updatePopupScrollFeather}
              className={cn(
                "flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pt-1 lg:pb-5 lg:pt-2.5 space-y-3.5 no-scrollbar",
                canScrollTop && canScrollBottom
                  ? "col-feather"
                  : canScrollTop
                    ? "col-feather-top"
                    : canScrollBottom
                      ? "col-feather-bottom"
                      : "",
              )}
            >
              {/* 1. Scores Section */}
              {hasAnyScoreBox && (
                <div>
                  <p className="mb-1.5 text-[11px] font-normal text-neutral-400">Scores</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* First box: Rating on top with dynamic score color, "Rating" below in grey */}
                    {scoreDisplay !== "N/A" && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <div
                          className="flex items-center gap-1 text-xs font-bold"
                          style={{ color: scoreColor }}
                        >
                          <Star className="size-3 shrink-0 fill-current" />
                          <span>{scoreDisplay}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] font-normal text-neutral-400">Rating</p>
                      </div>
                    )}

                    {/* Ranked (#) */}
                    {typeof m.rank === "number" && m.rank > 0 && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-xs font-bold text-white">
                          {formatCompactMetric(m.rank, true)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-normal text-neutral-400">Ranked</p>
                      </div>
                    )}

                    {/* Popularity (#) */}
                    {typeof m.popularity === "number" && m.popularity > 0 && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-xs font-bold text-white">
                          {formatCompactMetric(m.popularity, true)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-normal text-neutral-400">Popularity</p>
                      </div>
                    )}

                    {/* Members */}
                    {typeof m.members === "number" && m.members > 0 && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-xs font-bold text-white">
                          {formatCompactMetric(m.members, false)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-normal text-neutral-400">Members</p>
                      </div>
                    )}

                    {/* Favourites */}
                    {typeof m.favourites === "number" && m.favourites > 0 && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-xs font-bold text-white">
                          {formatCompactMetric(m.favourites, false)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-normal text-neutral-400">Favourites</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. Details Section */}
              {hasAnyDetailBox && (
                <div>
                  <p className="mb-1.5 text-[11px] font-normal text-neutral-400">Details</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Status */}
                    {detailStatusLabel && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-[10px] font-normal text-neutral-400">Status</p>
                        <p
                          className={cn(
                            "mt-0.5 text-xs font-medium",
                            isUpcomingStatus ? "text-red-500" : "text-white",
                          )}
                        >
                          {detailStatusLabel}
                        </p>
                      </div>
                    )}

                    {/* Source */}
                    {detailSourceLabel && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-[10px] font-normal text-neutral-400">Source</p>
                        <p className="mt-0.5 text-xs font-medium text-white">{detailSourceLabel}</p>
                      </div>
                    )}

                    {/* Rating */}
                    {detailRatingLabel && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-[10px] font-normal text-neutral-400">Rating</p>
                        <p className="mt-0.5 text-xs font-medium text-white">{detailRatingLabel}</p>
                      </div>
                    )}

                    {/* Episode length (on top) */}
                    {episodeLengthDisplay && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-[10px] font-normal text-neutral-400">Episode length</p>
                        <p className="mt-0.5 text-xs font-medium text-white">
                          {episodeLengthDisplay}
                        </p>
                      </div>
                    )}

                    {/* Total runtime (below) */}
                    {totalRuntimeDisplay && (
                      <div className="rounded-xl border border-white/[0.1] bg-[#121212] px-2.5 py-2">
                        <p className="text-[10px] font-normal text-neutral-400">Total runtime</p>
                        <p className="mt-0.5 text-xs font-medium text-white">
                          {totalRuntimeDisplay}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. Titles Section */}
              {(m.title?.english || m.title?.romaji || m.title?.native || synonyms.length > 0) && (
                <div>
                  <p className="mb-1.5 text-[11px] font-normal text-neutral-400">Titles</p>
                  <div className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#121212] divide-y divide-white/[0.1]">
                    {m.title?.english && (
                      <div className="flex items-center gap-3 px-3 py-2">
                        <span className="w-16 shrink-0 text-[11px] font-normal text-neutral-400">
                          English
                        </span>
                        <span className="flex-1 text-[11px] font-medium text-white break-words">
                          {m.title.english}
                        </span>
                      </div>
                    )}
                    {m.title?.romaji && (
                      <div className="flex items-center gap-3 px-3 py-2">
                        <span className="w-16 shrink-0 text-[11px] font-normal text-neutral-400">
                          Romaji
                        </span>
                        <span className="flex-1 text-[11px] font-medium text-white break-words">
                          {m.title.romaji}
                        </span>
                      </div>
                    )}
                    {m.title?.native && (
                      <div className="flex items-center gap-3 px-3 py-2">
                        <span className="w-16 shrink-0 text-[11px] font-normal text-neutral-400">
                          Native
                        </span>
                        <span className="flex-1 text-[11px] font-medium text-white break-words">
                          {m.title.native}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Synonyms as small pill boxes underneath */}
                  {synonyms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {synonyms.map((syn, idx) => (
                        <span
                          key={idx}
                          className="rounded-full border border-white/[0.1] bg-[#121212] px-2 py-0.5 text-[10px] font-normal text-neutral-200"
                        >
                          {syn}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Tags Section (styled using the exact same box and colour as Genres) */}
              {tagItems.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-normal text-neutral-400">
                    Tags • {tagItems.length}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tagItems.map((t, idx) => (
                      <span
                        key={idx}
                        className="rounded-full border border-white/[0.1] bg-[#121212] px-2 py-0.5 text-[10px] font-normal text-neutral-200"
                      >
                        {t.name}
                        {typeof t.rank === "number" ? (
                          <span className="ml-1 text-neutral-400">{t.rank}%</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
function SeasonsTab({ m }: { m: AnilistMedia }) {
  const { data, isLoading } = useQuery({
    queryKey: ["anime-data", m.id, "season"],
    queryFn: () => fetchApikumeData(String(m.id), "season"),
    staleTime: 0,
  });

  const relationPriority = (type: string) => {
    const upper = type?.toUpperCase() || "";
    if (upper === "PREQUEL") return 1;
    if (upper === "SEQUEL") return 2;
    return 3;
  };

  const { watchOrder, relatedList } = useMemo(() => {
    const res = data?.results ?? data ?? {};
    const wo = Array.isArray(res?.watch_order) ? res.watch_order : [];
    const rel = Array.isArray(res?.related)
      ? [...res.related].sort(
          (a: any, b: any) =>
            relationPriority(a.relation || a.relationType) -
            relationPriority(b.relation || b.relationType),
        )
      : [];
    return { watchOrder: wo, relatedList: rel };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
        {Array.from({ length: 6 }).map((_, idx) => (
          <AnimeCardSkeleton key={idx} className="w-full" />
        ))}
      </div>
    );
  }

  if (watchOrder.length === 0 && relatedList.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No related content.</div>
    );
  }

  return (
    <div className="space-y-6">
      {watchOrder.length > 0 && (
        <div className="-mt-6">
          <AnimeRowShell title="Watch Order">
            {watchOrder.map((r: any, idx: number) => (
              <div
                key={r.anikume_id ?? r.id ?? idx}
                className="group/badge relative shrink-0 w-[130px] sm:w-[165px] lg:w-[190px]"
              >
                <AnimeCard item={r} badge={null} />
                {(r.relation || r.season) && (
                  <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur transition-transform duration-300 group-hover/badge:-translate-y-1">
                    {String(r.relation || r.season).replace(/_/g, " ")}
                  </span>
                )}
              </div>
            ))}
          </AnimeRowShell>
        </div>
      )}

      {relatedList.length > 0 && (
        <div className={watchOrder.length > 0 ? "" : "-mt-6"}>
          <AnimeRowShell title={watchOrder.length > 0 ? "Related" : undefined}>
            {relatedList.map((r: any, idx: number) => (
              <div
                key={r.anikume_id ?? r.id ?? idx}
                className="group/badge relative shrink-0 w-[130px] sm:w-[165px] lg:w-[190px]"
              >
                <AnimeCard item={r} badge={null} />
                {(r.relation || r.relationType) && (
                  <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur transition-transform duration-300 group-hover/badge:-translate-y-1">
                    {String(r.relation || r.relationType).replace(/_/g, " ")}
                  </span>
                )}
              </div>
            ))}
          </AnimeRowShell>
        </div>
      )}
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
    <div className="mb-4 flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#121212] animate-in fade-in duration-300">
      <div className="relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden bg-black sm:w-36">
        {banner ? (
          <img
            src={banner}
            alt=""
            referrerPolicy="no-referrer"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="text-xs font-bold text-muted-foreground">EP {nextEp.episode}</span>
        )}
        <span className="absolute bottom-1 left-1 rounded-[6px] border border-white/[0.1] bg-[#121212] px-1.5 py-0.5 text-[10px] font-bold text-white">
          EP {nextEp.episode}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-2 pr-3">
        <p className="truncate text-sm font-bold">Soon in {parts.join(" ")}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground sm:text-xs">
          {new Date(nextEp.airingAt * 1000).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

/* ---------------------- Episodes ---------------------- */
function EpisodesTab({
  m,
  episodes,
  total,
  onRefresh,
  isRefreshing,
}: {
  m: AnilistMedia;
  episodes: Episode[];
  total: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const [sortOrder, setSortOrder] = useContentSortOrder();

  let count = total || episodes.length || m.episodes || 12;
  if (m.status === "RELEASING" && m.nextAiringEpisode) {
    count = Math.min(count, Math.max(0, m.nextAiringEpisode.episode - 1));
  }

  // Pre-index episodes by episode number for O(1) instant lookup
  const episodeMap = useMemo(() => {
    const map = new Map<number, Episode>();
    if (episodes) {
      for (let i = 0; i < episodes.length; i++) {
        map.set(episodes[i].episode, episodes[i]);
      }
    }
    return map;
  }, [episodes]);

  // Chunks of 50
  const ranges = useMemo(() => {
    const r: { label: string; start: number; end: number; id: number }[] = [];
    for (let s = 1; s <= count; s += 50) {
      const e = Math.min(s + 49, count);
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
  }, [count, sortOrder]);

  const [rangeIdx, setRangeIdx] = useState(0);

  useEffect(() => {
    setRangeIdx(0);
  }, [sortOrder]);

  const range = ranges[rangeIdx] ?? ranges[0] ?? { start: 1, end: count };

  type Item = {
    num: number;
    title: string;
    thumbnail: string | null;
    url: string | null;
    description: string | null;
    filler: boolean;
  };

  const items: Item[] = useMemo(() => {
    const raw: Item[] = Array.from({ length: range.end - range.start + 1 }).map((_, i) => {
      const num = range.start + i;
      const ep = episodeMap.get(num);
      const fallback = m.streamingEpisodes?.[num - 1];
      return {
        num,
        title: ep?.title ?? fallback?.title ?? `Episode ${num}`,
        thumbnail: ep?.image ?? fallback?.thumbnail ?? null,
        url: fallback?.url ?? null,
        description: ep?.description ?? null,
        filler: Boolean(ep?.filler || (ep as any)?.is_filler),
      };
    });

    if (sortOrder === "desc") {
      return raw.reverse();
    }
    return raw;
  }, [range.start, range.end, episodeMap, m, sortOrder]);

  return (
    <div>
      {m.nextAiringEpisode && (
        <NextEpisodeCountdown
          nextEp={m.nextAiringEpisode}
          banner={m.bannerImage || m.coverImage.extraLarge || m.coverImage.large}
        />
      )}
      <div className="mb-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Pure White Episode Count */}
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
            {count} Episodes
          </span>
        </div>

        {/* Right: Range Dropdown & Sort Chooser */}
        <div className="flex items-center gap-2">
          {ranges.length > 1 && (
            <div className="shrink-0 min-w-[100px] sm:min-w-[110px]">
              <SharedSelect
                value={String(rangeIdx)}
                options={ranges.map((r, i) => ({
                  value: String(i),
                  display: r.label,
                }))}
                onChange={(v) => setRangeIdx(Number(v))}
                triggerClassName="py-1.5 px-3 text-xs font-semibold text-white bg-[#121212] border border-white/[0.1]"
              />
            </div>
          )}

          <button
            onClick={() => setSortOrder((v) => (v === "desc" ? "asc" : "desc"))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/[0.1] bg-[#121212] hover:bg-white/[0.06] text-white text-xs font-bold transition active:scale-95"
            title={
              sortOrder === "desc"
                ? "Order: Descending (Newest first)"
                : "Order: Ascending (Oldest first)"
            }
            aria-label={sortOrder === "desc" ? "Sort descending" : "Sort ascending"}
          >
            {sortOrder === "desc" ? (
              <SortDescIcon className="size-4 text-white" />
            ) : (
              <SortAscIcon className="size-4 text-white" />
            )}
          </button>
        </div>
      </div>

      <div>
        {isRefreshing ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-0 items-stretch gap-3 overflow-hidden rounded-xl border border-white/[0.1] bg-[#121212]"
              >
                <div className="aspect-video w-28 shrink-0 self-stretch rounded-xl skeleton-box sm:w-36" />
                <div className="min-w-0 flex-1 space-y-2 py-2 pr-3">
                  <div className="h-3.5 w-3/4 skeleton-text" />
                  <div className="h-3 w-5/6 skeleton-text opacity-70" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {items.map((ep) => (
              <Link
                key={ep.num}
                to="/anime/watch/$id"
                params={{ id: String(m.id) }}
                hash={String(ep.num)}
                className="group flex min-w-0 items-stretch gap-3 overflow-hidden rounded-xl border border-white/[0.1] bg-[#121212] transition hover:border-[var(--brand)]/50 hover:bg-white/[0.04]"
              >
                <div className="relative grid aspect-video w-28 shrink-0 self-stretch place-items-center overflow-hidden rounded-xl bg-black sm:w-36">
                  {ep.thumbnail ? (
                    <img
                      src={ep.thumbnail}
                      alt=""
                      referrerPolicy="no-referrer"
                      decoding="async"
                      loading="lazy"
                      className="size-full rounded-xl object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <span className="text-xs font-bold text-white/80">EP {ep.num}</span>
                  )}
                  <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 flex items-center rounded-md bg-white/10 ring-1 ring-white/15 backdrop-blur-md px-1.5 py-0.5 text-[9.5px] sm:text-[10px] font-bold text-white shadow-sm">
                    EP {ep.num}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center py-1.5 pr-3">
                  <p
                    className={cn(
                      "truncate text-xs sm:text-[13px] font-bold transition-colors",
                      ep.filler
                        ? "text-amber-400 group-hover:text-amber-300"
                        : "text-white group-hover:text-[var(--brand,#df7426)]",
                    )}
                  >
                    {ep.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-white/70 sm:text-xs">
                    {ep.description || stripHtml(m.description)?.slice(0, 120) || "—"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------- Characters ---------------------- */
function CharactersTab({ m }: { m: AnilistMedia }) {
  const { data, isLoading } = useQuery({
    queryKey: ["anime-data", m.id, "character"],
    queryFn: () => fetchApikumeData(String(m.id), "character"),
    staleTime: 0,
  });

  const characters = useMemo(() => {
    const rawList = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];
    return rawList;
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex min-w-0 items-stretch gap-2 overflow-hidden rounded-2xl border border-white/5 bg-card/40 p-2"
          >
            <div className="size-14 shrink-0 rounded-xl skeleton-box sm:size-16" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pl-1">
              <div className="h-3.5 w-24 skeleton-text" />
              <div className="h-2.5 w-14 skeleton-text opacity-70" />
            </div>
            <div className="flex min-w-0 flex-col items-end justify-center gap-1.5 pr-1">
              <div className="h-3.5 w-24 skeleton-text" />
              <div className="h-2.5 w-14 skeleton-text opacity-70" />
            </div>
            <div className="size-14 shrink-0 rounded-xl skeleton-box sm:size-16" />
          </div>
        ))}
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/30 p-10 text-center text-sm text-muted-foreground">
        No characters available.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Characters
        <span className="rounded-md bg-white/5 px-2 py-0.5 text-foreground/85 ring-1 ring-white/10">
          {characters.length}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {characters.map((c: any, i: number) => {
          const charName = c.character ?? c.node?.name?.full ?? c.name ?? "Unknown";
          const charRole = c.role ?? "Supporting";
          const charImage = c.image ?? c.node?.image?.large ?? "";
          const vaName = c.actor ?? c.voiceActors?.[0]?.name?.full ?? null;
          const vaLang = c.language ?? c.voiceActors?.[0]?.languageV2 ?? "Japanese";
          const vaImage = c.actor_image ?? c.voiceActors?.[0]?.image?.large ?? null;

          return (
            <div
              key={i}
              className="flex min-w-0 items-stretch gap-2 overflow-hidden rounded-2xl border border-white/5 bg-card/40 p-2"
            >
              {charImage ? (
                <img
                  src={charImage}
                  alt={charName}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  loading="lazy"
                  className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-white/10 sm:size-16"
                />
              ) : (
                <div className="size-14 shrink-0 rounded-xl bg-white/5 ring-1 ring-white/10 sm:size-16" />
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center pl-1">
                <p className="truncate text-sm font-bold">{charName}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {String(charRole).toLowerCase()}
                </p>
              </div>
              {vaName && (
                <>
                  <div className="flex min-w-0 flex-col items-end justify-center pr-1 text-right">
                    <p className="truncate text-sm font-bold">{vaName}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {vaLang}
                    </p>
                  </div>
                  {vaImage ? (
                    <img
                      src={vaImage}
                      alt={vaName}
                      referrerPolicy="no-referrer"
                      decoding="async"
                      loading="lazy"
                      className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-white/10 sm:size-16"
                    />
                  ) : (
                    <div className="size-14 shrink-0 rounded-xl bg-white/5 ring-1 ring-white/10 sm:size-16" />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------- Related row using shared shell ---------------------- */
function RelatedRow({ title, items }: { title: string; items: AnilistMedia[] }) {
  if (items.length === 0) return null;
  return (
    <AnimeRowShell title={title}>
      {items.map((r) => (
        <AnimeCard key={r.id} media={r} badge={null} />
      ))}
    </AnimeRowShell>
  );
}

/* ---------------------- helpers ---------------------- */
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatAired(m: AnilistMedia) {
  const start = m.startDate;
  const end = m.endDate;
  const fmt = (d?: { year: number | null; month: number | null; day: number | null }) => {
    if (!d || !d.year) return null;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const mo = d.month ? months[d.month - 1] : "";
    return `${mo}${d.day ? ` ${d.day},` : ""} ${d.year}`.trim();
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s) return null;
  if (!e || (start.year === end?.year && start.month === end?.month && start.day === end?.day))
    return `Aired ${s}`;
  return `Aired ${s} — ${e}`;
}
