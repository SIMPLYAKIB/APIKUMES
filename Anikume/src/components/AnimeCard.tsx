import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Play, BookOpen, Star, Captions, Mic } from "lucide-react";
import {
  titleOf,
  apikumeTitle,
  type AnilistMedia,
  mapApikumeToAnilistMedia,
} from "@/lib/apikume";
import { cn, getStatusBgColor, getScoreColor } from "@/lib/utils";
import { useTapAnimation } from "@/hooks/useTapAnimation";
import { observeElementInView, drawStaticRegionBlur } from "@/lib/staticBlur";

type Props = {
  media?: AnilistMedia;
  item?: any;
  badge?: "episode" | "soon" | null;
  type?: "anime" | "manga";
  size?: "default" | "sm";
  className?: string;
};

const TOP_LEFT_BADGE_REGION = { x: 0.04, y: 0.03, w: 0.36, h: 0.09 };
const BOTTOM_RIGHT_BADGE_REGION = { x: 0.56, y: 0.88, w: 0.40, h: 0.09 };

function resolveCardTitle(isApikume: boolean, item: any, resolvedMedia: AnilistMedia): string | null {
  const rawTitle = isApikume && item ? item.title : resolvedMedia?.title;
  if (!rawTitle) return null;
  if (typeof rawTitle === "string") {
    const trimmed = rawTitle.trim();
    return trimmed && trimmed !== "Untitled" ? trimmed : null;
  }
  const hasAny =
    (rawTitle.english && String(rawTitle.english).trim()) ||
    (rawTitle.romaji && String(rawTitle.romaji).trim()) ||
    (rawTitle.native && String(rawTitle.native).trim());
  if (!hasAny) return null;
  const preferred = isApikume && item ? apikumeTitle(item.title) : titleOf(resolvedMedia);
  return preferred && preferred !== "Untitled" ? preferred : null;
}

