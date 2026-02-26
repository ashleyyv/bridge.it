/**
 * API base URL. Use NEXT_PUBLIC_API_URL in production (e.g. on Vercel)
 * to point to your deployed backend. Defaults to localhost for development.
 *
 * In dev, Next.js rewrites /api/* to the backend, so we use relative URLs
 * to avoid CORS and ensure requests hit the backend via the proxy.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  // Use relative URL so Next.js rewrites proxy to backend (avoids 404 on wrong server)
  if (typeof window !== "undefined" && p.startsWith("/api")) {
    return p;
  }
  const base = API_BASE.replace(/\/$/, "");
  return `${base}${p}`;
}

/** Fetch JSON safely; avoids "Unexpected token I" when server returns non-JSON (e.g. "Internal Server Error"). */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: T | undefined;
  try {
    data = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    return { ok: false, error: res.ok ? "Invalid JSON response" : text || `HTTP ${res.status}` };
  }
  return { ok: res.ok, data, error: res.ok ? undefined : (data && typeof data === "object" && "message" in data ? String((data as { message?: unknown }).message) : text || `HTTP ${res.status}`) };
}
