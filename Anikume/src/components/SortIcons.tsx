import { useState, useEffect } from "react";

let currentSortOrder: "desc" | "asc" = "asc";

const sortListeners = new Set<(order: "desc" | "asc") => void>();

function notifySortListeners(
  order: "desc" | "asc",
  skipListener?: (order: "desc" | "asc") => void,
) {
  sortListeners.forEach((listener) => {
    if (listener !== skipListener) {
      listener(order);
    }
  });
}

export function useContentSortOrder() {
  const [sortOrder, setSortOrderState] = useState<"desc" | "asc">("asc");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("global_content_sort_order");
      const resolved = saved === "desc" ? "desc" : "asc";
      currentSortOrder = resolved;
      setSortOrderState(resolved);
    } catch {}

    const handleChange = (newOrder: "desc" | "asc") => {
      setSortOrderState(newOrder);
    };
    sortListeners.add(handleChange);

    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === "global_content_sort_order" &&
        (e.newValue === "asc" || e.newValue === "desc")
      ) {
        currentSortOrder = e.newValue;
        setSortOrderState(e.newValue);
        notifySortListeners(e.newValue, handleChange);
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      sortListeners.delete(handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setSortOrder = (order: "desc" | "asc" | ((prev: "desc" | "asc") => "desc" | "asc")) => {
    const next = typeof order === "function" ? order(currentSortOrder) : order;
    if (next === currentSortOrder) return;
    currentSortOrder = next;
    try {
      localStorage.setItem("global_content_sort_order", next);
    } catch {}
    setSortOrderState(next);
    notifySortListeners(next);
  };

  return [sortOrder, setSortOrder] as const;
}

export function SortDescIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Sort descending"
    >
      {/* Downward arrow on left */}
      <path d="M7 4v14" />
      <path d="M3.5 14.5L7 18l3.5-3.5" />
      {/* Stacked bars on right (wide to narrow) */}
      <path d="M14 6h7" />
      <path d="M14 12h5" />
      <path d="M14 18h3" />
    </svg>
  );
}

export function SortAscIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Sort ascending"
    >
      {/* Upward arrow on left */}
      <path d="M7 20V6" />
      <path d="M3.5 9.5L7 6l3.5 3.5" />
      {/* Stacked bars on right (narrow to wide) */}
      <path d="M14 6h3" />
      <path d="M14 12h5" />
      <path d="M14 18h7" />
    </svg>
  );
}

export function RefreshCwIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Refresh"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
