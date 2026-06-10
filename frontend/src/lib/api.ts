import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";

// Dev: "/api/v1" is proxied to the local backend by Vite (see vite.config.ts).
// Prod (Vercel): set VITE_API_BASE_URL to the full backend API base, e.g.
// https://hrms-backend.onrender.com/api/v1
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // For FormData uploads, the browser must set Content-Type itself so the
  // multipart boundary is included. Strip the JSON default that's baked
  // into `axios.create({ headers: ... })`.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    if (config.headers && "Content-Type" in config.headers) {
      delete (config.headers as Record<string, unknown>)["Content-Type"];
    }
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const auth = useAuthStore.getState();
  if (!auth.refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE}/auth/refresh`, { refresh_token: auth.refreshToken })
      .then((res) => {
        useAuthStore.getState().setTokens(res.data.access_token, res.data.refresh_token);
        return res.data.access_token as string;
      })
      .catch(() => {
        useAuthStore.getState().clear();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const newToken = await tryRefresh();
      if (newToken) {
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newToken}` };
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(err: unknown): string {
  const ax = err as AxiosError<any>;
  const data = ax?.response?.data as any;
  if (data?.error?.message) return data.error.message;
  if (data?.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
  if (ax?.message) return ax.message;
  return "Something went wrong";
}
