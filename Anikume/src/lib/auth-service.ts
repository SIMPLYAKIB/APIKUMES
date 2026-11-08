import bcrypt from "bcryptjs";
import { getTurso, initTursoTables } from "./turso";

const TURNSTILE_SECRET_KEY = "0x4AAAAAAEhUaJgNY3SWz4UDS9x0TJiSd0w";

// Cache verified tokens so repeated clicks in the same modal session remain verified
const verifiedTokensCache = new Map<string, number>();

export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  const now = Date.now();
  // Clear expired tokens older than 15 mins
  for (const [key, exp] of verifiedTokensCache.entries()) {
    if (now > exp) verifiedTokensCache.delete(key);
  }

  if (verifiedTokensCache.has(token)) {
    return true;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", TURNSTILE_SECRET_KEY);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.success) {
      verifiedTokensCache.set(token, now + 15 * 60 * 1000);
      return true;
    }

    if (
      Array.isArray(data["error-codes"]) &&
      data["error-codes"].includes("timeout-or-duplicate")
    ) {
      return true;
    }

    return Boolean(data.success);
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return true;
  }
}

export type StoredUser = {
  id: string;
  username: string;
  email: string;
  password?: string;
  createdAt?: string;
};

// Generate a clean random user ID
function generateUserId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let randomPart = "";
  for (let i = 0; i < 12; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `usr_${randomPart}`;
}

export function normalizeContinue(data: any): { anime: any[]; manga: any[] } {
  let rawAnime: any[] = [];
  let rawManga: any[] = [];

  if (Array.isArray(data)) {
    // Legacy flat array
    for (const item of data) {
      if (item && (item.mangaId || item.chapterNum || item.chapterId)) {
        rawManga.push(item);
      } else if (item) {
        rawAnime.push(item);
      }
    }
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.anime)) rawAnime = data.anime;
    if (Array.isArray(data.manga)) rawManga = data.manga;
  }

  const cleanAnime = rawAnime
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

  const cleanManga = rawManga
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

  return { anime: cleanAnime, manga: cleanManga };
}

export function normalizeList(data: any): { anime: any[]; manga: any[] } {
  let rawAnime: any[] = [];
  let rawManga: any[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && item.type === "manga") {
        rawManga.push(item);
      } else if (item) {
        rawAnime.push(item);
      }
    }
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.anime)) rawAnime = data.anime;
    if (Array.isArray(data.manga)) rawManga = data.manga;
  }

  const cleanAnime = rawAnime
    .filter((item) => item && (item.id || item.animeId))
    .map((item) => ({
      id: item.id || item.animeId,
      title: item.title || "Anime",
      image: item.image || item.cover || "",
      format: item.format || "TV",
      status: item.status || "",
      score: item.score || null,
      episodes: item.episodes || null,
      isAdult: Boolean(item.isAdult),
      addedAt: Number(item.addedAt) || Date.now(),
    }))
    .slice(0, 100);

  const cleanManga = rawManga
    .filter((item) => item && (item.id || item.mangaId))
    .map((item) => ({
      id: item.id || item.mangaId,
      title: item.title || "Manga",
      image: item.image || item.cover || "",
      format: item.format || "MANGA",
      status: item.status || "",
      score: item.score || null,
      chapters: item.chapters || null,
      isAdult: Boolean(item.isAdult),
      addedAt: Number(item.addedAt) || Date.now(),
    }))
    .slice(0, 100);

  return { anime: cleanAnime, manga: cleanManga };
}

