import React, { useState } from "react";

export interface UserAvatarProps {
  avatarUrl?: string | null;
  frameUrl?: string | null;
  username?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "header" | "profile" | "modal-preview";
  className?: string;
  avatarClassName?: string;
  frameClassName?: string;
}

const SIZE_CONFIGS = {
  xs: { container: "size-6 min-w-6 min-h-6", text: "text-[9px]" },
  sm: { container: "size-8 min-w-8 min-h-8", text: "text-[11px]" },
  md: { container: "size-10 min-w-10 min-h-10", text: "text-xs" },
  lg: { container: "size-12 min-w-12 min-h-12", text: "text-sm" },
  header: { container: "size-10 min-w-10 min-h-10", text: "text-xs" },
  xl: { container: "size-16 min-w-16 min-h-16", text: "text-lg" },
  profile: { container: "size-24 sm:size-28 min-w-24 min-h-24", text: "text-2xl" },
  "modal-preview": { container: "size-28 sm:size-32 min-w-28 min-h-28", text: "text-3xl" },
};

export const DEFAULT_AVATAR = "/assets/avatars/photo_0.jpg";
export const DEFAULT_FRAME = "https://anikage.cc/assets/frames/4.png";

// Exactly 100 top anime face photos from /assets/avatars/
export const PRESET_AVATARS = Array.from({ length: 100 }, (_, i) => ({
  id: `photo_${i}`,
  url: `/assets/avatars/photo_${i}.jpg`,
  name: `Avatar ${i + 1}`,
}));

// Frames from anikage.cc (0 to 35) + None option
export const PRESET_FRAMES = [
  { id: "none", url: "", name: "No Frame", label: "None" },
  ...Array.from({ length: 36 }, (_, i) => ({
    id: `frame_${i}`,
    url: `https://anikage.cc/assets/frames/${i}.png`,
    name: `Frame ${i}`,
    label: `Frame ${i}`,
  })),
];

export function UserAvatar({
  avatarUrl,
  frameUrl,
  username,
  size = "md",
  className = "",
  avatarClassName = "",
  frameClassName = "",
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [frameError, setFrameError] = useState(false);

  const config = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const initial = (username?.trim()?.charAt(0) || "U").toUpperCase();

  // If no avatarUrl given, fallback to DEFAULT_AVATAR or initial
  const resolvedAvatar = avatarUrl !== undefined && avatarUrl !== null ? avatarUrl : DEFAULT_AVATAR;
  const hasFrame = Boolean(
    frameUrl && frameUrl !== "none" && frameUrl.trim() !== "" && !frameError,
  );

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none overflow-visible ${config.container} ${className}`}
    >
      {/* Inner Avatar Circle */}
      <div
        className={`rounded-full overflow-hidden flex items-center justify-center bg-white/10 ring-1 ring-white/15 size-full ${avatarClassName}`}
      >
        {resolvedAvatar && !imgError ? (
          <img
            src={resolvedAvatar}
            alt={username || "User avatar"}
            className="size-full object-cover rounded-full"
            onError={() => setImgError(true)}
            loading="eager"
            decoding="sync"
          />
        ) : (
          <div
            className={`size-full grid place-items-center bg-[var(--brand,#df7426)] font-bold text-white ${config.text}`}
          >
            {initial}
          </div>
        )}
      </div>
      {/* Decorative Frame Overlay */}
      {hasFrame && (
        <img
          src={frameUrl!}
          alt="Avatar Frame"
          key={frameUrl} // Force remount on frame change
          className={`absolute inset-0 size-full scale-[1.32] pointer-events-none object-contain z-10 select-none drop-shadow-md ${frameClassName}`}
          onError={() => setFrameError(true)}
          loading="eager"
        />
      )}
    </div>
  );
}
