"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Login failed");
      }

      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user_role", data.role);
      localStorage.setItem("user_id", data.user_id);

      // Role-based redirect
      const roleRoutes: Record<string, string> = {
        faculty:    "/faculty/home",
        student:    "/student/home",
        dept_admin: "/admin/dashboard",
        org_admin:  "/admin/dashboard",
        super_admin:"/admin/dashboard",
      };
      router.push(roleRoutes[data.role] || "/faculty/home");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 24px" }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20, background: "var(--accent-dim)",
          border: "2px solid var(--accent)", display: "flex", alignItems: "center",
          justifyContent: "center", margin: "0 auto 16px"
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
            <circle cx="9" cy="7" r="4"/>
            <path d="M3 21v-2a4 4 0 0 1 4-4h4"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            <path d="m21 21-3-3m0 0a4 4 0 1 0-5.66-5.66A4 4 0 0 0 18 18z"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>AttendAI</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>Smart attendance for your institution</p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input
            className="input"
            type="email"
            placeholder="your@college.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ paddingRight: 48 }}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                display: "flex", alignItems: "center",
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <span>⚠</span> {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ marginTop: 8 }}
        >
          {loading ? (
            <><Loader2 size={18} className="spin" /> Signing in...</>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 32, fontSize: 13, color: "var(--text-muted)" }}>
        Powered by Youdex AttendAI
      </p>

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
