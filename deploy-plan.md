# BYODB Architecture: Implementation Plan

### Client-Side SQLite WASM + Google Drive Sync

---

## Honest Assessment

> **TL;DR: The architecture is sound. Execute it with one modification — skip the server-side Drive proxy and call the Drive API directly from the browser after token exchange.**

| Risk                 | Reality                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| COOP/COEP headers    | Break third-party iframes, payment widgets, OAuth popups via `window.open()`. Audit your third-party dependencies first.                        |
| SQLite WASM bundle   | ~1.5–3MB WASM binary — requires code-splitting or it tanks initial load.                                                                        |
| OPFS is not a backup | Users who clear site data lose everything. Drive sync is essential, not optional.                                                               |
| OAuth backend        | You still need a persistent server for the token exchange (client secret cannot live in the browser). Vercel/Netlify serverless functions work. |
| Drive rate limits    | 1,000 req/100s per user. Fine for manual sync. Do NOT auto-sync on every write.                                                                 |
| "100% free"          | True for storage. You still need Vercel/Netlify for OAuth. Free tier has limits.                                                                |

---

## Assumed Project Structure

```
/
├── client/                    # React (Vite)
│   ├── src/
│   │   ├── db/                # ← DATABASE LAYER (main changes)
│   │   │   ├── index.ts       # NEW: Worker wrapper
│   │   │   ├── schema.ts      # NEW: One-time schema init
│   │   │   └── sync.ts        # NEW: Export/import/Drive sync
│   │   └── workers/
│   │       └── sqlite.worker.ts  # NEW: SQLite Web Worker
│   ├── public/
│   ├── index.html
│   └── vite.config.ts         # MODIFY: Add dev COOP/COEP headers
├── server/                    # Express
│   ├── routes/
│   │   └── auth.ts            # NEW: OAuth routes
│   └── index.ts               # MODIFY: Add session middleware
├── vercel.json                # NEW: Production COOP/COEP headers
└── .env                       # NEW: OAuth credentials
```

---

## Step 0 — Install Dependencies

```bash
# Client
cd client
npm install @sqlite.org/sqlite-wasm

# Server
cd ../server
npm install express-session googleapis
npm install -D @types/express-session
```

---

## Step 1 — Vite Config (COOP/COEP for Dev)

**`client/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"], // prevent Vite pre-bundling WASM
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
```

> ⚠️ These headers will break any `window.open()` OAuth popups from third parties
> and cross-origin iframes (Stripe, Intercom, etc.). Audit your deps before enabling.

---

## Step 2 — SQLite Web Worker (OPFS)

**`client/src/workers/sqlite.worker.ts`**

```ts
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

type WorkerMessage =
  | { id: number; type: "exec"; sql: string; params?: unknown[] }
  | { id: number; type: "export" }
  | { id: number; type: "import"; buffer: ArrayBuffer };

let db: any = null;

async function init() {
  const sqlite3 = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  });

  if ("OpfsDb" in sqlite3.oo1) {
    db = new sqlite3.oo1.OpfsDb("/app.db");
    console.log("[sqlite-worker] Using OPFS persistent storage");
  } else {
    db = new sqlite3.oo1.DB("/app.db", "ct");
    console.warn("[sqlite-worker] OPFS unavailable, using in-memory DB");
  }
}

const initPromise = init();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  await initPromise;
  const { id, type } = event.data;

  try {
    if (type === "exec") {
      const { sql, params = [] } = event.data as Extract<
        WorkerMessage,
        { type: "exec" }
      >;
      const rows: unknown[][] = [];
      db.exec({
        sql,
        bind: params,
        rowMode: "array",
        callback: (row: unknown[]) => rows.push(row),
      });
      self.postMessage({ id, result: rows });
    } else if (type === "export") {
      const byteArray: Uint8Array = db.serialize();
      self.postMessage({ id, result: byteArray.buffer }, [byteArray.buffer]);
    } else if (type === "import") {
      const { buffer } = event.data as Extract<
        WorkerMessage,
        { type: "import" }
      >;
      db.close();
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle("app.db", { create: true });
      const writable = await (fileHandle as any).createSyncAccessHandle();
      writable.truncate(0);
      writable.write(new Uint8Array(buffer));
      writable.flush();
      writable.close();
      const sqlite3 = await sqlite3InitModule({});
      db = new sqlite3.oo1.OpfsDb("/app.db");
      self.postMessage({ id, result: "ok" });
    }
  } catch (err: any) {
    self.postMessage({ id, error: err.message });
  }
};
```

