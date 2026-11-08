import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Play,
  Star,
  Radio,
  CheckCircle2,
  Calendar,
  Captions,
  Mic,
} from "lucide-react";
import type { ApikumeHeroItem } from "@/lib/apikume";
import { apikumeTitle } from "@/lib/apikume";
import { getScoreColor } from "@/lib/utils";

function statusLabel(s?: string | null) {
  if (!s || !String(s).trim()) return null;
  const upper = String(s).trim().toUpperCase();
  switch (upper) {
    case "RELEASING":
      return {
        label: "Releasing",
        icon: Radio,
        tone: "text-green-500",
        bgDot: "bg-green-500",
      };
    case "FINISHED":
    case "COMPLETED":
      return {
        label: "Finished",
        icon: CheckCircle2,
        tone: "text-blue-500",
        bgDot: "bg-blue-500",
      };
    case "UPCOMING":
    case "NOT_YET_RELEASED":
      return {
        label: "Upcoming",
        icon: Calendar,
        tone: "text-red-500",
        bgDot: "bg-red-500",
      };
    default:
      return {
        label: String(s).trim(),
        icon: Info,
        tone: "text-muted-foreground",
        bgDot: "bg-muted-foreground",
      };
  }
}

function resolveHeroTitle(titleObj?: ApikumeHeroItem["title"] | string | null): string | null {
  if (!titleObj) return null;
  if (typeof titleObj === "string") {
    const trimmed = titleObj.trim();
    return trimmed && trimmed !== "Untitled" ? trimmed : null;
  }
  const hasAny =
    (titleObj.english && String(titleObj.english).trim()) ||
    (titleObj.romaji && String(titleObj.romaji).trim()) ||
    (titleObj.native && String(titleObj.native).trim());
  if (!hasAny) return null;
  const preferred = apikumeTitle(titleObj);
  return preferred && preferred !== "Untitled" ? preferred : null;
}

