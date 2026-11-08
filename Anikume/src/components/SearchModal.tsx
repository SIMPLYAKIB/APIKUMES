import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Star, Captions, Mic, ArrowRight } from "lucide-react";
import {
  titleOf,
  apikumeTitle,
  prettyFormat,
  fetchApikumeEndpoint,
} from "@/lib/apikume";
import { formatScore, formatStatus, getScoreColor, getStatusColor, cn } from "@/lib/utils";
import { useTapAnimation } from "@/hooks/useTapAnimation";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

const SEARCH_RESULT_LIMIT = 5;

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SearchModal({ open, onClose }: Props) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [shouldRender, setShouldRender] = useState(open);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [canScrollTop, setCanScrollTop] = useState(false);
  const [canScrollBottom, setCanScrollBottom] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollTop(false);
      setCanScrollBottom(false);
      return;
    }
    const hasScroll = el.scrollHeight > el.clientHeight + 2;
    if (!hasScroll) {
      setCanScrollTop(false);
      setCanScrollBottom(false);
      return;
    }
    setCanScrollTop(el.scrollTop > 4);
    setCanScrollBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(focusTimer);
    } else {
      const timer = setTimeout(() => {
        setShouldRender(false);
        setQ("");
        setDebounced("");
      }, 140);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Lock UI background scrolling when search is open
  useEffect(() => {
    if (!open) return;
    const origBodyOverflow = document.body.style.overflow;
    const origHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = origBodyOverflow;
      document.documentElement.style.overflow = origHtmlOverflow;
    };
  }, [open]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setDebounced("");
      return;
    }
    const t = setTimeout(() => setDebounced(trimmed), 300);
    return () => clearTimeout(t);
  }, [q]);

  const isTyping = q.trim().length >= 2 && q.trim() !== debounced;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["search-modal-top5", debounced],
    queryFn: async () => {
      const res = await fetchApikumeEndpoint(
        `/search?q=${encodeURIComponent(debounced)}`,
      );
      const list = Array.isArray(res) ? res : res?.results || [];
      return list.slice(0, SEARCH_RESULT_LIMIT);
    },
    enabled: debounced.length >= 2,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const hasQuery = q.trim().length >= 2;
  const showSkeletons = hasQuery && (isFetching || isTyping || debounced.length < 2);
  const items = !isTyping && debounced.length >= 2 && Array.isArray(results) ? results.slice(0, SEARCH_RESULT_LIMIT) : [];

  useEffect(() => {
    const timer = setTimeout(updateScrollState, 40);
    return () => clearTimeout(timer);
  }, [items, showSkeletons, updateScrollState]);

  if (!shouldRender && !open) return null;

  const submit = () => {
    const term = q.trim();
    if (term.length < 2) return;
    onClose();
    navigate({
      to: "/anime/browse",
      search: { search: term },
    });
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[10vh] sm:pt-[12vh] overscroll-none touch-none",
        open ? "search-overlay-enter" : "search-overlay-exit pointer-events-none",
      )}
      onClick={onClose}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className={cn(
          "w-full max-w-2xl overflow-hidden rounded-2xl bg-[#0e0e0e] border border-white/10 shadow-2xl transform-gpu backface-hidden",
          open ? "search-enter" : "search-exit",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input bar with built-in close/back button */}
        <div className="flex items-center gap-3 px-4 py-3.5 bg-[#121212]">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Search Anime..."
            className="flex-1 bg-transparent text-sm sm:text-base font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          {/* X button inside the text input box acting as Back/Close */}
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground active:scale-95 cursor-pointer"
            aria-label="Back"
            title="Back / Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {hasQuery && (
          <div className="border-t border-white/[0.08] bg-[#0c0c0c]">
            {/* Optimized native top-down scroll with zero item stretching and top/bottom feather masks */}
            <div
              ref={scrollRef}
              onScroll={updateScrollState}
              className={cn(
                "max-h-[52vh] overflow-y-auto overscroll-contain touch-pan-y p-2.5 sm:p-3 no-scrollbar will-change-scroll",
                canScrollTop && canScrollBottom
                  ? "col-feather"
                  : canScrollTop
                    ? "col-feather-top"
                    : canScrollBottom
                      ? "col-feather-bottom"
                      : "",
              )}
            >
              <div className="flex flex-col gap-2">
                {showSkeletons ? (
                  Array.from({ length: SEARCH_RESULT_LIMIT }).map((_, i) => (
                    <div
                      key={`skel_search_${i}`}
                      className="flex min-w-0 shrink-0 grow-0 items-center gap-2.5 sm:gap-3 rounded-xl border border-white/[0.05] bg-[#141414] p-2 pr-3"
                    >
                      <div className="size-12 sm:size-14 shrink-0 rounded-lg skeleton-box" />
                      <div className="min-w-0 flex-1 space-y-2 pr-1">
                        <div className="h-3 sm:h-3.5 w-3/4 skeleton-text" />
                        <div className="h-2 sm:h-2.5 w-1/3 skeleton-text opacity-70" />
                      </div>
                    </div>
                  ))
                ) : items.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No anime matches “{debounced}”. Press Enter to browse.
                  </p>
                ) : (
                  items.map((m: any, i: number) => (
                    <div key={m.anikume_id || m.id || i} className="min-w-0 shrink-0 grow-0">
                      <SearchResultRow
                        media={m}
                        onSelect={onClose}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom bar with "View all results ->" pill button matching screenshot */}
            <div className="flex items-center justify-end border-t border-white/[0.08] bg-[#0e0e0e] px-3.5 py-2.5">
              <button
                type="button"
                onClick={submit}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-zinc-950 shadow-md transition hover:bg-zinc-200 active:scale-95 cursor-pointer"
              >
                <span>View all results</span>
                <ArrowRight className="size-3.5 sm:size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultRow({
  media,
  onSelect,
}: {
  media: any;
  onSelect: () => void;
}) {
  const rowRef = useRef<HTMLAnchorElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const [carouselApi, setCarouselApi] = useState<any>();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const isDraggingRef = useRef(false);

  const isApikume = Boolean(media && media.anikume_id);
  const rawTitle = isApikume ? apikumeTitle(media.title) : titleOf(media);
  const title = rawTitle && rawTitle !== "Untitled" ? rawTitle : null;
  const rawPoster = isApikume ? media.poster : media.coverImage?.large;
  const poster = rawPoster && String(rawPoster).trim() ? String(rawPoster).trim() : null;

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "20px 20px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setImgLoaded(false);
    if (!isInView) return;
    if (!poster) {
      setImgLoaded(true);
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      const timer = setTimeout(() => {
        requestAnimationFrame(() => setImgLoaded(true));
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [poster, isInView]);

  useEffect(() => {
    if (!carouselApi) return;
    const updateScrollState = () => {
      setCanScrollPrev(carouselApi.canScrollPrev());
      setCanScrollNext(carouselApi.canScrollNext());
    };
    updateScrollState();

    const onPointerDown = () => {
      isDraggingRef.current = false;
    };
    const onScroll = () => {
      isDraggingRef.current = true;
    };

    carouselApi.on("pointerDown", onPointerDown);
    carouselApi.on("scroll", onScroll);
    carouselApi.on("select", updateScrollState);
    carouselApi.on("reInit", updateScrollState);

    return () => {
      carouselApi.off("pointerDown", onPointerDown);
      carouselApi.off("scroll", onScroll);
      carouselApi.off("select", updateScrollState);
      carouselApi.off("reInit", updateScrollState);
    };
  }, [carouselApi]);

  const rawScore = isApikume
    ? media.rating != null && String(media.rating).trim() !== ""
      ? parseFloat(String(media.rating))
      : null
    : media.averageScore ?? media.meanScore;
  const score =
    rawScore != null && !Number.isNaN(Number(rawScore)) && Number(rawScore) > 0
      ? Number(rawScore)
      : null;
  const rawFormat = isApikume ? media.format : prettyFormat(media);
  const format = rawFormat && String(rawFormat).trim() ? String(rawFormat).trim() : null;
  const status = media.status && String(media.status).trim() ? String(media.status).trim() : null;
  const subCount =
    media.sub != null && String(media.sub).trim() !== "" ? String(media.sub).trim() : null;
  const dubCount =
    media.dub != null && String(media.dub).trim() !== "" ? String(media.dub).trim() : null;
  const isAdult =
    Boolean(media?.isAdult) ||
    Boolean(media?.is_adult === true || media?.adult === "true" || media?.adult === true) ||
    (Array.isArray(media?.genres) &&
      media.genres.some(
        (g: any) =>
          typeof g === "string" && (g.toLowerCase() === "hentai" || g.toLowerCase() === "adult"),
      ));
  const linkId = String(media.anikume_id || media.id || "");

  // Exact tag pill style from TopListSection.tsx
  const tagPillClass =
    "flex h-[20px] sm:h-[22px] shrink-0 items-center justify-center gap-1 rounded-full border border-white/[0.08] bg-black/60 px-2.5 text-[8.5px] sm:text-[9.5px] font-bold leading-none select-none whitespace-nowrap shadow-sm";

  const isReady = isInView && imgLoaded;
  const tap = useTapAnimation("scale-[0.98]");

  return (
    <Link
      ref={rowRef}
      to="/anime/$id"
      params={{ id: linkId }}
      {...tap.bind}
      onClick={(e) => {
        if (isDraggingRef.current) {
          e.preventDefault();
          e.stopPropagation();
          isDraggingRef.current = false;
          return;
        }
        onSelect();
      }}
      className={cn(
        "group flex min-w-0 items-center gap-2.5 sm:gap-3 rounded-xl border border-white/[0.06] bg-[#121212]/95 p-1.5 sm:p-2 pr-3 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]",
        tap.scaleClass,
      )}
    >
      {/* Poster container with skeleton-box + fade-in blur matching Top 10 (without 1, 2, 3 index number) */}
      <div className="relative size-12 sm:size-14 shrink-0 overflow-hidden rounded-lg bg-card ring-1 ring-white/[0.06]">
        <div
          className={cn(
            "absolute inset-0 skeleton-box pointer-events-none transition-opacity duration-500 ease-out",
            isReady ? "opacity-0" : "opacity-100",
          )}
        />
        {poster && (
          <img
            ref={imgRef}
            src={isInView ? poster : undefined}
            alt={title || ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={() => {
              setTimeout(() => {
                requestAnimationFrame(() => setImgLoaded(true));
              }, 60);
            }}
            onError={() => {
              setImgLoaded(true);
            }}
            className={cn(
              "absolute inset-0 block size-full object-cover transition-all duration-500 ease-out group-hover:scale-105 will-change-transform transform-gpu",
              isReady ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-95 blur-sm",
            )}
          />
        )}
      </div>

      {/* Right side: Skeleton text lines while loading, fading into unblurred Title + Pills */}
      <div className="relative min-w-0 flex-1 pr-1 flex flex-col justify-center overflow-hidden">
        {/* Per-card skeleton loader lines for title & metadata pills */}
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex flex-col justify-center space-y-2 pr-1 pointer-events-none transition-opacity duration-500 ease-out",
            isReady ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="h-3 sm:h-3.5 w-3/4 rounded skeleton-text" />
          <div className="h-2 sm:h-2.5 w-1/3 rounded skeleton-text opacity-70" />
        </div>

        {/* Actual title + pills with synchronized fade-in blur transition */}
        <div
          className={cn(
            "w-full min-w-0 flex flex-col justify-center transition-all duration-500 ease-out will-change-transform transform-gpu",
            isReady
              ? "opacity-100 scale-100 blur-0"
              : "opacity-0 scale-[0.98] blur-sm pointer-events-none",
          )}
        >
          {title && (
            <h3 className="block w-full truncate text-[10px] sm:text-xs font-bold leading-tight text-foreground transition group-hover:text-primary">
              {title}
            </h3>
          )}
          <div
            className={cn(
              "relative mt-1.5 w-full min-w-0 overflow-hidden",
              canScrollPrev && canScrollNext
                ? "row-feather"
                : canScrollPrev
                  ? "row-feather-left"
                  : canScrollNext
                    ? "row-feather-right"
                    : "",
            )}
          >
            <Carousel
              setApi={setCarouselApi}
              opts={{
                align: "start",
                dragFree: true,
                duration: 35,
                skipSnaps: true,
                slidesToScroll: "auto" as any,
              }}
              className="w-full relative select-none"
            >
              <CarouselContent className="-ml-1.5 py-0.5 items-center">
                {isAdult && (
                  <CarouselItem className="basis-auto pl-1.5 flex items-center">
                    <span className={tagPillClass} style={{ color: "#EF4444" }}>
                      <span className="leading-none">18+</span>
                    </span>
                  </CarouselItem>
                )}
                {score != null && (
                  <CarouselItem className="basis-auto pl-1.5 flex items-center">
                    <span
                      className={tagPillClass}
                      style={{
                        color: getScoreColor(isApikume && score <= 10 ? score * 10 : score),
                      }}
                    >
                      <Star
                        className="size-2.5 shrink-0 fill-current"
                        style={{
                          color: getScoreColor(isApikume && score <= 10 ? score * 10 : score),
                          fill: getScoreColor(isApikume && score <= 10 ? score * 10 : score),
                        }}
                      />
                      <span className="leading-none">
                        {isApikume && score <= 10
                          ? score.toFixed(score % 1 === 0 ? 0 : 1)
                          : formatScore(score)}
                      </span>
                    </span>
                  </CarouselItem>
                )}
                {format && (
                  <CarouselItem className="basis-auto pl-1.5 flex items-center">
                    <span className={cn(tagPillClass, "uppercase tracking-wide text-neutral-200")}>
                      <span className="leading-none">{format}</span>
                    </span>
                  </CarouselItem>
                )}
                {status && (
                  <CarouselItem className="basis-auto pl-1.5 flex items-center">
                    <span
                      className={cn(
                        tagPillClass,
                        "uppercase tracking-wide",
                        getStatusColor(status),
                      )}
                    >
                      <span className="leading-none">{formatStatus(status)}</span>
                    </span>
                  </CarouselItem>
                )}

                {/* Sub Pill as separate item */}
                {subCount && (
                  <CarouselItem className="basis-auto pl-1.5 flex items-center">
                    <span className={tagPillClass} style={{ color: "#00D2FF" }}>
                      <Captions className="size-2.5 shrink-0" style={{ color: "#00D2FF" }} />
                      <span className="leading-none" style={{ color: "#00D2FF" }}>{subCount}</span>
                    </span>
                  </CarouselItem>
                )}

                {/* Dub Pill as separate item */}
                {dubCount && (
                  <CarouselItem className="basis-auto pl-1.5 flex items-center">
                    <span className={tagPillClass} style={{ color: "#FF7300" }}>
                      <Mic className="size-2.5 shrink-0" style={{ color: "#FF7300" }} />
                      <span className="leading-none" style={{ color: "#FF7300" }}>{dubCount}</span>
                    </span>
                  </CarouselItem>
                )}
              </CarouselContent>
            </Carousel>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function useSearchHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