---

## Step 3 — Database Service Layer

**`client/src/db/index.ts`**

```ts
const worker = new Worker(
  new URL("../workers/sqlite.worker.ts", import.meta.url),
  { type: "module" },
);

let callId = 0;
const pending = new Map<number, { resolve: Function; reject: Function }>();

worker.onmessage = (event) => {
  const { id, result, error } = event.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  error ? p.reject(new Error(error)) : p.resolve(result);
};

function call<T>(message: object, transfer?: Transferable[]): Promise<T> {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transfer ?? []);
  });
}

export const db = {
  exec(sql: string, params?: unknown[]): Promise<unknown[][]> {
    return call({ type: "exec", sql, params });
  },
  async exportBlob(): Promise<Blob> {
    const buffer = await call<ArrayBuffer>({ type: "export" });
    return new Blob([buffer], { type: "application/octet-stream" });
  },
  async importBuffer(buffer: ArrayBuffer): Promise<void> {
    await call<string>({ type: "import", buffer }, [buffer]);
  },
};
```

---

## Step 4 — Sync Utility

**`client/src/db/sync.ts`**

```ts
import { db } from "./index";

// ── Local Backup ──────────────────────────────────────────────────────────────

export async function downloadLocalBackup(): Promise<void> {
  const blob = await db.exportBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-${new Date().toISOString().slice(0, 10)}.db`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreFromFile(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  await db.importBuffer(buffer);
  window.location.reload();
}

// ── Google Drive Sync (direct from browser, no server proxy) ──────────────────

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const FILE_NAME = "app-database.db";

async function getAccessToken(): Promise<string> {
  const res = await fetch("/auth/token");
  if (!res.ok) throw new Error("Not authenticated");
  const { access_token } = await res.json();
  return access_token;
}

async function findExistingFileId(token: string): Promise<string | null> {
  const res = await fetch(
    `${DRIVE_FILES_URL}?spaces=appDataFolder&q=name='${FILE_NAME}'&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const { files } = await res.json();
  return files?.[0]?.id ?? null;
}

export async function syncToDrive(): Promise<void> {
  const token = await getAccessToken();
  const blob = await db.exportBlob();
  const existingId = await findExistingFileId(token);

  const metadata = {
    name: FILE_NAME,
    parents: existingId ? undefined : ["appDataFolder"],
  };
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append("file", blob);

  const url = existingId
    ? `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.statusText}`);
}

export async function syncFromDrive(): Promise<void> {
  const token = await getAccessToken();
  const fileId = await findExistingFileId(token);
  if (!fileId) throw new Error("No backup found in Drive");

  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.statusText}`);

  const buffer = await res.arrayBuffer();
  await db.importBuffer(buffer);
  window.location.reload();
}
```

---

## Step 5 — Schema Init

**`client/src/db/schema.ts`**

```ts
import { db } from "./index";

export async function initSchema(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS your_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now')),
      data TEXT NOT NULL
    );
  `);
}
```

Call `initSchema()` once in your app entry point before rendering.

---

## Step 6 — Google Cloud Console Setup

1. Go to **APIs & Services → Credentials** in Google Cloud Console
2. Create **OAuth 2.0 Client ID** → Web Application
3. Authorized redirect URIs:
   - `https://yourdomain.com/auth/google/callback`
   - `http://localhost:3000/auth/google/callback`
