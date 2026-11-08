import { useState, useEffect, useRef } from "react";
import { X, Eye, EyeOff, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "../lib/auth";

const TURNSTILE_SITE_KEY = "0x4AAAAAAEhUaLea3ITRgBoP";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        params: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export function AuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalMode,
    setAuthModalMode,
    login,
    signup,
    isLoading,
  } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Turnstile state
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isTurnstileLoaded, setIsTurnstileLoaded] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Load real Cloudflare Turnstile script dynamically
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById("cf-turnstile-script")) {
      setIsTurnstileLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => setIsTurnstileLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize Turnstile widget when modal opens
  useEffect(() => {
    if (!isAuthModalOpen) {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {}
        widgetIdRef.current = null;
      }
      setError(null);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      return;
    }

    setError(null);

    // If Turnstile is already rendered, do not wipe it
    if (widgetIdRef.current) return;

    const timer = setTimeout(() => {
      if (isTurnstileLoaded && window.turnstile && turnstileContainerRef.current) {
        try {
          if (widgetIdRef.current) {
            window.turnstile.remove(widgetIdRef.current);
            widgetIdRef.current = null;
          }
          turnstileContainerRef.current.innerHTML = "";
          widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            theme: "dark",
            callback: (token: string) => {
              setTurnstileToken(token);
            },
            "error-callback": () => {
              console.warn("Turnstile notice");
            },
            "expired-callback": () => {
              // Keep previous verified token in memory to allow continued attempts
            },
          });
        } catch (err) {
          console.warn("Turnstile render exception:", err);
        }
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [isAuthModalOpen, isTurnstileLoaded]);

  const isSignIn = authModalMode === "signin";

  const handleSwitchMode = (newMode: "signin" | "signup") => {
    setError(null);
    setAuthModalMode(newMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignIn) {
      if (!email.trim() || !password) {
        setError("Please fill in all fields");
        return;
      }
      const res = await login(email.trim(), password, turnstileToken || undefined);
      if (!res.success) {
        setError(
          res.error ||
            (email.includes("@") ? "Wrong password or email" : "Wrong password or username"),
        );
      }
    } else {
      if (!username.trim() || !email.trim() || !password || !confirmPassword) {
        setError("Please fill in all fields");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
      const res = await signup(
        username.trim(),
        email.trim(),
        password,
        turnstileToken || undefined,
      );
      if (!res.success) {
        setError(res.error || "Failed to create account");
      }
    }
  };

  return (
    <AnimatePresence>
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            onClick={closeAuthModal}
          />

          {/* Modal Container */}
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{
              type: "spring",
              damping: 28,
              stiffness: 360,
            }}
            className="relative w-full max-w-[390px] rounded-3xl bg-[#0f1117]/95 p-6 sm:p-7 ring-1 ring-white/10 shadow-2xl backdrop-blur-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={closeAuthModal}
              aria-label="Close modal"
              className="absolute right-5 top-5 grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer z-10"
            >
              <X className="size-5" />
            </button>

            {/* Header with Logo & Mode Title */}
            <div className="mb-5 text-center">
              <div className="flex items-center justify-center mb-2.5">
                <img
                  src="/logo.png"
                  alt="AniKume"
                  className="h-9 sm:h-10 w-auto object-contain select-none"
                  draggable={false}
                />
              </div>

              <motion.div
                key={authModalMode}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-xs font-medium text-white/70">
                  {isSignIn ? "Welcome back!" : "Create your account"}
                </p>
              </motion.div>
            </div>

            {/* Error Banner */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  className="mb-4 rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-rose-400 ring-1 ring-rose-500/20 overflow-hidden"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <AnimatePresence initial={false}>
                {!isSignIn && (
                  <motion.div
                    key="username-input"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <input
                      type="text"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="w-full h-11 rounded-xl bg-white/[0.06] px-4 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--brand,#df7426)] focus:outline-none transition"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <input
                  type={isSignIn ? "text" : "email"}
                  placeholder={isSignIn ? "Email or Username" : "Email"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-11 rounded-xl bg-white/[0.06] px-4 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--brand,#df7426)] focus:outline-none transition"
                />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-11 rounded-xl bg-white/[0.06] px-4 pr-11 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--brand,#df7426)] focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {!isSignIn && (
                  <motion.div
                    key="confirm-password-input"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full h-11 rounded-xl bg-white/[0.06] px-4 text-sm text-white placeholder:text-white/40 ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--brand,#df7426)] focus:outline-none transition"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Real Cloudflare Turnstile container */}
              <div className="flex justify-center my-1 empty:hidden">
                <div ref={turnstileContainerRef} />
              </div>

              {/* Submit CTA Button */}
              <motion.button
                layout
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-[var(--brand,#df7426)] text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-3"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isSignIn ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </motion.button>
            </form>

            {/* Switch Mode - clean white text */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => handleSwitchMode(isSignIn ? "signup" : "signin")}
                className="text-xs font-semibold text-white hover:text-white/80 underline decoration-white/30 underline-offset-4 transition cursor-pointer"
              >
                {isSignIn ? "Sign Up" : "Sign In"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
