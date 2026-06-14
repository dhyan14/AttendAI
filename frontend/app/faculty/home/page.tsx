"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Users, TrendingUp, Clock, LogOut, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";

interface Lecture {
  id: string;
  subject_name: string;
  subject_code: string;
  division: string;
  batch: string;
  lecture_no: number;
  date: string;
  time: string;
  status: string;
  total_students: number;
  present_count: number;
}

export default function FacultyHomePage() {
  const router = useRouter();
  const [facultyProfile, setFacultyProfile] = useState<{ name: string; email: string; dept_name: string } | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch faculty profile (name, dept) from /faculty/me
        const facRes = await apiFetch("/faculty/me");
        if (facRes.ok) {
          setFacultyProfile(await facRes.json());
        }

        const lecturesRes = await apiFetch("/attendance/lectures");
        if (lecturesRes.ok) {
          setLectures(await lecturesRes.json());
        }
      } catch (err) {
        console.error("Error loading faculty home data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  function handleLogout() {
    localStorage.clear();
    router.replace("/login");
  }

  // Calculate stats
  const todayStr = new Date().toISOString().split("T")[0];
  const todayLectures = lectures.filter(l => l.date === todayStr);
  const pendingReview = lectures.filter(l => l.status === "pending").length;
  const totalLecturesCount = lectures.length;
  
  // Calculate average attendance % for finalized lectures
  const finalized = lectures.filter(l => l.status === "finalized");
  const avgAttendance = finalized.length > 0
    ? Math.round((finalized.reduce((acc, l) => acc + (l.present_count / Math.max(l.total_students, 1)), 0) / finalized.length) * 100)
    : 0;

  const stats = [
    { label: "Total Lectures",   value: totalLecturesCount.toString(), icon: <BookOpen size={20} />, color: "var(--accent)" },
    { label: "Avg Attendance", value: `${avgAttendance}%`,            icon: <Users size={20} />,    color: "var(--success)" },
    { label: "Today's Lectures",   value: todayLectures.length.toString(),icon: <TrendingUp size={20} />, color: "var(--warning)" },
    { label: "Pending Review",   value: pendingReview.toString(),       icon: <Clock size={20} />,    color: "var(--danger)" },
  ];

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar 
        title="Faculty Portal" 
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

      {/* Greeting */}
      <div style={{ padding: "8px 0 20px" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>{today}</p>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Good {getTimeOfDay()}, {facultyProfile?.name || "Faculty"} 👋</h2>
        {facultyProfile?.dept_name && (
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>{facultyProfile.dept_name}</p>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div style={{ color: s.color, marginBottom: 8 }}>{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Action */}
      <button
        className="btn btn-primary"
        style={{ marginBottom: 20, gap: 10 }}
        onClick={() => router.push("/faculty/attendance/take")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4"/>
          <path d="m21 21-3-3m0 0a4 4 0 1 0-5.66-5.66A4 4 0 0 0 18 18z"/>
        </svg>
        Take Attendance Now
      </button>

      {/* Today's Lectures */}
      <div className="section-header">
        <span className="section-title">Lecture Schedule</span>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : lectures.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-secondary)" }}>
          <BookOpen size={48} style={{ color: "var(--text-muted)", marginBottom: 12, margin: "0 auto 12px" }} />
          <p>No lectures scheduled.</p>
        </div>
      ) : (
        lectures.map((l, i) => (
          <div 
            key={i} 
            className="lecture-card" 
            style={{ 
              borderLeftColor: l.status === "finalized" ? "var(--success)" : "var(--accent)",
              cursor: "pointer"
            }}
            onClick={() => router.push(`/faculty/attendance?lecture_id=${l.id}`)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span className="badge badge-muted" style={{ fontSize: 11 }}>⊞ {l.division} (Batch {l.batch})</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Lecture {l.lecture_no}</span>
            </div>
            <h3 style={{ marginBottom: 8, fontSize: 16 }}>{l.subject_name}</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                🕐 {l.time} ({l.date})
              </span>
              {l.status === "finalized"
                ? <span className="badge badge-present">{l.present_count}/{l.total_students} Present</span>
                : <span className="badge badge-accent">Pending Review</span>
              }
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}
