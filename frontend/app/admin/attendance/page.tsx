"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import {
  Calendar, Users, CheckCircle, Clock, XCircle,
  ChevronRight, Loader2, Search, Filter,
} from "lucide-react";

interface Lecture {
  id: string;
  subject_name: string;
  subject_code: string;
  faculty_name: string;
  dept_name: string;
  date: string;
  status: "pending" | "finalized";
  present_count: number;
  total_students: number;
  lecture_no: number;
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "finalized">("all");

  useEffect(() => {
    apiFetch("/reports/summary")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.recent_lectures) setLectures(data.recent_lectures);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = lectures.filter(l => {
    const matchSearch =
      l.subject_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.faculty_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.dept_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || l.status === filter;
    return matchSearch && matchFilter;
  });

  const totalLectures = lectures.length;
  const pendingCount = lectures.filter(l => l.status === "pending").length;
  const finalizedCount = lectures.filter(l => l.status === "finalized").length;

  return (
    <div className="page-content fade-up">
      <TopBar title="Attendance Monitor" />

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: 16 }}>
        {[
          { label: "Total Sessions", value: totalLectures, icon: <Calendar size={18} />, color: "var(--accent)", bg: "var(--accent-dim)" },
          { label: "Pending Review", value: pendingCount, icon: <Clock size={18} />, color: "var(--warning)", bg: "var(--warning-dim)" },
          { label: "Finalized", value: finalizedCount, icon: <CheckCircle size={18} />, color: "var(--success)", bg: "var(--success-dim)" },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search size={16} />
          <input
            className="input"
            placeholder="Search subject, faculty…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "pending", "finalized"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="btn btn-secondary btn-sm"
              style={{
                background: filter === f ? "var(--accent-dim)" : undefined,
                color: filter === f ? "var(--accent-2)" : undefined,
                borderColor: filter === f ? "var(--border-accent)" : undefined,
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Lecture list */}
      {loading ? (
        <div className="empty-state">
          <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Calendar size={36} />
          <p>No sessions found</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {filtered.map((lec, i) => {
            const pct = lec.total_students > 0 ? Math.round((lec.present_count / lec.total_students) * 100) : 0;
            const good = pct >= 75;
            return (
              <div key={lec.id} className="attendance-row">
                <div style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  background: lec.status === "finalized" ? "var(--success-dim)" : "var(--warning-dim)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {lec.status === "finalized"
                    ? <CheckCircle size={18} color="var(--success)" />
                    : <Clock size={18} color="var(--warning)" />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                    {lec.subject_name}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>#{lec.lecture_no}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {lec.faculty_name} · {lec.dept_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{lec.date}</div>
                  {lec.status === "finalized" && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: "var(--text-muted)" }}>{lec.present_count}/{lec.total_students} present</span>
                        <span style={{ fontWeight: 700, color: good ? "var(--success)" : "var(--danger)" }}>{pct}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: good ? "var(--success)" : "var(--danger)" }} />
                      </div>
                    </div>
                  )}
                </div>
                <span className={`badge ${lec.status === "finalized" ? "badge-present" : "badge-warning"}`} style={{ flexShrink: 0 }}>
                  {lec.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
