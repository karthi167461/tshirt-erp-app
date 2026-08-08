import type { ApiError as ApiErrorShape } from "@erp/shared";

/**
 * API base URL.
 * - Served over http/https (web app, or served by the local server): same-origin ("").
 * - Bundled in the Tauri desktop shell (tauri:// origin): use the stored server
 *   URL (default http://localhost:4000), configurable for a different office PC.
 */
export function serverBaseUrl(): string {
  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  if (isHttp) return "";
  return localStorage.getItem("erp_server_url") || "http://localhost:4000";
}

export function setServerBaseUrl(url: string) {
  localStorage.setItem("erp_server_url", url.replace(/\/+$/, ""));
}

/** Thrown for any non-2xx response; carries the translatable code + params. */
export class ApiError extends Error {
  code: string;
  params?: Record<string, string | number>;
  constructor(shape: ApiErrorShape) {
    super(shape.code);
    this.code = shape.code;
    this.params = shape.params;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${serverBaseUrl()}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({ code: "error.network" });
  }

  if (!res.ok) {
    let shape: ApiErrorShape = { code: "error.internal" };
    try {
      const json = await res.json();
      if (json?.error) shape = json.error;
    } catch {
      /* keep default */
    }
    throw new ApiError(shape);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
