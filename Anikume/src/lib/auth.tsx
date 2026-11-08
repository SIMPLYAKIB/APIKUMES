import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";

export interface ContinueAnimeItem {
  animeId: number | string;
  animeTitle?: string;
  title?: string;
  animeCover?: string;
  episodeThumbnail?: string;
  image?: string;
  episodeNum: number;
  episodeTitle?: string;
  currentTime?: number;
  duration?: number;
  updatedAt?: number;
  isAdult?: boolean;
}

export interface ContinueMangaItem {
  mangaId: number | string;
  title?: string;
  mangaTitle?: string;
  image?: string;
  cover?: string;
  chapterNum: number;
  chapterId?: string;
  percent?: number;
  progressText?: string;
  updatedAt?: number;
  isAdult?: boolean;
}

export interface ContinueData {
  anime: ContinueAnimeItem[];
  manga: ContinueMangaItem[];
  lastSaved?: number;
}

export interface WatchlistItem {
  id: number | string;
  title: string;
  image: string;
  format?: string;
  status?: string;
  score?: number | null;
  episodes?: number | null;
  chapters?: number | null;
  isAdult?: boolean;
  addedAt: number;
}

export interface UserListData {
  anime: WatchlistItem[];
  manga: WatchlistItem[];
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  settings?: Record<string, any>;
  continue?: ContinueData;
  list?: UserListData;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalMode: "signin" | "signup";
  syncCountdown: number;
  openAuthModal: (mode?: "signin" | "signup") => void;
  closeAuthModal: () => void;
  setAuthModalMode: (mode: "signin" | "signup") => void;
  login: (
    identifier: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  signup: (
    username: string,
    email: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateSettings: (newSettings: Record<string, any>, showToast?: boolean) => Promise<void>;
  changeUsername: (newUsername: string) => Promise<{ success: boolean; error?: string }>;
  changeEmail: (newEmail: string) => Promise<{ success: boolean; error?: string }>;
  changeProfile: (
    newUsername?: string,
    newEmail?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateContinue: (continueData: Partial<ContinueData>) => Promise<void>;
  updateList: (listData: UserListData) => Promise<void>;
  toggleWatchlist: (item: any, type?: "anime" | "manga") => Promise<boolean>;
  isInWatchlist: (id: number | string, type?: "anime" | "manga") => boolean;
  syncNow: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = "anikume_auth_user";
const TOKEN_STORAGE_KEY = "anikume_auth_token";
export const USER_LIST_STORAGE_KEY = "anikume_user_list";

const SYNC_INTERVAL_SECONDS = 300; // 5 minutes

export function getCleanLocalContinue(): ContinueData {
  let anime: ContinueAnimeItem[] = [];
  let manga: ContinueMangaItem[] = [];

  try {
    const rawA = localStorage.getItem("continue_watching_list");
    if (rawA) {
      const parsedA = JSON.parse(rawA);
      if (Array.isArray(parsedA)) {
        anime = parsedA
          .filter((item) => item && (item.animeId || item.id))
          .map((item) => ({
            animeId: item.animeId || item.id,
            animeTitle: item.animeTitle || item.title || "Anime",
            animeCover: item.animeCover || item.image || "",
            episodeThumbnail: item.episodeThumbnail || item.animeCover || item.image || "",
            episodeNum: Number(item.episodeNum) || 1,
            episodeTitle: item.episodeTitle || `Episode ${item.episodeNum || 1}`,
            currentTime: Number(item.currentTime) || 0,
            duration: Number(item.duration) || 0,
            updatedAt: Number(item.updatedAt) || Date.now(),
            isAdult: Boolean(item.isAdult),
          }))
          .slice(0, 30);
      }
    }
  } catch {}

  try {
    const rawM = localStorage.getItem("continue_reading_list");
    if (rawM) {
      const parsedM = JSON.parse(rawM);
      if (Array.isArray(parsedM)) {
        manga = parsedM
          .filter((item) => item && (item.mangaId || item.id))
          .map((item) => ({
            mangaId: item.mangaId || item.id,
            title: item.title || item.mangaTitle || "Manga",
            image: item.image || item.cover || "",
            chapterNum: Number(item.chapterNum) || 1,
            chapterId: String(item.chapterId || item.chapterNum || 1),
            percent: Number(item.percent) || 0,
            progressText: String(item.progressText || ""),
            updatedAt: Number(item.updatedAt) || Date.now(),
            isAdult: Boolean(item.isAdult),
          }))
          .slice(0, 30);
      }
    }
  } catch {}

  return { anime, manga };
}

export function getCleanLocalList(): UserListData {
  try {
    const raw = localStorage.getItem(USER_LIST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        anime: Array.isArray(parsed.anime) ? parsed.anime : [],
        manga: Array.isArray(parsed.manga) ? parsed.manga : [],
      };
    }
  } catch {}
  return { anime: [], manga: [] };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [syncCountdown, setSyncCountdown] = useState<number>(SYNC_INTERVAL_SECONDS);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialSessionSaveRef = useRef(false);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (savedToken) {
        setToken(savedToken);
      }
    } catch {}
    setIsHydrated(true);
  }, []);

