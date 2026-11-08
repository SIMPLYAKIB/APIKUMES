import { createClient } from "@libsql/client";

const TURSO_DATABASE_URL = "libsql://anikume-anikume.aws-us-east-1.turso.io";
const TURSO_AUTH_TOKEN =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODgwMzMzNTUsImlkIjoiMDFhMDRkZWYtNGQwMS03ZjdjLTk0YjctNTY1ZDVjOGExZjEyIiwia2lkIjoiRFRzUWNzUTdWSEczbk56TG5abWlJaktiU1oxOUVEYkVudTY4S3cxU3cwayIsInJpZCI6IjBmODBlZDhhLTk2YzgtNDZkMC1iYjg0LTkwNmEyMTA4ZDllOSJ9.Zg69ajPtrosDFL7Z7Y7wTF1OBbWbHnMN_7yRE_77QnkSKxDjpz2VKsZS2QLEAY6zHIFbEu9Z-5beITHM402aDQ";

let tursoClient: ReturnType<typeof createClient> | null = null;

export function getTurso() {
  if (!tursoClient) {
    tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL || TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || TURSO_AUTH_TOKEN,
    });
  }
  return tursoClient;
}

let tableInitPromise: Promise<void> | null = null;

export async function initTursoTables() {
  if (!tableInitPromise) {
    tableInitPromise = (async () => {
      const client = getTurso();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          settings TEXT DEFAULT '{}',
          continue TEXT DEFAULT '{"anime":[],"manga":[]}',
          list TEXT DEFAULT '{"anime":[],"manga":[]}'
        );
      `);

      // Ensure list column exists if table was created prior
      try {
        await client.execute(
          `ALTER TABLE users ADD COLUMN list TEXT DEFAULT '{"anime":[],"manga":[]}'`,
        );
      } catch (e) {
        // column already exists
      }

      // Compact comments table: id (media ID) and comment (JSON string of comments)
      await client.execute(`
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          comment TEXT DEFAULT '[]'
        );
      `);
    })();
  }
  return tableInitPromise;
}
