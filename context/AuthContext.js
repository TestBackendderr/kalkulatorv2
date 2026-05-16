import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import {
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  setStoredUser,
  setTokens,
  clearAuthStorage,
} from "@/utils/tokenStorage";
import { setOnUnauthorized } from "@/utils/axiosInstance";
import { loginRequest, logoutRequest } from "@/utils/authApi";

/**
 * Dekoduje payload z JWT (base64url) bez weryfikacji podpisu.
 * Zwraca obiekt lub null przy błędzie.
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Sprowadza usera z dowolnego kształtu (response body lub JWT payload)
 * do jednego shape'u:
 *   { id, email, role, rola, imie, nazwisko, firstName, lastName, name }
 */
function normalizeUser(raw) {
  if (!raw) return null;
  // JWT: id jest w polu "sub"
  const id = raw.id ?? raw.sub ?? null;
  const role = raw.rola ?? raw.role ?? null;
  const imie = raw.imie ?? raw.firstName ?? "";
  const nazwisko = raw.nazwisko ?? raw.lastName ?? "";
  const fullName =
    [imie, nazwisko].filter(Boolean).join(" ").trim() ||
    raw.name ||
    raw.email ||
    "";

  return {
    id,
    email: raw.email ?? null,
    role,
    rola: role,
    imie,
    nazwisko,
    firstName: imie,
    lastName: nazwisko,
    name: fullName,
  };
}

function extractTokens(payload = {}) {
  const accessToken = payload.accessToken ?? payload.access_token ?? null;
  const refreshToken = payload.refreshToken ?? payload.refresh_token ?? null;
  return { accessToken, refreshToken };
}

/**
 * Достаём данные юзера из ответа бекенда.
 * Если в ответе нет явного поля user — декодируем из accessToken.
 */
function extractUser(payload = {}, accessToken = null) {
  const explicit =
    payload.user ?? payload.uzytkownik ?? null;

  if (explicit && (explicit.id ?? explicit.sub)) return explicit;

  if (accessToken) {
    const jwtPayload = decodeJwtPayload(accessToken);
    if (jwtPayload) return jwtPayload;
  }

  return payload;
}

const AuthContext = createContext({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(email, password);
    const { accessToken, refreshToken } = extractTokens(data);
    if (!accessToken || !refreshToken) {
      throw new Error("Nieprawidłowa odpowiedź serwera (brak tokenów).");
    }

    setTokens({ accessToken, refreshToken });

    const normalized = normalizeUser(extractUser(data, accessToken));
    setStoredUser(normalized);
    setUserState(normalized);
    return normalized;
  }, []);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    try {
      if (token) await logoutRequest(token);
    } catch {
      /* nawet jeśli backend padnie, czyścimy lokalnie */
    } finally {
      clearAuthStorage();
      setUserState(null);
      routerRef.current?.push("/login");
    }
  }, []);

  // Globalny handler 401 (po nieudanym refreshu) z axios-interceptora.
  useEffect(() => {
    setOnUnauthorized(() => {
      setUserState(null);
      const r = routerRef.current;
      if (r && r.pathname !== "/login") {
        r.replace("/login");
      }
    });
    return () => setOnUnauthorized(null);
  }, []);

  // Hydratacja sesji z localStorage przy starcie.
  useEffect(() => {
    try {
      const access = getAccessToken();
      const refresh = getRefreshToken();
      const stored = getStoredUser();
      if (access && refresh && stored) {
        setUserState(normalizeUser(stored));
      } else {
        clearAuthStorage();
      }
    } catch {
      clearAuthStorage();
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
