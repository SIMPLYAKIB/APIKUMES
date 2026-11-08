import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stripHtml(html: string) {
  return html.replace(/<[^>]*>?/gm, "");
}

export function getScoreColor(score100: number) {
  if (score100 <= 0) return "#ef4444"; // fully red
  if (score100 >= 90) return "#22c55e"; // fully green
  // Interpolate hue from 0 (red) to 120 (green) based on 0-90 scale
  const hue = (score100 / 90) * 120;
  return `hsl(${hue}, 80%, 50%)`;
}

export function formatScore(score100: number) {
  return (score100 / 10).toFixed(1);
}

export function formatStatus(status?: string | null) {
  const upper = status?.toUpperCase()?.replace(/[\s-]+/g, "_");
  switch (upper) {
    case "RELEASING":
      return "Releasing";
    case "FINISHED":
    case "COMPLETED":
      return "Finished";
    case "NOT_YET_RELEASED":
    case "UPCOMING":
      return "Upcoming";
    case "CANCELLED":
      return "Cancelled";
    case "HIATUS":
    case "ON_HIATUS":
      return "On Hiatus";
    default:
      return status ? status.replace(/_/g, " ") : "Unknown";
  }
}

export function getStatusColor(status?: string | null) {
  const upper = status?.toUpperCase()?.replace(/[\s-]+/g, "_");
  switch (upper) {
    case "RELEASING":
      return "text-green-500";
    case "FINISHED":
    case "COMPLETED":
      return "text-blue-500";
    case "NOT_YET_RELEASED":
    case "UPCOMING":
      return "text-red-500";
    case "CANCELLED":
      return "text-red-600";
    case "HIATUS":
    case "ON_HIATUS":
      return "text-yellow-500";
    default:
      return "text-muted-foreground";
  }
}

export function getStatusBgColor(status?: string | null) {
  const upper = status?.toUpperCase()?.replace(/[\s-]+/g, "_");
  switch (upper) {
    case "RELEASING":
      return "bg-green-500";
    case "FINISHED":
    case "COMPLETED":
      return "bg-blue-500";
    case "NOT_YET_RELEASED":
    case "UPCOMING":
      return "bg-red-500";
    case "CANCELLED":
      return "bg-red-600";
    case "HIATUS":
    case "ON_HIATUS":
      return "bg-yellow-500";
    default:
      return "bg-muted-foreground";
  }
}

let isClientHydrated = false;
export function markClientHydrated() {
  isClientHydrated = true;
}

export function getPreferredTitle(titleObj: any): string {
  if (!titleObj) return "Untitled";
  if (typeof titleObj === "string") return titleObj;

  let preference = "english";
  if (isClientHydrated && typeof window !== "undefined") {
    try {
      const userStr = localStorage.getItem("anikume_auth_user");
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.settings?.titleLanguage) {
          preference = user.settings.titleLanguage;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  const { english, romaji, native, userPreferred } = titleObj;

  if (preference === "romaji") {
    return romaji || native || english || userPreferred || "Untitled";
  }
  if (preference === "native") {
    return native || romaji || english || userPreferred || "Untitled";
  }

  // default english
  return english || romaji || native || userPreferred || "Untitled";
}

export function formatRelativeTime(dateString: string | undefined): string | null {
  const date = new Date(dateString);
  const targetTime = date.getTime();
  if (isNaN(targetTime)) return null;

  const now = new Date();
  const diffMs = now.getTime() - targetTime;

  if (diffMs < 0) return "soon";

  // Check if it's the exact same calendar day in local timezone
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return "today";

  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffHours / 24);

  // If not today but less than 24h, or 1 day difference
  if (diffDays < 1 && !isToday) return "1d ago";
  if (diffDays >= 1 && diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `${diffWeeks}w ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${Math.max(1, diffMonths)}m ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${Math.max(1, diffYears)}y ago`;
}
