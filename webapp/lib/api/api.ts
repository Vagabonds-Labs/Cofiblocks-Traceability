/**
 * Lightweight API client with refresh support and automatic retries.
 * No classes. No unnecessary abstractions. Just clean functions.
 */

import { ApiError } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/* ---------------------------------------------
   Single-flight refresh token Promise
   Access tokens are now stored in HttpOnly cookies,
   so we don't need to manage them client-side.
---------------------------------------------- */

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        return false;
      }

      // Access token is now set as a cookie by the backend
      // No need to read it from the response
      return true;
    } catch (err) {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/* ---------------------------------------------
   Core Request Wrapper
---------------------------------------------- */

const isProd = process.env.NEXT_PUBLIC_ENV === "production";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = false
): Promise<T> {

  const normalizedEndpoint = endpoint.startsWith("/")
    ? endpoint
    : `/${endpoint}`

  const url = isProd ? `${API_BASE_URL}${normalizedEndpoint}` : `/api${normalizedEndpoint}`;

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(!isFormData && { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  // Access token is sent automatically via HttpOnly cookie
  // No need to set Authorization header

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Required to send cookies
  });

  // Token expired → try refresh once
  if (response.status === 401 && !retry && !endpoint.includes("/auth/refresh")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry the request - cookies will be sent automatically
      return request<T>(endpoint, { ...options, headers }, true);
    }
  }

  // Handle errors
  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/* ---------------------------------------------
   Error Parser
---------------------------------------------- */

async function parseError(response: Response): Promise<ApiError> {
  let data: any;
  try {
    data = await response.json();
  } catch {
    data = { message: response.statusText };
  }

  return {
    statusCode: response.status,
    message: data.message || "Unexpected error",
    code: data.code,
    // Algunas respuestas de error traen detalle (p. ej. los errores por línea
    // de la importación de caficultores).
    data: data.data,
  };
}

/* ---------------------------------------------
   Public API
---------------------------------------------- */

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: "GET" }),

  post: <T>(endpoint: string, data?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "POST",
      body: data instanceof FormData ? data : JSON.stringify(data),
    }),

  put: <T>(endpoint: string, data?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),

  // Token management is no longer needed - cookies are handled automatically
  setToken: () => {},
  clearToken: () => {},
};