4. Scopes → Add ONLY: `https://www.googleapis.com/auth/drive.appdata`
5. Save `CLIENT_ID` and `CLIENT_SECRET` to your `.env`

**`.env` (server)**

```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
SESSION_SECRET=a_long_random_string_minimum_32_chars
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:3000
```

---

## Step 7 — Express OAuth Routes

**`server/routes/auth.ts`**

```ts
import { Router, Request, Response } from "express";
import { google } from "googleapis";

const router = Router();

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL}/auth/google/callback`,
  );
}

// 1. Redirect to Google consent screen
router.get("/google", (req: Request, res: Response) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.appdata"],
  });
  res.redirect(url);
});

// 2. Handle callback — exchange code for tokens
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code || typeof code !== "string")
    return res.status(400).send("Missing auth code");

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    (req.session as any).tokens = tokens;
    res.redirect(`${process.env.CLIENT_URL}?auth=success`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect(`${process.env.CLIENT_URL}?auth=error`);
  }
});

// 3. Provide fresh access token to browser (auto-refreshes if needed)
router.get("/token", async (req: Request, res: Response) => {
  const tokens = (req.session as any).tokens;
  if (!tokens) return res.status(401).json({ error: "Not authenticated" });

  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);

    if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      (req.session as any).tokens = credentials;
      return res.json({ access_token: credentials.access_token });
    }

    res.json({ access_token: tokens.access_token });
  } catch (err) {
    console.error("Token refresh error:", err);
    res.status(401).json({ error: "Token refresh failed" });
  }
});

router.get("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/status", (req: Request, res: Response) => {
  res.json({ authenticated: !!(req.session as any).tokens });
});

export default router;
```

**`server/index.ts`** — wire up session + routes:

```ts
import express from "express";
import session from "express-session";
import authRouter from "./routes/auth";
import "dotenv/config";

const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/auth", authRouter);
app.listen(3000, () => console.log("Server on :3000"));
```

---

## Step 8 — Deployment Headers

**`vercel.json`**

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ],
  "rewrites": [{ "source": "/auth/:path*", "destination": "/api/auth/:path*" }]
}
```

**`netlify.toml`** (if using Netlify instead)

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"

[[redirects]]
  from = "/auth/*"
  to = "/.netlify/functions/auth/:splat"
  status = 200
```

---

## Implementation Checklist

| #   | Task                         | File                           | Status |
| --- | ---------------------------- | ------------------------------ | ------ |
| 1   | Install deps                 | `package.json`                 | ☐      |
| 2   | Configure Vite dev headers   | `vite.config.ts`               | ☐      |
| 3   | SQLite Web Worker (OPFS)     | `src/workers/sqlite.worker.ts` | ☐      |
| 4   | DB service layer             | `src/db/index.ts`              | ☐      |
| 5   | Sync utility (local + Drive) | `src/db/sync.ts`               | ☐      |
| 6   | Schema init                  | `src/db/schema.ts`             | ☐      |
| 7   | Google Cloud OAuth app setup | Console config                 | ☐      |
| 8   | `.env` with credentials      | `.env`                         | ☐      |
| 9   | Express OAuth routes         | `server/routes/auth.ts`        | ☐      |
| 10  | Session middleware           | `server/index.ts`              | ☐      |
| 11  | Production headers           | `vercel.json` / `netlify.toml` | ☐      |

---

## Key Architectural Decision

> The original plan had Express endpoints **proxying** Drive API calls (download/upload).
> **This is removed.** After the server-side code exchange, the browser calls the Drive API
> directly using the access token from `/auth/token`. This gives you genuine end-to-end
> privacy — your server never touches the user's database file.

```
Original (privacy gap):
  Browser → Your Server → Google Drive

Recommended (true E2E):
  Browser → Your Server (token only) → Google Drive (direct)
```

---

_Upload your project files for path-specific modifications tailored to your exact codebase._
