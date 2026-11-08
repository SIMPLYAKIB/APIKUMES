import { SharedSelect } from "@/components/SharedSelect";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Search, ChevronDown, Check, Play } from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";

import { fetchApikumeEndpoint } from "@/lib/apikume";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  FORMATS,
  GENRES,
  prettyFormat,
  titleOf,
  SEASONS,
  SORTS,
  STATUSES,
} from "@/lib/apikume";

const browseSchema = z.object({
  search: fallback(z.string(), "").default(""),
  genre: fallback(z.string(), "").default(""),
  season: fallback(z.string(), "").default(""),
  year: fallback(z.coerce.number().optional(), undefined).default(undefined),
  format: fallback(z.string(), "").default(""),
  status: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "POPULARITY_DESC").default("POPULARITY_DESC"),
  page: fallback(z.coerce.number().int().min(1), 1).default(1),
});

export const Route = createFileRoute("/anime/browse")({
  validateSearch: zodValidator(browseSchema),
  head: () => ({
    meta: [
      { title: "Browse Anime · AniDrone" },
      {
        name: "description",
        content:
          "Browse and search thousands of anime. Filter by genre, season, year, format and more.",
      },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const [searchInput, setSearchInput] = useState(params.search ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["browse", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params.search) q.set("search", params.search);
      if (params.genre) q.set("genre", params.genre);
      if (params.season) q.set("season", params.season);
      if (params.year) q.set("year", params.year.toString());
      if (params.format) q.set("format", params.format);
      if (params.status) q.set("status", params.status);
      if (params.sort) q.set("sort", params.sort);
      if (params.page) q.set("page", params.page.toString());

      const res = await fetchApikumeEndpoint(`/api/anime/browse?${q.toString()}`);
      return res; // Assuming it returns { pageInfo: { lastPage, currentPage }, results: [...] }
    },
  });

  const update = (
    patch: Record<string, string | number | undefined>,
    opts: { keepPage?: boolean } = {},
  ) => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        if (!opts.keepPage && !("page" in patch)) delete next.page;
        for (const k of Object.keys(next))
          if (next[k] === "" || next[k] === undefined) delete next[k];
        return next as never;
      },
    });
  };

  const goToPage = (p: number) => {
    update({ page: p }, { keepPage: true });
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const years = Array.from({ length: 40 }, (_, i) => new Date().getFullYear() + 1 - i);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-[1500px] overflow-x-hidden px-4 pb-6 pt-24 sm:px-6">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Browse Anime</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: searchInput });
          }}
          className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-card/60 px-3 py-2 backdrop-blur-md"
        >
          <Search className="size-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Anime..."
            className="flex-1 bg-transparent text-sm font-semibold focus:outline-none"
          />
          <button className="rounded-md bg-foreground px-3 py-1.5 text-xs font-bold text-background">
            Search
          </button>
        </form>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect
            label="Genres"
            value={params.genre}
            onChange={(v) => update({ genre: v })}
            options={GENRES}
            multiple
          />
          <FilterSelect
            label="Season"
            value={params.season}
            onChange={(v) => update({ season: v })}
            options={SEASONS}
            multiple
          />
          <FilterSelect
            label="Year"
            value={params.year ? String(params.year) : ""}
            onChange={(v) => update({ year: v })}
            options={years.map(String)}
            multiple
          />
          <FilterSelect
            label="Format"
            value={params.format}
            onChange={(v) => update({ format: v })}
            options={FORMATS}
            renderLabel={prettyFormat}
            multiple
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(v) => update({ status: v })}
            options={STATUSES}
            multiple
          />
          <FilterSelect
            label="Sort by"
            value={params.sort}
            onChange={(v) => update({ sort: v })}
            options={SORTS.map((s) => s.value)}
            renderLabel={(v) => SORTS.find((s) => s.value === v)?.label ?? v}
            allowAny={false}
          />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {isLoading
            ? Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="w-full">
                  <div
                    className="w-full rounded-xl skeleton-box"
                    style={{ paddingBottom: "140%" }}
                  />
                  <div className="mt-3 h-4 w-3/4 skeleton-text" />
                  <div className="mt-1.5 h-3 w-1/2 skeleton-text opacity-70" />
                </div>
              ))
            : data?.results?.map((m: any) => (
                <Link
                  key={m.anikume_id || m.id}
                  to="/anime/$id"
                  params={{ id: String(m.anikume_id || m.id) }}
                  className="group block transition-transform duration-300 hover:-translate-y-1"
                >
                  <div
                    className="relative w-full overflow-hidden rounded-lg bg-card ring-1 ring-white/5 shadow-lg transition group-hover:ring-primary/60"
                    style={{ paddingBottom: "140%" }}
                  >
                    <img
                      src={m.poster || m.coverImage?.large}
                      alt={titleOf(m)}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 block size-full object-cover transition-all duration-300 ease-in-out group-hover:scale-105 group-hover:blur-sm"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    {(m.is_adult ||
                      m.isAdult ||
                      (m.genres || []).some(
                        (g: string) => g.toLowerCase() === "hentai" || g.toLowerCase() === "adult",
                      )) && (
                      <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                        18+
                      </span>
                    )}

                    <span className="absolute bottom-2 right-2 grid size-9 translate-y-2 place-items-center rounded-full bg-foreground text-background opacity-0 shadow-[var(--shadow-glow)] transition group-hover:translate-y-0 group-hover:opacity-100">
                      <Play className="size-4 fill-current" />
                    </span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-foreground/90 group-hover:text-foreground">
                    {titleOf(m)}
                  </h3>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {m.format || prettyFormat(m) || "—"}
                  </p>
                </Link>
              ))}
        </div>

        {data?.results?.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No anime found with these filters.
          </p>
        )}

        {data && data.pageInfo?.lastPage > 1 && (
          <PageNav
            current={data.pageInfo.currentPage}
            last={Math.min(data.pageInfo.lastPage, 868)}
            onGo={goToPage}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

function PageNav({
  current,
  last,
  onGo,
}: {
  current: number;
  last: number;
  onGo: (p: number) => void;
}) {
  const pages = buildPageList(current, last);
  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`e${i}`}
            className="grid size-10 place-items-center text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onGo(p)}
            aria-current={p === current ? "page" : undefined}
            className={
              "grid size-10 place-items-center rounded-full text-sm font-bold tabular-nums transition " +
              (p === current
                ? "bg-foreground text-background shadow-lg"
                : "bg-card/60 text-foreground/80 ring-1 ring-white/10 hover:bg-white/10")
            }
          >
            {p}
          </button>
        ),
      )}
    </nav>
  );
}

