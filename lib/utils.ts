import { clsx, type ClassValue } from "clsx";
import { createHash } from "node:crypto";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function daysAgo(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * 86_400_000);
}

export async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Run `fn` over items with bounded concurrency; never rejects (returns settled results). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
