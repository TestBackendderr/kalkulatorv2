import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

const STORAGE_KEY = "kalkulatorv2_user";

const AuthContext = createContext({
  user: null,
  loading: true,
  setUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const setUser = (nextUser) => {
    if (nextUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      setUserState(nextUser);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setUserState(null);
    }
  };

  const logout = () => {
    setUser(null);
    router.push("/login");
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUserState(JSON.parse(raw));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
