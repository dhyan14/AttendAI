"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { TrendingUp, AlertCircle, Award, Loader2, LogOut } from "lucide-react";

interface SubjectStats {
  name: string;
  code: string;
  percentage: number;
  present: number;
  total: number;
  color: string;
}

interface StudentProfile {
  id: string;
  roll_no: string;
  name: string;
  division: string;
  batch: string;
  semester: number;
}

function ProgressRing({ pct, size = 80, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-card-2)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color }}>
        {pct}%
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
        // 1. Get student profile
        const profileRes = await apiFetch("/students/me");
        if (!profileRes.ok) {
          throw new Error("Student profile not found");
        }
        const profileData = await profileRes.json();
        setProfile(profileData);

        // 2. Get overall stats
        const statsRes = await apiFetch(`/students/${profileData.id}/attendance`);
        if (statsRes.ok) {
          setOverallStats(await statsRes.json());
        }

        // 3. Get history to calculate per-subject stats
        const historyRes = await apiFetch(`/students/${profileData.id}/attendance/history`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          
          // Group by subject
          const subjMap: Record<string, { name: string; present: number; total: number }> = {};
          historyData.forEach((h: any) => {
            const code = h.subject_code;
            if (!subjMap[code]) {
              subjMap[code] = { name: h.subject_name, present: 0, total: 0 };
            }
            subjMap[code].total += 1;
            if (h.status === "present") {
              subjMap[code].present += 1;
            }
          });

          // Convert map to list
          const colors = ["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)", "var(--accent-light)"];
          const subjList: SubjectStats[] = Object.keys(subjMap).map((code, idx) => {
            const s = subjMap[code];
            const percentage = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
            return {
              name: s.name,
              code,
              percentage,
              present: s.present,
              total: s.total,
              color: colors[idx % colors.length],
            };
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

  function handleLogout() {
    localStorage.clear();
    router.replace("/login");
  }

  const low = subjects.filter(s => s.percentage < 75);

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
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
            onClick={handleLogout}
            style={{
              background: "none",
              border: "none",
              color: "var(--danger)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <LogOut size={16} />
            Logout
          </button>
        }
      />

      {/* Profile summary */}
      <div style={{ padding: "0 0 16px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Hey, {profile?.name || "Student"} 👋</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 2 }}>Roll No: {profile?.roll_no} · Division {profile?.division} · Sem {profile?.semester}</p>
      </div>

      {/* Overall Attendance Card */}
      <div className="card" style={{ marginBottom: 16, background: "linear-gradient(135deg, #16122d 0%, var(--bg-card) 100%)", border: "1px solid var(--border-accent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ProgressRing pct={overallStats.percentage} size={90} stroke={8} />
          <div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Overall Attendance</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 2 }}>{overallStats.percentage}%</div>
            <div style={{ fontSize: 12, color: overallStats.percentage >= 75 ? "var(--success)" : "var(--danger)" }}>
              {overallStats.percentage >= 75 ? "✓ Good standing" : "⚠ Below required 75%"}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Present", value: overallStats.present, color: "var(--success)" },
          { label: "Absent",  value: overallStats.absent, color: "var(--danger)" },
          { label: "Total",   value: overallStats.total_lectures, color: "var(--accent)" },
        ].map((st, i) => (
          <div key={i} className="card" style={{ textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: st.color }}>{st.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Low Attendance Alert */}
      {low.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: 16, flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <AlertCircle size={16} /> Low Attendance Warning
          </div>
          {low.map(s => (
            <div key={s.code} style={{ fontSize: 13, paddingLeft: 24 }}>
              • {s.name}: <strong>{s.percentage}%</strong>
            </div>
          ))}
        </div>
      )}

      {/* Subject List */}
      <div className="section-header">
        <span className="section-title">Subjects</span>
      </div>

      {subjects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-secondary)" }}>
          No subject statistics available.
        </div>
      ) : (
        subjects.map((s, i) => (
          <div key={i} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
            onClick={() => router.push("/student/attendance")}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"var(--accent)", flexShrink:0 }}>
              {s.code}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.name}</div>
              <div style={{ background: "var(--bg-card-2)", borderRadius: 99, height: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${s.percentage}%`, background: s.color, borderRadius: 99, transition: "width 0.5s ease" }} />
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: s.percentage >= 75 ? "var(--success)" : "var(--danger)", flexShrink:0 }}>
              {s.percentage}%
            </span>
          </div>
        ))
      )}
    </div>
  );
}
