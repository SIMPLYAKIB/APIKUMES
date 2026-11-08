import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { Header } from "@/components/Header";
import { HeroSlider } from "@/components/HeroSlider";
import { AnimeRow } from "@/components/AnimeRow";
import { AnimeCard, AnimeCardSkeleton } from "@/components/AnimeCard";
import { TopListSection } from "@/components/TopListSection";
import { ContinueWatchingRow } from "@/components/ContinueWatchingRow";
import { Footer } from "@/components/Footer";
import {
  fetchApikumeAnimeHome,
  type ApikumeHeroItem,
  type ApikumeAnimeItem,
} from "@/lib/apikume";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AniKume – Free Anime Online" },
      {
        name: "description",
        content:
          "Watch anime online for free in HD on AniKume. Stream trending, seasonal and top-rated anime with English subs and dubs.",
      },
      { property: "og:title", content: "AniKume – Free Anime Online" },
      {
        property: "og:description",
        content:
          "Watch anime online for free in HD. Stream trending, seasonal and top-rated anime.",
      },
    ],
  }),
  component: Home,
});

type TabType = "popular" | "season";

const SELECTOR_TABS: { id: TabType; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "season", label: "This Season" },
];

const MOBILE_CARD_LIMIT = 9;
const PC_CARD_LIMIT = 15;

function detectIsDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.name === "anikume_pc_display_frame" ||
    window.location.search.includes("_pc_display=1") ||
    window.innerWidth >= 1024 ||
    window.matchMedia("(min-width: 1024px)").matches
  );
}

