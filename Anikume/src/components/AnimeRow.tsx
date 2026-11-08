import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { AnilistMedia } from "@/lib/apikume";
import { AnimeCard, AnimeCardSkeleton } from "./AnimeCard";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "./ui/carousel";

type Props = {
  title: string;
  items?: any[];
  isLoading?: boolean;
  queryKey?: string;
  fetcher?: () => Promise<AnilistMedia[]>;
  viewAllSearch?: Record<string, string | number>;
  type?: "anime" | "manga";
};

export function AnimeRow({
  title,
  items,
  isLoading: propIsLoading,
  queryKey,
  fetcher,
  viewAllSearch,
  type = "anime",
}: Props) {
  const query = useQuery({
    queryKey: [queryKey ?? title],
    queryFn: fetcher ?? (async () => []),
    enabled: !items && !!fetcher,
    staleTime: 0,
  });

  const resolvedItems = items ?? query.data;
  const isLoading = propIsLoading ?? (items ? false : query.isLoading);

  return (
    <AnimeRowShell
      title={title}
      isLoading={isLoading}
      titleHref={{
        to: type === "manga" ? "/manga/browse" : "/anime/browse",
        search: viewAllSearch ?? {},
      }}
    >
      {isLoading || !resolvedItems || resolvedItems.length === 0
        ? Array.from({ length: 8 }).map((_, i) => (
            <AnimeCardSkeleton key={i} />
          ))
        : resolvedItems.map((m) => (
            <AnimeCard
              key={m.id || m.anikume_id}
              item={m.anikume_id ? m : undefined}
              media={m.anikume_id ? undefined : m}
              type={type}
            />
          ))}
    </AnimeRowShell>
  );
}

/**
 * Shared row shell — used by AnimeRow and the related/recommendations rows on
 * the details page so both get identical feather + chevron + slide behavior.
 */
export function AnimeRowShell({
  title,
  titleHref,
  isLoading = false,
  children,
}: {
  title?: string;
  titleHref?: { to: string; search?: Record<string, string | number> };
  isLoading?: boolean;
  children: React.ReactNode;
}) {
  const HeadingTag: React.ElementType = titleHref ? Link : "div";
  const headingProps = titleHref ? { to: titleHref.to, search: titleHref.search ?? {} } : {};

  const [api, setApi] = React.useState<any>();
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);
  const prevScrollPrevRef = React.useRef(false);
  const prevScrollNextRef = React.useRef(false);

  React.useEffect(() => {
    if (!api) return;
    const updateScrollState = () => {
      const progress = api.scrollProgress();
      const nextPrev = progress > 0.001;
      const nextNext = progress < 0.999;
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
    api.on("select", updateScrollState);
    api.on("scroll", updateScrollState);
    api.on("reInit", updateScrollState);

    return () => {
      api.off("select", updateScrollState);
      api.off("scroll", updateScrollState);
      api.off("reInit", updateScrollState);
    };
  }, [api]);

  return (
    <section className="pt-8 duration-300 animate-in fade-in slide-in-from-bottom-4">
      {title && (
        <div className="mb-3 flex items-center justify-between w-full px-1">
          {isLoading ? (
            <>
              <div className="h-5 sm:h-6 w-36 sm:w-44 rounded skeleton-text" />
              <div className="size-5 rounded skeleton-box" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="h-4 sm:h-5 w-1 rounded-full bg-[var(--brand,#df7426)] shrink-0 inline-block" />
                <h2 className="section-title">{title}</h2>
              </div>
              {titleHref && (
                <Link
                  to={titleHref.to}
                  search={titleHref.search ?? {}}
                  className="group inline-flex items-center text-muted-foreground transition hover:text-foreground active:text-[#df7426] active:bg-[#df7426]/10 rounded p-0.5 ml-auto"
                  aria-label={`${title}`}
                >
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1 group-active:text-[#df7426]" />
                </Link>
              )}
            </>
          )}
        </div>
      )}

      <Carousel
        setApi={setApi}
        opts={{
          align: "start",
          dragFree: true,
          duration: 35,
          skipSnaps: true,
          slidesToScroll: "auto" as any,
        }}
        className="w-full relative group/row"
      >
        <div
          className={`-my-4 ${
            canScrollPrev && canScrollNext
              ? "row-feather"
              : canScrollPrev
                ? "row-feather-left"
                : canScrollNext
                  ? "row-feather-right"
                  : ""
          }`}
        >
          <CarouselContent className="-ml-3 sm:-ml-4 px-1 py-4">
            {React.Children.map(children, (child, idx) => {
              if (!child) return null;
              return (
                <CarouselItem key={idx} className="basis-auto pl-3 sm:pl-4">
                  {child}
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </div>
      </Carousel>
    </section>
  );
}
