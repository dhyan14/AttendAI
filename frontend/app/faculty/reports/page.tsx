"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { BarChart3, Users, CheckCircle, TrendingUp, Loader2, BookOpen } from "lucide-react";

interface SubjectReport {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  division: string;
  batch: string;
  total_lectures: number;
  finalized_lectures: number;
  total_students: number;
  avg_attendance: number;
}

export default function FacultyReportsPage() {
  const [reports, setReports] = useState<SubjectReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/faculty/reports")
      .then(r => r.ok ? r.json() : [])
      .then(data => setReports(Array.isArray(data) ? data : []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, []);

  const totalLectures = reports.reduce((s, r) => s + r.total_lectures, 0);
  const avgAttendance = reports.length > 0
    ? Math.round(reports.reduce((s, r) => s + r.avg_attendance, 0) / reports.length)
    : 0;

  return (
    <div className="page-content fade-up">
      <TopBar title="My Reports" />

      <div className="stats-grid" style={{ marginTop: 16 }}>
        {[
          { label: "Subjects", value: reports.length, icon: <BookOpen size={18} />, color: "var(--accent)", bg: "var(--accent-dim)" },
          { label: "Total Lectures", value: totalLectures, icon: <CheckCircle size={18} />, color: "var(--info)", bg: "var(--info-dim)" },
          { label: "Avg Attendance", value: `${avgAttendance}%`, icon: <TrendingUp size={18} />, color: avgAttendance >= 75 ? "var(--success)" : "var(--warning)", bg: avgAttendance >= 75 ? "var(--success-dim)" : "var(--warning-dim)" },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 26 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">
          <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : reports.length === 0 ? (
        <div className="empty-state">
          <BarChart3 size={36} />
          <p>No subject data available yet</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="section-header">
            <span className="section-title">Subject Breakdown</span>
          </div>
          {reports.map((r) => {
            const good = r.avg_attendance >= 75;
            return (
              <div key={r.subject_id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.subject_name}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                      <span className="badge badge-accent" style={{ fontSize: 10 }}>{r.subject_code}</span>
                      {r.division && <span className="badge badge-muted" style={{ fontSize: 10 }}>Div {r.division}</span>}
                      {r.batch && <span className="badge badge-muted" style={{ fontSize: 10 }}>{r.batch}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: good ? "var(--success)" : "var(--danger)", letterSpacing: -1, lineHeight: 1 }}>
                      {r.avg_attendance}%
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>avg attendance</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle size={12} color="var(--success)" />
                    {r.finalized_lectures}/{r.total_lectures} lectures
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Users size={12} color="var(--accent-2)" />
                    {r.total_students} students
                  </span>
                </div>

                <div className="progress-bar">
                  <div className="progress-fill" style={{
                    width: `${r.avg_attendance}%`,
                    background: good
                      ? "linear-gradient(90deg, var(--success), #4ade80)"
                      : "linear-gradient(90deg, var(--danger), #fb923c)",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
