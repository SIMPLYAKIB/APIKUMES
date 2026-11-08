import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const LOGO_URL = "/logo.png";
const LOGO_CACHE_KEY = "anikume_logo_data_v1";

let memoryCachedLogo: string | null = null;
let hasHydratedOnce = false;

function loadCachedLogoFromStorage(): string | null {
  if (memoryCachedLogo) return memoryCachedLogo;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(LOGO_CACHE_KEY);
      if (stored && stored.startsWith("data:image/")) {
        memoryCachedLogo = stored;
        return stored;
      }
    } catch {}
  }
  return null;
}

// Preload and cache logo immediately on module evaluation in browser
if (typeof window !== "undefined") {
  const preloadImg = new Image();
  preloadImg.decoding = "sync";
  preloadImg.src = loadCachedLogoFromStorage() || LOGO_URL;

  if (!memoryCachedLogo) {
    fetch(LOGO_URL, { cache: "force-cache" })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string" && reader.result.startsWith("data:image/")) {
            memoryCachedLogo = reader.result;
            try {
              localStorage.setItem(LOGO_CACHE_KEY, reader.result);
            } catch {}
          }
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {});
  }
}

export function Logo({ className = "" }: { className?: string }) {
  const [logoSrc, setLogoSrc] = useState<string>(() =>
    hasHydratedOnce && memoryCachedLogo ? memoryCachedLogo : LOGO_URL,
  );

  useEffect(() => {
    hasHydratedOnce = true;
    const cached = loadCachedLogoFromStorage();
    if (cached && logoSrc !== cached) {
      setLogoSrc(cached);
    }
  }, [logoSrc]);

  return (
    <Link
      to="/"
      className={"group inline-flex items-center gap-1.5 shrink-0 transition active:scale-95 " + className}
      aria-label="AniKume home"
    >
      <img
        src={logoSrc}
        alt="AniKume"
        suppressHydrationWarning
        data-img-loaded="true"
        data-permanent-logo="true"
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        className="h-10 w-auto select-none sm:h-12 object-contain !opacity-100 !transition-none"
        draggable={false}
        onError={() => {
          if (logoSrc !== LOGO_URL) {
            setLogoSrc(LOGO_URL);
          }
        }}
      />
    </Link>
  );
}