export async function handleSignup(
  body: {
    username?: string;
    email?: string;
    password?: string;
    turnstileToken?: string;
    continueData?: any;
    listData?: any;
  },
  clientIp?: string,
) {
  await initTursoTables();
  const db = getTurso();

  if (body.turnstileToken) {
    const isValidCf = await verifyTurnstileToken(body.turnstileToken, clientIp);
    if (!isValidCf) {
      return { error: "Human verification failed. Please try again.", status: 400 };
    }
  }

  const username = body.username?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!username || username.length < 2) {
    return { error: "Username must be at least 2 characters", status: 400 };
  }
  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address", status: 400 };
  }
  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters", status: 400 };
  }

  // Check if username or email already exists using json_extract
  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE LOWER(json_extract(id, '$.email')) = ? OR LOWER(json_extract(id, '$.username')) = ? LIMIT 1",
    args: [email, username.toLowerCase()],
  });

  if (existing.rows.length > 0) {
    try {
      const parsed = JSON.parse(String(existing.rows[0].id)) as StoredUser;
      if (parsed.email.toLowerCase() === email) {
        return { error: "An account with this email already exists", status: 409 };
      }
    } catch {}
    return { error: "This username is already taken", status: 409 };
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const userId = generateUserId();
  const createdAt = new Date().toISOString();

  const userPayload: StoredUser = {
    id: userId,
    username,
    email,
    password: hashedPassword,
    createdAt,
  };

  const idColValue = JSON.stringify(userPayload);
  const continuePayload = normalizeContinue(body.continueData);
  const listPayload = normalizeList(body.listData);

  await db.execute({
    sql: `INSERT INTO users (id, settings, continue, list) VALUES (?, ?, ?, ?)`,
    args: [idColValue, "{}", JSON.stringify(continuePayload), JSON.stringify(listPayload)],
  });

  // Create a session token
  const token = Buffer.from(
    JSON.stringify({ id: userId, email, username, t: Date.now() }),
  ).toString("base64");

  return {
    status: 200,
    data: {
      success: true,
      token,
      user: {
        id: userId,
        username,
        email,
        settings: {},
        continue: continuePayload,
        list: listPayload,
        createdAt,
      },
    },
  };
}

export async function handleLogin(
  body: {
    identifier?: string;
    password?: string;
    turnstileToken?: string;
  },
  clientIp?: string,
) {
  await initTursoTables();
  const db = getTurso();

  if (body.turnstileToken) {
    const isValidCf = await verifyTurnstileToken(body.turnstileToken, clientIp);
    if (!isValidCf) {
      return { error: "Human verification failed. Please try again.", status: 400 };
    }
  }

  const identifier = body.identifier?.trim().toLowerCase();
  const password = body.password;
  const isEmail = Boolean(identifier && identifier.includes("@"));
  const credentialError = isEmail ? "Wrong password or email" : "Wrong password or username";

  if (!identifier || !password) {
    return { error: "Please fill in all fields", status: 400 };
  }

  const result = await db.execute({
    sql: "SELECT id, settings, continue, list FROM users WHERE LOWER(json_extract(id, '$.email')) = ? OR LOWER(json_extract(id, '$.username')) = ? LIMIT 1",
    args: [identifier, identifier],
  });

  if (result.rows.length === 0) {
    return { error: credentialError, status: 401 };
  }

  const row = result.rows[0];
  let userData: StoredUser | null = null;
  try {
    userData = JSON.parse(String(row.id));
  } catch {
    return { error: "Corrupted user record", status: 500 };
  }

  if (!userData) {
    return { error: credentialError, status: 401 };
  }

  const isMatch = await bcrypt.compare(password, userData.password || "");
  if (!isMatch) {
    return { error: credentialError, status: 401 };
  }

  let settings = {};
  let continueData = { anime: [], manga: [] };
  let listData = { anime: [], manga: [] };
  try {
    settings = JSON.parse(String(row.settings || "{}"));
  } catch (e) {}
  try {
    continueData = normalizeContinue(JSON.parse(String(row.continue || "{}")));
  } catch (e) {}
  try {
    listData = normalizeList(JSON.parse(String(row.list || "{}")));
  } catch (e) {}

  const token = Buffer.from(
    JSON.stringify({
      id: userData.id,
      email: userData.email,
      username: userData.username,
      t: Date.now(),
    }),
  ).toString("base64");

  return {
    status: 200,
    data: {
      success: true,
      token,
      user: {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        settings,
        continue: continueData,
        list: listData,
        createdAt: userData.createdAt,
      },
    },
  };
}

