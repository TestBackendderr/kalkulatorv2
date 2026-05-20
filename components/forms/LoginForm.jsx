import { useState } from "react";

const LoginForm = ({ onSubmit, error, blocked = false, submitting = false }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && blocked ? (
        <div className="login-alert login-alert--blocked" role="alert">
          <span className="login-alert__icon" aria-hidden="true">
            ⛔
          </span>
          <div>
            <strong>Konto zablokowane</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        error && <p className="error">{error}</p>
      )}
      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="Wprowadź email"
          autoComplete="email"
          disabled={submitting}
        />
      </div>
      <div className="form-group">
        <label htmlFor="password">Hasło</label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Wprowadź hasło"
          autoComplete="current-password"
          disabled={submitting}
        />
      </div>
      <button type="submit" className="login-btn" disabled={submitting}>
        {submitting ? "Logowanie…" : "Zaloguj się"}
      </button>
    </form>
  );
};

export default LoginForm;