function buildPageList(current: number, last: number): (number | "…")[] {
  if (last <= 5) {
    const pages: number[] = [];
    for (let i = 1; i <= last; i++) pages.push(i);
    return pages;
  }
  if (current <= 3) {
    return [1, 2, 3, 4, "…", last];
  }
  if (current >= last - 2) {
    return [1, "…", last - 3, last - 2, last - 1, last];
  }
  return [1, "…", current - 1, current, current + 1, "…", last];
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  renderLabel,
  allowAny = true,
  multiple = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; display: string })[];
  renderLabel?: (v: string) => string;
  allowAny?: boolean;
  multiple?: boolean;
}) {
  const items = useMemo(() => {
    const list: { value: string; display: string }[] = [];
    if (allowAny) {
      list.push({ value: "", display: "Any" });
    }
    options.forEach((o) => {
      if (typeof o === "string") {
        const displayStr = renderLabel
          ? renderLabel(o)
          : o
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(" ");
        list.push({ value: o, display: displayStr });
      } else {
        list.push(o);
      }
    });
    return list;
  }, [options, allowAny, renderLabel]);

  const mappedValue = multiple ? (value ? value.split(",") : []) : value;

  return (
    <SharedSelect
      multiple={multiple}
      value={mappedValue}
      onChange={(v) => {
        if (multiple) {
          onChange(Array.isArray(v) ? v.join(",") : v);
        } else {
          onChange(v);
        }
      }}
      options={items}
      label={label}
      className="w-full"
    />
  );
}
