"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Users, TrendingUp, Clock, LogOut, Loader2, Camera, ChevronRight, Zap } from "lucide-react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";

interface Lecture {
  id: string; subject_name: string; subject_code: string;
  division: string; batch: string; lecture_no: number;
  date: string; time: string; status: string;
  total_students: number; present_count: number;
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

export default function FacultyHomePage() {
  const router = useRouter();
  const [facultyProfile, setFacultyProfile] = useState<{ name: string; email: string; dept_name: string } | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [facRes, lecturesRes] = await Promise.all([
          apiFetch("/faculty/me"),
          apiFetch("/attendance/lectures"),
        ]);
        if (facRes.ok) setFacultyProfile(await facRes.json());
        if (lecturesRes.ok) setLectures(await lecturesRes.json());
      } catch (err) {
        console.error("Error loading faculty home:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayLectures = lectures.filter(l => l.date === todayStr);
  const pendingReview = lectures.filter(l => l.status === "pending").length;
  const finalized = lectures.filter(l => l.status === "finalized");
  const avgAttendance = finalized.length > 0
    ? Math.round((finalized.reduce((acc, l) => acc + (l.present_count / Math.max(l.total_students, 1)), 0) / finalized.length) * 100)
    : 0;

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "var(--accent-dim)", border: "1px solid var(--border-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
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
        title="Faculty Portal"
        rightAction={
          <button
            onClick={() => { localStorage.clear(); router.replace("/login"); }}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, transition: "color 0.2s", display: "flex", alignItems: "center" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <LogOut size={18} />
          </button>
        }
      />

      {/* Greeting */}
      <div style={{ paddingBottom: 20 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>{today}</p>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginBottom: 4 }}>
          Good {getTimeOfDay()}, {facultyProfile?.name?.split(" ")[0] || "Prof"} 👋
        </h2>
        {facultyProfile?.dept_name && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{facultyProfile.dept_name}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Lectures",  value: lectures.length,  icon: <BookOpen size={18} />, color: "var(--accent)",   bg: "var(--accent-dim)" },
          { label: "Avg Attendance",  value: `${avgAttendance}%`, icon: <TrendingUp size={18} />, color: avgAttendance >= 75 ? "var(--success)" : "var(--warning)", bg: avgAttendance >= 75 ? "var(--success-dim)" : "var(--warning-dim)" },
          { label: "Today's Sessions",value: todayLectures.length, icon: <Users size={18} />, color: "#38bdf8",      bg: "var(--info-dim)" },
          { label: "Pending Review",  value: pendingReview,    icon: <Clock size={18} />,     color: pendingReview > 0 ? "var(--danger)" : "var(--text-muted)", bg: pendingReview > 0 ? "var(--danger-dim)" : "rgba(255,255,255,0.03)" },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 8 }}>
              {s.icon}
            </div>
            <div className="stat-value" style={{ color: s.color, fontSize: 26 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Today's pending CTA */}
      {!loading && todayLectures.filter(l => l.status === "pending").length > 0 && (
        <div className="card-gradient" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Zap size={14} style={{ color: "var(--warning)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)", textTransform: "uppercase", letterSpacing: 0.5 }}>Today's Pending</span>
          </div>
          {todayLectures.filter(l => l.status === "pending").map(l => (
            <button
              key={l.id}
              onClick={() => router.push(`/faculty/attendance/take?lecture_id=${l.id}`)}
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center",
                gap: 12, cursor: "pointer", marginBottom: 8, transition: "all 0.2s",
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Clock size={16} style={{ color: "var(--accent-2)" }} />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{l.subject_name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Div {l.division} · Lecture {l.lecture_no} · {l.time}</div>
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* Take Attendance CTA */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 24 }}>
        <button
          className="btn btn-primary"
          style={{ gap: 8, fontSize: 14, padding: "14px 12px", height: 50, borderRadius: 14 }}
          onClick={() => router.push("/faculty/attendance/take")}
        >
          <Camera size={18} /> Take Attendance
        </button>
        <button
          className="btn btn-secondary"
          style={{ gap: 6, fontSize: 14, padding: "14px 12px", height: 50, borderRadius: 14 }}
          onClick={() => router.push("/faculty/attendance")}
        >
          <BookOpen size={16} /> History
        </button>
      </div>

      {/* Lecture Schedule */}
      <div className="section-header">
        <span className="section-title">Lecture Schedule</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{lectures.length} total</span>
      </div>

      {lectures.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 16px" }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: "var(--bg-card-2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <BookOpen size={28} style={{ color: "var(--text-muted)" }} />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No lectures yet.<br/>Take your first attendance above.</p>
        </div>
      ) : (
        lectures.slice(0, 10).map((l, i) => {
          const pct = l.total_students > 0 ? Math.round((l.present_count / l.total_students) * 100) : 0;
          const finalized = l.status === "finalized";
          return (
            <div
              key={i}
              className={`lecture-card ${!finalized ? "pending" : ""}`}
              style={{ borderLeftColor: finalized ? "var(--success)" : "var(--warning)" }}
              onClick={() => router.push(`/faculty/attendance/take?lecture_id=${l.id}`)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="chip">Div {l.division}</span>
                  <span className="chip">Batch {l.batch}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>#{l.lecture_no}</span>
              </div>

              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2, letterSpacing: -0.2 }}>{l.subject_name}</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{l.subject_code} · {l.date}</p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {finalized ? (
                  <>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.present_count}/{l.total_students} present</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 75 ? "var(--success)" : "var(--danger)" }}>{pct}%</span>
                      </div>
                      <div style={{ background: "var(--bg-card-2)", borderRadius: 99, height: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: pct >= 75 ? "var(--success)" : "var(--danger)", borderRadius: 99, transition: "width 0.5s" }} />
                      </div>
                    </div>
                    <span className="badge badge-present" style={{ flexShrink: 0 }}>Finalized</span>
                  </>
                ) : (
                  <span className="badge badge-warning">Pending Review</span>
                )}
              </div>
            </div>
          );
        })
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
