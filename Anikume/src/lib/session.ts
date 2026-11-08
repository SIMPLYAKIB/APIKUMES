// Session management (persistent session caching disabled)

export function initSessionTracker() {
  if (typeof window === "undefined") return;
  clearMediaSessionFlags();
}

export function clearMediaSessionFlags() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("app_runtime_session_id");
    sessionStorage.removeItem("app_session_last_active_ts");
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        (key.startsWith("mangaball_session_updated_") ||
          key.startsWith("episodes_session_updated_"))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

export function isMediaSessionStale(_mediaId: string | number, _status?: string | null): boolean {
  return true;
}

export function markMediaSessionFresh(_mediaId: string | number) {
  // No-op: session caching disabled
}

export function invalidateMediaSession(_mediaId: string | number) {
  // No-op: session caching disabled
}

if (typeof window !== "undefined") {
  initSessionTracker();
}
