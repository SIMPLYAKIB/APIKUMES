import { getTurso, initTursoTables } from "./turso";

export interface CommentUser {
  id: string;
  username: string;
  avatarUrl: string;
  frameUrl?: string;
}

export interface CommentReply {
  id: string;
  userId: string;
  replyToUserName?: string;
  replyToId?: string;
  text: string;
  isSpoiler?: boolean;
  isEdited?: boolean;
  createdAt: number;
  likes: string[];
  dislikes: string[];
  author?: CommentUser;
  isDeleted?: boolean;
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

function generateCommentId(prefix: "com" | "rep" = "com"): string {
  const rand = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

function getAuthUserFromHeader(
  authHeader?: string | null,
): { id: string; username: string; email: string } | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    if (decoded?.id) {
      return {
        id: String(decoded.id),
        username: decoded.username || "User",
        email: decoded.email || "",
      };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function resolveUsersMap(userIds: string[]): Promise<Map<string, CommentUser>> {
  const map = new Map<string, CommentUser>();
  if (userIds.length === 0) return map;

  const db = getTurso();
  const placeholders = userIds.map(() => "?").join(",");

  try {
    const result = await db.execute({
      sql: `SELECT id, settings FROM users WHERE json_extract(id, '$.id') IN (${placeholders})`,
      args: userIds,
    });

    for (const row of result.rows) {
      try {
        const uData = JSON.parse(String(row.id));
        let settings: Record<string, any> = {};
        if (row.settings) {
          try {
            settings = JSON.parse(String(row.settings));
          } catch {}
        }
        if (uData?.id) {
          map.set(String(uData.id), {
            id: String(uData.id),
            username: uData.username || "User",
            avatarUrl: settings?.avatarUrl || "/assets/avatars/photo_0.jpg",
            frameUrl: settings?.frameUrl || "",
          });
        }
      } catch {}
    }
  } catch (e) {
    console.error("Error resolving comment user metadata:", e);
  }

  return map;
}

function attachAuthors(comments: CommentItem[], userMap: Map<string, CommentUser>): CommentItem[] {
  return comments.map((c) => {
    const author = userMap.get(String(c.userId)) || {
      id: String(c.userId),
      username: "User",
      avatarUrl: "/assets/avatars/photo_0.jpg",
    };

    const replies = Array.isArray(c.replies)
      ? c.replies.map((r) => ({
          ...r,
          author: userMap.get(String(r.userId)) || {
            id: String(r.userId),
            username: "User",
            avatarUrl: "/assets/avatars/photo_0.jpg",
          },
        }))
      : [];

    return {
      ...c,
      author,
      replies,
    };
  });
}

export async function handleGetComments(mediaId: string, epNum?: number) {
  if (!mediaId) return { status: 400, error: "Media ID is required" };

  await initTursoTables();
  const db = getTurso();

  const result = await db.execute({
    sql: "SELECT comment FROM comments WHERE id = ? LIMIT 1",
    args: [mediaId],
  });

  if (result.rows.length === 0 || !result.rows[0].comment) {
    return {
      status: 200,
      data: {
        success: true,
        comments: [],
        totalCount: 0,
      },
    };
  }

  let rawComments: CommentItem[] = [];
  try {
    rawComments = JSON.parse(String(result.rows[0].comment));
    if (!Array.isArray(rawComments)) rawComments = [];
  } catch {
    rawComments = [];
  }

  if (epNum !== undefined && !isNaN(epNum)) {
    rawComments = rawComments.filter(
      (c) => c.epNum === undefined || c.epNum === null || c.epNum === epNum,
    );
  }

  const userIdsSet = new Set<string>();
  for (const c of rawComments) {
    if (c.userId) userIdsSet.add(String(c.userId));
    if (Array.isArray(c.replies)) {
      for (const r of c.replies) {
        if (r.userId) userIdsSet.add(String(r.userId));
      }
    }
  }

  const userMap = await resolveUsersMap(Array.from(userIdsSet));
  const populatedComments = attachAuthors(rawComments, userMap);

  return {
    status: 200,
    data: {
      success: true,
      comments: populatedComments,
      totalCount: populatedComments.reduce(
        (acc, c) =>
          acc + (c.isDeleted ? 0 : 1) + (c.replies?.filter((r) => !r.isDeleted).length || 0),
        0,
      ),
    },
  };
}

export async function handleAddComment(
  authHeader: string | null,
  body: {
    mediaId: string;
    text: string;
    epNum?: number;
    isSpoiler?: boolean;
    parentId?: string | null;
    parentCommentId?: string | null;
    replyToUserName?: string;
    replyToId?: string;
  },
) {
  const authUser = getAuthUserFromHeader(authHeader);
  if (!authUser) return { status: 401, error: "Please log in to post a comment" };

  const mediaId = String(body.mediaId || "").trim();
  const text = String(body.text || "").trim();
  const epNum = body.epNum !== undefined ? Number(body.epNum) : undefined;
  const isSpoiler = Boolean(body.isSpoiler);
  const parentId = body.parentId
    ? String(body.parentId).trim()
    : body.parentCommentId
      ? String(body.parentCommentId).trim()
      : null;
  const replyToUserName = body.replyToUserName ? String(body.replyToUserName).trim() : undefined;
  const replyToId = body.replyToId ? String(body.replyToId).trim() : undefined;

  if (!mediaId) return { status: 400, error: "Media ID is required" };
  if (!text) return { status: 400, error: "Comment cannot be empty" };
  if (text.length > 2000) return { status: 400, error: "Comment cannot exceed 2000 characters" };

  await initTursoTables();
  const db = getTurso();

  const result = await db.execute({
    sql: "SELECT comment FROM comments WHERE id = ? LIMIT 1",
    args: [mediaId],
  });

  let comments: CommentItem[] = [];
  if (result.rows.length > 0 && result.rows[0].comment) {
    try {
      comments = JSON.parse(String(result.rows[0].comment));
      if (!Array.isArray(comments)) comments = [];
    } catch {
      comments = [];
    }
  }

  let createdReply: CommentReply | null = null;
  let createdComment: CommentItem | null = null;

  if (parentId) {
    const parentIdx = comments.findIndex((c) => c.id === parentId);
    if (parentIdx === -1) return { status: 404, error: "Parent comment not found" };

    const parent = comments[parentIdx];
    if (!Array.isArray(parent.replies)) parent.replies = [];

    createdReply = {
      id: generateCommentId("rep"),
      userId: authUser.id,
      replyToUserName: replyToUserName || parent.author?.username || "User",
      replyToId,
      text,
      isSpoiler,
      createdAt: Date.now(),
      likes: [],
      dislikes: [],
    };
    parent.replies.push(createdReply);
  } else {
    createdComment = {
      id: generateCommentId("com"),
      userId: authUser.id,
      epNum: epNum && !isNaN(epNum) ? epNum : undefined,
      text,
      isSpoiler,
      createdAt: Date.now(),
      likes: [],
      dislikes: [],
      replies: [],
    };
    comments.unshift(createdComment);
  }

  const commentsJson = JSON.stringify(comments);
  await db.execute({
    sql: `
      INSERT INTO comments (id, comment) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET comment = excluded.comment
    `,
    args: [mediaId, commentsJson],
  });

  const userIdsSet = new Set<string>();
  for (const c of comments) {
    if (c.userId) userIdsSet.add(String(c.userId));
    if (Array.isArray(c.replies)) {
      for (const r of c.replies) if (r.userId) userIdsSet.add(String(r.userId));
    }
  }

  const userMap = await resolveUsersMap(Array.from(userIdsSet));
  const populatedComments = attachAuthors(comments, userMap);

  return {
    status: 200,
    data: {
      success: true,
      comments: populatedComments,
      comment: createdComment ? { ...createdComment, author: userMap.get(authUser.id) } : undefined,
      reply: createdReply ? { ...createdReply, author: userMap.get(authUser.id) } : undefined,
      totalCount: populatedComments.reduce(
        (acc, c) =>
          acc + (c.isDeleted ? 0 : 1) + (c.replies?.filter((r) => !r.isDeleted).length || 0),
        0,
      ),
    },
  };
}

export async function handleReactComment(
  authHeader: string | null,
  body: {
    mediaId: string;
    commentId: string;
    replyId?: string;
    reaction?: "like" | "dislike";
    type?: "like" | "dislike";
  },
) {
  const authUser = getAuthUserFromHeader(authHeader);
  if (!authUser) return { status: 401, error: "Please log in to react" };

  const { mediaId, commentId, replyId } = body;
  const reaction = body.reaction || body.type;

  if (!mediaId || !commentId || !reaction)
    return { status: 400, error: "Missing required reaction parameters" };

  await initTursoTables();
  const db = getTurso();

  const result = await db.execute({
    sql: "SELECT comment FROM comments WHERE id = ? LIMIT 1",
    args: [mediaId],
  });

  if (result.rows.length === 0 || !result.rows[0].comment) {
    return { status: 404, error: "Comments not found for this media" };
  }

  let comments: CommentItem[] = [];
  try {
    comments = JSON.parse(String(result.rows[0].comment));
  } catch {
    return { status: 500, error: "Failed to parse comments" };
  }

  const parent = comments.find((c) => c.id === commentId);
  if (!parent) return { status: 404, error: "Comment not found" };

  const target = replyId ? parent.replies?.find((r) => r.id === replyId) : parent;
  if (!target) return { status: 404, error: "Target comment/reply not found" };

  if (!Array.isArray(target.likes)) target.likes = [];
  if (!Array.isArray(target.dislikes)) target.dislikes = [];

  const uid = authUser.id;
  const hasLiked = target.likes.includes(uid);
  const hasDisliked = target.dislikes.includes(uid);

  if (reaction === "like") {
    if (hasLiked) {
      target.likes = target.likes.filter((id) => id !== uid);
    } else {
      target.likes.push(uid);
      target.dislikes = target.dislikes.filter((id) => id !== uid);
    }
  } else if (reaction === "dislike") {
    if (hasDisliked) {
      target.dislikes = target.dislikes.filter((id) => id !== uid);
    } else {
      target.dislikes.push(uid);
      target.likes = target.likes.filter((id) => id !== uid);
    }
  }

  const commentsJson = JSON.stringify(comments);
  await db.execute({
    sql: "UPDATE comments SET comment = ? WHERE id = ?",
    args: [commentsJson, mediaId],
  });

  const userIdsSet = new Set<string>();
  for (const c of comments) {
    if (c.userId) userIdsSet.add(String(c.userId));
    if (Array.isArray(c.replies)) {
      for (const r of c.replies) if (r.userId) userIdsSet.add(String(r.userId));
    }
  }

  const userMap = await resolveUsersMap(Array.from(userIdsSet));
  const populatedComments = attachAuthors(comments, userMap);

  return {
    status: 200,
    data: {
      success: true,
      comments: populatedComments,
      totalCount: populatedComments.reduce(
        (acc, c) =>
          acc + (c.isDeleted ? 0 : 1) + (c.replies?.filter((r) => !r.isDeleted).length || 0),
        0,
      ),
    },
  };
}

export async function handleDeleteComment(
  authHeader: string | null,
  body: {
    mediaId: string;
    commentId: string;
    replyId?: string;
  },
) {
  const authUser = getAuthUserFromHeader(authHeader);
  if (!authUser) return { status: 401, error: "Unauthorized" };

  const { mediaId, commentId, replyId } = body;
  if (!mediaId || !commentId) return { status: 400, error: "Missing required parameters" };

  await initTursoTables();
  const db = getTurso();

  const result = await db.execute({
    sql: "SELECT comment FROM comments WHERE id = ? LIMIT 1",
    args: [mediaId],
  });

  if (result.rows.length === 0 || !result.rows[0].comment)
    return { status: 404, error: "Comments not found" };

  let comments: CommentItem[] = [];
  try {
    comments = JSON.parse(String(result.rows[0].comment));
  } catch {
    return { status: 500, error: "Failed to parse comments" };
  }

  if (replyId) {
    const parent = comments.find((c) => c.id === commentId);
    if (parent && Array.isArray(parent.replies)) {
      const replyIdx = parent.replies.findIndex((r) => r.id === replyId);
      if (replyIdx !== -1) {
        if (String(parent.replies[replyIdx].userId) !== String(authUser.id)) {
          return { status: 403, error: "You can only delete your own replies" };
        }
        parent.replies.splice(replyIdx, 1);
      }
    }
  } else {
    const commentIdx = comments.findIndex((c) => c.id === commentId);
    if (commentIdx !== -1) {
      if (String(comments[commentIdx].userId) !== String(authUser.id)) {
        return { status: 403, error: "You can only delete your own comments" };
      }
      comments.splice(commentIdx, 1);
    }
  }

  const commentsJson = JSON.stringify(comments);
  await db.execute({
    sql: "UPDATE comments SET comment = ? WHERE id = ?",
    args: [commentsJson, mediaId],
  });

  const userIdsSet = new Set<string>();
  for (const c of comments) {
    if (c.userId) userIdsSet.add(String(c.userId));
    if (Array.isArray(c.replies)) {
      for (const r of c.replies) if (r.userId) userIdsSet.add(String(r.userId));
    }
  }

  const userMap = await resolveUsersMap(Array.from(userIdsSet));
  const populatedComments = attachAuthors(comments, userMap);

  return {
    status: 200,
    data: {
      success: true,
      comments: populatedComments,
      totalCount: populatedComments.reduce(
        (acc, c) =>
          acc + (c.isDeleted ? 0 : 1) + (c.replies?.filter((r) => !r.isDeleted).length || 0),
        0,
      ),
    },
  };
}

export async function handleEditComment(
  authHeader: string | null,
  body: {
    mediaId: string;
    commentId: string;
    replyId?: string;
    text: string;
    isSpoiler?: boolean;
  },
) {
  const authUser = getAuthUserFromHeader(authHeader);
  if (!authUser) return { status: 401, error: "Please log in to edit" };

  const { mediaId, commentId, replyId, text, isSpoiler } = body;
  if (!mediaId || !commentId || !text?.trim())
    return { status: 400, error: "Missing required parameters for edit" };

  await initTursoTables();
  const db = getTurso();

  const result = await db.execute({
    sql: "SELECT comment FROM comments WHERE id = ? LIMIT 1",
    args: [mediaId],
  });

  if (result.rows.length === 0 || !result.rows[0].comment)
    return { status: 404, error: "Comments not found" };

  let comments: CommentItem[] = [];
  try {
    comments = JSON.parse(String(result.rows[0].comment));
  } catch {
    return { status: 500, error: "Failed to parse comments" };
  }

  const parent = comments.find((c) => c.id === commentId);
  if (!parent) return { status: 404, error: "Comment not found" };

  if (replyId) {
    const reply = parent.replies?.find((r) => r.id === replyId);
    if (!reply) return { status: 404, error: "Reply not found" };
    if (String(reply.userId) !== String(authUser.id))
      return { status: 403, error: "You can only edit your own replies" };
    reply.text = text.trim();
    reply.isSpoiler = Boolean(isSpoiler);
    reply.isEdited = true;
    reply.createdAt = Date.now();
  } else {
    if (String(parent.userId) !== String(authUser.id))
      return { status: 403, error: "You can only edit your own comments" };
    parent.text = text.trim();
    parent.isSpoiler = Boolean(isSpoiler);
    parent.isEdited = true;
    parent.createdAt = Date.now();
  }

  const commentsJson = JSON.stringify(comments);
  await db.execute({
    sql: "UPDATE comments SET comment = ? WHERE id = ?",
    args: [commentsJson, mediaId],
  });

  const userIdsSet = new Set<string>();
  for (const c of comments) {
    if (c.userId) userIdsSet.add(String(c.userId));
    if (Array.isArray(c.replies)) {
      for (const r of c.replies) if (r.userId) userIdsSet.add(String(r.userId));
    }
  }

  const userMap = await resolveUsersMap(Array.from(userIdsSet));
  const populatedComments = attachAuthors(comments, userMap);

  return {
    status: 200,
    data: {
      success: true,
      comments: populatedComments,
      totalCount: populatedComments.reduce(
        (acc, c) =>
          acc + (c.isDeleted ? 0 : 1) + (c.replies?.filter((r) => !r.isDeleted).length || 0),
        0,
      ),
    },
  };
}
