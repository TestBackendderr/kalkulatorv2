const ACCESS_KEY = "kv2_access_token";
const REFRESH_KEY = "kv2_refresh_token";
const USER_KEY = "kalkulatorv2_user";

const isClient = () => typeof window !== "undefined";

export function getAccessToken() {
  if (!isClient()) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  if (!isClient()) return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens({ accessToken, refreshToken } = {}) {
  if (!isClient()) return;
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  if (!isClient()) return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getStoredUser() {
  if (!isClient()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (!isClient()) return;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function clearAuthStorage() {
  clearTokens();
  setStoredUser(null);
}
