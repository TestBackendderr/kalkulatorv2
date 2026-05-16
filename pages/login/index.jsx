import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import LoginForm from "@/components/forms/LoginForm";
import { useAuth } from "@/context/AuthContext";
import { authenticateUser } from "@/utils/usersMockStore";

export default function LoginPage() {
  const [error, setError] = useState("");
  const router = useRouter();
  const { user, loading, setUser } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/kalkulator");
    }
  }, [user, loading, router]);

  const handleLogin = (email, password) => {
    if (!email?.trim() || !password?.trim()) {
      setError("Wprowadź email i hasło.");
      return;
    }

    const session = authenticateUser(email, password);
    if (!session) {
      setError("Nieprawidłowy email lub hasło.");
      return;
    }

    setUser(session);
    router.push("/kalkulator");
  };

  if (loading) {
    return <div className="login-page">Ładowanie...</div>;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Logowanie — Kalkulator v2</h2>
        <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 16 }}>
          Demo: admin@sunfee.pl / admin · handlowiec@sunfee.pl / handlowiec
        </p>
        <div className="login-form">
          <LoginForm onSubmit={handleLogin} error={error} />
        </div>
      </div>
    </div>
  );
}
