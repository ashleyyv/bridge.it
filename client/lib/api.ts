/**
 * API base URL. Use NEXT_PUBLIC_API_URL in production (e.g. on Vercel)
 * to point to your deployed backend. Defaults to localhost for development.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
