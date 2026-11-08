import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { X, Play } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useTapAnimation } from "@/hooks/useTapAnimation";

interface ContinueRowProps {
  type?: "all" | "anime";
  title?: string;
}

export function ContinueWatchingRow({ type = "anime", title }: ContinueRowProps) {
  const [animeList, setAnimeList] = useState<any[]>([]);
  const location = useLocation();
  const { updateContinue } = useAuth();

  const loadFromStorage = useCallback(() => {
    try {
      const rawAnime = localStorage.getItem("continue_watching_list");
      if (rawAnime) {
        const parsed = JSON.parse(rawAnime);
        setAnimeList(Array.isArray(parsed) ? parsed : []);
      } else {
        setAnimeList([]);
      }
    } catch {
      setAnimeList([]);
    }
  }, []);

  useEffect(() => {
    loadFromStorage();

    const handleUpdate = () => loadFromStorage();
    window.addEventListener("anikume_continue_update", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener("anikume_continue_update", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [location.key, loadFromStorage]);

  const handleRemoveAnime = async (e: React.MouseEvent, id: number | string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const newList = animeList.filter((item) => String(item.animeId || item.id) !== String(id));
      localStorage.setItem("continue_watching_list", JSON.stringify(newList));
      setAnimeList(newList);

      // Clean individual episode progress keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`progress_${id}_ep_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      window.dispatchEvent(new Event("anikume_continue_update"));

      await updateContinue({ anime: newList });
    } catch {}
  };

  const formatTime = (seconds?: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (animeList.length === 0) return null;

  return (
    <div className="space-y-6">
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <span className="h-4 sm:h-5 w-1 rounded-full bg-[var(--brand,#df7426)] shrink-0 inline-block" />
            <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              {title ? title : "Continue Watching"}
            </h2>
          </div>
        </div>

        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:px-8">
          {animeList.map((item) => (
            <ContinueWatchingCard
              key={`anime_${item.animeId || item.id}`}
              item={item}
              onRemove={handleRemoveAnime}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ContinueWatchingCard({
  item,
  onRemove,
}: {
  item: any;
  onRemove: (e: React.MouseEvent, animeId: any) => void;
}) {
  const animeId = item.animeId || item.id;
  const percentage =
    item.duration && item.duration > 0
      ? Math.min((item.currentTime / item.duration) * 100, 100)
      : 0;
  const tap = useTapAnimation("scale-95");

  return (
    <Link
      to="/anime/watch/$id"
      params={{ id: String(animeId) }}
      hash={String(item.episodeNum || 1)}
      {...tap.bind}
      className={cn(
        "group relative flex aspect-video w-[210px] shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-card ring-1 ring-white/10 transition-transform duration-300 ease-out hover:-translate-y-1 sm:w-[250px] md:w-[290px] lg:w-[320px]",
        tap.scaleClass,
      )}
    >
      <div className="relative flex-1 overflow-hidden">
        <img
          src={item.episodeThumbnail || item.animeCover || item.image}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-all duration-300 ease-in-out group-hover:scale-105 group-hover:blur-sm"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {item.isAdult && (
          <span className="pointer-events-none absolute right-2 top-2 z-20 rounded-md bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur">
            18+
          </span>
        )}

        {/* Remove Button */}
        <button
          onClick={(e) => onRemove(e, animeId)}
          className="absolute right-2 top-2 z-30 grid size-6 place-items-center rounded-full bg-black/70 text-white md:opacity-0 transition-opacity hover:bg-black/90 md:group-hover:opacity-100 shadow-md cursor-pointer"
          title="Remove from history"
        >
          <X className="size-3.5" />
        </button>

        <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
          EP {item.episodeNum || 1}
        </span>

        <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white drop-shadow-md bg-black/50 px-1 rounded">
          {formatTime(item.currentTime)} / {formatTime(item.duration)}
        </span>

        <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black opacity-0 shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all duration-300 group-hover:opacity-100 group-hover:scale-110">
          <Play className="size-5 fill-current ml-0.5" />
        </span>
      </div>

      <div className="absolute top-0 w-full p-2.5 bg-gradient-to-b from-black/80 to-transparent pointer-events-none pr-9">
        <p className="truncate text-xs font-bold text-white drop-shadow-md">
          {item.animeTitle || item.title}
        </p>
      </div>

      <div className="absolute bottom-0 left-0 h-1 w-full bg-white/20">
        <div
          className="h-full bg-white"
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>
    </Link>
  );
}
