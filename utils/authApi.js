import { rawApi } from "./axiosInstance";

/** POST /auth/login — backend oczekuje { email, haslo } */
export async function loginRequest(email, password) {
  const res = await rawApi.post("/auth/login", {
    email,
    haslo: password,
  });
  return res.data;
}

/** POST /auth/refresh — wymiana refreshToken na nowy accessToken */
export async function refreshRequest(refreshToken) {
  const res = await rawApi.post("/auth/refresh", { refreshToken });
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
