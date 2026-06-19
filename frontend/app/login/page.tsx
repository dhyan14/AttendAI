"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Zap, ChevronRight, Cpu } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      localStorage.setItem("user_email", email);
      document.cookie = `user_role=${data.role}; path=/; max-age=2592000; SameSite=Lax`;

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

  const demoAccounts = [
    { role: "Super Admin",  email: "superadmin@attendai.com", pwd: "SuperAdmin@123", color: "#f5a623" },
    { role: "Faculty",      email: "faculty@svgu.edu",         pwd: "Faculty@123",   color: "#00d4ff" },
    { role: "Student",      email: "student@svgu.edu",          pwd: "Student@123",  color: "#10d97a" },
  ];

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#060a10",
      position: "relative",
      overflow: "hidden",
      padding: "20px",
    }}>

      {/* Animated grid background */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        animation: "gridPan 20s linear infinite",
        pointerEvents: "none",
      }} />

      {/* Radial ambient glows */}
      <div style={{
        position: "absolute", top: "-20%", left: "-10%",
        width: "50vw", height: "50vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)",
        pointerEvents: "none", animation: "blobFloat1 8s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "-15%", right: "-10%",
        width: "40vw", height: "40vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,240,208,0.06) 0%, transparent 70%)",
        pointerEvents: "none", animation: "blobFloat2 10s ease-in-out infinite",
      }} />

      {/* Corner tech decorations */}
      <div style={{ position: "absolute", top: 20, left: 20, pointerEvents: "none", opacity: 0.3 }}>
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <path d="M0 60 L0 0 L60 0" stroke="#00d4ff" strokeWidth="1.5"/>
          <circle cx="0" cy="0" r="4" fill="#00d4ff"/>
        </svg>
      </div>
      <div style={{ position: "absolute", bottom: 20, right: 20, pointerEvents: "none", opacity: 0.3, transform: "rotate(180deg)" }}>
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <path d="M0 60 L0 0 L60 0" stroke="#00f0d0" strokeWidth="1.5"/>
          <circle cx="0" cy="0" r="4" fill="#00f0d0"/>
        </svg>
      </div>

      {/* Main card */}
      <div style={{
        width: "100%", maxWidth: 420,
        position: "relative", zIndex: 1,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 0.5s, transform 0.5s cubic-bezier(0.22,1,0.36,1)",
      }}>

        {/* Logo section */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 76, height: 76,
            borderRadius: 24,
            background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,240,208,0.10))",
            border: "1.5px solid rgba(0,212,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 40px rgba(0,212,255,0.25), inset 0 0 20px rgba(0,212,255,0.05)",
            animation: "iconBreath 4s ease-in-out infinite",
            position: "relative",
          }}>
            <div style={{
              position: "absolute", inset: -1,
              borderRadius: 24,
              background: "linear-gradient(135deg, rgba(0,212,255,0.4), transparent, rgba(0,240,208,0.4))",
              WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              padding: "1px",
              animation: "rotateBorder 4s linear infinite",
            }} />
            <Cpu size={36} color="#00d4ff" />
          </div>

          <h1 style={{
            fontSize: 38, fontWeight: 700, marginBottom: 8, letterSpacing: -1,
            background: "linear-gradient(135deg, #e8f4fc 0%, #00d4ff 60%, #00f0d0 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            AttendAI
          </h1>

          <p style={{
            color: "rgba(122,155,181,0.8)", fontSize: 13, lineHeight: 1.6,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 0.3,
          }}>
            AI-powered attendance system
          </p>

          {/* Status indicator */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            marginTop: 12, padding: "4px 12px",
            background: "rgba(16,217,122,0.08)",
            border: "1px solid rgba(16,217,122,0.2)",
            borderRadius: 99,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#10d97a",
              boxShadow: "0 0 6px #10d97a",
              animation: "statusPulse 2s ease-in-out infinite",
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#10d97a",
              textTransform: "uppercase", letterSpacing: 1,
              fontFamily: "'JetBrains Mono', monospace",
            }}>System Online</span>
          </div>
        </div>

        {/* Login card */}
        <div style={{
          background: "rgba(12,18,25,0.92)",
          border: "1px solid rgba(0,212,255,0.12)",
          borderRadius: 22,
          padding: "28px 24px",
          backdropFilter: "blur(20px)",
          boxShadow: "0 0 0 1px rgba(0,212,255,0.06), 0 8px 48px rgba(0,0,0,0.6), 0 0 40px rgba(0,212,255,0.06)",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Top glow line */}
          <div style={{
            position: "absolute", top: 0, left: "15%", right: "15%", height: 1,
            background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)",
          }} />

          <div style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4, letterSpacing: -0.3, color: "#e8f4fc" }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 13, color: "rgba(122,155,181,0.7)", margin: 0 }}>
              Sign in to access your dashboard
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700,
                color: "rgba(0,212,255,0.7)", marginBottom: 8,
                textTransform: "uppercase", letterSpacing: 1.2,
                fontFamily: "'JetBrains Mono', monospace",
              }}>Email Address</label>
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

            <div style={{ marginBottom: 0 }}>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700,
                color: "rgba(0,212,255,0.7)", marginBottom: 8,
                textTransform: "uppercase", letterSpacing: 1.2,
                fontFamily: "'JetBrains Mono', monospace",
              }}>Password</label>
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
                    border: "none", cursor: "pointer", color: "rgba(0,212,255,0.5)",
                    display: "flex", alignItems: "center", padding: 0,
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#00d4ff")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(0,212,255,0.5)")}
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
              className="btn btn-primary btn-primary-full"
              disabled={loading}
              style={{
                marginTop: 24, height: 52, fontSize: 15,
                borderRadius: 14, letterSpacing: 0.2,
              }}
            >
              {loading ? (
                <><Loader2 size={18} className="spin" /> Authenticating...</>
              ) : (
                <><Zap size={16} /> Sign In <ChevronRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        {/* Demo credentials */}
        <div style={{
          marginTop: 16,
          background: "rgba(8,13,20,0.8)",
          border: "1px solid rgba(0,212,255,0.1)",
          borderRadius: 16,
          padding: "16px 18px",
          backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Zap size={11} color="#00d4ff" />
            <span style={{
              fontSize: 9, fontWeight: 700, color: "#00d4ff",
              textTransform: "uppercase", letterSpacing: 1.5,
              fontFamily: "'JetBrains Mono', monospace",
            }}>Quick Access — Demo Accounts</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {demoAccounts.map((acc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setEmail(acc.email); setPassword(acc.pwd); }}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10, cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", width: "100%",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `rgba(${acc.color === '#00d4ff' ? '0,212,255' : acc.color === '#10d97a' ? '16,217,122' : '245,166,35'},0.06)`;
                  e.currentTarget.style.borderColor = `rgba(${acc.color === '#00d4ff' ? '0,212,255' : acc.color === '#10d97a' ? '16,217,122' : '245,166,35'},0.25)`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: acc.color, boxShadow: `0 0 6px ${acc.color}`,
                  }} />
                  <span style={{ fontSize: 12, color: "#e8f4fc", fontWeight: 600 }}>{acc.role}</span>
                </div>
                <span style={{
                  fontSize: 10, color: "rgba(122,155,181,0.6)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{acc.email}</span>
              </button>
            ))}
          </div>
        </div>

        <p style={{
          textAlign: "center", marginTop: 20, fontSize: 10,
          color: "rgba(45,74,94,0.8)", fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 0.5,
        }}>
          Youdex AttendAI · v1.0 · Secured
        </p>
      </div>

      <style>{`
        @keyframes gridPan {
          from { background-position: 0 0; }
          to   { background-position: 44px 44px; }
        }
        @keyframes blobFloat1 {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%       { transform: translate(3%,4%) scale(1.05); }
        }
        @keyframes blobFloat2 {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%       { transform: translate(-3%,-4%) scale(1.05); }
        }
        @keyframes iconBreath {
          0%, 100% { box-shadow: 0 0 40px rgba(0,212,255,0.25), inset 0 0 20px rgba(0,212,255,0.05); }
          50%       { box-shadow: 0 0 60px rgba(0,212,255,0.4), inset 0 0 28px rgba(0,212,255,0.1); }
        }
        @keyframes rotateBorder {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes statusPulse {
          0%, 100% { box-shadow: 0 0 6px #10d97a; }
          50%       { box-shadow: 0 0 14px #10d97a; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
