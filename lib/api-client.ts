"use client";

/** Thin fetch wrapper for client components: JSON in/out, throws Error(message) with the server's friendly text. */
export async function api<T = unknown>(url: string, init: Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data as T;
}
