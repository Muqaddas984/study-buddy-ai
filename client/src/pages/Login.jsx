import { useState } from "react";
import { api } from "../api";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError(""); setSuccess("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "register") {
      const emailOk = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(form.email.trim());
      if (!emailOk) { setError("Please enter a valid email (e.g. name@gmail.com)."); return; }
      if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    }
    setError(""); setSuccess("");
    setLoading(true);
    try {
      if (mode === "register") {
        await api.register(form);
        setMode("login");
        setSuccess("✓ Account created successfully! Please login.");
      } else {
        const data = await api.login(form);
        localStorage.setItem("token", data.token);
        localStorage.setItem("userName", data.user.name);
        onLogin(data.user.name);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="blob b1"></div>
      <div className="blob b2"></div>
      <div className="blob b3"></div>
      <div className="auth-shell">

        {/* Left branding panel (hidden on mobile) */}
        <div className="auth-brand">
          <div className="brand-inner">
            <h1>📚 Study Buddy</h1>
            <p className="brand-tag">Your AI-powered study partner</p>
            <ul className="brand-points">
              <li>✨ Instant AI summaries of your notes</li>
              <li>📝 Auto-generated quizzes with scoring</li>
              <li>💬 24/7 AI tutor with file & image analysis</li>
              <li>📊 Track your study progress</li>
            </ul>
          </div>
        </div>

        {/* Right form panel */}
        <div className="auth-form-panel">
          <div className="auth-form-inner">
            <h2>{mode === "login" ? "Welcome back 👋" : "Create your account"}</h2>
            <p className="auth-sub">
              {mode === "login"
                ? "Login to continue your learning journey"
                : "Join Study Buddy — it's free"}
            </p>

            <form onSubmit={submit}>
              {mode === "register" && (
                <div className="field">
                  <label>Full Name</label>
                  <input placeholder="Your full name" autoComplete="off" value={form.name}
                    onChange={set("name")} required autoComplete="name" />
                </div>
              )}

              <div className="field">
                <label>Email Address</label>
                <input type="email" placeholder="you@example.com" autoComplete="email" value={form.email}
                  onChange={set("email")} required autoComplete="email" />
              </div>

              <div className="field">
                <label>Password</label>
                <div className="pass-wrap">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder={mode === "register" ? "Minimum 6 characters" : "Your password"}
                    value={form.password} onChange={set("password")}
                    required minLength={6}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button type="button" className="eye" tabIndex={-1}
                    onClick={() => setShowPass(!showPass)}
                    aria-label={showPass ? "Hide password" : "Show password"}>
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {error && <p className="error">⚠️ {error}</p>}
              {success && <p className="success">{success}</p>}

              <button className="btn primary full" disabled={loading}>
                {loading ? <span className="spinner"></span>
                  : mode === "login" ? "Login" : "Create Account"}
              </button>
            </form>

            <p className="switch">
              {mode === "login" ? "New to Study Buddy? " : "Already have an account? "}
              <span onClick={switchMode}>
                {mode === "login" ? "Create an account" : "Login"}
              </span>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}