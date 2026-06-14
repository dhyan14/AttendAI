"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user_role", data.role);
      localStorage.setItem("user_id", data.user_id);

      const routes: Record<string, string> = {
        faculty:    "/faculty/home",
        student:    "/student/home",
        dept_admin: "/admin/dashboard",
        org_admin:  "/admin/dashboard",
        super_admin: "/super/dashboard",
      };
      router.push(routes[data.role] ?? "/faculty/home");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient glow blobs */}
      <div style={{
        position: "absolute", top: -100, left: -100,
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,111,224,0.15) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -80, right: -80,
        width: 250, height: 250, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "40px 24px",
        position: "relative", zIndex: 1,
      }}>

        {/* Logo mark */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22,
            background: "linear-gradient(135deg, rgba(124,111,224,0.2), rgba(168,85,247,0.15))",
            border: "1.5px solid var(--border-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 40px var(--accent-glow)",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" strokeWidth="1.5">
              <circle cx="9" cy="7" r="4"/>
              <path d="M3 21v-2a4 4 0 0 1 4-4h4"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              <path d="m21 21-3-3m0 0a4 4 0 1 0-5.66-5.66A4 4 0 0 0 18 18z"/>
            </svg>
          </div>

          <h1 style={{
            fontSize: 34, fontWeight: 900, marginBottom: 8, letterSpacing: -0.8,
            background: "linear-gradient(135deg, #f0eeff 0%, var(--accent-2) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            AttendAI
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5 }}>
            AI-powered attendance management<br/>for educational institutions
          </p>
        </div>

        {/* Login card */}
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 24,
          padding: "28px 24px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, letterSpacing: -0.3 }}>Welcome back</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>Sign in to continue to your dashboard</p>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="input"
                type="email"
                placeholder="your@institution.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showPwd ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 48 }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{
                    position: "absolute", right: 14, top: "50%",
                    transform: "translateY(-50%)", background: "none",
                    border: "none", cursor: "pointer", color: "var(--text-muted)",
                    display: "flex", alignItems: "center", padding: 0,
                    transition: "color 0.2s",
                  }}
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="alert alert-danger" style={{ marginTop: 16 }}>
                <span style={{ fontSize: 15 }}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: 24, height: 52, fontSize: 15, borderRadius: 14 }}
            >
              {loading
                ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Signing in...</>
                : "Sign In →"
              }
            </button>
          </form>
        </div>

        {/* Demo credentials hint */}
        <div style={{
          marginTop: 20,
          background: "rgba(124,111,224,0.06)",
          border: "1px solid var(--border-accent)",
          borderRadius: 14,
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Sparkles size={13} style={{ color: "var(--accent-2)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-2)", textTransform: "uppercase", letterSpacing: 0.5 }}>Demo Accounts</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { role: "Super Admin",  email: "superadmin@attendai.com", pwd: "SuperAdmin@123" },
              { role: "Faculty",      email: "faculty@svgu.edu",         pwd: "Faculty@123" },
              { role: "Student",      email: "student@svgu.edu",          pwd: "Student@123" },
            ].map((acc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setEmail(acc.email); setPassword(acc.pwd); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "4px 0", borderRadius: 6, width: "100%",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{acc.role}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{acc.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p style={{ textAlign: "center", padding: "0 0 24px", fontSize: 11, color: "var(--text-muted)" }}>
        Powered by Youdex AttendAI · v1.0
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
