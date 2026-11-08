import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  MessageSquare,
  X,
  ThumbsUp,
  ThumbsDown,
  Reply,
  MoreHorizontal,
  Trash2,
  Edit3,
  Eye,
  ArrowUp,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";
import { SharedSelect } from "@/components/SharedSelect";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export interface CommentUser {
  id: string;
  username: string;
  avatarUrl: string;
  frameUrl?: string;
}

export interface CommentReply {
  id: string;
  userId: string;
  replyToUserName: string;
  replyToId?: string;
  text: string;
  isSpoiler?: boolean;
  isEdited?: boolean;
  createdAt: number;
  likes: string[];
  dislikes: string[];
  author?: CommentUser;
}

export interface CommentItem {
  id: string;
  userId: string;
  epNum?: number;
  text: string;
  isSpoiler?: boolean;
  isEdited?: boolean;
  createdAt: number;
  likes: string[];
  dislikes: string[];
  replies: CommentReply[];
  author?: CommentUser;
  isDeleted?: boolean;
}

export interface CommentsSectionProps {
  mediaId: number | string;
  mediaType?: "anime" | "manga";
  currentEp?: number;
  currentCh?: number;
  title?: string;
}

function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function CommentsSection({
  mediaId,
  mediaType = "anime",
  currentEp,
  currentCh,
  title,
}: CommentsSectionProps) {
  const { user, token, isAuthenticated, openAuthModal } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"top" | "newest" | "oldest">("newest");

  // New comment state
  const [newCommentText, setNewCommentText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active reply ID (parent comment ID)
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyIsSpoiler, setReplyIsSpoiler] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editIsSpoiler, setEditIsSpoiler] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Revealed spoilers
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});

  // Collapsed comment threads (default to true to match screenshot where you expand them)
  const [collapsedThreads, setCollapsedThreads] = useState<Record<string, boolean>>({});

  // Menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleClick = () => setOpenMenuId(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Fetch comments
  const fetchComments = async () => {
    try {
      const epParam = currentEp !== undefined ? `&ep=${currentEp}` : "";
      const res = await fetch(`/api/comments?id=${mediaId}${epParam}`);
      if (!res.ok) throw new Error("Failed to load comments");
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);

      // Default collapse all threads initially
      const initialCollapsed: Record<string, boolean> = {};
      if (data.comments) {
        data.comments.forEach((c: any) => {
          initialCollapsed[c.id] = true;
        });
      }
      setCollapsedThreads(initialCollapsed);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    fetchComments();
  }, [mediaId, currentEp]);

  // Post top-level comment
  const handlePostComment = async () => {
    if (!isAuthenticated || !token) {
      openAuthModal("signin");
      return;
    }
    const trimmed = newCommentText.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/comments/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mediaId: String(mediaId),
          text: trimmed,
          isSpoiler,
          epNum: currentEp,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to post comment");
      }

      const data = await res.json();
      if (data.comment) {
        const newCom: CommentItem = {
          ...data.comment,
          author: {
            id: user?.id || "",
            username: user?.username || "User",
            avatarUrl: user?.settings?.avatarUrl || "",
            frameUrl: user?.settings?.frameUrl || "",
          },
          likes: [],
          dislikes: [],
          replies: [],
        };
        setComments((prev) => [newCom, ...prev]);
        setNewCommentText("");
        setIsSpoiler(false);
        toast.success("Comment posted!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Post reply to top-level comment
  const handlePostReply = async (
    commentId: string,
    replyToUserName: string,
    replyToId?: string,
  ) => {
    if (!isAuthenticated || !token) {
      openAuthModal("signin");
      return;
    }
    const trimmed = replyText.trim();
    if (!trimmed) return;

    setIsSubmittingReply(true);
    try {
      const res = await fetch("/api/comments/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mediaId: String(mediaId),
          text: trimmed,
          parentId: commentId,
          replyToUserName,
          replyToId,
          isSpoiler: replyIsSpoiler,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to post reply");
      }

      const data = await res.json();
      if (data.reply) {
        const newRep: CommentReply = {
          ...data.reply,
          author: {
            id: user?.id || "",
            username: user?.username || "User",
            avatarUrl: user?.settings?.avatarUrl || "",
            frameUrl: user?.settings?.frameUrl || "",
          },
          likes: [],
          dislikes: [],
        };

        setComments((prev) =>
          prev.map((c) => {
            if (c.id === commentId) {
              return {
                ...c,
                replies: [...(c.replies || []), newRep],
              };
            }
            return c;
          }),
        );

        setReplyingToId(null);
        setReplyText("");
        setReplyIsSpoiler(false);
        setCollapsedThreads((prev) => ({ ...prev, [commentId]: false }));
        toast.success("Reply posted!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to post reply");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // React (Like/Dislike)
  const handleReact = async (commentId: string, type: "like" | "dislike", replyId?: string) => {
    if (!isAuthenticated || !token || !user?.id) {
      openAuthModal("signin");
      return;
    }
    const currentUserId = user.id;

    // Optimistic update
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        if (replyId) {
          const newReplies = (c.replies || []).map((r) => {
            if (r.id !== replyId) return r;
            const currentLikes = r.likes || [];
            const currentDislikes = r.dislikes || [];
            let nextLikes = [...currentLikes];
            let nextDislikes = [...currentDislikes];

            if (type === "like") {
              if (nextLikes.includes(currentUserId)) {
                nextLikes = nextLikes.filter((id) => id !== currentUserId);
              } else {
                nextLikes.push(currentUserId);
                nextDislikes = nextDislikes.filter((id) => id !== currentUserId);
              }
            } else {
              if (nextDislikes.includes(currentUserId)) {
                nextDislikes = nextDislikes.filter((id) => id !== currentUserId);
              } else {
                nextDislikes.push(currentUserId);
                nextLikes = nextLikes.filter((id) => id !== currentUserId);
              }
            }
            return { ...r, likes: nextLikes, dislikes: nextDislikes };
          });
          return { ...c, replies: newReplies };
        } else {
          const currentLikes = c.likes || [];
          const currentDislikes = c.dislikes || [];
          let nextLikes = [...currentLikes];
          let nextDislikes = [...currentDislikes];

          if (type === "like") {
            if (nextLikes.includes(currentUserId)) {
              nextLikes = nextLikes.filter((id) => id !== currentUserId);
            } else {
              nextLikes.push(currentUserId);
              nextDislikes = nextDislikes.filter((id) => id !== currentUserId);
            }
          } else {
            if (nextDislikes.includes(currentUserId)) {
              nextDislikes = nextDislikes.filter((id) => id !== currentUserId);
            } else {
              nextDislikes.push(currentUserId);
              nextLikes = nextLikes.filter((id) => id !== currentUserId);
            }
          }
          return { ...c, likes: nextLikes, dislikes: nextDislikes };
        }
      }),
    );

    try {
      const url = "/api/comments/react";
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaId: String(mediaId), commentId, replyId, type }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (commentId: string, replyId?: string) => {
    if (!token) return;
    try {
      const url = "/api/comments/delete";

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaId: String(mediaId), commentId, replyId }),
      });

      if (!res.ok) throw new Error("Failed to delete");

      if (replyId) {
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === commentId) {
              return {
                ...c,
                replies: (c.replies || []).filter((r) => r.id !== replyId),
              };
            }
            return c;
          }),
        );
        toast.success("Reply deleted");
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        toast.success("Comment deleted");
      }
    } catch (e) {
      toast.error("Failed to delete comment");
    }
  };

  const handleSaveEdit = async (commentId: string, replyId?: string) => {
    if (!token) return;
    const trimmed = editText.trim();
    if (!trimmed) return;

    setIsSubmittingEdit(true);
    try {
      const url = "/api/comments/edit";

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mediaId: String(mediaId),
          commentId,
          replyId,
          text: trimmed,
          isSpoiler: editIsSpoiler,
        }),
      });

      if (!res.ok) throw new Error("Failed to edit");

      if (replyId) {
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === commentId) {
              return {
                ...c,
                replies: (c.replies || []).map((r) =>
                  r.id === replyId
                    ? { ...r, text: trimmed, isSpoiler: editIsSpoiler, isEdited: true }
                    : r,
                ),
              };
            }
            return c;
          }),
        );
      } else {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, text: trimmed, isSpoiler: editIsSpoiler, isEdited: true }
              : c,
          ),
        );
      }
      setEditingId(null);
      toast.success("Comment updated");
    } catch (e) {
      toast.error("Failed to update comment");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCollapse = (id: string) => {
    setCollapsedThreads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) => {
      if (sortBy === "top") {
        const scoreA = (a.likes?.length || 0) - (a.dislikes?.length || 0);
        const scoreB = (b.likes?.length || 0) - (b.dislikes?.length || 0);
        return scoreB - scoreA;
      }
      if (sortBy === "newest") {
        return b.createdAt - a.createdAt;
      }
      return a.createdAt - b.createdAt;
    });
  }, [comments, sortBy]);

  const totalCommentsCount = useMemo(() => {
    return comments.reduce((acc, curr) => acc + 1 + (curr.replies?.length || 0), 0);
  }, [comments]);

  return (
    <section className="w-full text-white bg-transparent">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 px-1">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full border border-white/10 flex items-center justify-center text-white/50 bg-[#111111]">
            <MessageSquare className="size-4" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {totalCommentsCount} Comments
            </h2>
            <p className="text-[11px] text-white/40 mt-1">
              Talk about this {mediaType === "anime" ? "episode" : "chapter"} without spoiling them
            </p>
          </div>
        </div>

        <div className="w-[140px]">
          <SharedSelect
            value={sortBy}
            onChange={(v) => setSortBy(v as any)}
            align="right"
            options={[
              { value: "top", display: "Top" },
              { value: "newest", display: "Newest" },
              { value: "oldest", display: "Oldest" },
            ]}
          />
        </div>
      </div>

      {/* Main Comment Input Block */}
      <div className="border border-white/10 rounded-[20px] p-3 sm:p-4 bg-transparent mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handlePostComment();
          }}
          className="flex gap-3 relative"
        >
          <div className="shrink-0 pt-1">
            <UserAvatar
              avatarUrl={user?.settings?.avatarUrl}
              frameUrl={user?.settings?.frameUrl}
              username={user?.username || "Guest"}
              size="md"
            />
          </div>
          <div className="flex-1 min-w-0 bg-[#0a0a0a] rounded-2xl border border-white/10 flex flex-col overflow-hidden">
            <textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (newCommentText.trim() && !isSubmitting) {
                    handlePostComment();
                  }
                }
              }}
              placeholder={isAuthenticated ? "Write a comment..." : "Sign in to leave a comment..."}
              disabled={!isAuthenticated}
              rows={3}
              className="w-full bg-transparent p-4 text-sm text-white focus:outline-none resize-none placeholder:text-white/40 disabled:opacity-50"
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              {/* Spoiler Checkbox */}
              <button
                type="button"
                onClick={() => setIsSpoiler(!isSpoiler)}
                disabled={!isAuthenticated}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-full border transition cursor-pointer select-none",
                  isSpoiler
                    ? "border-white/20 text-white"
                    : "border-white/10 text-white/50 hover:bg-white/5 hover:text-white",
                )}
              >
                <div
                  className={cn(
                    "size-3.5 rounded-[4px] flex items-center justify-center border transition-colors",
                    isSpoiler ? "border-white bg-white" : "border-white/30 bg-transparent",
                  )}
                >
                  {isSpoiler && <Check className="size-3 text-black stroke-[3]" />}
                </div>
                <span className="text-xs font-medium">Spoiler</span>
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs text-white/40 font-medium font-mono">
                  {newCommentText.length}/2000
                </span>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault(); // Prevents textarea blur
                      if (newCommentText.trim() && !isSubmitting) {
                        handlePostComment();
                      }
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      if (newCommentText.trim() && !isSubmitting) {
                        handlePostComment();
                      }
                    }}
                    disabled={!newCommentText.trim() || isSubmitting}
                    className={cn(
                      "size-7 sm:size-8 rounded-full flex items-center justify-center transition shadow-sm cursor-pointer disabled:cursor-not-allowed shrink-0",
                      newCommentText.trim()
                        ? "bg-white text-black hover:bg-zinc-200 active:scale-95"
                        : "bg-white/10 text-white/40",
                    )}
                  >
                    <ArrowUp className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuthModal("signin")}
                    className="h-8 px-4 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 transition cursor-pointer"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Comment List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4 py-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="border border-white/10 rounded-[20px] p-4 flex gap-3 animate-pulse"
              >
                <div className="size-10 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-32 rounded bg-white/10" />
                  <div className="h-12 w-full rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="size-14 rounded-2xl bg-white/5 ring-1 ring-white/10 grid place-items-center text-white/30 mb-3">
              <MessageSquare className="size-7" />
            </div>
            <p className="text-sm font-bold text-white/70">No comments yet</p>
            <p className="text-xs text-white/40 mt-1 max-w-xs">
              Be the first to share your thoughts!
            </p>
          </div>
        ) : (
          sortedComments.map((comment) => {
            const isAuthor = user?.id && user.id === comment.userId;
            const hasReplies = comment.replies && comment.replies.length > 0;
            const isCollapsed = collapsedThreads[comment.id];
            const isEditingThis = editingId === comment.id;
            const isSpoilerHidden = comment.isSpoiler && !revealedSpoilers[comment.id];
            const hasLiked = user?.id ? comment.likes?.includes(user.id) : false;
            const hasDisliked = user?.id ? comment.dislikes?.includes(user.id) : false;

            return (
              <div
                key={comment.id}
                className="border border-white/10 rounded-[20px] p-3 sm:p-4 bg-transparent transition-colors hover:bg-white/[0.01]"
              >
                <div className="flex gap-3 relative z-10">
                  {/* Avatar */}
                  <div className="shrink-0 flex flex-col items-center z-10">
                    <UserAvatar
                      avatarUrl={comment.author?.avatarUrl}
                      frameUrl={comment.author?.frameUrl}
                      username={comment.author?.username}
                      size="md"
                    />
                  </div>

                  {/* Comment Body */}
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">
                          {comment.author?.username || "User"}
                        </span>
                        <span className="text-xs text-white/40">{timeAgo(comment.createdAt)}</span>
                        {comment.isEdited && (
                          <span className="text-[10px] text-white/30 italic">(edited)</span>
                        )}
                      </div>

                      {/* Dropdown Menu Toggle */}
                      {isAuthor && !isEditingThis && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === comment.id ? null : comment.id);
                            }}
                            className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>

                          {/* Dropdown */}
                          <AnimatePresence>
                            {openMenuId === comment.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 top-full mt-1 w-32 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(comment.id);
                                    setEditText(comment.text);
                                    setEditIsSpoiler(Boolean(comment.isSpoiler));
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                                >
                                  <Edit3 className="size-4" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDelete(comment.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="size-4" /> Delete
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    {/* Text Content */}
                    {isEditingThis ? (
                      <div className="mt-2 bg-[#111111] border border-white/10 rounded-xl p-3">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (!isSubmittingEdit) handleSaveEdit(comment.id);
                            }
                          }}
                          rows={2}
                          className="w-full bg-transparent text-sm text-white focus:outline-none resize-none"
                        />
                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                          <button
                            type="button"
                            onClick={() => setEditIsSpoiler(!editIsSpoiler)}
                            className={cn(
                              "text-xs px-2.5 py-1 rounded-lg border transition cursor-pointer",
                              editIsSpoiler
                                ? "border-white/20 text-white"
                                : "border-white/10 text-white/50",
                            )}
                          >
                            {editIsSpoiler ? "Spoiler" : "No Spoiler"}
                          </button>
                          <div className="flex gap-2">
                            <span className="text-[10px] text-white/40 font-mono">
                              {editText.length}/2000
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="size-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 cursor-pointer transition shrink-0"
                            >
                              <X className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                if (!isSubmittingEdit && editText.trim())
                                  handleSaveEdit(comment.id);
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                if (!isSubmittingEdit && editText.trim())
                                  handleSaveEdit(comment.id);
                              }}
                              disabled={isSubmittingEdit || !editText.trim()}
                              className={cn(
                                "size-7 sm:size-8 rounded-full flex items-center justify-center transition shadow-sm cursor-pointer disabled:cursor-not-allowed shrink-0",
                                editText.trim()
                                  ? "bg-white text-black hover:bg-zinc-200 active:scale-95"
                                  : "bg-white/10 text-white/40",
                              )}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {isSpoilerHidden ? (
                          <div
                            onClick={() => toggleSpoiler(comment.id)}
                            className="my-1.5 p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs cursor-pointer hover:bg-white/10 transition flex items-center justify-between select-none"
                          >
                            <span className="flex items-center gap-2">
                              <AlertCircle className="size-4" />
                              Spoiler hidden. Click to reveal.
                            </span>
                            <Eye className="size-4 opacity-70" />
                          </div>
                        ) : (
                          <p className="text-[15px] text-white/90 leading-relaxed whitespace-pre-wrap break-words mt-0.5">
                            {comment.text}
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-5 mt-3">
                          <button
                            type="button"
                            onClick={() => handleReact(comment.id, "like")}
                            className={cn(
                              "flex items-center gap-1.5 text-xs font-medium transition cursor-pointer select-none",
                              hasLiked ? "text-white" : "text-white/40 hover:text-white/80",
                            )}
                          >
                            <ThumbsUp className={cn("size-4", hasLiked && "fill-current")} />
                            <span>{comment.likes?.length || 0}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReact(comment.id, "dislike")}
                            className={cn(
                              "flex items-center gap-1.5 text-xs font-medium transition cursor-pointer select-none",
                              hasDisliked ? "text-rose-400" : "text-white/40 hover:text-white/80",
                            )}
                          >
                            <ThumbsDown className={cn("size-4", hasDisliked && "fill-current")} />
                            <span>{comment.dislikes?.length || 0}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!isAuthenticated) {
                                openAuthModal("signin");
                                return;
                              }
                              setReplyingToId(replyingToId === comment.id ? null : comment.id);
                              setReplyText("");
                            }}
                            className={cn(
                              "flex items-center gap-1.5 text-xs font-medium transition cursor-pointer",
                              replyingToId === comment.id
                                ? "text-white"
                                : "text-white/40 hover:text-white/80",
                            )}
                          >
                            <Reply className="size-4" />
                            <span>Reply</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Replies Section */}
                {(hasReplies ||
                  replyingToId === comment.id ||
                  (replyingToId && comment.replies?.find((r) => r.id === replyingToId))) && (
                  <div className="relative mt-3 pl-[42px] sm:pl-12">
                    <div className="relative z-10 space-y-3">
                      {/* Existing Replies */}
                      <AnimatePresence initial={false}>
                        {!isCollapsed && hasReplies && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="space-y-3"
                          >
                            {comment.replies.map((reply) => {
                              const isReplyAuthor = user?.id && user.id === reply.userId;
                              const isReplyEditing = editingId === reply.id;
                              const isReplySpoilerHidden =
                                reply.isSpoiler && !revealedSpoilers[reply.id];
                              const rHasLiked = user?.id ? reply.likes?.includes(user.id) : false;
                              const rHasDisliked = user?.id
                                ? reply.dislikes?.includes(user.id)
                                : false;

                              return (
                                <div
                                  key={reply.id}
                                  className="bg-[#111111] rounded-2xl p-3 flex gap-3 relative"
                                >
                                  <div className="shrink-0 pt-0.5">
                                    <UserAvatar
                                      avatarUrl={reply.author?.avatarUrl}
                                      frameUrl={reply.author?.frameUrl}
                                      username={reply.author?.username}
                                      size="sm"
                                    />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-white">
                                          {reply.author?.username || "User"}
                                        </span>
                                        <span className="text-xs text-white/40">
                                          {timeAgo(reply.createdAt)}
                                        </span>
                                        {reply.isEdited && (
                                          <span className="text-[10px] text-white/30 italic">
                                            (edited)
                                          </span>
                                        )}
                                      </div>

                                      {isReplyAuthor && !isReplyEditing && (
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenMenuId(
                                                openMenuId === reply.id ? null : reply.id,
                                              );
                                            }}
                                            className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer"
                                          >
                                            <MoreHorizontal className="size-4" />
                                          </button>

                                          <AnimatePresence>
                                            {openMenuId === reply.id && (
                                              <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute right-0 top-full mt-1 w-32 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setEditingId(reply.id);
                                                    setEditText(reply.text);
                                                    setEditIsSpoiler(Boolean(reply.isSpoiler));
                                                    setOpenMenuId(null);
                                                  }}
                                                  className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                                                >
                                                  <Edit3 className="size-4" /> Edit
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    handleDelete(comment.id, reply.id);
                                                    setOpenMenuId(null);
                                                  }}
                                                  className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                                                >
                                                  <Trash2 className="size-4" /> Delete
                                                </button>
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
                                      )}
                                    </div>

                                    {isReplyEditing ? (
                                      <div className="mt-2 bg-[#0a0a0a] border border-white/10 rounded-xl p-2.5">
                                        <textarea
                                          value={editText}
                                          onChange={(e) => setEditText(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                              e.preventDefault();
                                              if (!isSubmittingEdit)
                                                handleSaveEdit(comment.id, reply.id);
                                            }
                                          }}
                                          rows={2}
                                          className="w-full bg-transparent text-sm text-white focus:outline-none resize-none"
                                        />
                                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                                          <button
                                            type="button"
                                            onClick={() => setEditIsSpoiler(!editIsSpoiler)}
                                            className={cn(
                                              "text-xs px-2 py-0.5 rounded border transition cursor-pointer",
                                              editIsSpoiler
                                                ? "border-white/20 text-white"
                                                : "border-white/10 text-white/50",
                                            )}
                                          >
                                            {editIsSpoiler ? "Spoiler" : "No Spoiler"}
                                          </button>
                                          <div className="flex gap-2">
                                            <span className="text-[10px] text-white/40 font-mono">
                                              {editText.length}/2000
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setEditingId(null)}
                                              className="px-3 py-1.5 rounded-full text-xs font-semibold text-white/50 hover:text-white hover:bg-white/5 cursor-pointer transition"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              onPointerDown={(e) => {
                                                e.preventDefault();
                                                if (!isSubmittingEdit && editText.trim())
                                                  handleSaveEdit(comment.id, reply.id);
                                              }}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                if (!isSubmittingEdit && editText.trim())
                                                  handleSaveEdit(comment.id, reply.id);
                                              }}
                                              disabled={isSubmittingEdit || !editText.trim()}
                                              className={cn(
                                                "size-7 sm:size-8 rounded-full flex items-center justify-center transition shadow-sm cursor-pointer disabled:cursor-not-allowed shrink-0",
                                                editText.trim()
                                                  ? "bg-white text-black hover:bg-zinc-200 active:scale-95"
                                                  : "bg-white/10 text-white/40",
                                              )}
                                            >
                                              Save
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {isReplySpoilerHidden ? (
                                          <div
                                            onClick={() => toggleSpoiler(reply.id)}
                                            className="my-1 p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs cursor-pointer hover:bg-white/10 transition flex items-center justify-between select-none"
                                          >
                                            <span className="flex items-center gap-1.5">
                                              <AlertCircle className="size-3.5" />
                                              Spoiler. Click to reveal.
                                            </span>
                                            <Eye className="size-3.5 opacity-70" />
                                          </div>
                                        ) : (
                                          <p className="text-[15px] text-white/90 leading-relaxed whitespace-pre-wrap break-words mt-0.5">
                                            {reply.replyToUserName && (
                                              <span className="text-white/60 mr-1.5">
                                                @{reply.replyToUserName}
                                              </span>
                                            )}
                                            {reply.text}
                                          </p>
                                        )}

                                        <div className="flex items-center gap-5 mt-2.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleReact(comment.id, "like", reply.id)
                                            }
                                            className={cn(
                                              "flex items-center gap-1.5 text-xs font-medium transition cursor-pointer select-none",
                                              rHasLiked
                                                ? "text-white"
                                                : "text-white/40 hover:text-white/80",
                                            )}
                                          >
                                            <ThumbsUp
                                              className={cn(
                                                "size-3.5",
                                                rHasLiked && "fill-current",
                                              )}
                                            />
                                            <span>{reply.likes?.length || 0}</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleReact(comment.id, "dislike", reply.id)
                                            }
                                            className={cn(
                                              "flex items-center gap-1.5 text-xs font-medium transition cursor-pointer select-none",
                                              rHasDisliked
                                                ? "text-rose-400"
                                                : "text-white/40 hover:text-white/80",
                                            )}
                                          >
                                            <ThumbsDown
                                              className={cn(
                                                "size-3.5",
                                                rHasDisliked && "fill-current",
                                              )}
                                            />
                                            <span>{reply.dislikes?.length || 0}</span>
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Reply Input Box */}
                      {replyingToId &&
                        (replyingToId === comment.id ||
                          comment.replies?.find((r) => r.id === replyingToId)) && (
                          <div className="bg-[#111111] border border-white/5 rounded-2xl p-3 flex gap-3">
                            <div className="shrink-0 pt-0.5">
                              <UserAvatar
                                avatarUrl={user?.settings?.avatarUrl}
                                frameUrl={user?.settings?.frameUrl}
                                username={user?.username || "Guest"}
                                size="sm"
                              />
                            </div>
                            <div className="flex-1 min-w-0 bg-[#0a0a0a] rounded-xl border border-white/10 flex flex-col overflow-hidden">
                              <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value.slice(0, 2000))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (replyText.trim() && !isSubmittingReply) {
                                      handlePostReply(
                                        comment.id,
                                        replyingToId === comment.id
                                          ? comment.author?.username || "user"
                                          : comment.replies.find((r) => r.id === replyingToId)
                                              ?.author?.username || "user",
                                        replyingToId === comment.id ? undefined : replyingToId,
                                      );
                                    }
                                  }
                                }}
                                placeholder={`Reply to ${
                                  replyingToId === comment.id
                                    ? comment.author?.username
                                    : comment.replies.find((r) => r.id === replyingToId)?.author
                                        ?.username || "user"
                                }...`}
                                rows={1}
                                className="w-full bg-transparent p-3 pb-2 text-[15px] text-white focus:outline-none resize-none placeholder:text-white/40 min-h-[44px]"
                              />
                              <div className="flex items-center justify-between px-2 pb-2">
                                <button
                                  type="button"
                                  onClick={() => setReplyIsSpoiler(!replyIsSpoiler)}
                                  className={cn(
                                    "flex items-center gap-1 px-2 py-1 rounded-full border transition cursor-pointer select-none",
                                    replyIsSpoiler
                                      ? "border-white/20 text-white"
                                      : "border-white/10 text-white/50 hover:bg-white/5 hover:text-white",
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "size-3 rounded-[4px] flex items-center justify-center border transition-colors",
                                      replyIsSpoiler
                                        ? "border-white bg-white"
                                        : "border-white/30 bg-transparent",
                                    )}
                                  >
                                    {replyIsSpoiler && (
                                      <Check className="size-2.5 text-black stroke-[3]" />
                                    )}
                                  </div>
                                  <span className="text-[10px] font-semibold">Spoiler</span>
                                </button>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-white/40 font-mono">
                                    {replyText.length}/2000
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setReplyingToId(null)}
                                      className="size-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 cursor-pointer transition shrink-0"
                                    >
                                      <X className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onPointerDown={(e) => {
                                        e.preventDefault(); // Prevents textarea blur
                                        if (replyText.trim() && !isSubmittingReply) {
                                          handlePostReply(
                                            comment.id,
                                            replyingToId === comment.id
                                              ? comment.author?.username || "user"
                                              : comment.replies.find((r) => r.id === replyingToId)
                                                  ?.author?.username || "user",
                                            replyingToId === comment.id ? undefined : replyingToId,
                                          );
                                        }
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        if (replyText.trim() && !isSubmittingReply) {
                                          handlePostReply(
                                            comment.id,
                                            replyingToId === comment.id
                                              ? comment.author?.username || "user"
                                              : comment.replies.find((r) => r.id === replyingToId)
                                                  ?.author?.username || "user",
                                            replyingToId === comment.id ? undefined : replyingToId,
                                          );
                                        }
                                      }}
                                      disabled={!replyText.trim() || isSubmittingReply}
                                      className={cn(
                                        "size-7 sm:size-8 rounded-full flex items-center justify-center transition shadow-sm cursor-pointer disabled:cursor-not-allowed shrink-0",
                                        replyText.trim()
                                          ? "bg-white text-black hover:bg-zinc-200 active:scale-95"
                                          : "bg-white/10 text-white/40",
                                      )}
                                    >
                                      <ArrowUp className="size-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* Toggle Replies Pill */}
                      {hasReplies && (
                        <button
                          type="button"
                          onClick={() => toggleCollapse(comment.id)}
                          className={cn(
                            "relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer select-none",
                            isCollapsed
                              ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                              : "bg-white/10 text-white hover:bg-white/20",
                          )}
                        >
                          {isCollapsed ? (
                            <>
                              {comment.replies.length}{" "}
                              {comment.replies.length === 1 ? "reply" : "replies"}{" "}
                              <ChevronDown className="size-3.5" />
                            </>
                          ) : (
                            <>
                              Hide replies <ChevronUp className="size-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
