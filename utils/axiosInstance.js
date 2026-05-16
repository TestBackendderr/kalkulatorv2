import axios from "axios";
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearAuthStorage,
} from "./tokenStorage";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const SKIP_AUTH_PATHS = ["/auth/login", "/auth/refresh"];

const shouldSkipAuth = (url = "") =>
  SKIP_AUTH_PATHS.some((p) => url.includes(p));

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

/**
 * Raw axios — bez interceptorów. Używany do auth-endpointów
 * (login, refresh, logout) i wewnątrz logiki rotacji tokenów,
 * żeby nie wpadać w nieskończoną pętlę 401 → refresh → 401.
 */
export const rawApi = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

let onUnauthorizedCb = null;

/** AuthContext rejestruje tu callback (np. czyszczenie state + redirect na /login). */
export function setOnUnauthorized(cb) {
  onUnauthorizedCb = typeof cb === "function" ? cb : null;
}

api.interceptors.request.use((config) => {
  if (typeof window === "undefined") return config;
  if (shouldSkipAuth(config.url)) return config;

  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Token refresh z kolejkowaniem równoległych zapytań ───────────────────────

let refreshPromise = null;

async function performRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");

  const res = await rawApi.post("/auth/refresh", { refreshToken });
  const data = res?.data || {};

  const accessToken = data.accessToken ?? data.access_token;
  const newRefresh = data.refreshToken ?? data.refresh_token ?? refreshToken;

  if (!accessToken) {
    throw new Error("Invalid refresh response");
  }

  setTokens({ accessToken, refreshToken: newRefresh });
  return accessToken;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error?.config || {};
    const status = error?.response?.status;

    if (
      status !== 401 ||
      original._retry ||
      shouldSkipAuth(original.url) ||
      typeof window === "undefined"
    ) {
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      clearAuthStorage();
      if (onUnauthorizedCb) {
        try {
          onUnauthorizedCb();
        } catch {
          /* ignore */
        }
      }
      return Promise.reject(error);
    }
  },
);

export default api;
