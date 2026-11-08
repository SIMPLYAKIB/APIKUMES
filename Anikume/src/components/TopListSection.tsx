import { useRef, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Star, Captions, Mic } from "lucide-react";
import {
  prettyFormat,
  titleOf,
  apikumeTitle,
  fetchApikumeSection,
  type ApikumeAnimeItem,
} from "@/lib/apikume";
import { formatScore, formatStatus, getScoreColor, getStatusColor, cn } from "@/lib/utils";
import { useTapAnimation } from "@/hooks/useTapAnimation";
import { observeElementInView } from "@/lib/staticBlur";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

export function TopListSection({
  stacked = false,
  type = "anime",
  top10,
  isLoading = false,
  fillHeight = false,
  className,
}: {
  stacked?: boolean;
  type?: "anime" | "manga";
  top10?: any[];
  isLoading?: boolean;
  fillHeight?: boolean;
  className?: string;
}) {
  const top = useQuery({
    queryKey: ["anime-section", "top_10"],
    queryFn: () => fetchApikumeSection<ApikumeAnimeItem>("top_10"),
    staleTime: 0,
    enabled: !top10,
  });

  const resolvedTop = top10 ?? top.data;
  const resolvedLoadingTop = isLoading || (top10 ? false : top.isLoading);

  return (
    <div className={cn("w-full", fillHeight && "h-full flex flex-col", className)}>
      <Column
        title={type === "manga" ? "Top 10 Manga" : "Top 10"}
        items={resolvedTop}
        loading={resolvedLoadingTop}
        accent="hot"
        limit={10}
        type={type}
        fillHeight={fillHeight}
      />
    </div>
  );
}

function Column({
  title,
  items,
  loading,
  accent,
  limit,
  type,
  fillHeight = false,
}: {
  title: string;
  items: any[] | undefined;
  loading: boolean;
  accent: "hot" | "info";
  limit: number;
  type: "anime" | "manga";
  fillHeight?: boolean;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-full duration-300 animate-in fade-in",
        fillHeight && "h-full flex flex-col"
      )}
    >
      {loading ? (
        <div className="mb-4 h-5 sm:h-6 w-24 rounded skeleton-text shrink-0" />
      ) : (
        <div className="mb-4 flex items-center gap-2 shrink-0">
          <span className="h-4 sm:h-5 w-1 rounded-full bg-[var(--brand,#df7426)] shrink-0 inline-block" />
          <h2 className="section-title">{title}</h2>
        </div>
      )}
      <ul
        className={cn(
          "w-full max-w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-black/50 p-2.5 sm:p-3",
          fillHeight
            ? "flex-1 flex flex-col justify-between gap-1.5"
            : "space-y-2",
        )}
      >
        {loading || !items || items.length === 0
          ? Array.from({ length: limit }).map((_, i) => (
              <li
                key={i}
                className="flex min-w-0 items-center gap-2.5 sm:gap-3 rounded-xl border border-white/[0.05] bg-black/40 p-2 pr-3 flex-1"
              >
                <span className="grid w-7 sm:w-8 shrink-0 place-items-center text-lg sm:text-2xl font-black text-muted-foreground/40">
                  {i + 1}
                </span>
                <div className="size-12 sm:size-14 shrink-0 rounded-lg skeleton-box" />
                <div className="min-w-0 flex-1 space-y-2 pr-1">
                  <div className="h-3 sm:h-3.5 w-3/4 skeleton-text" />
                  <div className="h-2 sm:h-2.5 w-1/3 skeleton-text opacity-70" />
                </div>
              </li>
            ))
          : items.slice(0, limit).map((m, i) => (
              <li key={m.id || m.anikume_id || i} className="min-w-0 flex-1">
                <Row media={m} index={i + 1} accent={accent} type={type} />
              </li>
            ))}
      </ul>
    </div>
  );
}

