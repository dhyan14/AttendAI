"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
        faculty: "/faculty/home",
        student: "/student/home",
        dept_admin: "/admin/dashboard",
        org_admin: "/admin/dashboard",
        super_admin: "/admin/dashboard",
      };
      router.push(routes[data.role] ?? "/faculty/home");
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
          width: 76, height: 76, borderRadius: 22,
          background: "var(--accent-dim)", border: "2px solid var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 18px", boxShadow: "0 0 32px var(--accent-glow)"
        }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6">
            <circle cx="9" cy="7" r="4"/>
            <path d="M3 21v-2a4 4 0 0 1 4-4h4"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            <path d="m21 21-3-3m0 0a4 4 0 1 0-5.66-5.66A4 4 0 0 0 18 18z"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>AttendAI</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Smart attendance for your institution</p>
      </div>

      {/* Card */}
      <div className="card" style={{ padding: 24 }}>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              className="input"
              type="email"
              placeholder="your@college.edu"
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
                }}
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginTop: 14 }}>
              <span style={{ fontSize: 16 }}>⚠</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: 20 }}
          >
            {loading
              ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Signing in...</>
              : "Sign In"
            }
          </button>
        </form>
      </div>

      <p style={{ textAlign: "center", marginTop: 28, fontSize: 12, color: "var(--text-muted)" }}>
        Powered by Youdex AttendAI
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