export async function handleGetMe(authHeader?: string | null) {
  if (!authHeader) {
    return { error: "Unauthorized", status: 401 };
  }

  try {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));

    if (!decoded?.id) {
      return { error: "Invalid token", status: 401 };
    }

    await initTursoTables();
    const db = getTurso();
    const result = await db.execute({
      sql: "SELECT id, settings, continue, list FROM users WHERE json_extract(id, '$.id') = ? LIMIT 1",
      args: [decoded.id],
    });

    if (result.rows.length === 0) {
      return { error: "User not found", status: 404 };
    }

    const row = result.rows[0];
    const userData: StoredUser = JSON.parse(String(row.id));
    let settings = {};
    let continueData = { anime: [], manga: [] };
    let listData = { anime: [], manga: [] };
    try {
      settings = JSON.parse(String(row.settings || "{}"));
    } catch (e) {}
    try {
      continueData = normalizeContinue(JSON.parse(String(row.continue || "{}")));
    } catch (e) {}
    try {
      listData = normalizeList(JSON.parse(String(row.list || "{}")));
    } catch (e) {}

    return {
      status: 200,
      data: {
        success: true,
        user: {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          settings,
          continue: continueData,
          list: listData,
          createdAt: userData.createdAt,
        },
      },
    };
  } catch (err: any) {
    return { error: "Invalid authentication token", status: 401 };
  }
}

export async function handleSaveContinue(body: { userId: string; continueData: any }) {
  if (!body.userId) {
    return { error: "User ID required", status: 400 };
  }

  await initTursoTables();
  const db = getTurso();

  const cleanContinue = normalizeContinue(body.continueData);
  const continueJson = JSON.stringify(cleanContinue);

  await db.execute({
    sql: "UPDATE users SET continue = ? WHERE json_extract(id, '$.id') = ?",
    args: [continueJson, body.userId],
  });

  return { status: 200, data: { success: true, continue: cleanContinue } };
}

export async function handleSaveList(body: { userId: string; listData: any }) {
  if (!body.userId) {
    return { error: "User ID required", status: 400 };
  }

  await initTursoTables();
  const db = getTurso();

  const cleanList = normalizeList(body.listData);
  const listJson = JSON.stringify(cleanList);

  await db.execute({
    sql: "UPDATE users SET list = ? WHERE json_extract(id, '$.id') = ?",
    args: [listJson, body.userId],
  });

  return { status: 200, data: { success: true, list: cleanList } };
}

export async function handleSaveSettings(body: { userId: string; settings: any }) {
  if (!body.userId) {
    return { error: "User ID required", status: 400 };
  }

  await initTursoTables();
  const db = getTurso();

  const settingsJson = JSON.stringify(body.settings || {});

  await db.execute({
    sql: "UPDATE users SET settings = ? WHERE json_extract(id, '$.id') = ?",
    args: [settingsJson, body.userId],
  });

  return { status: 200, data: { success: true, settings: body.settings } };
}

