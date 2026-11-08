// High-performance image cache manager
const memoryLoadedImages = new Set<string>();

export function isImageCached(src?: string | null): boolean {
  if (!src) return false;
  if (typeof window === "undefined") return false;
  return memoryLoadedImages.has(src);
}

export function markImageCached(src?: string | null) {
  if (!src) return;
  memoryLoadedImages.add(src);
}

export function cacheImagesParallel(urls: (string | null | undefined)[]) {
  if (typeof window === "undefined") return;
  const valid = Array.from(new Set(urls.filter((u): u is string => Boolean(u))));

  // Fetch all in parallel using Image constructors
  valid.forEach((url) => {
    if (memoryLoadedImages.has(url)) return;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    img.src = url;
    img.onload = () => {
      memoryLoadedImages.add(url);
    };
  });
}
