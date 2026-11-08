import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Pencil,
  AlertTriangle,
  RotateCcw,
  KeyRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { UserAvatar, DEFAULT_AVATAR } from "@/components/UserAvatar";
import { AvatarSliderPicker } from "@/components/AvatarSliderPicker";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const {
    user,
    isAuthenticated,
    openAuthModal,
    updateSettings,
    changeProfile,
    changePassword,
    deleteAccount,
  } = useAuth();

  // Local state initialized from user settings
  const currentAvatar =
    user?.settings?.avatarUrl !== undefined ? user.settings.avatarUrl : DEFAULT_AVATAR;
  const currentFrame = user?.settings?.frameUrl !== undefined ? user.settings.frameUrl : "";
  const currentTitleLang = user?.settings?.titleLanguage || "english";

  const [titleLanguage, setTitleLanguage] = useState<"english" | "romaji" | "native">(
    (currentTitleLang as any) || "english",
  );

  // Profile Form state
  const [usernameInput, setUsernameInput] = useState(user?.username || "");
  const [emailInput, setEmailInput] = useState(user?.email || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password form state
  const [isPasswordSectionOpen, setIsPasswordSectionOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Delete account confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Edit Avatar & Frame Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Sync state when user changes
  useEffect(() => {
    if (user) {
      setUsernameInput(user.username || "");
      setEmailInput(user.email || "");
      if (user.settings?.titleLanguage) {
        setTitleLanguage(user.settings.titleLanguage as any);
      }
    }
  }, [user]);

  // Check if profile inputs are dirty/modified
  const hasProfileChanges =
    Boolean(user) &&
    ((usernameInput || "").trim() !== (user?.username || "") ||
      (emailInput || "").trim().toLowerCase() !== (user?.email || "").toLowerCase());

  // Reset form inputs back to currently saved user data
  const handleResetProfile = () => {
    if (!user) return;
    setUsernameInput(user.username || "");
    setEmailInput(user.email || "");
    toast.info("Changes reset to saved values");
  };

  // Save profile changes (Username & Email simultaneously)
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !hasProfileChanges) return;

    const trimmedUsername = usernameInput.trim();
    const trimmedEmail = emailInput.trim().toLowerCase();

    if (!trimmedUsername) {
      toast.error("Username cannot be empty");
      return;
    }
    if (!trimmedEmail) {
      toast.error("Email cannot be empty");
      return;
    }

    setIsSavingProfile(true);
    const res = await changeProfile(
      trimmedUsername !== user.username ? trimmedUsername : undefined,
      trimmedEmail !== user.email ? trimmedEmail : undefined,
    );
    setIsSavingProfile(false);

    if (!res.success) {
      toast.error(res.error || "Failed to save profile changes");
    }
  };

  // Title preference auto-save
  const handleTitleChange = async (lang: "english" | "romaji" | "native") => {
    setTitleLanguage(lang);
    if (isAuthenticated) {
      await updateSettings({ titleLanguage: lang }, false);
      toast.success(`Title preference set to ${lang.charAt(0).toUpperCase() + lang.slice(1)}`);
    } else {
      localStorage.setItem("anikume_title_preference", lang);
      toast.success(`Title preference set to ${lang.charAt(0).toUpperCase() + lang.slice(1)}`);
    }
  };

  // Avatar select auto-save
  const handleSelectAvatar = async (url: string) => {
    if (!isAuthenticated) return;
    await updateSettings({ avatarUrl: url }, false);
    toast.success("Avatar updated");
  };

  // Frame select auto-save
  const handleSelectFrame = async (frameUrl: string) => {
    if (!isAuthenticated) return;
    await updateSettings({ frameUrl }, false);
    toast.success(frameUrl ? "Frame updated" : "Frame removed");
  };

  // File upload for custom avatar
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image must be less than 4MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const base64 = event.target.result as string;
        await updateSettings({ avatarUrl: base64 }, false);
        toast.success("Profile photo uploaded and saved");
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Password Update
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error("Updated password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Confirm updated password does not match");
      return;
    }

    setIsUpdatingPassword(true);
    const res = await changePassword(currentPassword, newPassword, confirmPassword);
    setIsUpdatingPassword(false);

    if (res.success) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsPasswordSectionOpen(false);
    } else {
      toast.error(res.error || "Failed to update password");
    }
  };

  // Handle Delete Account
  const handleConfirmDelete = async () => {
    setIsDeletingAccount(true);
    const res = await deleteAccount();
    setIsDeletingAccount(false);
    setIsDeleteModalOpen(false);
    if (!res.success) {
      toast.error(res.error || "Failed to delete account");
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-[#09090b] text-foreground pb-24">
        <Header />
        <main className="mx-auto max-w-xl px-4 pt-28">
          <div className="rounded-3xl bg-[#141416] p-8 ring-1 ring-white/10 flex flex-col items-center justify-center text-center shadow-2xl">
            <div className="size-16 rounded-2xl bg-[var(--brand,#df7426)]/10 text-[var(--brand,#df7426)] grid place-items-center mb-4">
              <Shield className="size-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Account Settings</h2>
            <p className="text-sm text-white/50 mb-6 max-w-sm">
              Sign in or create an account to customize your profile, choose anime avatar frames,
              and manage preferences.
            </p>
            <button
              onClick={() => openAuthModal("signin")}
              className="rounded-2xl bg-white text-zinc-950 px-8 py-3 text-sm font-bold shadow-lg transition hover:bg-zinc-200 cursor-pointer active:scale-95"
            >
              Sign In to Continue
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-foreground pb-24">
      <Header />
      <main className="mx-auto max-w-xl px-4 pt-24 pb-12 space-y-6">
        {/* Profile Card with Avatar, Frame & Form */}
        <div className="rounded-[28px] bg-[#141416] ring-1 ring-white/10 p-6 sm:p-8 flex flex-col items-center relative overflow-hidden shadow-2xl">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 size-48 bg-white/5 rounded-full blur-3xl pointer-events-none" />

          {/* Centered Avatar Display */}
          <div className="relative mb-3 flex flex-col items-center z-10">
            <div className="relative p-2">
              <UserAvatar
                avatarUrl={currentAvatar}
                frameUrl={currentFrame}
                username={user.username}
                size="profile"
              />
            </div>

            {/* Edit Pill Button */}
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-[#222222] hover:bg-[#2c2c2c] px-4 py-1.5 text-xs font-semibold text-white/90 transition cursor-pointer active:scale-95 shadow-sm"
            >
              <Pencil className="size-3.5" />
              <span>Edit</span>
            </button>
          </div>

          {/* Account Details Form */}
          <form onSubmit={handleSaveProfile} className="w-full space-y-4 z-10 mt-2">
            {/* Username Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/80 pl-1 block">
                Username (Login ID)
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                maxLength={25}
                placeholder="Username"
                className="w-full rounded-2xl bg-[#0a0a0c] border border-white/10 px-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none transition placeholder:text-white/30"
              />
              <p className="text-[11px] text-white/40 pl-1">
                Set during signup and can be updated here
              </p>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/80 pl-1 block">Email Address</label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-2xl bg-[#0a0a0c] border border-white/10 px-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none transition placeholder:text-white/30"
              />
            </div>

            {/* Action Buttons: Reset & Save Changes */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetProfile}
                disabled={!hasProfileChanges}
                className={cn(
                  "flex-1 rounded-2xl py-3 text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5",
                  hasProfileChanges
                    ? "bg-[#222222] hover:bg-[#2c2c2c] text-white/90 active:scale-98"
                    : "bg-[#1c1c1e] text-white/30 cursor-not-allowed",
                )}
              >
                <RotateCcw className="size-4" />
                <span>Reset</span>
              </button>

              <button
                type="submit"
                disabled={!hasProfileChanges || isSavingProfile}
                className={cn(
                  "flex-1 rounded-2xl py-3 text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow",
                  hasProfileChanges
                    ? "bg-[#e5e5e5] hover:bg-white text-zinc-950 active:scale-98"
                    : "bg-[#252528] text-white/30 cursor-not-allowed",
                )}
              >
                {isSavingProfile ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Title Preference Card */}
        <div className="rounded-[28px] bg-[#141416] ring-1 ring-white/10 p-6 shadow-xl space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--brand,#df7426)]" />
              <span>Title Preference</span>
            </h3>
            <p className="text-xs text-white/50">
              Choose how anime and manga titles are displayed throughout the app
            </p>
          </div>

          <div className="relative flex h-11 w-full rounded-2xl bg-[#0a0a0c] border border-white/10 p-1 overflow-hidden select-none">
            <div
              className="absolute bottom-1 top-1 rounded-xl bg-white transition-all duration-300 ease-out shadow-sm"
              style={{
                width: "calc(33.333% - 5.33px)",
                left:
                  titleLanguage === "english"
                    ? "4px"
                    : titleLanguage === "romaji"
                      ? "calc(33.333% + 2px)"
                      : "calc(66.666% + 1px)",
              }}
            />
            {(["english", "romaji", "native"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => handleTitleChange(lang)}
                className={cn(
                  "relative z-10 flex flex-1 items-center justify-center text-xs font-bold capitalize transition-colors duration-200 cursor-pointer",
                  titleLanguage === lang ? "text-zinc-950" : "text-white/40 hover:text-white/80",
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Change Password Card */}
        <div className="rounded-[28px] bg-[#141416] ring-1 ring-white/10 p-6 shadow-xl overflow-hidden space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="size-4 text-[var(--brand,#df7426)]" />
                <span>Change Password</span>
              </h3>
              <p className="text-xs text-white/50">
                Update your password to keep your account secure
              </p>
            </div>

            {!isPasswordSectionOpen && (
              <button
                type="button"
                onClick={() => setIsPasswordSectionOpen(true)}
                className="rounded-2xl border border-white/10 bg-[#222222] hover:bg-[#2c2c2c] px-4 py-2 text-xs font-bold text-white transition cursor-pointer active:scale-95"
              >
                Change Password
              </button>
            )}
          </div>

          <AnimatePresence>
            {isPasswordSectionOpen && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSavePassword}
                className="pt-4 space-y-4 border-t border-white/5 overflow-hidden"
              >
                {/* Current Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 pl-1 block">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full rounded-2xl bg-[#0a0a0c] border border-white/10 px-4 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none transition pr-10 placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition cursor-pointer"
                    >
                      {showCurrentPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Updated Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 pl-1 block">
                    Updated Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min. 6 chars)"
                      className="w-full rounded-2xl bg-[#0a0a0c] border border-white/10 px-4 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none transition pr-10 placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition cursor-pointer"
                    >
                      {showNewPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Updated Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 pl-1 block">
                    Confirm Updated Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPw ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full rounded-2xl bg-[#0a0a0c] border border-white/10 px-4 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none transition pr-10 placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition cursor-pointer"
                    >
                      {showConfirmPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Password Save / Cancel Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPasswordSectionOpen(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="flex-1 rounded-2xl bg-[#222222] hover:bg-[#2c2c2c] py-3 text-xs font-bold text-white/80 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="flex-1 rounded-2xl bg-[#e5e5e5] hover:bg-white text-zinc-950 py-3 text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow active:scale-98 flex items-center justify-center gap-2"
                  >
                    <KeyRound className="size-4" />
                    <span>{isUpdatingPassword ? "Saving..." : "Save Password"}</span>
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Data & Account Section */}
        <div className="space-y-3">
          <div className="px-1">
            <h3 className="text-base font-bold text-white">Data & Account</h3>
            <p className="text-xs text-white/50">Manage your data and account settings</p>
          </div>

          <div className="rounded-[28px] bg-[#141416] ring-1 ring-white/10 p-6 shadow-xl space-y-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Delete account</h4>
              <p className="text-xs text-white/50 leading-relaxed">
                This action is irreversible. All data will be permanently deleted. We recommend
                downloading your data first.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="w-full rounded-2xl bg-[#e11d48] hover:bg-[#be123c] py-3 text-sm font-bold text-white transition shadow-lg cursor-pointer active:scale-98"
            >
              Delete account
            </button>
          </div>
        </div>
      </main>

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 z-[101] w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] bg-[#141416] border border-white/10 p-6 shadow-2xl text-center space-y-4"
            >
              <div className="size-14 rounded-2xl bg-rose-500/10 text-rose-500 grid place-items-center mx-auto">
                <AlertTriangle className="size-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Account?</h3>
                <p className="text-xs text-white/50 mt-1">
                  Are you sure you want to delete your account? All your history, comments, and
                  preferences will be permanently wiped.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 rounded-2xl bg-[#222222] hover:bg-[#2c2c2c] py-2.5 text-xs font-bold text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeletingAccount}
                  className="flex-1 rounded-2xl bg-rose-600 hover:bg-rose-700 py-2.5 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
                >
                  {isDeletingAccount ? "Deleting..." : "Yes, Delete"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Avatar & Frame Modal with 100 Avatars & Interactive Slider */}
      <AnimatePresence>
        {isEditModalOpen && (
          <AvatarSliderPicker
            currentAvatar={currentAvatar}
            currentFrame={currentFrame}
            username={user.username}
            onSelectAvatar={handleSelectAvatar}
            onSelectFrame={handleSelectFrame}
            onUploadCustom={handleFileUpload}
            onClose={() => setIsEditModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
