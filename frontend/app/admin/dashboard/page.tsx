"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Users, User, ShieldAlert, Award, ArrowRight, LogOut, CheckCircle, Clock, Loader2, Building2 } from "lucide-react";

interface OrgStats {
  total_students: number;
  total_faculty: number;
  avg_attendance: number;
  open_disputes: number;
  departments: {
    id: string;
    name: string;
    code: string;
    student_count: number;
    faculty_count: number;
    avg_attendance: number;
  }[];
}

interface RecentActivity {
  id: string;
  subject_name: string;
  faculty_name: string;
  date: string;
  status: string;
  present_count: number;
  total_students: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<{ email: string; role: string } | null>(null);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [recentLectures, setRecentLectures] = useState<RecentActivity[]>([]);
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

  function handleLogout() {
    localStorage.clear();
    router.replace("/login");
  }

  const roleLabels: Record<string, string> = {
    dept_admin: "Department Admin",
    org_admin: "Organization Admin",
    super_admin: "Super Admin",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading dashboard...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="page-content fade-up">
      <TopBar
        title="Admin Panel"
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

      {/* Greeting card */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, #1b1437 0%, var(--bg-card) 100%)", border: "1px solid var(--border-accent)" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Welcome back</p>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 6px" }}>{adminUser?.email || "Admin"}</h2>
        <span className="badge badge-accent">{roleLabels[adminUser?.role || ""] || "Administrator"}</span>
      </div>

      {/* Live Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div className="stat-card">
          <div style={{ color: "var(--accent)", marginBottom: 8 }}><Users size={20} /></div>
          <div className="stat-value">{stats?.total_students ?? "—"}</div>
          <div className="stat-label">Total Students</div>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--accent-light)", marginBottom: 8 }}><User size={20} /></div>
          <div className="stat-value">{stats?.total_faculty ?? "—"}</div>
          <div className="stat-label">Total Faculty</div>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--success)", marginBottom: 8 }}><Award size={20} /></div>
          <div className="stat-value">{stats?.avg_attendance ?? "—"}{stats ? "%" : ""}</div>
          <div className="stat-label">Avg Attendance</div>
        </div>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => router.push("/admin/disputes")}>
          <div style={{ color: "var(--danger)", marginBottom: 8 }}><ShieldAlert size={20} /></div>
          <div className="stat-value" style={{ color: (stats?.open_disputes ?? 0) > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {stats?.open_disputes ?? "—"}
          </div>
          <div className="stat-label">Open Disputes</div>
        </div>
      </div>

      {/* Department breakdown */}
      {stats?.departments && stats.departments.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Departments</span>
            <button
              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer" }}
              onClick={() => router.push("/admin/departments")}
            >
              View All
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {stats.departments.slice(0, 3).map((dept) => (
              <div key={dept.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontWeight: 700, fontSize: 12 }}>
                    {dept.code}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{dept.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {dept.student_count} students · {dept.faculty_count} faculty
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: dept.avg_attendance >= 75 ? "var(--success)" : "var(--warning)" }}>
                  {dept.avg_attendance}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Quick Actions */}
      <div className="section-header">
        <span className="section-title">Quick Actions</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {[
          { icon: <Users size={18} />, label: "Manage Students", desc: "View, add, edit, or CSV import students", path: "/admin/students" },
          { icon: <User size={18} />, label: "Manage Faculty", desc: "View, add, edit faculty members", path: "/admin/faculty" },
          { icon: <Building2 size={18} />, label: "Departments", desc: "View and manage academic departments", path: "/admin/departments" },
          { icon: <ShieldAlert size={18} />, label: "Attendance Disputes", desc: "Review and resolve attendance corrections", path: "/admin/disputes", danger: (stats?.open_disputes ?? 0) > 0 },
        ].map((item, i) => (
          <div
            key={i}
            className="card"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => router.push(item.path)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: item.danger ? "var(--danger-dim)" : "var(--accent-dim)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: item.danger ? "var(--danger)" : "var(--accent)"
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.desc}</div>
              </div>
            </div>
            <ArrowRight size={18} style={{ color: "var(--text-muted)" }} />
          </div>
        ))}
      </div>

      {/* Live Recent Activity */}
      {recentLectures.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Recent Lectures</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentLectures.slice(0, 5).map((lec, i) => (
              <div key={i} className="card" style={{ display: "flex", gap: 12 }}>
                <div style={{ marginTop: 2 }}>
                  {lec.status === "finalized"
                    ? <CheckCircle size={16} color="var(--success)" />
                    : <Clock size={16} color="var(--warning)" />
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{lec.subject_name}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{lec.date}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {lec.status === "finalized"
                      ? `${lec.present_count}/${lec.total_students} Present · ${lec.faculty_name}`
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
