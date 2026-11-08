import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CachedImage } from "./CachedImage";
import { cn } from "@/lib/utils";

function getExternalLinkColor(site?: string, color?: string | null): string | undefined {
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

type Mapping = {
  label: string;
  href: string;
  favicon: string;
  color?: string;
};

export function LinksPopup({
  open,
  onClose,
  extraLinks = [],
}: {
  open: boolean;
  onClose: () => void;
  anilistId?: number | string;
  extraLinks?: any[];
  isManga?: boolean;
}) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!shouldRender) return null;

  const items: Mapping[] = [];

  extraLinks.forEach((l) => {
    const rawSite = l.site || "External";
    const displayLabel = rawSite.replace(/\.[a-z]+$/i, "");
    const href = l.url || l.link || "";
    if (!href) return;
    const cleanLabel = displayLabel
      .toLowerCase()
      .replace(".co", "")
      .replace(".net", "")
      .replace(".com", "")
      .replace(".io", "");
    if (
      !items.some(
        (i) =>
          i.label.toLowerCase().includes(cleanLabel) || cleanLabel.includes(i.label.toLowerCase()),
      )
    ) {
      items.push({
        label: displayLabel,
        href,
        favicon: l.icon || l.logo || "",
        color: getExternalLinkColor(l.site, l.color),
      });
    }
  });

  return (
    <div
      className={cn(
        "fixed inset-0 z-[150] grid place-items-center bg-black/70 p-4 backdrop-blur-sm transition-opacity duration-200 ease-out will-change-[opacity]",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl transform-gpu transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity]",
          isVisible ? "scale-100 opacity-100" : "scale-90 opacity-0",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            External Links
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full bg-white/5 text-foreground/80 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-5">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No external links available.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((it) => (
                <a
                  key={it.label}
                  href={it.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-card/40 p-2 transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-card"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 p-[2px]">
                    {it.favicon ? (
                      <span
                        className="size-[32px] rounded-full flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: it.color }}
                      >
                        <CachedImage
                          src={it.favicon}
                          alt={it.label}
                          className="size-full object-cover rounded-full"
                        />
                      </span>
                    ) : (
                      <span
                        className="size-[32px] rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ backgroundColor: it.color || "#2e51a2" }}
                      >
                        {it.label.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate text-center text-[11px] font-bold text-foreground/90 group-hover:text-foreground">
                    {it.label}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