export function AnimeCard({ media, item, type: overrideType, size = "default", className }: Props) {
  const isApikume = Boolean(item || (media && typeof media.id === "string" && !/^\d+$/.test(String(media.id))));
  const resolvedMedia: AnilistMedia = item ? mapApikumeToAnilistMedia(item, item.anikume_id) : media!;
  const title = resolveCardTitle(isApikume, item, resolvedMedia);
  const rawCoverImg = isApikume && item ? item.poster : (resolvedMedia.coverImage?.large || resolvedMedia.coverImage?.extraLarge);
  const coverImg = rawCoverImg && String(rawCoverImg).trim() ? String(rawCoverImg).trim() : null;

  const [imgLoaded, setImgLoaded] = useState(false);
  const [isInView, setIsInView] = useState(true);
  const [animDone, setAnimDone] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const topBadgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const bottomBadgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const blurDrawnRef = useRef(false);

  const drawBadgesOnce = () => {
    if (blurDrawnRef.current) return;
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    blurDrawnRef.current = true;
    drawStaticRegionBlur(img, topBadgeCanvasRef.current, TOP_LEFT_BADGE_REGION, 1 / 1.4, false);
    drawStaticRegionBlur(img, bottomBadgeCanvasRef.current, BOTTOM_RIGHT_BADGE_REGION, 1 / 1.4, false);
  };

  useEffect(() => {
    const el = cardContainerRef.current;
    if (!el) return;
    return observeElementInView(el, () => setIsInView(true));
  }, []);

  useEffect(() => {
    blurDrawnRef.current = false;
    if (!coverImg) {
      setImgLoaded(true);
      setAnimDone(true);
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      el.setAttribute("data-img-loaded", "true");
      drawBadgesOnce();
      setImgLoaded(true);
      return;
    }
    setImgLoaded(false);
    setAnimDone(false);
    const fallbackTimer = setTimeout(() => {
      if (imgRef.current) {
        imgRef.current.setAttribute("data-img-loaded", "true");
        drawBadgesOnce();
      }
      setImgLoaded(true);
    }, 650);
    return () => clearTimeout(fallbackTimer);
  }, [coverImg]);

  const isReady = isInView && imgLoaded;

  useEffect(() => {
    if (!isReady) {
      setAnimDone(false);
      return;
    }
    drawBadgesOnce();
    const timer = setTimeout(() => setAnimDone(true), 450);
    return () => clearTimeout(timer);
  }, [isReady]);

  const rawFormat = item !== undefined ? item?.format : resolvedMedia?.format;
  const formatText = rawFormat && String(rawFormat).trim() ? String(rawFormat).trim() : null;

  const rawStatus = item !== undefined ? item?.status : resolvedMedia?.status;
  const hasStatus = Boolean(rawStatus && String(rawStatus).trim());
  const statusColor = hasStatus ? getStatusBgColor(String(rawStatus).trim()) : null;

  const isManga =
    overrideType === "manga" ||
    formatText === "MANGA" ||
    formatText === "NOVEL" ||
    formatText === "ONE_SHOT";

  const isAdultTag =
    resolvedMedia.isAdult ||
    (resolvedMedia.genres || []).some((g) => g.toLowerCase() === "hentai" || g.toLowerCase() === "adult") ||
    Boolean(
      item &&
        (item.is_adult === true ||
          item.adult === "true" ||
          item.adult === true)
    );

  const rawScore =
    item?.rating != null && String(item.rating).trim() !== ""
      ? parseFloat(String(item.rating))
      : item?.score != null && String(item.score).trim() !== ""
        ? parseFloat(String(item.score))
        : item === undefined && resolvedMedia?.averageScore != null
          ? Number(resolvedMedia.averageScore)
          : item === undefined && resolvedMedia?.meanScore != null
            ? Number(resolvedMedia.meanScore)
            : null;

  const validScore = rawScore != null && !isNaN(rawScore) && rawScore > 0;
  // If score is <= 10 (e.g. 8.5 or 10 directly from API), scale by 10 for getScoreColor
  const score100 = validScore ? (rawScore <= 10 ? rawScore * 10 : rawScore) : null;
  const scoreColor = score100 != null ? getScoreColor(score100) : null;
  const scoreText = validScore
    ? rawScore <= 10
      ? rawScore.toFixed(rawScore % 1 === 0 ? 0 : 1)
      : (rawScore / 10).toFixed(1)
    : null;

  const subCount =
    item?.sub != null && String(item.sub).trim() !== ""
      ? String(item.sub).trim()
      : (media as any)?.sub != null && String((media as any).sub).trim() !== ""
        ? String((media as any).sub).trim()
        : null;

  const dubCount =
    item?.dub != null && String(item.dub).trim() !== ""
      ? String(item.dub).trim()
      : (media as any)?.dub != null && String((media as any).dub).trim() !== ""
        ? String((media as any).dub).trim()
        : null;

  const linkId = String(item?.anikume_id ?? item?.id ?? resolvedMedia?.id ?? "").trim();
  const isSmall = size === "sm";
  const tap = useTapAnimation("scale-95");

  return (
    <Link
      to={isManga ? "/manga/$id" : "/anime/$id"}
      params={{ id: linkId }}
      {...tap.bind}
      className={cn(
        "group block min-w-0 transition-transform duration-300 ease-out hover:-translate-y-1",
        tap.scaleClass,
        className || "w-[clamp(112px,29vw,144px)] shrink-0 snap-start sm:w-[144px] md:w-[155px] lg:w-[190px]",
      )}
    >
      <div
        ref={cardContainerRef}
        className="relative w-full overflow-hidden rounded-lg bg-card ring-1 ring-white/5 shadow-lg transition group-hover:ring-primary/60"
        style={{ paddingBottom: "140%" }}
      >
        {/* Single skeleton box for photo, rating, and sub/dub (unmounted once entrance animation completes) */}
        {!animDone && (
          <div
            className={cn(
              "absolute inset-0 skeleton-box pointer-events-none transition-opacity duration-500 ease-out",
              (!isInView || isReady) && "[animation-play-state:paused]",
              isReady ? "opacity-0" : "opacity-100",
            )}
          />
        )}
        {coverImg && (
          <img
            ref={imgRef}
            src={coverImg}
            alt={title || ""}
            loading="eager"
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={(e) => {
              e.currentTarget.setAttribute("data-img-loaded", "true");
              drawBadgesOnce();
              requestAnimationFrame(() => setImgLoaded(true));
            }}
            onError={(e) => {
              e.currentTarget.setAttribute("data-img-loaded", "true");
              setImgLoaded(true);
            }}
            className={cn(
              "absolute inset-0 block size-full object-cover group-hover:scale-105 group-hover:blur-sm",
              animDone
                ? "opacity-100 scale-100 transition-transform duration-300 ease-out"
                : cn(
                    "transition-[opacity,transform,filter] duration-450 ease-out will-change-transform transform-gpu",
                    isReady ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-[1.06] blur-[4px]",
                  ),
            )}
          />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {((scoreText && scoreColor) || isAdultTag) && (
          <div
            className={cn(
              "pointer-events-none absolute z-10 flex items-center overflow-hidden rounded-md bg-white/10 ring-1 ring-white/15 font-bold shadow-sm",
              isSmall
                ? "left-1.5 top-1.5 gap-1 px-1 py-0.5 text-[8.5px] sm:text-[9px]"
                : "left-1.5 top-1.5 sm:left-2 sm:top-2 gap-1 sm:gap-1.5 px-1 py-0.5 sm:px-1.5 sm:py-0.5 text-[8.5px] sm:text-[9.5px] lg:text-[10px]",
              animDone
                ? "opacity-100 scale-100"
                : cn(
                    "transition-[opacity,transform] duration-450 ease-out",
                    isReady ? "opacity-100 scale-100" : "opacity-0 scale-[1.05]",
                  ),
            )}
          >
            <canvas
              ref={topBadgeCanvasRef}
              width={24}
              height={12}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full"
            />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/10" />
            <div className="relative z-10 flex items-center gap-1 sm:gap-1.5">
              {scoreText && scoreColor && (
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <Star
                    className={cn("fill-current", isSmall ? "size-2 sm:size-2.5" : "size-2 sm:size-2.5")}
                    style={{ color: scoreColor, fill: scoreColor }}
                  />
                  <span style={{ color: scoreColor }}>{scoreText}</span>
                </div>
              )}
              {scoreText && scoreColor && isAdultTag && (
                <span className="h-2.5 sm:h-3 w-[1px] bg-white/25" />
              )}
              {isAdultTag && (
                <span className="font-bold tracking-wider" style={{ color: "#EF4444" }}>
                  18+
                </span>
              )}
            </div>
          </div>
        )}

        {(subCount || dubCount) && (
          <div
            className={cn(
              "pointer-events-none absolute z-10 flex items-center overflow-hidden rounded-md bg-white/10 ring-1 ring-white/15 font-bold shadow-sm",
              isSmall
                ? "right-1.5 bottom-1.5 gap-1 px-1 py-0.5 text-[8.5px] sm:text-[9px]"
                : "right-1.5 bottom-1.5 sm:right-2 sm:bottom-2 gap-1 sm:gap-1.5 px-1 py-0.5 sm:px-1.5 sm:py-0.5 text-[8.5px] sm:text-[9.5px] lg:text-[10px]",
              animDone
                ? "opacity-100 scale-100"
                : cn(
                    "transition-[opacity,transform] duration-450 ease-out",
                    isReady ? "opacity-100 scale-100" : "opacity-0 scale-[1.05]",
                  ),
            )}
          >
            <canvas
              ref={bottomBadgeCanvasRef}
              width={24}
              height={12}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full"
            />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/10" />
            <div className="relative z-10 flex items-center gap-1 sm:gap-1.5">
              {subCount && (
                <div className="flex items-center gap-0.5" style={{ color: "#00D2FF" }}>
                  <Captions
                    className={cn(isSmall ? "size-2 sm:size-2.5" : "size-2 sm:size-2.5")}
                    style={{ color: "#00D2FF" }}
                  />
                  <span style={{ color: "#00D2FF" }}>{subCount}</span>
                </div>
              )}
              {subCount && dubCount && (
                <span className="h-2.5 sm:h-3 w-[1px] bg-white/25" />
              )}
              {dubCount && (
                <div className="flex items-center gap-0.5" style={{ color: "#FF7300" }}>
                  <Mic
                    className={cn(isSmall ? "size-2 sm:size-2.5" : "size-2 sm:size-2.5")}
                    style={{ color: "#FF7300" }}
                  />
                  <span style={{ color: "#FF7300" }}>{dubCount}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <span
          className={cn(
            "absolute inset-0 m-auto grid translate-y-2 place-items-center rounded-full bg-foreground text-background opacity-0 shadow-[var(--shadow-glow)] transition group-hover:translate-y-0 group-hover:opacity-100",
            isSmall ? "size-7 sm:size-8" : "size-7 sm:size-8 lg:size-9",
          )}
        >
          {isManga ? (
            <BookOpen className={cn(isSmall ? "size-3 sm:size-3.5" : "size-3 sm:size-3.5 lg:size-4")} />
          ) : (
            <Play className={cn("fill-current", isSmall ? "size-3 sm:size-3.5" : "size-3 sm:size-3.5 lg:size-4")} />
          )}
        </span>
      </div>

      {(hasStatus || title) && (
        <div
          className={cn(
            "flex items-start",
            isSmall ? "mt-2 gap-1 sm:gap-1.5" : "mt-2 sm:mt-2.5 lg:mt-3 gap-1 sm:gap-1.5",
          )}
        >
          {hasStatus && statusColor && (
            <span
              className={cn(
                "mt-[0.35em] shrink-0 rounded-full",
                isSmall ? "size-1.5" : "size-1.5 sm:size-2",
                statusColor,
              )}
            />
          )}
          {title && (
            <h3
              className={cn(
                "line-clamp-2 min-h-[2.75em] font-semibold leading-snug text-foreground/90 group-hover:text-foreground",
                isSmall
                  ? "text-[8.5px] sm:text-[9.25px] lg:text-[9.75px]"
                  : "text-[9px] sm:text-[9.75px] md:text-[10px] lg:text-[10.5px]",
              )}
            >
              {title}
            </h3>
          )}
        </div>
      )}
      {formatText && (
        <p
          className={cn(
            "mt-0.5 line-clamp-1 text-muted-foreground",
            hasStatus
              ? isSmall
                ? "ml-2.5 sm:ml-3 text-[8.5px] sm:text-[9.5px] lg:text-[10px]"
                : "ml-2.5 sm:ml-3.5 text-[9px] sm:text-[10px] lg:text-[11px]"
              : isSmall
                ? "text-[8.5px] sm:text-[9.5px] lg:text-[10px]"
                : "text-[9px] sm:text-[10px] lg:text-[11px]",
          )}
        >
          {formatText}
        </p>
      )}
    </Link>
  );
}

export function AnimeCardSkeleton({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "sm";
}) {
  const isSmall = size === "sm";

  return (
    <div
      className={cn(
        "block min-w-0 pointer-events-none select-none",
        className || "w-[clamp(112px,29vw,144px)] shrink-0 snap-start sm:w-[144px] md:w-[155px] lg:w-[190px]",
      )}
    >
      <div
        className="relative w-full overflow-hidden rounded-lg skeleton-box"
        style={{ paddingBottom: "140%" }}
      />

      <div
        className={cn(
          "flex items-start",
          isSmall ? "mt-2 gap-1 sm:gap-1.5" : "mt-2 sm:mt-2.5 lg:mt-3 gap-1 sm:gap-1.5",
        )}
      >
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded-full bg-white/20",
            isSmall ? "size-1.5" : "size-1.5 sm:size-2",
          )}
        />
        <div className="flex flex-1 flex-col gap-1">
          <div
            className={cn(
              "w-full rounded skeleton-text",
              isSmall ? "h-2.5 sm:h-3" : "h-2.5 sm:h-3 lg:h-3.5",
            )}
          />
          <div
            className={cn(
              "w-3/5 rounded skeleton-text",
              isSmall ? "h-2.5 sm:h-3" : "h-2.5 sm:h-3 lg:h-3.5",
            )}
          />
        </div>
      </div>
      <div
        className={cn(
          "mt-1 w-1/2 rounded skeleton-text opacity-70",
          isSmall
            ? "ml-2.5 sm:ml-3 h-2 sm:h-2.5"
            : "ml-2.5 sm:ml-3.5 h-2 sm:h-2.5",
        )}
      />
    </div>
  );
}