export async function handleChangeUsername(body: { userId: string; newUsername: string }) {
  if (!body.userId) return { error: "User ID required", status: 400 };
  const newUsername = body.newUsername?.trim();
  if (!newUsername || newUsername.length < 3) {
    return { error: "Username must be at least 3 characters", status: 400 };
  }
  if (newUsername.length > 25) {
    return { error: "Username cannot exceed 25 characters", status: 400 };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(newUsername)) {
    return {
      error: "Username can only contain letters, numbers, underscores, dashes and dots",
      status: 400,
    };
  }
  await initTursoTables();
  const db = getTurso();

  const userResult = await db.execute({
    sql: "SELECT id FROM users WHERE json_extract(id, '$.id') = ? LIMIT 1",
    args: [body.userId],
  });
  if (userResult.rows.length === 0) {
    return { error: "User not found", status: 404 };
  }
  let userData: StoredUser;
  try {
    userData = JSON.parse(String(userResult.rows[0].id));
  } catch {
    return { error: "Corrupted user record", status: 500 };
  }

  if (userData.username.toLowerCase() !== newUsername.toLowerCase()) {
    const checkTaken = await db.execute({
      sql: "SELECT id FROM users WHERE LOWER(json_extract(id, '$.username')) = ? AND json_extract(id, '$.id') != ? LIMIT 1",
      args: [newUsername.toLowerCase(), body.userId],
    });
    if (checkTaken.rows.length > 0) {
      return {
        error: "This username is already taken. Please choose a unique username.",
        status: 409,
      };
    }
  }
  userData.username = newUsername;

  await db.execute({
    sql: "UPDATE users SET id = ? WHERE json_extract(id, '$.id') = ?",
    args: [JSON.stringify(userData), body.userId],
  });

  const newToken = Buffer.from(
    JSON.stringify({
      id: userData.id,
      email: userData.email,
      username: userData.username,
      t: Date.now(),
    }),
  ).toString("base64");

  return { status: 200, data: { success: true, username: userData.username, token: newToken } };
}

export async function handleChangeEmail(body: { userId: string; newEmail: string }) {
  if (!body.userId) return { error: "User ID required", status: 400 };
  const newEmail = body.newEmail?.trim().toLowerCase();
  if (!newEmail || !newEmail.includes("@") || !newEmail.includes(".")) {
    return { error: "Please enter a valid email address", status: 400 };
  }
  await initTursoTables();
  const db = getTurso();

  const userResult = await db.execute({
    sql: "SELECT id FROM users WHERE json_extract(id, '$.id') = ? LIMIT 1",
    args: [body.userId],
  });
  if (userResult.rows.length === 0) {
    return { error: "User not found", status: 404 };
  }
  let userData: StoredUser;
  try {
    userData = JSON.parse(String(userResult.rows[0].id));
  } catch {
    return { error: "Corrupted user record", status: 500 };
  }

  if (userData.email.toLowerCase() !== newEmail) {
    const checkTaken = await db.execute({
      sql: "SELECT id FROM users WHERE LOWER(json_extract(id, '$.email')) = ? AND json_extract(id, '$.id') != ? LIMIT 1",
      args: [newEmail, body.userId],
    });
    if (checkTaken.rows.length > 0) {
      return { error: "An account with this email address already exists.", status: 409 };
    }
    userData.email = newEmail;
  }

  await db.execute({
    sql: "UPDATE users SET id = ? WHERE json_extract(id, '$.id') = ?",
    args: [JSON.stringify(userData), body.userId],
  });

  const newToken = Buffer.from(
    JSON.stringify({
      id: userData.id,
      email: userData.email,
      username: userData.username,
      t: Date.now(),
    }),
  ).toString("base64");

  return { status: 200, data: { success: true, email: userData.email, token: newToken } };
}

export async function handleChangePassword(body: {
  userId: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}) {
  if (!body.userId) return { error: "User ID required", status: 400 };
  const currentPassword = body.currentPassword || "";
  const newPassword = body.newPassword || "";
  const confirmPassword = body.confirmPassword || "";

  if (!currentPassword) {
    return { error: "Current password is required", status: 400 };
  }
  if (!newPassword || newPassword.length < 6) {
    return { error: "Updated password must be at least 6 characters", status: 400 };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Confirm updated password does not match", status: 400 };
  }

  await initTursoTables();
  const db = getTurso();

  const userResult = await db.execute({
    sql: "SELECT id FROM users WHERE json_extract(id, '$.id') = ? LIMIT 1",
    args: [body.userId],
  });
  if (userResult.rows.length === 0) {
    return { error: "User not found", status: 404 };
  }
  let userData: StoredUser;
  try {
    userData = JSON.parse(String(userResult.rows[0].id));
  } catch {
    return { error: "Corrupted user record", status: 500 };
  }

  const isMatch = await bcrypt.compare(currentPassword, userData.password || "");
  if (!isMatch) {
    return { error: "Current password is incorrect", status: 401 };
  }

  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(newPassword, salt);
  userData.password = hashed;

  await db.execute({
    sql: "UPDATE users SET id = ? WHERE json_extract(id, '$.id') = ?",
    args: [JSON.stringify(userData), body.userId],
  });

  return { status: 200, data: { success: true, message: "Password updated successfully" } };
}

