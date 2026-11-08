import { QueryClient, QueryClientProvider, useIsFetching } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  ScrollRestoration,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { RotateCw, Smartphone } from "lucide-react";
import "@/lib/session";
import { DebugTyper } from "@/components/DebugTyper";
import { AuthProvider } from "@/lib/auth";
import { AuthModal } from "@/components/AuthModal";

import appCss from "../styles.css?url";

import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {error && (
          <div className="mt-4 text-left">
            <p className="text-xs font-semibold text-red-400 mb-1">Error Details:</p>
            <pre className="p-3 bg-red-950/80 border border-red-500/40 rounded-lg text-xs text-red-200 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
              {error.stack || error.message || String(error)}
            </pre>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "color-scheme", content: "dark" },
      { name: "darkreader-lock", content: "" },
      { name: "theme-color", content: "#000000" },
      { title: "AniKume – Free Anime Online" },
      {
        name: "description",
        content:
          "Watch anime online for free in HD on AniKume. Stream trending, seasonal and top-rated anime with English subs and dubs.",
      },
      { property: "og:title", content: "AniKume – Free Anime Online" },
      { property: "og:type", content: "website" },
      { property: "og:description", content: "Stream trending, seasonal and top-rated anime." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AniKume – Free Anime Online" },
      { name: "twitter:description", content: "Stream trending, seasonal and top-rated anime." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preload", as: "image", href: "/logo.png", type: "image/png" },
      { rel: "preconnect", href: "https://apikume.onrender.com", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://apikume.onrender.com" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ScrollRestoration getKey={(location) => location.pathname} />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function buildPcFrameUrl(): string {
  if (typeof window === "undefined") return "/?_pc_display=1&desktop=true";
  try {
    const urlObj = new URL(window.location.href);
    urlObj.searchParams.set("_pc_display", "1");
    urlObj.searchParams.set("desktop", "true");
    return urlObj.pathname + urlObj.search + urlObj.hash;
  } catch {
    return "/?_pc_display=1&desktop=true";
  }
}

function isDirectDesktopOnSmallScreen(): boolean {
  if (typeof window === "undefined") return false;
  if (window.name === "anikume_pc_display_frame") return false;
  if (window.location.search.includes("_pc_display=1")) return false;
  const rawSearch = window.location.search || "";
  if (!rawSearch) return false;
  let hasDesktopParam = false;
  try {
    const params = new URLSearchParams(rawSearch);
    for (const [k, v] of params.entries()) {
      const key = k.trim().toLowerCase();
      const val = v.trim().toLowerCase();
      if (key === "desktop" && (val === "" || val === "true" || val === "1" || val === "yes")) {
        hasDesktopParam = true;
        break;
      }
    }
  } catch {}
  if (!hasDesktopParam) {
    try {
      const decoded = decodeURIComponent(rawSearch);
      hasDesktopParam = /[?&]\s*desktop\s*(?:=\s*(?:true|1|yes))?(?:[&#]|$)/i.test(decoded);
    } catch {}
  }
  if (!hasDesktopParam) return false;
  return (window.innerWidth || 390) < 1024;
}

function PcDisplayOverlay({
  onActiveChange,
}: {
  onActiveChange?: (active: boolean) => void;
}) {
  const [enabled, setEnabled] = useState<boolean>(() => isDirectDesktopOnSmallScreen());
  const [rotatedManually, setRotatedManually] = useState<boolean>(() => isDirectDesktopOnSmallScreen());
  const [frameUrl, setFrameUrl] = useState<string>(() => buildPcFrameUrl());
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth || 1280 : 1280,
    h: typeof window !== "undefined" ? window.innerHeight || 720 : 720,
  }));
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.name === "anikume_pc_display_frame") return;

    const updateViewport = () => {
      setViewport({
        w: window.innerWidth || 390,
        h: window.innerHeight || 844,
      });
    };
    updateViewport();

    if (isDirectDesktopOnSmallScreen()) {
      setFrameUrl(buildPcFrameUrl());
      setRotatedManually(true);
      setEnabled(true);
    }

    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const next = Boolean(detail?.enabled);
      if (next) {
        setFrameUrl(buildPcFrameUrl());
        setRotatedManually(Boolean(detail?.direct));
        updateViewport();
        setEnabled(true);
      } else {
        setEnabled(false);
        setRotatedManually(false);
      }
    };

    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "ANIKUME_EXIT_PC_DISPLAY") {
        setEnabled(false);
        setRotatedManually(false);
        try {
          const orientation = (window.screen as any)?.orientation;
          if (orientation && typeof orientation.unlock === "function") {
            orientation.unlock();
          }
        } catch {}
        const rawNextUrl = e.data.url;
        if (typeof rawNextUrl === "string" && rawNextUrl) {
          let cleanNextUrl = rawNextUrl;
          try {
            const u = new URL(rawNextUrl, window.location.origin);
            u.searchParams.delete("_pc_display");
            u.searchParams.delete("desktop");
            for (const key of Array.from(u.searchParams.keys())) {
              if (key.trim().toLowerCase() === "desktop") {
                u.searchParams.delete(key);
              }
            }
            cleanNextUrl = u.pathname + u.search + u.hash;
          } catch {}
          if (
            cleanNextUrl !==
            window.location.pathname + window.location.search + window.location.hash
          ) {
            router.navigate({ href: cleanNextUrl });
          }
        }
      }
    };

    window.addEventListener("anikume-pc-display", onToggle);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      window.removeEventListener("anikume-pc-display", onToggle);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, [router]);

  // Listen to physical device orientation tilt so rotating a portrait-locked phone also auto-triggers PC view
  useEffect(() => {
    if (!enabled) return;
    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      const gamma = Math.abs(e.gamma ?? 0);
      if (gamma > 55) {
        setRotatedManually(true);
      }
    };
    window.addEventListener("deviceorientation", onDeviceOrientation);
    return () => window.removeEventListener("deviceorientation", onDeviceOrientation);
  }, [enabled]);

  const isLandscapeViewport = viewport.w >= viewport.h;
  const showPcFrame = isLandscapeViewport || rotatedManually;

  useEffect(() => {
    onActiveChange?.(Boolean(enabled && showPcFrame));
  }, [enabled, showPcFrame, onActiveChange]);

  if (!enabled) return null;

  const exitPcMode = () => {
    setEnabled(false);
    setRotatedManually(false);
    try {
      const orientation = (window.screen as any)?.orientation;
      if (orientation && typeof orientation.unlock === "function") {
        orientation.unlock();
      }
    } catch {}
  };

  if (!showPcFrame) {
    return (
      <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/95 px-6 text-center backdrop-blur-xl animate-in fade-in duration-200">
        <div className="flex max-w-sm flex-col items-center rounded-3xl border border-white/[0.1] bg-[#121212] p-6 shadow-2xl">
          <div className="relative mb-4 flex size-16 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04]">
            <Smartphone className="size-8 text-white transition-transform duration-700 animate-pulse -rotate-90" />
            <RotateCw className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-white text-black p-1 shadow" />
          </div>
          <h3 className="text-base font-bold text-white">Rotate your phone</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
            Turn your phone sideways to view the{" "}
            <span className="font-semibold text-white">1280 × 720</span> PC Display.
          </p>
          <div className="mt-5 flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={() => setRotatedManually(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black transition hover:bg-white/90 active:scale-95 cursor-pointer"
            >
              <RotateCw className="size-3.5" />
              <span>Rotate Screen Now (1280 × 720)</span>
            </button>
            <button
              type="button"
              onClick={exitPcMode}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-xs font-medium text-neutral-300 transition hover:bg-white/[0.08] hover:text-white cursor-pointer"
            >
              <span>Back to Mobile Display</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const scale = isLandscapeViewport
    ? Math.min(viewport.w / 1280, viewport.h / 720)
    : Math.min(viewport.h / 1280, viewport.w / 720);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-black">
      <div
        style={{
          width: "1280px",
          height: "720px",
          transform: isLandscapeViewport
            ? `scale(${scale})`
            : `rotate(90deg) scale(${scale})`,
          transformOrigin: "center center",
        }}
        className="relative shrink-0 bg-background shadow-2xl"
      >
        <iframe
          name="anikume_pc_display_frame"
          src={frameUrl}
          scrolling="yes"
          title="AniKume PC Display (1280x720)"
          className="h-[720px] w-[1280px] border-0 bg-background"
        />
      </div>
    </div>
  );
}

