// Shared singleton IntersectionObserver + One-Time Static Blur Canvas utility

type InViewCallback = () => void;

const observerCallbacks = new WeakMap<Element, InViewCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
    return null;
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.isIntersecting) {
            const cb = observerCallbacks.get(entry.target);
            if (cb) {
              observerCallbacks.delete(entry.target);
              sharedObserver?.unobserve(entry.target);
              cb();
            }
          }
        }
      },
      { rootMargin: "280px 100px" },
    );
  }
  return sharedObserver;
}

export function observeElementInView(el: Element, onInView: InViewCallback): () => void {
  if (
    typeof window === "undefined" ||
    window.name === "anikume_pc_display_frame" ||
    window.location.search.includes("_pc_display=1") ||
    window.location.search.toLowerCase().includes("desktop") ||
    window.innerWidth >= 768
  ) {
    onInView();
    return () => {};
  }
  const obs = getSharedObserver();
  if (!obs) {
    onInView();
    return () => {};
  }
  observerCallbacks.set(el, onInView);
  obs.observe(el);
  return () => {
    observerCallbacks.delete(el);
    obs.unobserve(el);
  };
}

let scratchCanvas: HTMLCanvasElement | null = null;

function getScratchCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
  }
  if (scratchCanvas.width !== w) scratchCanvas.width = w;
  if (scratchCanvas.height !== h) scratchCanvas.height = h;
  return scratchCanvas;
}

export interface NormalizedRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draws a one-time static frosted-glass blur of the exact region of `img`
 * onto `canvas`. Once drawn on image load, the browser composites `canvas`
 * as a tiny static bitmap texture with ZERO per-frame backdrop-filter shader cost.
 */
export function drawStaticRegionBlur(
  img: HTMLImageElement | null,
  canvas: HTMLCanvasElement | null,
  region: NormalizedRegion,
  containerAspect = 1 / 1.4,
  alignTop = false,
  darkScrimAlpha = 0,
): void {
  if (!img || !canvas) return;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return;

  try {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const imgAspect = nw / nh;
    let vx = 0;
    let vy = 0;
    let vw = nw;
    let vh = nh;

    if (imgAspect > containerAspect) {
      vw = nh * containerAspect;
      vx = (nw - vw) * 0.5;
    } else {
      vh = nw / containerAspect;
      vy = alignTop ? 0 : (nh - vh) * 0.5;
    }

    // Expand sample slightly for smooth edge bleed
    const padX = region.w * 0.15;
    const padY = region.h * 0.25;
    const rx = Math.max(0, region.x - padX);
    const ry = Math.max(0, region.y - padY);
    const rw = Math.min(1 - rx, region.w + padX * 2);
    const rh = Math.min(1 - ry, region.h + padY * 2);

    const sx = Math.max(0, Math.floor(vx + vw * rx));
    const sy = Math.max(0, Math.floor(vy + vh * ry));
    const sw = Math.max(1, Math.min(nw - sx, Math.floor(vw * rw)));
    const sh = Math.max(1, Math.min(nh - sy, Math.floor(vh * rh)));

    const cw = canvas.width;
    const ch = canvas.height;

    // Two-pass hardware box/bilinear downsample + blur for silky frosted glass on all GPUs
    const smallW = Math.max(6, Math.round(cw * 0.3));
    const smallH = Math.max(4, Math.round(ch * 0.3));
    const scratch = getScratchCanvas(smallW, smallH);
    const sCtx = scratch?.getContext("2d", { alpha: true });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (scratch && sCtx) {
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = "high";
      sCtx.clearRect(0, 0, smallW, smallH);
      sCtx.drawImage(img, sx, sy, sw, sh, 0, 0, smallW, smallH);
      if ("filter" in ctx) {
        ctx.filter = "blur(2px)";
      }
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(scratch, 0, 0, smallW, smallH, -2, -2, cw + 4, ch + 4);
      if ("filter" in ctx) {
        ctx.filter = "none";
      }
    } else {
      if ("filter" in ctx) {
        ctx.filter = "blur(3px)";
      }
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, sx, sy, sw, sh, -2, -2, cw + 4, ch + 4);
      if ("filter" in ctx) {
        ctx.filter = "none";
      }
    }

    if (darkScrimAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${darkScrimAlpha})`;
      ctx.fillRect(0, 0, cw, ch);
    }
  } catch {
    // Fallback is handled by the badge's CSS background tint
  }
}
