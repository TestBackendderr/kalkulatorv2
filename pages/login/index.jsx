import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import LoginForm from "@/components/forms/LoginForm";
import { useAuth } from "@/context/AuthContext";

function extractServerError(err) {
  const status = err?.response?.status;
  const msg = err?.response?.data?.message;

  if (status === 401) return "Nieprawidłowy email lub hasło.";
  if (status === 403) return "Konto zostało zablokowane.";
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg.trim()) return msg;

  if (err?.code === "ERR_NETWORK" || err?.message === "Network Error") {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    return `Brak połączenia z serwerem (${api}).`;
  }
  if (typeof err?.message === "string" && err.message.trim() && !err?.response) {
    return err.message;
  }
  return "Nie udało się zalogować. Spróbuj ponownie.";
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { user, loading, login } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/kalkulator");
    }
  }, [user, loading, router]);

  const handleLogin = async (email, password) => {
    if (!email?.trim() || !password?.trim()) {
      setError("Wprowadź email i hasło.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.push("/kalkulator");
    } catch (err) {
      setError(extractServerError(err));
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
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}
