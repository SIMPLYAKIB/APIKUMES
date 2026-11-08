import React, { useRef } from "react";
import { motion } from "motion/react";
import { Check, Plus, X, Sparkles, Smile, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESET_AVATARS, PRESET_FRAMES, UserAvatar } from "./UserAvatar";

interface AvatarSliderPickerProps {
  currentAvatar: string;
  currentFrame: string;
  username: string;
  onSelectAvatar: (url: string) => void;
  onSelectFrame: (url: string) => void;
  onUploadCustom: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
}

export function AvatarSliderPicker({
  currentAvatar,
  currentFrame,
  username,
  onSelectAvatar,
  onSelectFrame,
  onUploadCustom,
  onClose,
}: AvatarSliderPickerProps) {
  const [activeTab, setActiveTab] = React.useState<"avatar" | "fx">("avatar");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCustomAvatar =
    Boolean(currentAvatar) &&
    (currentAvatar.startsWith("data:") ||
      currentAvatar.startsWith("blob:") ||
      (!currentAvatar.startsWith("/assets/avatars/") &&
        !currentAvatar.startsWith("/photos/") &&
        !currentAvatar.includes("photo_")));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/85 backdrop-blur-md cursor-pointer"
      />

      {/* Main Solid Predetermined Sized Modal Box */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 14 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] bg-[#121215] border border-white/15 shadow-[0_30px_70px_rgba(0,0,0,0.95)] flex flex-col max-h-[88vh]"
      >
        {/* Clean Header: "Edit" */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#16161a] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-white/80" />
            <h3 className="text-base font-bold text-white tracking-wide">Edit</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full bg-white/5 p-2 text-white/50 hover:bg-white/15 hover:text-white transition cursor-pointer active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Live Preview Area - Clean centered avatar with live animation/FX */}
        <div className="bg-[#0a0a0d] border-b border-white/10 py-5 flex items-center justify-center shrink-0">
          <div className="relative flex flex-col items-center">
            <UserAvatar
              avatarUrl={currentAvatar}
              frameUrl={currentFrame}
              username={username}
              size="profile"
            />
          </div>
        </div>

        {/* Hidden File Input for Custom Upload */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={onUploadCustom}
          accept="image/*"
          className="hidden"
        />

        {/* Clean Tabs: "Avatar" & "FX" */}
        <div className="flex border-b border-white/10 bg-[#141417] p-1.5 mx-4 mt-3 rounded-2xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("avatar")}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 select-none",
              activeTab === "avatar"
                ? "bg-white text-zinc-950 shadow-md"
                : "text-white/50 hover:text-white/80",
            )}
          >
            <Smile className="size-4" />
            <span>Avatar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("fx")}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 select-none",
              activeTab === "fx"
                ? "bg-white text-zinc-950 shadow-md"
                : "text-white/50 hover:text-white/80",
            )}
          >
            <Zap className="size-4" />
            <span>FX</span>
          </button>
        </div>

        {/* Grid Content Container - Scrollable with maximum visibility */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {activeTab === "avatar" && (
            <div className="flex-1 min-h-[320px] max-h-[440px] overflow-y-auto rounded-2xl bg-[#09090c] border border-white/10 p-3 pb-12 custom-scrollbar">
              <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
                {/* 1st Tile: Plus (+) Button for Custom Image Upload (Clean, No Text) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "group relative aspect-square w-full rounded-2xl bg-[#16161a] border-2 border-dashed transition-all duration-150 cursor-pointer shadow-sm hover:scale-105 active:scale-95 flex items-center justify-center p-1.5",
                    isCustomAvatar
                      ? "border-white bg-[#222228] ring-2 ring-white/30 text-white"
                      : "border-white/20 hover:border-white/50 hover:bg-[#1f1f26] text-white/70 hover:text-white",
                  )}
                >
                  {isCustomAvatar ? (
                    <div className="relative size-full rounded-xl overflow-hidden">
                      <img
                        src={currentAvatar}
                        alt="Custom upload"
                        className="size-full object-cover rounded-xl"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="size-5 rounded-full bg-white text-zinc-950 grid place-items-center shadow">
                          <Check className="size-3 stroke-[3]" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="size-10 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center text-white transition-all border border-white/10">
                      <Plus className="size-6 stroke-[2.5]" />
                    </div>
                  )}
                </button>

                {/* 100 Anime Avatars */}
                {PRESET_AVATARS.map((avatar) => {
                  const isSelected = currentAvatar === avatar.url;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => onSelectAvatar(avatar.url)}
                      className={cn(
                        "group relative aspect-square w-full overflow-hidden rounded-2xl bg-[#18181c] border-2 transition-all duration-150 cursor-pointer shadow-sm hover:scale-105 active:scale-95 flex items-center justify-center p-0.5",
                        isSelected
                          ? "border-white ring-2 ring-white/30 shadow-[0_0_15px_rgba(255,255,255,0.25)]"
                          : "border-white/10 hover:border-white/40 hover:bg-[#202026]",
                      )}
                    >
                      <img
                        src={avatar.url}
                        alt={avatar.name}
                        className="size-full rounded-[14px] object-cover"
                        loading="eager"
                        decoding="sync"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-black/40 rounded-[14px] flex items-center justify-center">
                          <div className="size-6 rounded-full bg-white text-zinc-950 grid place-items-center shadow-lg">
                            <Check className="size-3.5 stroke-[3]" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "fx" && (
            <div className="flex-1 min-h-[320px] max-h-[440px] overflow-y-auto rounded-2xl bg-[#09090c] border border-white/10 p-3 pb-12 custom-scrollbar">
              <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
                {/* All Frames with 1st Tile as Rotated Plus (None/No Frame, No Text) */}
                {PRESET_FRAMES.map((frame) => {
                  const isSelected =
                    frame.id === "none"
                      ? !currentFrame || currentFrame === "" || currentFrame === "none"
                      : currentFrame === frame.url;

                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => onSelectFrame(frame.url)}
                      className={cn(
                        "group relative aspect-square w-full rounded-2xl bg-[#16161a] p-1.5 flex items-center justify-center border-2 transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer select-none",
                        isSelected
                          ? "border-white bg-[#222228] shadow-[0_0_15px_rgba(255,255,255,0.25)]"
                          : "border-white/10 hover:border-white/30 hover:bg-[#1c1c22]",
                      )}
                    >
                      {frame.id === "none" ? (
                        <div className="size-10 rounded-full bg-white/10 group-hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all">
                          {/* Rotated plus icon for None button */}
                          <Plus className="size-6 stroke-[2.5] text-white/70 rotate-45 transition-transform group-hover:rotate-90" />
                        </div>
                      ) : (
                        <div className="relative size-full flex items-center justify-center p-0.5">
                          {/* Pure Frame FX Graphic - only the animated/effect graphic */}
                          <img
                            src={frame.url}
                            alt={frame.name}
                            key={frame.url}
                            className="size-full object-contain pointer-events-none drop-shadow-md select-none"
                            loading="eager"
                          />
                        </div>
                      )}

                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 size-4 rounded-full bg-white text-zinc-950 grid place-items-center shadow-lg">
                          <Check className="size-2.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer: Done Button */}
        <div className="p-4 border-t border-white/10 bg-[#16161a] shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-sm shadow transition cursor-pointer active:scale-95"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
