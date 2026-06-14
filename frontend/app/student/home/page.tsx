"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { AlertCircle, Loader2, LogOut, TrendingDown, ShieldAlert, Calendar } from "lucide-react";

interface SubjectStats {
  name: string; code: string; percentage: number; present: number; total: number;
}
interface StudentProfile {
  id: string; roll_no: string; name: string; division: string; batch: string; semester: number;
}

function ProgressRing({ pct, size = 90, stroke = 8 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-card-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color }}>{pct}%</div>
      </div>
    </div>
  );
}

export default function StudentHomePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [overallStats, setOverallStats] = useState({ total_lectures: 0, present: 0, absent: 0, percentage: 0 });
  const [subjects, setSubjects] = useState<SubjectStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStudentData() {
      try {
        const profileRes = await apiFetch("/students/me");
        if (!profileRes.ok) throw new Error("Student profile not found");
        const profileData = await profileRes.json();
        setProfile(profileData);

        const [statsRes, historyRes] = await Promise.all([
          apiFetch(`/students/${profileData.id}/attendance`),
          apiFetch(`/students/${profileData.id}/attendance/history`),
        ]);

        if (statsRes.ok) setOverallStats(await statsRes.json());

        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const subjMap: Record<string, { name: string; present: number; total: number }> = {};
          historyData.forEach((h: any) => {
            const code = h.subject_code;
            if (!subjMap[code]) subjMap[code] = { name: h.subject_name, present: 0, total: 0 };
            subjMap[code].total += 1;
            if (h.status === "present") subjMap[code].present += 1;
          });
          const subjList: SubjectStats[] = Object.keys(subjMap).map(code => {
            const s = subjMap[code];
            return { name: s.name, code, percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0, present: s.present, total: s.total };
          });
          setSubjects(subjList);
        }
      } catch (err) {
        console.error("Error loading student data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStudentData();
  }, []);

  const low = subjects.filter(s => s.percentage < 75);
  const good = overallStats.percentage >= 75;

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={26} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading your dashboard...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar
        title="Student Portal"
        rightAction={
          <button
            onClick={() => { localStorage.clear(); router.replace("/login"); }}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <LogOut size={18} />
          </button>
        }
      />

      {/* Greeting */}
      <div style={{ paddingBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginBottom: 4 }}>
          Hey, {profile?.name?.split(" ")[0] || "Student"} 👋
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {profile?.roll_no && <span className="chip">{profile.roll_no}</span>}
          {profile?.division && <span className="chip">Div {profile.division}</span>}
          {profile?.semester && <span className="chip">Sem {profile.semester}</span>}
        </div>
      </div>

      {/* Overall Attendance hero */}
      <div className="hero-banner" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <ProgressRing pct={overallStats.percentage} size={96} stroke={9} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Overall Attendance</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -0.8, color: good ? "var(--success)" : "var(--danger)", lineHeight: 1 }}>
              {overallStats.percentage}%
            </div>
            <div style={{ fontSize: 13, marginTop: 6, color: good ? "var(--success)" : "var(--danger)", display: "flex", alignItems: "center", gap: 4 }}>
              {good ? "✓ Good standing" : "⚠ Below 75% threshold"}
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
          {[
            { label: "Present", value: overallStats.present, color: "var(--success)", bg: "var(--success-dim)" },
            { label: "Absent",  value: overallStats.absent,  color: "var(--danger)",  bg: "var(--danger-dim)" },
            { label: "Total",   value: overallStats.total_lectures, color: "var(--accent-2)", bg: "var(--accent-dim)" },
          ].map((st, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 8px", textAlign: "center", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: st.color }}>{st.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Low attendance alert */}
      {low.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: 16, flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <AlertCircle size={16} />
            Low Attendance Warning
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {low.map(s => (
              <div key={s.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <span style={{ color: "rgba(240,90,90,0.8)" }}>{s.name}</span>
                <span style={{ fontWeight: 700 }}>{s.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        <button
          className="card"
          style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", border: "1px solid var(--border-accent)", background: "var(--accent-dim)" }}
          onClick={() => router.push("/student/attendance")}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar size={18} style={{ color: "var(--accent-2)" }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-2)" }}>History</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>View records</div>
          </div>
        </button>
        <button
          className="card"
          style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", border: "1px solid rgba(240,90,90,0.2)", background: "var(--danger-dim)" }}
          onClick={() => router.push("/student/attendance")}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--danger-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldAlert size={18} style={{ color: "var(--danger)" }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>Dispute</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Raise a request</div>
          </div>
        </button>
      </div>

      {/* Subject list */}
      <div className="section-header">
        <span className="section-title">Subjects</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{subjects.length} subjects</span>
      </div>

      {subjects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "36px 16px" }}>
          <TrendingDown size={32} style={{ color: "var(--text-muted)", margin: "0 auto 10px", display: "block" }} />
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No subject data available yet.</p>
        </div>
      ) : (
        subjects.map((s, i) => {
          const good = s.percentage >= 75;
          return (
            <div
              key={i}
              className="card"
              style={{ marginBottom: 8, cursor: "pointer" }}
              onClick={() => router.push("/student/attendance")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: good ? "var(--success-dim)" : "var(--danger-dim)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800,
                  color: good ? "var(--success)" : "var(--danger)",
                  letterSpacing: -0.3,
                }}>
                  {s.code.split("-").pop()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: good ? "var(--success)" : "var(--danger)", flexShrink: 0, marginLeft: 8 }}>
                      {s.percentage}%
                    </span>
                  </div>
                  <div style={{ background: "var(--bg-card-2)", borderRadius: 99, height: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${s.percentage}%`,
                      background: good ? "var(--success)" : s.percentage >= 60 ? "var(--warning)" : "var(--danger)",
                      borderRadius: 99, transition: "width 0.6s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.present} present</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.total} total</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