export async function handleChangeProfile(body: {
  userId: string;
  newUsername?: string;
  newEmail?: string;
}) {
  if (!body.userId) return { error: "User ID required", status: 400 };
  const newUsername = body.newUsername?.trim();
  const newEmail = body.newEmail?.trim().toLowerCase();

  await initTursoTables();
  const db = getTurso();

  const userResult = await db.execute({
    sql: "SELECT id FROM users WHERE json_extract(id, '$.id') = ? LIMIT 1",
    args: [body.userId],
  });
  if (userResult.rows.length === 0) {
    return { error: "User not found", status: 404 };
  }
  let userData: StoredUser;
  try {
    userData = JSON.parse(String(userResult.rows[0].id));
  } catch {
    return { error: "Corrupted user record", status: 500 };
  }

  // Check username if changed
  if (newUsername && newUsername.toLowerCase() !== userData.username.toLowerCase()) {
    if (newUsername.length < 3) {
      return { error: "Username must be at least 3 characters", status: 400 };
    }
    if (newUsername.length > 25) {
      return { error: "Username cannot exceed 25 characters", status: 400 };
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(newUsername)) {
      return {
        error: "Username can only contain letters, numbers, underscores, dashes and dots",
        status: 400,
      };
    }
    const checkTaken = await db.execute({
      sql: "SELECT id FROM users WHERE LOWER(json_extract(id, '$.username')) = ? AND json_extract(id, '$.id') != ? LIMIT 1",
      args: [newUsername.toLowerCase(), body.userId],
    });
    if (checkTaken.rows.length > 0) {
      return { error: "This username is already taken", status: 409 };
    }
    userData.username = newUsername;
  }

  // Check email if changed
  if (newEmail && newEmail.toLowerCase() !== userData.email.toLowerCase()) {
    if (!newEmail.includes("@") || !newEmail.includes(".")) {
      return { error: "Please enter a valid email address", status: 400 };
    }
    const checkTaken = await db.execute({
      sql: "SELECT id FROM users WHERE LOWER(json_extract(id, '$.email')) = ? AND json_extract(id, '$.id') != ? LIMIT 1",
      args: [newEmail.toLowerCase(), body.userId],
    });
    if (checkTaken.rows.length > 0) {
      return { error: "An account with this email address already exists", status: 409 };
    }
    userData.email = newEmail;
  }

  await db.execute({
    sql: "UPDATE users SET id = ? WHERE json_extract(id, '$.id') = ?",
    args: [JSON.stringify(userData), body.userId],
  });

  const newToken = Buffer.from(
    JSON.stringify({
      id: userData.id,
      email: userData.email,
      username: userData.username,
      t: Date.now(),
    }),
  ).toString("base64");

  return {
    status: 200,
    data: {
      success: true,
      username: userData.username,
      email: userData.email,
      token: newToken,
    },
  };
}

export async function handleDeleteAccount(body: { userId: string }) {
  if (!body.userId) return { error: "User ID required", status: 400 };
  await initTursoTables();
  const db = getTurso();

  await db.execute({
    sql: "DELETE FROM users WHERE json_extract(id, '$.id') = ?",
    args: [body.userId],
  });

  return { status: 200, data: { success: true, message: "Account deleted successfully" } };
}
