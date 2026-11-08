import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Bookmark, Film, BookText, Trash2, Play, BookOpen, Star, RefreshCw } from "lucide-react";
import { useAuth, getCleanLocalList } from "@/lib/auth";


export const Route = createFileRoute("/list")({
  component: ListPage,
});

function ListPage() {
  const { user, isAuthenticated, openAuthModal, toggleWatchlist, syncNow, syncCountdown } =
    useAuth();
  const [activeTab, setActiveTab] = useState<"anime" | "manga">("anime");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [localList, setLocalList] = useState(getCleanLocalList);

  const loadList = () => {
    setLocalList(getCleanLocalList());
  };

  useEffect(() => {
    loadList();
    const handleUpdate = () => loadList();
    window.addEventListener("anikume_list_update", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener("anikume_list_update", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncNow();
    loadList();
    setIsSyncing(false);
  };

  const filteredItems = useMemo(() => {
    const raw = activeTab === "anime" ? localList.anime : localList.manga;
    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase();
    return raw.filter((item) => item.title.toLowerCase().includes(q));
  }, [activeTab, localList, searchQuery]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
        {/* Header Title & Sync Banner */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-lg">
              <Bookmark className="size-5 text-[var(--brand,#df7426)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">My Library</h1>
              <p className="text-xs text-white/50">Your bookmarked Anime and Manga collections</p>
            </div>
          </div>

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
                title="Sync now to cloud"
              >
                <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
                <span>Sync Now</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  ({formatCountdown(syncCountdown)})
                </span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => openAuthModal("signin")}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow transition hover:brightness-110"
            >
              Sign In to Cloud Sync
            </button>
          )}
        </div>

        {/* Categories & Search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("anime")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === "anime"
                  ? "bg-white text-black shadow-md"
                  : "bg-white/5 text-zinc-400 hover:text-white ring-1 ring-white/10"
              }`}
            >
              <Film className="size-3.5" />
              Anime Watchlist
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                {localList.anime.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("manga")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === "manga"
                  ? "bg-white text-black shadow-md"
                  : "bg-white/5 text-zinc-400 hover:text-white ring-1 ring-white/10"
              }`}
            >
              <BookText className="size-3.5" />
              Manga Reading List
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                {localList.manga.length}
              </span>
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder={`Search in ${activeTab === "anime" ? "Anime" : "Manga"}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 rounded-xl bg-white/5 px-3.5 py-1.5 text-xs text-white placeholder:text-zinc-500 ring-1 ring-white/10 focus:outline-none focus:ring-primary"
            />
          </div>
        </div>

        {/* Item Cards Grid */}
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredItems.map((item) => {
              const isManga = activeTab === "manga";
              const itemId = String(item.id);
              const targetRoute = isManga ? "/manga/$id" : "/anime/$id";

              return (
                <div
                  key={`${activeTab}_${item.id}`}
                  className="group relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:ring-primary/60"
                >
                  <Link
                    to={targetRoute}
                    params={{ id: itemId }}
                    className="relative block aspect-[3/4] overflow-hidden"
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                    {/* Score / Format Badge */}
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      {item.score && (
                        <span className="flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur">
                          <Star className="size-2.5 fill-current" />
                          {(item.score / 10).toFixed(1)}
                        </span>
                      )}
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        await toggleWatchlist(item, activeTab);
                      }}
                      className="absolute top-2 right-2 z-20 grid size-7 place-items-center rounded-full bg-black/70 text-zinc-400 transition hover:bg-red-500 hover:text-white"
                      title="Remove from list"
                    >
                      <Trash2 className="size-3.5" />
                    </button>

                    {/* Hover Action Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                      <div className="grid size-11 place-items-center rounded-full bg-white text-black shadow-lg">
                        {isManga ? (
                          <BookOpen className="size-5" />
                        ) : (
                          <Play className="size-5 fill-current ml-0.5" />
                        )}
                      </div>
                    </div>

                    {/* Footer Info */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-semibold text-zinc-300">
                      <span>{item.format || (isManga ? "MANGA" : "TV")}</span>
                      {isManga
                        ? item.chapters && <span>{item.chapters} Ch</span>
                        : item.episodes && <span>{item.episodes} Ep</span>}
                    </div>
                  </Link>

                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <Link
                      to={targetRoute}
                      params={{ id: itemId }}
                      className="line-clamp-2 text-xs font-bold text-zinc-200 hover:text-primary transition-colors leading-tight"
                    >
                      {item.title}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl bg-card/40 p-12 ring-1 ring-white/10 backdrop-blur-md min-h-[300px] flex flex-col items-center justify-center text-center">
            <div className="grid size-14 place-items-center rounded-full bg-white/5 ring-1 ring-white/10 mb-4 text-white/40">
              <Bookmark className="size-7" />
            </div>
            <h3 className="text-base font-bold text-white">
              {searchQuery
                ? "No matching titles found"
                : `No ${activeTab === "anime" ? "anime" : "manga"} in your list yet`}
            </h3>
            <p className="text-xs text-white/40 max-w-sm mt-1.5">
              {searchQuery
                ? "Try searching for a different title"
                : `Bookmark any ${activeTab === "anime" ? "anime" : "manga"} while browsing to save it to your personal library.`}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