function Row({
  media,
  index,
  accent,
  type,
}: {
  media: any;
  index: number;
  accent: "hot" | "info";
  type: "anime" | "manga";
}) {
  const rowRef = useRef<HTMLAnchorElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [animDone, setAnimDone] = useState(false);

  const [carouselApi, setCarouselApi] = useState<any>();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const prevScrollPrevRef = useRef(false);
  const prevScrollNextRef = useRef(false);
  const isDraggingRef = useRef(false);

  const isApikume = Boolean(media && media.anikume_id);
  const rawTitle = isApikume ? apikumeTitle(media.title) : titleOf(media);
  const title = rawTitle && rawTitle !== "Untitled" ? rawTitle : null;
  const rawPoster = isApikume ? media.poster : media.coverImage?.large;
  const poster = rawPoster && String(rawPoster).trim() ? String(rawPoster).trim() : null;

  // Shared singleton IntersectionObserver across all cards & rows
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    return observeElementInView(el, () => setIsInView(true));
  }, []);

  useEffect(() => {
    setImgLoaded(false);
    setAnimDone(false);
    if (!isInView) return;
    if (!poster) {
      setImgLoaded(true);
      setAnimDone(true);
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      requestAnimationFrame(() => setImgLoaded(true));
    }
  }, [poster, isInView]);

  const isReady = isInView && imgLoaded;

  useEffect(() => {
    if (!isReady) return;
    const t = setTimeout(() => setAnimDone(true), 520);
    return () => clearTimeout(t);
  }, [isReady]);

  useEffect(() => {
    if (!carouselApi) return;
    const updateScrollState = () => {
      const nextPrev = carouselApi.canScrollPrev();
      const nextNext = carouselApi.canScrollNext();
      if (prevScrollPrevRef.current !== nextPrev) {
        prevScrollPrevRef.current = nextPrev;
        setCanScrollPrev(nextPrev);
      }
      if (prevScrollNextRef.current !== nextNext) {
        prevScrollNextRef.current = nextNext;
        setCanScrollNext(nextNext);
      }
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
  const score = rawScore != null && !Number.isNaN(Number(rawScore)) && Number(rawScore) > 0 ? Number(rawScore) : null;
  const rawFormat = isApikume ? media.format : prettyFormat(media);
  const format = rawFormat && String(rawFormat).trim() ? String(rawFormat).trim() : null;
  const status = media.status && String(media.status).trim() ? String(media.status).trim() : null;
  const subCount = media.sub != null && String(media.sub).trim() !== "" ? String(media.sub).trim() : null;
  const dubCount = media.dub != null && String(media.dub).trim() !== "" ? String(media.dub).trim() : null;
  const isAdult =
    Boolean(media?.isAdult) ||
    Boolean(media?.is_adult === true || media?.adult === "true" || media?.adult === true) ||
    (Array.isArray(media?.genres) &&
      media.genres.some(
        (g: any) =>
          typeof g === "string" && (g.toLowerCase() === "hentai" || g.toLowerCase() === "adult"),
      ));
  const linkId = String(media.anikume_id || media.id || "");
  const numberColor =
    index <= 3
      ? accent === "hot"
        ? "text-[var(--hot)]"
        : "text-[var(--info)]"
      : "text-muted-foreground/60";

  // Individual tag pill style
  const tagPillClass =
    "flex h-[20px] sm:h-[22px] shrink-0 items-center justify-center gap-1 rounded-full border border-white/[0.08] bg-black/60 px-2.5 text-[8.5px] sm:text-[9.5px] font-bold leading-none select-none whitespace-nowrap shadow-sm";

  const tap = useTapAnimation("scale-[0.98]");

  return (
    <Link
      ref={rowRef}
      to={type === "manga" ? "/manga/$id" : "/anime/$id"}
      params={{ id: linkId }}
      {...tap.bind}
      onClick={(e) => {
        if (isDraggingRef.current) {
          e.preventDefault();
          e.stopPropagation();
          isDraggingRef.current = false;
        }
      }}
      className={cn(
        "group flex min-w-0 h-full items-center gap-2.5 sm:gap-3 rounded-xl border border-white/[0.06] bg-[#0c0c0c]/90 p-1.5 sm:p-2 pr-3 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.03]",
        tap.scaleClass,
      )}
    >
      <span
        className={cn(
          "grid w-7 sm:w-8 shrink-0 place-items-center text-xl sm:text-2xl font-black tabular-nums transition-colors duration-500",
          isReady ? numberColor : "text-muted-foreground/40",
        )}
      >
        {index}
      </span>

      {/* Poster container with skeleton-box + fade-in blur matching AnimeCard */}
      <div className="relative size-12 sm:size-14 shrink-0 overflow-hidden rounded-lg bg-card ring-1 ring-white/[0.06]">
        {!animDone && (
          <div
            className={cn(
              "absolute inset-0 skeleton-box pointer-events-none transition-opacity duration-500 ease-out",
              isReady ? "opacity-0" : "opacity-100",
            )}
          />
        )}
        {poster && (
          <img
            ref={imgRef}
            src={isInView ? poster : undefined}
            alt={title || ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={() => {
              requestAnimationFrame(() => setImgLoaded(true));
            }}
            onError={() => {
              setImgLoaded(true);
            }}
            className={cn(
              "absolute inset-0 block size-full object-cover ease-out group-hover:scale-105 transform-gpu",
              animDone
                ? "opacity-100 scale-100 transition-transform duration-300"
                : isReady
                  ? "opacity-100 scale-100 blur-0 transition-all duration-450"
                  : "opacity-0 scale-95 blur-[4px] transition-all duration-450",
            )}
          />
        )}
      </div>

      {/* Right side: Skeleton text lines while loading, fading into unblurred Title + Pills */}
      <div className="relative min-w-0 flex-1 pr-1 flex flex-col justify-center overflow-hidden">
        {/* Per-card skeleton loader lines for title & metadata pills */}
        {!animDone && (
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
        )}

        {/* Actual title + pills with synchronized fade-in blur transition */}
        <div
          className={cn(
            "w-full min-w-0 flex flex-col justify-center ease-out transform-gpu",
            animDone
              ? "opacity-100 scale-100"
              : isReady
                ? "opacity-100 scale-100 blur-0 transition-all duration-450"
                : "opacity-0 scale-[0.98] blur-[4px] pointer-events-none transition-all duration-450",
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
                      style={{ color: getScoreColor(isApikume && score <= 10 ? score * 10 : score) }}
                    >
                      <Star
                        className="size-2.5 shrink-0 fill-current"
                        style={{
                          color: getScoreColor(isApikume && score <= 10 ? score * 10 : score),
                          fill: getScoreColor(isApikume && score <= 10 ? score * 10 : score),
                        }}
                      />
                      <span className="leading-none">
                        {isApikume && score <= 10 ? score.toFixed(score % 1 === 0 ? 0 : 1) : formatScore(score)}
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