  const openAuthModal = useCallback((mode: "signin" | "signup" = "signin") => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  // Save sanitized continue watching to Turso
  const syncContinueToTurso = useCallback(async (userId: string, data: ContinueData) => {
    try {
      const lastSaved = Date.now();
      const payload = { ...data, lastSaved };
      await fetch("/api/auth/save-continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, continueData: payload }),
      });
      localStorage.setItem("continue_last_save_time", lastSaved.toString());
    } catch (e) {
      console.warn("Auto-sync continue error:", e);
    }
  }, []);

  // Save sanitized watchlist to Turso
  const syncListToTurso = useCallback(async (userId: string, data: UserListData) => {
    try {
      await fetch("/api/auth/save-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, listData: data }),
      });
    } catch (e) {
      console.warn("Auto-sync list error:", e);
    }
  }, []);

  // Full manual/periodic sync
  const syncNow = useCallback(async () => {
    if (!user) return;
    const cleanContinue = getCleanLocalContinue();
    const cleanList = getCleanLocalList();
    await Promise.all([
      syncContinueToTurso(user.id, cleanContinue),
      syncListToTurso(user.id, cleanList),
    ]);
    setUser((prev) =>
      prev
        ? {
            ...prev,
            continue: cleanContinue,
            list: cleanList,
          }
        : null,
    );
    setSyncCountdown(SYNC_INTERVAL_SECONDS);
  }, [user, syncContinueToTurso, syncListToTurso]);

  // 5-Minute Auto-Sync Countdown
  useEffect(() => {
    if (!user) {
      setSyncCountdown(SYNC_INTERVAL_SECONDS);
      return;
    }

    const interval = setInterval(() => {
      setSyncCountdown((prev) => {
        if (prev <= 1) {
          // Trigger sync on 0
          syncNow();
          return SYNC_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [user, syncNow]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          const tursoContinue = data.user.continue || { anime: [], manga: [] };
          const dbLastSaved = Number(tursoContinue.lastSaved || 0);
          
          let localLastSaved = Number(localStorage.getItem("continue_last_save_time") || 0);
          const cleanLocal = getCleanLocalContinue();
          const maxLocalUpdate = Math.max(
            0,
            ...cleanLocal.anime.map((a) => a.updatedAt || 0),
            ...cleanLocal.manga.map((m) => m.updatedAt || 0)
          );
          localLastSaved = Math.max(localLastSaved, maxLocalUpdate);

          if (dbLastSaved >= localLastSaved || localLastSaved === 0) {
            const tursoAnime = Array.isArray(tursoContinue.anime)
              ? tursoContinue.anime
              : Array.isArray(tursoContinue)
                ? tursoContinue
                : [];
            const tursoManga = Array.isArray(tursoContinue.manga) ? tursoContinue.manga : [];

            localStorage.setItem("continue_watching_list", JSON.stringify(tursoAnime));
            localStorage.setItem("continue_reading_list", JSON.stringify(tursoManga));
            localStorage.setItem("continue_last_save_time", dbLastSaved.toString());
          } else {
            // Local is newer, update user object and sync to DB
            data.user.continue = cleanLocal;
            fetch("/api/auth/save-continue", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: data.user.id, continueData: { ...cleanLocal, lastSaved: localLastSaved } }),
            }).catch((e) => console.warn("Initial sync up error:", e));
          }

          const tursoList = data.user.list || { anime: [], manga: [] };
          localStorage.setItem(USER_LIST_STORAGE_KEY, JSON.stringify(tursoList));

          setUser(data.user);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));

          window.dispatchEvent(new Event("anikume_continue_update"));
          window.dispatchEvent(new Event("anikume_list_update"));
          window.dispatchEvent(new Event("storage"));
        }
      } else if (res.status === 401) {
        setUser(null);
        setToken(null);
        localStorage.removeItem(USER_STORAGE_KEY);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (e) {
      console.warn("Failed to refresh user auth state:", e);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshUser();
    }
  }, [token, refreshUser]);

  // LOGIN: Replaces current local continue watching with Turso ones
  const login = async (identifier: string, password: string, turnstileToken?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, turnstileToken }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { success: false, error: data.error || "Login failed" };
      }

      const tursoContinue = data.user.continue || { anime: [], manga: [] };
      const dbLastSaved = Number(tursoContinue.lastSaved || 0);

      let localLastSaved = Number(localStorage.getItem("continue_last_save_time") || 0);
      const cleanLocal = getCleanLocalContinue();
      const maxLocalUpdate = Math.max(
        0,
        ...cleanLocal.anime.map((a) => a.updatedAt || 0),
        ...cleanLocal.manga.map((m) => m.updatedAt || 0)
      );
      localLastSaved = Math.max(localLastSaved, maxLocalUpdate);

      if (dbLastSaved >= localLastSaved || localLastSaved === 0) {
        const tursoAnime = Array.isArray(tursoContinue.anime)
          ? tursoContinue.anime
          : Array.isArray(tursoContinue)
            ? tursoContinue
            : [];
        const tursoManga = Array.isArray(tursoContinue.manga) ? tursoContinue.manga : [];

        // Replace local storage with Turso continue watching items
        localStorage.setItem("continue_watching_list", JSON.stringify(tursoAnime));
        localStorage.setItem("continue_reading_list", JSON.stringify(tursoManga));
        localStorage.setItem("continue_last_save_time", dbLastSaved.toString());
      } else {
        // Local is newer, update user object and sync to DB
        data.user.continue = cleanLocal;
        fetch("/api/auth/save-continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.user.id, continueData: { ...cleanLocal, lastSaved: localLastSaved } }),
        }).catch((e) => console.warn("Initial sync up error:", e));
      }

      // Replace local watchlist with Turso list items
      const tursoList = data.user.list || { anime: [], manga: [] };
      localStorage.setItem(USER_LIST_STORAGE_KEY, JSON.stringify(tursoList));

      // Dispatch events so all components immediately show updated Turso continue watching
      window.dispatchEvent(new Event("anikume_continue_update"));
      window.dispatchEvent(new Event("anikume_list_update"));
      window.dispatchEvent(new Event("storage"));

      setUser(data.user);
      setToken(data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);

      setSyncCountdown(SYNC_INTERVAL_SECONDS);

      toast.success(`Welcome back, ${data.user.username}!`);
      setIsAuthModalOpen(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Network error. Please try again." };
    } finally {
      setIsLoading(false);
    }
  };

  // SIGNUP: Preserves local continue watching, initial sync to Turso, starts 5-min cooldown
  const signup = async (
    username: string,
    email: string,
    password: string,
    turnstileToken?: string,
  ) => {
    setIsLoading(true);
    try {
      const initialContinue = getCleanLocalContinue();
      const initialList = getCleanLocalList();

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password,
          turnstileToken,
          continueData: initialContinue,
          listData: initialList,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { success: false, error: data.error || "Sign up failed" };
      }

      setUser(data.user);
      setToken(data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);

      // Start 5-min cooldown
      setSyncCountdown(SYNC_INTERVAL_SECONDS);

      toast.success(`Account created successfully! Welcome, ${data.user.username}.`);
      setIsAuthModalOpen(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Network error. Please try again." };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    toast.info("Logged out successfully");
  };

  const updateSettings = async (newSettings: Record<string, any>, showToast: boolean = true) => {
    if (!user) return;
    try {
      const merged = { ...(user.settings || {}), ...newSettings };
      await fetch("/api/auth/save-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, settings: merged }),
      });
      const updatedUser = { ...user, settings: merged };
      setUser(updatedUser);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      if (showToast) {
        toast.success("Settings saved");
      }
    } catch (e) {
      console.warn("Failed to update settings:", e);
      if (showToast) {
        toast.error("Failed to save settings");
      }
    }
  };

  const changeUsername = async (newUsername: string) => {
    if (!user) return { success: false, error: "Not logged in" };
    try {
      const res = await fetch("/api/auth/change-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, newUsername }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || "Failed to change username" };
      }
      const updatedUser = { ...user, username: data.username };
      setUser(updatedUser);
      if (data.token) {
        setToken(data.token);
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      toast.success("Username updated successfully!");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Failed to update username" };
    }
  };

  const changeEmail = async (newEmail: string) => {
    if (!user) return { success: false, error: "Not logged in" };
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, newEmail }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || "Failed to change email" };
      }
      const updatedUser = { ...user, email: data.email };
      setUser(updatedUser);
      if (data.token) {
        setToken(data.token);
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      toast.success("Email updated successfully!");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Failed to update email" };
    }
  };

  const changeProfile = async (newUsername?: string, newEmail?: string) => {
    if (!user) return { success: false, error: "Not logged in" };
    try {
      const res = await fetch("/api/auth/change-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, newUsername, newEmail }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || "Failed to update profile" };
      }
      const updatedUser = {
        ...user,
        username: data.username || user.username,
        email: data.email || user.email,
      };
      setUser(updatedUser);
      if (data.token) {
        setToken(data.token);
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      toast.success("Changes saved successfully!");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Failed to save profile changes" };
    }
  };

  const deleteAccount = async () => {
    if (!user) return { success: false, error: "Not logged in" };
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || "Failed to delete account" };
      }
      logout();
      toast.success("Account deleted successfully");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Failed to delete account" };
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => {
    if (!user) return { success: false, error: "Not logged in" };
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || "Failed to change password" };
      }
      toast.success("Password changed successfully!");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Failed to update password" };
    }
  };

  const updateContinue = async (continueData: Partial<ContinueData>) => {
    if (!user) return;
    try {
      const current = getCleanLocalContinue();
      const merged: ContinueData = {
        anime: continueData.anime || current.anime,
        manga: continueData.manga || current.manga,
      };
      await syncContinueToTurso(user.id, merged);
      setUser((prev) => (prev ? { ...prev, continue: merged } : null));
    } catch (e) {
      console.warn("Failed to sync continue watching:", e);
    }
  };

  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    const onListChanged = () => setListVersion((v) => v + 1);
    window.addEventListener("anikume_list_update", onListChanged);
    window.addEventListener("storage", onListChanged);
    return () => {
      window.removeEventListener("anikume_list_update", onListChanged);
      window.removeEventListener("storage", onListChanged);
    };
  }, []);

  const updateList = async (listData: UserListData) => {
    try {
      localStorage.setItem(USER_LIST_STORAGE_KEY, JSON.stringify(listData));
      setListVersion((v) => v + 1);
      setUser((prev) => (prev ? { ...prev, list: listData } : null));
      window.dispatchEvent(new Event("anikume_list_update"));
      if (user) {
        await syncListToTurso(user.id, listData);
      }
    } catch (e) {
      console.warn("Failed to update list:", e);
    }
  };

  const isInWatchlist = useCallback(
    (id: number | string, type: "anime" | "manga" = "anime") => {
      if (!isHydrated) return false;
      void listVersion;
      const cleanId = String(id ?? "").trim();
      if (!cleanId) return false;
      const list = getCleanLocalList();
      const targetArr = type === "anime" ? list.anime : list.manga;
      return targetArr.some((item) => String(item.id).trim() === cleanId);
    },
    [listVersion, isHydrated],
  );

  const toggleWatchlist = async (item: any, type: "anime" | "manga" = "anime") => {
    const list = getCleanLocalList();
    const itemId = String(item.id || item.anikume_id || item.animeId || item.mangaId || "").trim();
    if (!itemId) return false;
    const isManga = type === "manga";
    const currentArr = isManga ? list.manga : list.anime;

    const exists = currentArr.some((i) => String(i.id).trim() === itemId);
    let newArr: WatchlistItem[];

    if (exists) {
      newArr = currentArr.filter((i) => String(i.id).trim() !== itemId);
      toast.info(`Removed from ${isManga ? "Reading List" : "Watchlist"}`);
    } else {
      const newItem: WatchlistItem = {
        id: itemId,
        title:
          item.title?.english ||
          item.title?.romaji ||
          item.title ||
          item.animeTitle ||
          item.mangaTitle ||
          "Untitled",
        image:
          item.coverImage?.large ||
          item.coverImage?.extraLarge ||
          item.image ||
          item.animeCover ||
          "",
        format: item.format || (isManga ? "MANGA" : "TV"),
        status: item.status || "",
        score: item.averageScore || item.meanScore || item.score || null,
        episodes: item.episodes || null,
        chapters: item.chapters || null,
        isAdult: Boolean(item.isAdult),
        addedAt: Date.now(),
      };
      newArr = [newItem, ...currentArr];
      toast.success(`Saved to ${isManga ? "Reading List" : "Watchlist"}`);
    }

    const updatedList: UserListData = {
      anime: isManga ? list.anime : newArr,
      manga: isManga ? newArr : list.manga,
    };

    await updateList(updatedList);
    return !exists;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        isAuthModalOpen,
        authModalMode,
        syncCountdown,
        openAuthModal,
        closeAuthModal,
        setAuthModalMode,
        login,
        signup,
        logout,
        refreshUser,
        updateSettings,
        changeUsername,
        changeEmail,
        changeProfile,
        deleteAccount,
        changePassword,
        updateContinue,
        updateList,
        toggleWatchlist,
        isInWatchlist,
        syncNow,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