export function HeroSlider({
  slides = [],
  isLoading = false,
}: {
  slides?: ApikumeHeroItem[];
  isLoading?: boolean;
}) {
  const [i, setI] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const [loadedSlides, setLoadedSlides] = useState<Record<number, boolean>>({});
  const count = slides.length;

  useEffect(() => {
    if (isLoading || count === 0) {
      setHeroReady(false);
      return;
    }
    const timer = setTimeout(() => {
      setHeroReady(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [isLoading, count]);

  const markSlideLoaded = (idx: number) => {
    setLoadedSlides((prev) => (prev[idx] ? prev : { ...prev, [idx]: true }));
    if (idx === i || idx === 0) {
      requestAnimationFrame(() => setHeroReady(true));
    }
  };

  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => {
      setI((p) => (p + 1) % count);
    }, 6000);
    return () => clearInterval(id);
  }, [count]);

  useEffect(() => {
    if (i >= count && count > 0) {
      setI(0);
    }
  }, [count, i]);

  if (isLoading || count === 0) {
    return <HeroSliderSkeleton />;
  }

  const m = slides[i] || slides[0];
  const rawRating = m.rating != null && String(m.rating).trim() !== "" ? parseFloat(String(m.rating)) : NaN;
  const numRating = !Number.isNaN(rawRating) && rawRating > 0 ? rawRating : null;
  const ratingScore = numRating != null ? (numRating <= 10 ? numRating * 10 : numRating) : null;
  const scoreColor = ratingScore != null ? getScoreColor(ratingScore) : null;
  const st = statusLabel(m.status);
  const StatusIcon = st ? st.icon : null;
  const title = resolveHeroTitle(m.title);
  const yearVal = m.year != null && String(m.year).trim() !== "" ? String(m.year).trim() : null;
  const subCount = m.sub != null && String(m.sub).trim() !== "" ? String(m.sub).trim() : null;
  const dubCount = m.dub != null && String(m.dub).trim() !== "" ? String(m.dub).trim() : null;
  const isAdult = m.is_adult === true || m.adult === "true" || m.adult === true;
  const cleanDescription =
    m.description && String(m.description).replace(/<[^>]*>?/gm, "").trim()
      ? String(m.description).replace(/<[^>]*>?/gm, "").trim()
      : null;
  const logoSrc = m.logo && String(m.logo).trim() ? String(m.logo).trim() : null;
  const posterCardSrc = m.poster && String(m.poster).trim() ? String(m.poster).trim() : null;

  const hasAnyCapsuleData = Boolean(
    st || yearVal || (numRating != null && scoreColor) || subCount || dubCount || isAdult
  );

  return (
    <section className="relative w-full max-w-full overflow-hidden">
      {/* Edge-to-edge container */}
      <div className="relative h-[490px] sm:h-[530px] md:h-[580px] lg:h-[610px] w-full overflow-hidden bg-black">
        {slides.map((s, idx) => {
          const cleanBanner = s.banner && String(s.banner).trim() ? String(s.banner).trim() : null;
          const cleanPoster = s.poster && String(s.poster).trim() ? String(s.poster).trim() : null;
          const bannerSrc = cleanBanner || cleanPoster || null;
          const mobileSrc = cleanPoster || cleanBanner || null;
          const isCurrent = idx === i;
          const isAdjacent =
            idx === i ||
            idx === (i + 1) % count ||
            idx === (i - 1 + count) % count;

          return (
            <div
              key={`slide_${s.anikume_id || "hero"}_${idx}`}
              aria-hidden={!isCurrent}
              className={`absolute inset-0 size-full transition-all duration-700 ease-in-out ${
                isCurrent
                  ? "opacity-100 scale-100 z-0"
                  : "opacity-0 scale-105 pointer-events-none"
              }`}
            >
              {/* PC Backdrop using API banner */}
              {bannerSrc && (
                <img
                  src={isAdjacent ? bannerSrc : undefined}
                  alt=""
                  data-permanent-logo="true"
                  data-img-loaded="true"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  loading={isCurrent ? "eager" : "lazy"}
                  onLoad={(e) => {
                    e.currentTarget.setAttribute("data-img-loaded", "true");
                    markSlideLoaded(idx);
                  }}
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.setAttribute("data-img-loaded", "true");
                    if (cleanPoster && !target.src.endsWith(cleanPoster)) {
                      target.src = cleanPoster;
                    }
                    markSlideLoaded(idx);
                  }}
                  className="hidden md:block size-full object-cover object-center select-none"
                />
              )}

              {/* Mobile Art using poster */}
              {mobileSrc && (
                <img
                  src={isAdjacent ? mobileSrc : undefined}
                  alt=""
                  data-permanent-logo="true"
                  data-img-loaded="true"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  loading={isCurrent ? "eager" : "lazy"}
                  onLoad={(e) => {
                    e.currentTarget.setAttribute("data-img-loaded", "true");
                    markSlideLoaded(idx);
                  }}
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.setAttribute("data-img-loaded", "true");
                    if (cleanBanner && !target.src.endsWith(cleanBanner)) {
                      target.src = cleanBanner;
                    }
                    markSlideLoaded(idx);
                  }}
                  className="block md:hidden size-full object-cover object-top select-none"
                />
              )}
            </div>
          );
        })}

        {/* Top subtle gradient for header readability */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none z-[1]" />

        {/* Bottom subtle gradient */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none z-[1]" />
        <div className="hidden md:block absolute inset-y-0 left-0 w-[55%] bg-gradient-to-r from-black/85 via-black/40 to-transparent pointer-events-none z-[1]" />

        {/* MOBILE VIEW */}
        <div className="md:hidden absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end px-4 pb-9 text-center pointer-events-none">
          <div className="w-full max-w-xl mx-auto flex flex-col items-center duration-300 animate-in fade-in slide-in-from-bottom-2 pointer-events-auto">
            {/* Anime Clear Logo above Title - Much Bigger */}
            {logoSrc && (
              <img
                src={logoSrc}
                alt={title || ""}
                data-permanent-logo="true"
                data-img-loaded="true"
                loading="eager"
                decoding="async"
                className="max-h-24 sm:max-h-28 max-w-[85%] w-auto object-contain mb-2 drop-shadow-[0_8px_20px_rgba(0,0,0,0.85)] select-none"
              />
            )}
            {/* Title - omitted if null */}
            {title && (
              <h1 className="text-[9px] sm:text-[10px] font-bold leading-snug tracking-tight text-white drop-shadow-md max-w-[85%] mx-auto line-clamp-2">
                {title}
              </h1>
            )}

            {/* Single Unified Capsule Pill */}
            {hasAnyCapsuleData && (
              <div className="mt-2.5 inline-flex max-w-full flex-wrap items-center justify-center gap-2 sm:gap-2.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md px-3.5 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold text-white/90 shadow-md">
                {st && StatusIcon && (
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={`size-3.5 sm:size-4 ${st.tone}`} />
                    <span className={st.tone}>{st.label}</span>
                  </div>
                )}

                {yearVal && (
                  <>
                    {st && <span className="h-3.5 sm:h-4 w-[1px] bg-white/20" />}
                    <span className="text-white/80">{yearVal}</span>
                  </>
                )}

                {numRating != null && scoreColor && (
                  <>
                    {(st || yearVal) && <span className="h-3.5 sm:h-4 w-[1px] bg-white/20" />}
                    <div className="flex items-center gap-1 font-bold" style={{ color: scoreColor }}>
                      <Star
                        className="size-3.5 sm:size-4 fill-current"
                        style={{ color: scoreColor, fill: scoreColor }}
                      />
                      <span style={{ color: scoreColor }}>
                        {numRating.toFixed(numRating % 1 === 0 ? 0 : 1)}
                      </span>
                    </div>
                  </>
                )}

                {subCount && (
                  <>
                    {(st || yearVal || (numRating != null && scoreColor)) && (
                      <span className="h-3.5 sm:h-4 w-[1px] bg-white/20" />
                    )}
                    <div className="flex items-center gap-1 font-bold" style={{ color: "#00D2FF" }}>
                      <Captions className="size-3.5 sm:size-4" style={{ color: "#00D2FF" }} />
                      <span style={{ color: "#00D2FF" }}>{subCount}</span>
                    </div>
                  </>
                )}

                {dubCount && (
                  <>
                    {(st || yearVal || (numRating != null && scoreColor) || subCount) && (
                      <span className="h-3.5 sm:h-4 w-[1px] bg-white/20" />
                    )}
                    <div className="flex items-center gap-1 font-bold" style={{ color: "#FF7300" }}>
                      <Mic className="size-3.5 sm:size-4" style={{ color: "#FF7300" }} />
                      <span style={{ color: "#FF7300" }}>{dubCount}</span>
                    </div>
                  </>
                )}

                {isAdult && (
                  <>
                    {(st || yearVal || (numRating != null && scoreColor) || subCount || dubCount) && (
                      <span className="h-3.5 sm:h-4 w-[1px] bg-white/20" />
                    )}
                    <span className="text-red-400 font-bold">18+</span>
                  </>
                )}
              </div>
            )}

            {/* Action Buttons with active scale tap animation */}
            <div className="mt-3 flex items-center justify-center gap-2.5">
              <Link
                to="/anime/watch/$id"
                params={{ id: m.anikume_id }}
                hash="1"
                className="inline-flex items-center gap-1.5 rounded-full bg-white text-zinc-950 font-bold text-xs px-5 py-2 shadow-lg hover:bg-zinc-200 transition duration-100 ease-out active:scale-95 cursor-pointer"
              >
                <Play className="size-3.5 fill-current ml-0.5" />
                Watch
              </Link>

              <Link
                to="/anime/$id"
                params={{ id: m.anikume_id }}
                aria-label="Details"
                className="grid size-8 place-items-center rounded-full bg-white/10 border border-white/15 backdrop-blur-md text-white hover:bg-white/20 transition duration-100 ease-out active:scale-95 cursor-pointer"
              >
                <Info className="size-4" />
              </Link>
            </div>
          </div>

          {/* Mobile Bottom Left Prev (<) */}
          <button
            aria-label="Previous slide"
            onClick={() => setI((p) => (p - 1 + count) % count)}
            className="pointer-events-auto absolute left-2.5 bottom-2.5 z-20 grid size-7 place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition duration-100 ease-out active:scale-90 cursor-pointer"
          >
            <ChevronLeft className="size-4" />
          </button>

          {/* Mobile Bottom Right Next (>) */}
          <button
            aria-label="Next slide"
            onClick={() => setI((p) => (p + 1) % count)}
            className="pointer-events-auto absolute right-2.5 bottom-2.5 z-20 grid size-7 place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition duration-100 ease-out active:scale-90 cursor-pointer"
          >
            <ChevronRight className="size-4" />
          </button>

          {/* Mobile Minimal Slide Dots */}
          <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5">
            {slides.map((s, idx) => {
              const active = idx === i;
              return (
                <button
                  key={`mobdot_${s.anikume_id || "hero"}_${idx}`}
                  type="button"
                  aria-label={`Go to slide ${idx + 1}`}
                  onClick={() => setI(idx)}
                  className={`hero-indicator-dot h-1 rounded-full shrink-0 transition-all duration-300 ease-out cursor-pointer ${
                    active ? "w-6 bg-white" : "w-1.5 bg-white/30 hover:bg-white/60"
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* PC VIEW */}
        <div className="hidden md:flex absolute inset-x-0 bottom-0 z-10 items-end justify-between px-8 lg:px-12 pb-7 pt-4">
          {/* Left Info Stack */}
          <div className="max-w-xl flex flex-col items-start text-left duration-300 animate-in fade-in">
            {/* Anime Clear Logo above Title - Much Bigger */}
            {logoSrc && (
              <img
                src={logoSrc}
                alt={title || ""}
                data-permanent-logo="true"
                data-img-loaded="true"
                loading="eager"
                decoding="async"
                className="max-h-32 md:max-h-40 lg:max-h-48 max-w-[440px] lg:max-w-[500px] w-auto object-contain object-left mb-3 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)] select-none"
              />
            )}
            {title && (
              <h1 className="text-[11px] lg:text-xs font-bold leading-snug tracking-tight text-white drop-shadow-lg max-w-md line-clamp-2">
                {title}
              </h1>
            )}

            {/* Single Unified Capsule Pill */}
            {hasAnyCapsuleData && (
              <div className="mt-3 inline-flex items-center gap-2.5 lg:gap-3 rounded-full bg-white/10 border border-white/15 backdrop-blur-md px-4 py-1.5 lg:px-4.5 lg:py-2 text-sm lg:text-base font-semibold text-white/90 shadow-md">
                {st && StatusIcon && (
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={`size-4 lg:size-4.5 ${st.tone}`} />
                    <span className={st.tone}>{st.label}</span>
                  </div>
                )}

                {yearVal && (
                  <>
                    {st && <span className="h-4 lg:h-4.5 w-[1px] bg-white/20" />}
                    <span className="text-white/80">{yearVal}</span>
                  </>
                )}

                {numRating != null && scoreColor && (
                  <>
                    {(st || yearVal) && <span className="h-4 lg:h-4.5 w-[1px] bg-white/20" />}
                    <div className="flex items-center gap-1.5 font-bold" style={{ color: scoreColor }}>
                      <Star
                        className="size-4 lg:size-4.5 fill-current"
                        style={{ color: scoreColor, fill: scoreColor }}
                      />
                      <span style={{ color: scoreColor }}>
                        {numRating.toFixed(numRating % 1 === 0 ? 0 : 1)}
                      </span>
                    </div>
                  </>
                )}

                {subCount && (
                  <>
                    {(st || yearVal || (numRating != null && scoreColor)) && (
                      <span className="h-4 lg:h-4.5 w-[1px] bg-white/20" />
                    )}
                    <div className="flex items-center gap-1.5 font-bold" style={{ color: "#00D2FF" }}>
                      <Captions className="size-4 lg:size-4.5" style={{ color: "#00D2FF" }} />
                      <span style={{ color: "#00D2FF" }}>{subCount}</span>
                    </div>
                  </>
                )}

                {dubCount && (
                  <>
                    {(st || yearVal || (numRating != null && scoreColor) || subCount) && (
                      <span className="h-4 lg:h-4.5 w-[1px] bg-white/20" />
                    )}
                    <div className="flex items-center gap-1.5 font-bold" style={{ color: "#FF7300" }}>
                      <Mic className="size-4 lg:size-4.5" style={{ color: "#FF7300" }} />
                      <span style={{ color: "#FF7300" }}>{dubCount}</span>
                    </div>
                  </>
                )}

                {isAdult && (
                  <>
                    {(st || yearVal || (numRating != null && scoreColor) || subCount || dubCount) && (
                      <span className="h-4 lg:h-4.5 w-[1px] bg-white/20" />
                    )}
                    <span className="text-red-400 font-bold">18+</span>
                  </>
                )}
              </div>
            )}

            {cleanDescription && (
              <p className="mt-3 text-xs lg:text-sm leading-relaxed text-zinc-300 line-clamp-2 max-w-lg drop-shadow">
                {cleanDescription}
              </p>
            )}

            {/* PC Action Buttons */}
            <div className="mt-4 flex items-center gap-3">
              <Link
                to="/anime/watch/$id"
                params={{ id: m.anikume_id }}
                hash="1"
                className="inline-flex items-center gap-2 rounded-full bg-white text-zinc-950 font-bold text-sm px-6 py-2.5 shadow-xl hover:bg-zinc-200 transition duration-100 ease-out hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Play className="size-4 fill-current ml-0.5" />
                Watch
              </Link>

              <Link
                to="/anime/$id"
                params={{ id: m.anikume_id }}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20 transition duration-100 ease-out hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Info className="size-4" />
                Details
              </Link>
            </div>
          </div>

          {/* Right Side: Anime Cover Card */}
          <div className="flex flex-col items-center shrink-0 w-36 lg:w-44 duration-300 animate-in fade-in">
            <Link
              to="/anime/$id"
              params={{ id: m.anikume_id }}
              className="group block relative w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/15 transition-all duration-100 ease-out hover:scale-105 active:scale-95 cursor-pointer select-none"
            >
              <div className="size-full">
                {posterCardSrc && (
                  <img
                    src={posterCardSrc}
                    alt={title || ""}
                    data-permanent-logo="true"
                    data-img-loaded="true"
                    referrerPolicy="no-referrer"
                    decoding="async"
                    loading="eager"
                    className="size-full object-cover"
                  />
                )}
              </div>
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="grid size-9 place-items-center rounded-full bg-white text-black shadow-lg">
                  <Play className="size-4 fill-current ml-0.5" />
                </span>
              </div>
            </Link>

            {/* Controls Below Cover */}
            <div className="mt-2.5 flex items-center justify-between w-full px-1 text-white">
              <button
                aria-label="Previous slide"
                onClick={() => setI((p) => (p - 1 + count) % count)}
                className="grid size-7 place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition cursor-pointer"
              >
                <ChevronLeft className="size-4" />
              </button>

              <div className="flex items-center gap-1.5">
                {slides.map((s, idx) => {
                  const active = idx === i;
                  return (
                    <button
                      key={`pcdot_${s.anikume_id || "hero"}_${idx}`}
                      type="button"
                      aria-label={`Go to slide ${idx + 1}`}
                      onClick={() => setI(idx)}
                      className={`hero-indicator-dot h-1.5 rounded-full shrink-0 transition-all duration-300 ease-out cursor-pointer ${
                        active ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/60"
                      }`}
                    />
                  );
                })}
              </div>

              <button
                aria-label="Next slide"
                onClick={() => setI((p) => (p + 1) % count)}
                className="grid size-7 place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition cursor-pointer"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroSliderSkeleton() {
  return (
    <section className="relative w-full overflow-hidden">
      {/* Edge-to-edge skeleton container starting from top with no outer border lines */}
      <div className="relative h-[490px] sm:h-[530px] md:h-[580px] lg:h-[610px] w-full overflow-hidden bg-black">
        {/* Full-width skeleton shimmer without outer border */}
        <div className="absolute inset-0 size-full bg-gradient-to-r from-white/[0.03] via-white/[0.10] to-white/[0.03] bg-[length:200%_100%] animate-[skeleton-shimmer_1.8s_ease-in-out_infinite]" />

        {/* Top subtle gradient */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

        {/* Bottom subtle gradient overlay blending with page */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />

        {/* Mobile Skeleton Layout */}
        <div className="md:hidden absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end px-4 pb-9 text-center">
          <div className="max-w-xl mx-auto flex flex-col items-center w-full space-y-3">
            <div className="h-3.5 w-3/4 rounded-md skeleton-text" />
            <div className="h-7 w-40 rounded-full skeleton-box" />
            <div className="flex items-center gap-2.5 pt-1">
              <div className="h-9 w-24 rounded-full skeleton-box" />
              <div className="size-9 rounded-full skeleton-box" />
            </div>
          </div>
        </div>

        {/* PC Skeleton Layout */}
        <div className="hidden md:flex absolute inset-x-0 bottom-0 z-10 items-end justify-between px-8 lg:px-12 pb-7 pt-4 w-full">
          {/* Left Info Stack */}
          <div className="max-w-xl flex flex-col items-start text-left w-full space-y-3.5">
            <div className="h-5 lg:h-6 w-2/3 rounded-lg skeleton-text" />
            <div className="h-7 w-44 rounded-full skeleton-box" />
            <div className="space-y-2 w-full pt-1">
              <div className="h-4 w-full rounded-md skeleton-text" />
              <div className="h-4 w-5/6 rounded-md skeleton-text" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <div className="h-10 w-32 rounded-full skeleton-box" />
              <div className="h-10 w-28 rounded-full skeleton-box" />
            </div>
          </div>

          {/* Right Side: Individual Poster Card Skeleton matching AnimeCard */}
          <div className="flex flex-col items-center shrink-0 w-36 lg:w-44 aspect-[2/3] rounded-2xl overflow-hidden skeleton-box shadow-2xl ring-1 ring-white/10" />
        </div>
      </div>
    </section>
  );
}

export { HeroSlider as ApikumeHeroSlider };