function Home() {
  const [isDesktop, setIsDesktop] = useState<boolean>(detectIsDesktop);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      setIsDesktop(detectIsDesktop());
    };
    onChange();
    mql.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  const tabLimit = isDesktop ? PC_CARD_LIMIT : MOBILE_CARD_LIMIT;

  // Single combined request to /api/anime for all Home page sections
  const { data: homeData, isLoading: homeLoading } = useQuery({
    queryKey: ["apikume-anime-home"],
    queryFn: () => fetchApikumeAnimeHome(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: 1000,
  });

  const heroSlides: ApikumeHeroItem[] | undefined = homeData?.heroslider?.results;
  const heroLoading = homeLoading || !heroSlides || heroSlides.length === 0;

  const trendingItems: ApikumeAnimeItem[] | undefined = homeData?.trendingnow?.results;
  const trendingLoading = homeLoading || !trendingItems || trendingItems.length === 0;

  const [activeTab, setActiveTab] = useState<TabType>("popular");
  const [isTabChanging, setIsTabChanging] = useState(false);
  const [renderedTabs, setRenderedTabs] = useState<{ popular: boolean; season: boolean }>({
    popular: true,
    season: false,
  });

  const popularItems: ApikumeAnimeItem[] | undefined = homeData?.popular?.results;
  const seasonItems: ApikumeAnimeItem[] | undefined = homeData?.thisseason?.results;

  const rawTabItems = activeTab === "popular" ? popularItems : seasonItems;
  const tabItems = rawTabItems ? rawTabItems.slice(0, tabLimit) : undefined;

  const upcomingItems: ApikumeAnimeItem[] | undefined = homeData?.upcoming?.results;
  const upcomingLoading = homeLoading || !upcomingItems || upcomingItems.length === 0;

  const top10Items: ApikumeAnimeItem[] | undefined = homeData?.top10?.results;
  const top10Loading = homeLoading || !top10Items || top10Items.length === 0;

  const handleTabChange = (newTab: TabType) => {
    if (newTab === activeTab) return;
    setRenderedTabs((prev) => (prev[newTab] ? prev : { ...prev, [newTab]: true }));
    setIsTabChanging(true);
    setActiveTab(newTab);
    setTimeout(() => {
      setIsTabChanging(false);
    }, 180);
  };

  const isSelectorLoading = homeLoading || !tabItems || tabItems.length === 0;

  const activeIndex = SELECTOR_TABS.findIndex((t) => t.id === activeTab);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-background text-foreground">
      <Header />

      <main className="w-full max-w-full overflow-x-clip">
        {/* Hero Banner: Full width from top */}
        <HeroSlider
          slides={heroSlides}
          isLoading={heroLoading}
        />

        <div
          className="mx-auto mt-4 w-full max-w-[1500px] space-y-6 sm:space-y-8"
          style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter)" }}
        >
          {/* Continue Watching: Whole Screen */}
          <ContinueWatchingRow type="anime" />

          {/* Trending Now: Whole Screen Row */}
          <AnimeRow
            title="Trending Now"
            items={trendingItems}
            isLoading={trendingLoading}
            viewAllSearch={{ sort: "TRENDING_DESC" }}
          />

          {/* MOBILE VIEW (< 1024px) */}
          {!isDesktop ? (
          <div className="space-y-8">
            {/* Tab Selector Section */}
            <div className="pt-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                {isSelectorLoading ? (
                  <>
                    {/* Exact shape of the Popular | This Season segmented pill selector */}
                    <div className="relative flex w-full max-w-[165px] items-center rounded-full border border-white/10 bg-[#161618] p-0.5 shadow-sm">
                      <div className="h-[21px] flex-1 rounded-full skeleton-box" />
                      <div className="flex flex-1 items-center justify-center py-1">
                        <div className="h-2.5 w-11 !rounded-full skeleton-text" />
                      </div>
                    </div>
                    <div className="size-5 rounded skeleton-box shrink-0" />
                  </>
                ) : (
                  <>
                    {/* Segmented Tab Selector matching details/episodes overview style */}
                    <div className="relative flex w-full max-w-[165px] items-center rounded-full border border-white/10 bg-[#161618] p-0.5 shadow-sm">
                      <div
                        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-full bg-white shadow-md transition-transform duration-250 ease-out"
                        style={{
                          width: `calc((100% - 4px) / ${SELECTOR_TABS.length})`,
                          transform: `translateX(calc(${activeIndex} * 100%))`,
                        }}
                      />
                      {SELECTOR_TABS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleTabChange(t.id)}
                          className={
                            "relative z-10 flex-1 cursor-pointer select-none rounded-full py-1 text-center text-[10px] font-bold transition-colors duration-200 " +
                            (activeTab === t.id
                              ? "font-extrabold text-zinc-950"
                              : "text-white/70 hover:text-white")
                          }
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <Link
                      to="/anime/browse"
                      search={{
                        sort:
                          activeTab === "popular"
                            ? "POPULARITY_DESC"
                            : "TRENDING_DESC",
                      }}
                      className="flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:text-[#df7426] active:bg-[#df7426]/10 rounded p-1 group"
                      aria-label="View all"
                    >
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 group-active:text-[#df7426]" />
                    </Link>
                  </>
                )}
              </div>

              {/* 3 cards per row, 9 cards total (?limit=9) — once rendered, tabs stay mounted in DOM */}
              {isSelectorLoading ? (
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {Array.from({ length: MOBILE_CARD_LIMIT }).map((_, i) => (
                    <AnimeCardSkeleton key={`skel_m_${i}`} size="sm" className="w-full" />
                  ))}
                </div>
              ) : (
                <>
                  {renderedTabs.popular && popularItems && (
                    <div
                      className={
                        activeTab === "popular"
                          ? "grid grid-cols-3 gap-2.5 sm:gap-3 duration-200 animate-in fade-in"
                          : "hidden"
                      }
                    >
                      {popularItems.slice(0, MOBILE_CARD_LIMIT).map((m: any, idx: number) => (
                        <AnimeCard
                          key={`mob_card_pop_${m.anikume_id || idx}`}
                          item={m}
                          size="sm"
                          className="w-full"
                        />
                      ))}
                    </div>
                  )}
                  {renderedTabs.season && seasonItems && (
                    <div
                      className={
                        activeTab === "season"
                          ? "grid grid-cols-3 gap-2.5 sm:gap-3 duration-200 animate-in fade-in"
                          : "hidden"
                      }
                    >
                      {seasonItems.slice(0, MOBILE_CARD_LIMIT).map((m: any, idx: number) => (
                        <AnimeCard
                          key={`mob_card_sea_${m.anikume_id || idx}`}
                          item={m}
                          size="sm"
                          className="w-full"
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Upcoming Row: Below Tab Selector */}
            <AnimeRow
              title="Upcoming Releases"
              items={upcomingItems}
              isLoading={upcomingLoading}
              viewAllSearch={{ status: "NOT_YET_RELEASED" }}
            />

            {/* Top 10: At the very bottom for mobile (single Top 10 list, no movie) */}
            <div className="mb-2">
              <TopListSection
                top10={top10Items}
                isLoading={top10Loading}
              />
            </div>
          </div>
          ) : (
          /* PC / DESKTOP VIEW (>= 1024px) */
          <div className="space-y-10">
            {/* Split Section: Left is Tab Selector + 5x3 Compact Grid (smaller than Trending row), Right is Top 10 aligned in one line */}
            <div className="flex flex-col items-stretch gap-6 pt-2 lg:flex-row xl:gap-7">
              {/* Left Part: Dynamic flex-1 width so 5 columns + gap + right column fit 100% cleanly */}
              <div className="flex min-w-0 flex-col justify-between lg:flex-1">
                <div className="flex h-full flex-col">
                  <div className="mb-4 flex items-center justify-between gap-4 shrink-0">
                    {isSelectorLoading ? (
                      <>
                        {/* Exact shape of the Popular | This Season segmented pill selector */}
                        <div className="relative flex w-full max-w-[195px] items-center rounded-full border border-white/10 bg-[#161618] p-0.5 shadow-sm">
                          <div className="h-[24px] flex-1 rounded-full skeleton-box" />
                          <div className="flex flex-1 items-center justify-center py-1">
                            <div className="h-3 w-14 !rounded-full skeleton-text" />
                          </div>
                        </div>
                        <div className="size-5 rounded skeleton-box shrink-0" />
                      </>
                    ) : (
                      <>
                        {/* Segmented Tab Selector */}
                        <div className="relative flex w-full max-w-[195px] items-center rounded-full border border-white/10 bg-[#161618] p-0.5 shadow-sm">
                          <div
                            className="absolute bottom-0.5 left-0.5 top-0.5 rounded-full bg-white shadow-md transition-transform duration-250 ease-out"
                            style={{
                              width: `calc((100% - 4px) / ${SELECTOR_TABS.length})`,
                              transform: `translateX(calc(${activeIndex} * 100%))`,
                            }}
                          />
                          {SELECTOR_TABS.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleTabChange(t.id)}
                              className={
                                "relative z-10 flex-1 cursor-pointer select-none rounded-full py-1 text-center text-xs font-bold transition-colors duration-200 " +
                                (activeTab === t.id
                                  ? "font-extrabold text-zinc-950"
                                  : "text-white/70 hover:text-white")
                              }
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        <Link
                          to="/anime/browse"
                          search={{
                            sort:
                              activeTab === "popular"
                                ? "POPULARITY_DESC"
                                : "TRENDING_DESC",
                          }}
                          className="flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:text-[#df7426] active:bg-[#df7426]/10 rounded p-1 group"
                          aria-label="View all"
                        >
                          <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-0.5 group-active:text-[#df7426]" />
                        </Link>
                      </>
                    )}
                  </div>

                  {/* PC Grid: 5 cols x 3 rows = 15 compact cards (?limit=15) — once rendered, tabs stay mounted in DOM */}
                  {isSelectorLoading ? (
                    <div className="grid flex-1 grid-cols-5 content-between gap-3 xl:gap-3.5">
                      {Array.from({ length: PC_CARD_LIMIT }).map((_, i) => (
                        <AnimeCardSkeleton key={`skel_pc_${i}`} size="sm" className="w-full" />
                      ))}
                    </div>
                  ) : (
                    <>
                      {renderedTabs.popular && popularItems && (
                        <div
                          className={
                            activeTab === "popular"
                              ? "grid flex-1 grid-cols-5 content-between gap-3 xl:gap-3.5 duration-200 animate-in fade-in"
                              : "hidden"
                          }
                        >
                          {popularItems.slice(0, PC_CARD_LIMIT).map((m: any, idx: number) => (
                            <AnimeCard
                              key={`pc_card_pop_${m.anikume_id || idx}`}
                              item={m}
                              size="sm"
                              className="w-full"
                            />
                          ))}
                        </div>
                      )}
                      {renderedTabs.season && seasonItems && (
                        <div
                          className={
                            activeTab === "season"
                              ? "grid flex-1 grid-cols-5 content-between gap-3 xl:gap-3.5 duration-200 animate-in fade-in"
                              : "hidden"
                          }
                        >
                          {seasonItems.slice(0, PC_CARD_LIMIT).map((m: any, idx: number) => (
                            <AnimeCard
                              key={`pc_card_sea_${m.anikume_id || idx}`}
                              item={m}
                              size="sm"
                              className="w-full"
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Right Part: Dynamic width (~34%) Single Top 10 List, stretches to match left column height in one line */}
              <aside className="flex flex-col shrink-0 lg:w-[34%] xl:w-[33%]">
                <TopListSection
                  fillHeight
                  top10={top10Items}
                  isLoading={top10Loading}
                />
              </aside>
            </div>

            {/* Upcoming Row: Whole screen below the split section */}
            <AnimeRow
              title="Upcoming Releases"
              items={upcomingItems}
              isLoading={upcomingLoading}
              viewAllSearch={{ status: "NOT_YET_RELEASED" }}
            />
          </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
