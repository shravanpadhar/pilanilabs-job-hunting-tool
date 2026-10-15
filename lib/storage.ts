import { promises as fs } from "node:fs";
import path from "node:path";
import { env, flags } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

/**
 * Private file storage. Supabase Storage (private bucket + signed URLs) when configured;
 * otherwise a local folder (`.local-storage`) for development only.
 */
const LOCAL_ROOT = path.join(process.cwd(), ".local-storage");
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const sb = supabaseAdmin();
  const { data } = await sb.storage.getBucket(env.storageBucket);
  if (!data) {
    const { error } = await sb.storage.createBucket(env.storageBucket, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

const localPath = (p: string) => path.join(LOCAL_ROOT, ...p.split("/"));

export async function putFile(storagePath: string, body: Buffer, contentType: string): Promise<void> {
  if (flags.supabaseStorage) {
    await ensureBucket();
    const { error } = await supabaseAdmin().storage.from(env.storageBucket).upload(storagePath, body, { contentType, upsert: true });
    if (error) throw error;
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Storage is not configured.");
  const full = localPath(storagePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

/** A short-lived signed URL, or null when running on local storage (stream via readLocalFile instead). */
export async function signedUrl(storagePath: string, expiresInSeconds = 300): Promise<string | null> {
  if (!flags.supabaseStorage) return null;
  const { data, error } = await supabaseAdmin().storage.from(env.storageBucket).createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function readLocalFile(storagePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(localPath(storagePath));
  } catch {
    return null;
  }
}

export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if (flags.supabaseStorage) {
    const { error } = await supabaseAdmin().storage.from(env.storageBucket).remove(paths);
    if (error) log.warn("storage_remove_failed", { message: error.message });
    return;
  }
  await Promise.all(paths.map((p) => fs.rm(localPath(p), { force: true })));
}

/** Delete everything stored under `${userId}/` (used by "Delete my data"). */
export async function removeUserFiles(userId: string): Promise<void> {
  if (flags.supabaseStorage) {
    const sb = supabaseAdmin().storage.from(env.storageBucket);
    for (const folder of ["resumes", "exports"]) {
      const { data } = await sb.list(`${userId}/${folder}`, { limit: 1000 });
      if (data?.length) await sb.remove(data.map((f) => `${userId}/${folder}/${f.name}`));
    }
    return;
  }
  await fs.rm(path.join(LOCAL_ROOT, userId), { recursive: true, force: true });
}
