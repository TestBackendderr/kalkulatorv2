import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import LoginForm from "@/components/forms/LoginForm";
import { useAuth } from "@/context/AuthContext";

function messageFromResponse(data) {
  const msg = data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return "";
}

function isBlockedAccountMessage(text) {
  return /zablokowan/i.test(text || "");
}

/** { text, blocked } — blocked = widoczny alert o blokadzie konta */
function extractLoginError(err) {
  const status = err?.response?.status;
  const serverMsg = messageFromResponse(err?.response?.data);

  if (serverMsg) {
    return {
      text: serverMsg,
      blocked: isBlockedAccountMessage(serverMsg),
    };
  }

  if (status === 403) {
    return { text: "Konto zostało zablokowane.", blocked: true };
  }

  if (status === 401) {
    return { text: "Nieprawidłowy email lub hasło.", blocked: false };
  }

  if (err?.code === "ERR_NETWORK" || err?.message === "Network Error") {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return {
      text: `Brak połączenia z serwerem (${api}).`,
      blocked: false,
    };
  }

  if (typeof err?.message === "string" && err.message.trim() && !err?.response) {
    return { text: err.message, blocked: false };
  }

  return {
    text: "Nie udało się zalogować. Spróbuj ponownie.",
    blocked: false,
  };
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { user, loading, login } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/kalkulator");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (router.query.zablokowane === "1") {
      setBlocked(true);
      setError("Konto jest zablokowane. Skontaktuj się z administratorem.");
    }
  }, [router.query.zablokowane]);

  const handleLogin = async (email, password) => {
    if (!email?.trim() || !password?.trim()) {
      setError("Wprowadź email i hasło.");
      return;
    }

    setError("");
    setBlocked(false);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.push("/kalkulator");
    } catch (err) {
      const info = extractLoginError(err);
      setError(info.text);
      setBlocked(info.blocked);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="login-page">Ładowanie...</div>;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Logowanie — Kalkulator v2</h2>
        <div className="login-form">
          <LoginForm
            onSubmit={handleLogin}
            error={error}
            blocked={blocked}
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}