function AppContent() {
  // Custom touch-scroll + inertia engine for the scaled/rotated 1280x720 PC Display iframe on mobile
  useEffect(() => {
    if (typeof window === "undefined" || window.name !== "anikume_pc_display_frame") return;

    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "visible";

    // Prevent browser from hijacking/cancelling touch gestures inside the scaled/rotated PC iframe
    const styleEl = document.createElement("style");
    styleEl.textContent = "html, body, * { touch-action: none !important; }";
    document.head.appendChild(styleEl);

    let startPageX = 0;
    let startPageY = 0;
    let lastPageX = 0;
    let lastPageY = 0;
    let lastTime = 0;
    let velX = 0;
    let velY = 0;
    let axis: "none" | "x" | "y" = "none";
    let scrollYTarget: HTMLElement | null = null;
    let scrollXTarget: HTMLElement | null = null;
    let isInsideCarousel = false;
    let rafId: number | null = null;

    const isRotated90 = () => {
      try {
        if (window.parent && window.parent !== window) {
          return window.parent.innerWidth < window.parent.innerHeight;
        }
      } catch {}
      return false;
    };

    const getScale = () => {
      try {
        if (window.parent && window.parent !== window) {
          const pw = window.parent.innerWidth || 1280;
          const ph = window.parent.innerHeight || 720;
          return pw >= ph
            ? Math.min(pw / 1280, ph / 720)
            : Math.min(ph / 1280, pw / 720);
        }
      } catch {}
      return 1;
    };

    // Map raw touch coordinates to the iframe's internal 1280x720 coordinate space
    const getLogicalPoint = (t: Touch) => {
      const s = Math.max(0.25, getScale());
      if (isRotated90()) {
        return {
          x: t.clientY / s,
          y: -t.clientX / s,
        };
      }
      return {
        x: t.clientX / s,
        y: t.clientY / s,
      };
    };

    const stopMomentum = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const scrollWindowBy = (dy: number) => {
      window.scrollBy(0, dy);
    };

    const applyVerticalScroll = (dy: number) => {
      if (scrollYTarget) {
        const prev = scrollYTarget.scrollTop;
        scrollYTarget.scrollTop += dy;
        const consumed = scrollYTarget.scrollTop - prev;
        const remainder = dy - consumed;
        if (Math.abs(remainder) > 0.5) {
          scrollWindowBy(remainder);
        }
      } else {
        scrollWindowBy(dy);
      }
    };

    let isInsideVerticalCarousel = false;

    const findScrollTargets = (startNode: EventTarget | null) => {
      scrollYTarget = null;
      scrollXTarget = null;
      isInsideCarousel = false;
      isInsideVerticalCarousel = false;
      let el = startNode instanceof HTMLElement ? startNode : null;
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.getAttribute("data-orientation") === "vertical") {
          isInsideVerticalCarousel = true;
        }
        if (
          el.getAttribute("aria-roledescription") === "carousel" ||
          el.getAttribute("role") === "region" ||
          el.hasAttribute("data-swipe-tags") ||
          el.classList?.contains("overflow-x-auto")
        ) {
          isInsideCarousel = true;
        }
        const tag = el.tagName.toUpperCase();
        const isPageLayoutNode =
          tag === "MAIN" ||
          tag === "SECTION" ||
          tag === "ARTICLE" ||
          tag === "HEADER" ||
          tag === "FOOTER" ||
          el.id === "root";
        const style = window.getComputedStyle(el);
        if (
          !scrollYTarget &&
          !isPageLayoutNode &&
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.clientHeight < 680 &&
          el.scrollHeight > el.clientHeight + 4
        ) {
          scrollYTarget = el;
        }
        if (
          !scrollXTarget &&
          !isPageLayoutNode &&
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          el.scrollWidth > el.clientWidth + 4
        ) {
          scrollXTarget = el;
        }
        el = el.parentElement;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      stopMomentum();
      const pt = getLogicalPoint(e.touches[0]);
      startPageX = pt.x;
      startPageY = pt.y;
      lastPageX = pt.x;
      lastPageY = pt.y;
      lastTime = performance.now();
      velX = 0;
      velY = 0;
      axis = "none";
      findScrollTargets(e.target);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const pt = getLogicalPoint(e.touches[0]);
      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      const dx = lastPageX - pt.x;
      const dy = lastPageY - pt.y;

      if (axis === "none") {
        const totalDx = Math.abs(pt.x - startPageX);
        const totalDy = Math.abs(pt.y - startPageY);
        if (totalDx > 3 || totalDy > 3) {
          axis = totalDy >= totalDx ? "y" : "x";
        }
      }

      if (axis === "y" && !isInsideVerticalCarousel) {
        if (e.cancelable) e.preventDefault();
        applyVerticalScroll(dy);
        velY = 0.7 * (dy / dt) + 0.3 * velY;
      } else if (axis === "x" && scrollXTarget && !isInsideCarousel) {
        if (e.cancelable) e.preventDefault();
        scrollXTarget.scrollLeft += dx;
        velX = 0.7 * (dx / dt) + 0.3 * velX;
      }

      lastPageX = pt.x;
      lastPageY = pt.y;
      lastTime = now;
    };

    const onTouchEnd = () => {
      if (axis === "y" && !isInsideVerticalCarousel && Math.abs(velY) > 0.05) {
        let prevFrame = performance.now();
        const step = (now: number) => {
          const dt = Math.min(32, Math.max(8, now - prevFrame));
          prevFrame = now;
          const delta = velY * dt;
          applyVerticalScroll(delta);
          velY *= 0.95;
          if (Math.abs(velY) > 0.02) {
            rafId = requestAnimationFrame(step);
          } else {
            rafId = null;
          }
        };
        rafId = requestAnimationFrame(step);
      } else if (axis === "x" && scrollXTarget && !isInsideCarousel && Math.abs(velX) > 0.05) {
        let prevFrame = performance.now();
        const target = scrollXTarget;
        const step = (now: number) => {
          const dt = Math.min(32, Math.max(8, now - prevFrame));
          prevFrame = now;
          target.scrollLeft += velX * dt;
          velX *= 0.95;
          if (Math.abs(velX) > 0.02) {
            rafId = requestAnimationFrame(step);
          } else {
            rafId = null;
          }
        };
        rafId = requestAnimationFrame(step);
      }
      axis = "none";
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      stopMomentum();
      styleEl.remove();
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    import("@/lib/utils").then((m) => m.markClientHydrated()).catch(() => {});

    // Enable instant :active pseudo-class on mobile WebKit/Chromium without 200ms scroll-disambiguation lag
    const noopTouch = () => {};
    document.addEventListener("touchstart", noopTouch, { passive: true });

    let activeTapEl: HTMLElement | null = null;
    let tapReleaseTimer: ReturnType<typeof setTimeout> | null = null;
    let downX = 0;
    let downY = 0;
    let downTime = 0;
    const MIN_PRESS_MS = 160;

    const clearTapEl = (immediate = false) => {
      if (!activeTapEl) return;
      const el = activeTapEl;
      activeTapEl = null;
      if (tapReleaseTimer) {
        clearTimeout(tapReleaseTimer);
        tapReleaseTimer = null;
      }
      if (immediate) {
        el.removeAttribute("data-tap-active");
      } else {
        const elapsed = performance.now() - downTime;
        const remaining = Math.max(0, MIN_PRESS_MS - elapsed);
        if (remaining === 0) {
          el.removeAttribute("data-tap-active");
        } else {
          tapReleaseTimer = setTimeout(() => {
            el.removeAttribute("data-tap-active");
          }, remaining);
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const interactive = target.closest(
        'a, button, [role="button"]',
      ) as HTMLElement | null;
      if (!interactive || interactive.hasAttribute("disabled")) return;
      if (activeTapEl && activeTapEl !== interactive) {
        activeTapEl.removeAttribute("data-tap-active");
      }
      if (tapReleaseTimer) {
        clearTimeout(tapReleaseTimer);
        tapReleaseTimer = null;
      }
      downX = e.clientX;
      downY = e.clientY;
      downTime = performance.now();
      activeTapEl = interactive;
      interactive.setAttribute("data-tap-active", "true");
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeTapEl) return;
      if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) {
        clearTapEl(true);
      }
    };

    const onPointerUp = () => clearTapEl(false);
    const onPointerCancel = () => clearTapEl(true);

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerCancel, { passive: true });

    const markLoaded = (img: HTMLImageElement) => {
      if (img.getAttribute("data-permanent-logo") === "true") {
        img.setAttribute("data-img-loaded", "true");
        return;
      }
      requestAnimationFrame(() => {
        img.setAttribute("data-img-loaded", "true");
      });
    };

    const processImg = (img: HTMLImageElement) => {
      if (img.getAttribute("data-permanent-logo") === "true") {
        img.setAttribute("data-img-loaded", "true");
        return;
      }
      if (img.getAttribute("data-img-loaded") === "true") return;
      if (img.complete && img.naturalWidth > 0) {
        requestAnimationFrame(() => {
          img.setAttribute("data-img-loaded", "true");
        });
      }
    };

    const scanAllImages = () => {
      document.querySelectorAll("img").forEach((img) => processImg(img));
    };

    const handleImgEvent = (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLImageElement) {
        markLoaded(target);
      }
    };

    document.addEventListener("load", handleImgEvent, true);
    document.addEventListener("error", handleImgEvent, true);
    window.addEventListener("resize", scanAllImages);

    scanAllImages();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.target instanceof HTMLImageElement) {
          if (m.target.getAttribute("data-permanent-logo") === "true") {
            m.target.setAttribute("data-img-loaded", "true");
          } else if (!m.target.complete) {
            m.target.removeAttribute("data-img-loaded");
          } else {
            processImg(m.target);
          }
        } else if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node instanceof HTMLImageElement) {
              processImg(node);
            } else if (node instanceof Element) {
              node.querySelectorAll("img").forEach((img) => processImg(img));
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    return () => {
      document.removeEventListener("touchstart", noopTouch);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("load", handleImgEvent, true);
      document.removeEventListener("error", handleImgEvent, true);
      window.removeEventListener("resize", scanAllImages);
      observer.disconnect();
    };
  }, []);

  const [pcOverlayActive, setPcOverlayActive] = useState<boolean>(() =>
    isDirectDesktopOnSmallScreen(),
  );

  return (
    <>
      <DebugTyper />
      {/* Required: nested routes render here. Unmounted while full-screen PC Display iframe is active to avoid duplicate background API fetches. */}
      {!pcOverlayActive && <Outlet />}
      <AuthModal />
      <PcDisplayOverlay onActiveChange={setPcOverlayActive} />
    </>
  );
}
