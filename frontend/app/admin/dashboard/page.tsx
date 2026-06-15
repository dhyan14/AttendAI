"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import {
  Users, User, ShieldAlert, Award, ArrowRight, LogOut,
  CheckCircle, Clock, Loader2, Building2, TrendingUp, FileText,
} from "lucide-react";

interface OrgStats {
  total_students: number;
  total_faculty: number;
  avg_attendance: number;
  open_disputes: number;
  departments: {
    id: string; name: string; code: string;
    student_count: number; faculty_count: number; avg_attendance: number;
  }[];
}

interface RecentLecture {
  id: string; subject_name: string; faculty_name: string;
  date: string; status: string; present_count: number; total_students: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<{ email: string; role: string } | null>(null);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [recentLectures, setRecentLectures] = useState<RecentLecture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [userRes, statsRes, reportsRes] = await Promise.all([
          apiFetch("/users/me"),
          apiFetch("/departments/stats"),
          apiFetch("/reports/summary"),
        ]);
        if (userRes.ok) setAdminUser(await userRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (reportsRes.ok) {
          const rData = await reportsRes.json();
          setRecentLectures(rData.recent_lectures || []);
        }
      } catch (err) {
        console.error("Failed to load admin dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const roleLabels: Record<string, string> = {
    dept_admin:  "Department Admin",
    org_admin:   "Organization Admin",
    super_admin: "Super Admin",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "linear-gradient(135deg, var(--accent-dim), rgba(168,85,247,0.08))",
          border: "1px solid var(--border-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Loader2 size={26} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading dashboard...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const statItems = [
    { icon: <Users size={18} />, label: "Students", value: stats?.total_students ?? "—", color: "#7c6fe0", bg: "rgba(124,111,224,0.1)" },
    { icon: <User size={18} />,  label: "Faculty",  value: stats?.total_faculty ?? "—",  color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
    {
      icon: <Award size={18} />, label: "Avg Attend.", value: stats ? `${stats.avg_attendance}%` : "—",
      color: (stats?.avg_attendance ?? 0) >= 75 ? "var(--success)" : "var(--warning)",
      bg: (stats?.avg_attendance ?? 0) >= 75 ? "var(--success-dim)" : "var(--warning-dim)",
    },
    {
      icon: <ShieldAlert size={18} />, label: "Disputes", value: stats?.open_disputes ?? "—",
      color: (stats?.open_disputes ?? 0) > 0 ? "var(--danger)" : "var(--success)",
      bg: (stats?.open_disputes ?? 0) > 0 ? "var(--danger-dim)" : "var(--success-dim)",
      onClick: () => router.push("/admin/disputes"),
    },
  ];

  const quickActions = [
    { icon: <Users size={20} />,     label: "Students",    desc: "View, add, or import students",    path: "/admin/students",    color: "var(--accent)",   bg: "var(--accent-dim)" },
    { icon: <User size={20} />,      label: "Faculty",     desc: "Manage faculty members",           path: "/admin/faculty",     color: "#a78bfa",         bg: "rgba(167,139,250,0.1)" },
    { icon: <Building2 size={20} />, label: "Departments", desc: "View academic departments",        path: "/admin/departments", color: "#38bdf8",         bg: "var(--info-dim)" },
    { icon: <ShieldAlert size={20} />,label:"Disputes",    desc: "Review attendance corrections",   path: "/admin/disputes",    color: "var(--danger)",   bg: "var(--danger-dim)", danger: (stats?.open_disputes ?? 0) > 0 },
    { icon: <FileText size={20} />,  label: "Reports",     desc: "Attendance analytics & summaries", path: "/admin/reports",     color: "var(--warning)",  bg: "var(--warning-dim)" },
  ];

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar
        title="Admin Panel"
        subtitle={roleLabels[adminUser?.role || ""] || "Administrator"}
        rightAction={
          <button
            onClick={() => { localStorage.clear(); router.replace("/login"); }}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <LogOut size={16} />
          </button>
        }
      />

      {/* Hero greeting */}
      <div className="hero-banner" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Welcome back</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: -0.3 }}>
          {adminUser?.email?.split("@")[0] || "Admin"} 👋
        </h2>
        <span className="badge badge-accent" style={{ fontSize: 11 }}>
          {roleLabels[adminUser?.role || ""] || "Administrator"}
        </span>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        {statItems.map((s, i) => (
          <div
            key={i}
            className="stat-card"
            style={{ cursor: s.onClick ? "pointer" : "default" }}
            onClick={s.onClick}
          >
            <div className="stat-icon" style={{ background: s.bg, color: s.color, width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              {s.icon}
            </div>
            <div className="stat-value" style={{ color: s.color, fontSize: 28 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Department breakdown */}
      {stats?.departments && stats.departments.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Departments</span>
            <button className="section-link" onClick={() => router.push("/admin/departments")}>View All →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {stats.departments.slice(0, 3).map((dept) => {
              const pct = dept.avg_attendance;
              const good = pct >= 75;
              return (
                <div key={dept.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => router.push("/admin/departments")}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: "var(--accent-dim)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 11, color: "var(--accent-2)",
                    letterSpacing: -0.3,
                  }}>
                    {dept.code}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{dept.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {dept.student_count} students · {dept.faculty_count} faculty
                    </div>
                    <div style={{ marginTop: 6, background: "var(--bg-card-2)", borderRadius: 99, height: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: good ? "var(--success)" : "var(--warning)", borderRadius: 99, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: good ? "var(--success)" : "var(--warning)", flexShrink: 0 }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Quick Actions */}
      <div className="section-header">
        <span className="section-title">Quick Actions</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {quickActions.map((item, i) => (
          <div
            key={i}
            className="card"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", transition: "all 0.2s" }}
            onClick={() => router.push(item.path)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: item.bg, display: "flex", alignItems: "center", justifyContent: "center",
                color: item.color, flexShrink: 0,
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>{item.desc}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {item.danger && (
                <span className="badge badge-absent" style={{ fontSize: 10 }}>
                  {stats?.open_disputes}
                </span>
              )}
              <ArrowRight size={16} style={{ color: "var(--text-muted)" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent Lectures */}
      {recentLectures.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Recent Lectures</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentLectures.slice(0, 5).map((lec, i) => (
              <div key={i} className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: lec.status === "finalized" ? "var(--success-dim)" : "var(--warning-dim)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {lec.status === "finalized"
                    ? <CheckCircle size={18} color="var(--success)" />
                    : <Clock size={18} color="var(--warning)" />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{lec.subject_name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{lec.date}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {lec.status === "finalized"
                      ? `${lec.present_count}/${lec.total_students} present · ${lec.faculty_name}`
                      : `Pending · ${lec.faculty_name}`
                    }
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
