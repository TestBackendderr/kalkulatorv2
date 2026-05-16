import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Brak dostępu</h2>
        <p style={{ textAlign: "center", marginBottom: "1rem", color: "#64748b" }}>
          Nie masz uprawnień do tej strony.
        </p>
        <Link href="/kalkulator" className="login-btn" style={{ display: "block", textAlign: "center" }}>
          Wróć do kalkulatora
        </Link>
      </div>
    </div>
  );
}
