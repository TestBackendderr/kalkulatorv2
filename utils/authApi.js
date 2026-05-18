import { rawApi } from "./axiosInstance";

/** POST /auth/login — backend oczekuje { email, haslo } */
export async function loginRequest(email, password) {
  const res = await rawApi.post("/auth/login", {
    email,
    haslo: password,
  });
  return res.data;
}

/** POST /auth/refresh — cookie refresh_token i/lub body { refreshToken } */
export async function refreshRequest(refreshToken) {
  const res = await rawApi.post(
    "/auth/refresh",
    refreshToken ? { refreshToken } : {},
  );
  return res.data;
}

/** POST /auth/logout — wymaga Bearer accessToken */
export async function logoutRequest(accessToken) {
  return rawApi.post(
    "/auth/logout",
    {},
    accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  );
}
