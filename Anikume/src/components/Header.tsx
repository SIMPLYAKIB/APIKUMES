import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  User,
  LogOut,
  Settings,
  LogIn,
  Monitor,
  Smartphone,
} from "lucide-react";
import { Logo } from "./Logo";
import { SearchModal, useSearchHotkey } from "./SearchModal";
import { useAuth } from "../lib/auth";
import { UserAvatar } from "./UserAvatar";

function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const hiddenRef = useRef(false);
  const atTopRef = useRef(true);

  useEffect(() => {
    let last = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      const atTop = y <= 60;
      if (atTopRef.current !== atTop) {
        atTopRef.current = atTop;
        setIsAtTop(atTop);
      }

      let nextHidden = hiddenRef.current;
      if (atTop) {
        nextHidden = false;
      } else if (y > last + 10) {
        nextHidden = true;
      } else if (y < last - 6) {
        nextHidden = false;
      }

      if (hiddenRef.current !== nextHidden) {
        hiddenRef.current = nextHidden;
        setHidden(nextHidden);
      }
      last = y;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { hidden, isAtTop };
}

export function useAppMode() {
  return false; // App is exclusively Anime
}

function UserMenuPopover() {
  const [open, setOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [inPcDisplay, setInPcDisplay] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 64, right: 12 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, openAuthModal } = useAuth();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setInPcDisplay(window.name === "anikume_pc_display_frame");
    }
  }, []);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 140);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const toggleMenu = () => {
    if (!open && anchorRef.current && typeof window !== "undefined") {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: Math.round(rect.bottom + 10),
        right: Math.max(12, Math.round(window.innerWidth - rect.right)),
      });
    }
    setOpen((prev) => !prev);
  };

  // Close when clicking anywhere outside or scrolling anywhere
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onScrollOrMove = () => {
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("scroll", onScrollOrMove, { passive: true, capture: true });
    window.addEventListener("wheel", onScrollOrMove, { passive: true, capture: true });
    window.addEventListener("touchmove", onScrollOrMove, { passive: true, capture: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("scroll", onScrollOrMove, { capture: true });
      window.removeEventListener("wheel", onScrollOrMove, { capture: true });
      window.removeEventListener("touchmove", onScrollOrMove, { capture: true });
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleToggleDisplayMode = () => {
    setOpen(false);
    if (typeof window === "undefined") return;

    if (window.name === "anikume_pc_display_frame" && window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "ANIKUME_EXIT_PC_DISPLAY",
          url: window.location.pathname + window.location.search + window.location.hash,
        },
        "*",
      );
      return;
    }

    try {
      const orientation = (window.screen as any)?.orientation;
      if (orientation && typeof orientation.lock === "function") {
        orientation.lock("landscape").catch(() => {});
      }
    } catch {}

    window.dispatchEvent(new CustomEvent("anikume-pc-display", { detail: { enabled: true } }));
  };

  const isAuthed = mounted && isAuthenticated && !!user;

  return (
    <div ref={anchorRef} className="relative size-11 shrink-0">
      <button
        type="button"
        aria-label="Account"
        title={isAuthed ? user.username : "Account & Settings"}
        onClick={toggleMenu}
        className="relative grid size-11 place-items-center rounded-full bg-white/10 text-white/90 ring-1 ring-white/15 backdrop-blur-[6px] transform-gpu backface-hidden transition hover:bg-white/20 hover:text-white cursor-pointer active:scale-95"
      >
        {isAuthed ? (
          <UserAvatar
            avatarUrl={user.settings?.avatarUrl}
            frameUrl={user.settings?.frameUrl}
            username={user.username}
            size="header"
          />
        ) : (
          <User className="size-5" />
        )}
      </button>

      {mounted &&
        (shouldRender || open) &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: `${pos.top}px`, right: `${pos.right}px` }}
            className={
              "fixed z-[9999] w-[220px] rounded-2xl bg-black/85 p-1.5 ring-1 ring-white/10 shadow-2xl backdrop-blur-xl transform-gpu backface-hidden " +
              (open ? "profile-menu-enter" : "profile-menu-exit pointer-events-none")
            }
          >
            {isAuthed ? (
              <>
                {/* User Details Header */}
                <div className="px-3 py-2 border-b border-white/10 mb-1">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      avatarUrl={user.settings?.avatarUrl}
                      frameUrl={user.settings?.frameUrl}
                      username={user.username}
                      size="sm"
                    />
                    <div className="overflow-hidden">
                      <p className="truncate text-xs font-bold text-white">{user.username}</p>
                      <p className="truncate text-[10px] text-white/50">{user.email}</p>
                    </div>
                  </div>
                </div>

                {/* Menu items: Settings, PC/Mobile Display, and Logout */}
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate({ to: "/settings" });
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    <Settings className="size-4 text-white/70" />
                    <span>Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleDisplayMode}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      {inPcDisplay ? (
                        <Smartphone className="size-4 text-white/70" />
                      ) : (
                        <Monitor className="size-4 text-white/70" />
                      )}
                      <span>{inPcDisplay ? "Mobile Display" : "PC Display"}</span>
                    </span>
                    {!inPcDisplay && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/70">
                        1280×720
                      </span>
                    )}
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                  >
                    <LogOut className="size-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openAuthModal("signin");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <LogIn className="size-4 text-white" />
                  <span>Login</span>
                </button>

                <div className="my-1 border-t border-white/10" />

                <button
                  type="button"
                  onClick={handleToggleDisplayMode}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    {inPcDisplay ? (
                      <Smartphone className="size-4 text-white/70" />
                    ) : (
                      <Monitor className="size-4 text-white/70" />
                    )}
                    <span>{inPcDisplay ? "Mobile Display" : "PC Display"}</span>
                  </span>
                  {!inPcDisplay && (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/70">
                      1280×720
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Header({ forceHidden = false }: { forceHidden?: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  useSearchHotkey(() => setSearchOpen(true));
  const { hidden: hiddenOnScroll, isAtTop } = useHideOnScroll();
  const hidden = isAtTop ? false : forceHidden || hiddenOnScroll;

  return (
    <>
      <header
        className={
          "fixed inset-x-0 top-0 z-50 bg-transparent transition-transform duration-150 ease-out will-change-transform " +
          (hidden ? "-translate-y-full" : "translate-y-0")
        }
      >
        <div className="mx-auto flex max-w-[1500px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
          <Logo className="shrink-0" />
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <IconBtn label="Search" onClick={() => setSearchOpen(true)}>
              <Search className="size-5" />
            </IconBtn>
            <UserMenuPopover />
          </div>
        </div>
      </header>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  title,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className="relative grid size-11 place-items-center rounded-full bg-white/10 text-white/90 ring-1 ring-white/15 backdrop-blur-[6px] transform-gpu backface-hidden transition hover:bg-white/20 hover:text-white active:scale-95 cursor-pointer"
    >
      {children}
    </button>
  );
}
