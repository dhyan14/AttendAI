"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Users, TrendingUp, Clock } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

export default function FacultyHomePage() {
  const router = useRouter();
  const [name, setName] = useState("Faculty");

  useEffect(() => {
    if (typeof window !== "undefined") {
      // TODO: fetch from /users/me
      const role = localStorage.getItem("user_role");
      if (!role) router.replace("/login");
    }
  }, [router]);

  const stats = [
    { label: "Lectures Today",   value: "3",   icon: <BookOpen size={20} />, color: "var(--accent)" },
    { label: "Students Present", value: "87%",  icon: <Users size={20} />,   color: "var(--success)" },
    { label: "This Week",        value: "12",   icon: <TrendingUp size={20} />, color: "var(--warning)" },
    { label: "Pending Review",   value: "1",    icon: <Clock size={20} />,   color: "var(--danger)" },
  ];

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page-content">
      <TopBar title="AttendAI" />

      {/* Greeting */}
      <div style={{ padding: "8px 0 20px" }} className="fade-up">
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>{today}</p>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Good {getTimeOfDay()}, {name} 👋</h2>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {stats.map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ animationDelay: `${i * 60}ms` }}>
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
        <span className="section-title">Today&apos;s Lectures</span>
      </div>

      {[
        { subject: "Engineering Mathematics 4", div: "Div B", lecture: 5, time: "02:07 PM", present: 33, total: 76, done: true },
        { subject: "Data Structures", div: "Div A", lecture: 3, time: "04:00 PM", present: null, total: 72, done: false },
      ].map((l, i) => (
        <div key={i} className="lecture-card" style={{ borderLeftColor: l.done ? "var(--success)" : "var(--accent)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span className="badge badge-muted" style={{ fontSize: 11 }}>⊞ {l.div}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Lecture {l.lecture}</span>
          </div>
          <h3 style={{ marginBottom: 8, fontSize: 16 }}>{l.subject}</h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
              🕐 {l.time}
            </span>
            {l.done
              ? <span className="badge badge-present">{l.present}/{l.total} Present</span>
              : <span className="badge badge-accent">Scheduled</span>
            }
          </div>
        </div>
      ))}
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}
