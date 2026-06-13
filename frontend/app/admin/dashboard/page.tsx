"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Users, User, ShieldAlert, Award, FileText, ArrowRight, LogOut, CheckCircle, Clock } from "lucide-react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<{ email: string; role: string } | null>(null);
  const [stats, setStats] = useState({
    totalStudents: 524,
    totalFaculty: 18,
    avgAttendance: 78.4,
    openDisputes: 3,
  });

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await apiFetch("/users/me");
        if (res.ok) {
          const data = await res.json();
          setAdminUser(data);
        }
      } catch (err) {
        console.error("Failed to load user info:", err);
      }
    }
    loadUser();
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

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div className="stat-card">
          <div style={{ color: "var(--accent)", marginBottom: 8 }}><Users size={20} /></div>
          <div className="stat-value">{stats.totalStudents}</div>
          <div className="stat-label">Total Students</div>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--accent-light)", marginBottom: 8 }}><User size={20} /></div>
          <div className="stat-value">{stats.totalFaculty}</div>
          <div className="stat-label">Total Faculty</div>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--success)", marginBottom: 8 }}><Award size={20} /></div>
          <div className="stat-value">{stats.avgAttendance}%</div>
          <div className="stat-label">Avg Attendance</div>
        </div>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => router.push("/admin/disputes")}>
          <div style={{ color: "var(--danger)", marginBottom: 8 }}><ShieldAlert size={20} /></div>
          <div className="stat-value" style={{ color: stats.openDisputes > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {stats.openDisputes}
          </div>
          <div className="stat-label">Open Disputes</div>
        </div>
      </div>

      {/* Quick Access List */}
      <div className="section-header">
        <span className="section-title">Quick Actions</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        <div
          className="card"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => router.push("/admin/students")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
              <Users size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Manage Students</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>View, add, edit, or CSV import students</div>
            </div>
          </div>
          <ArrowRight size={18} style={{ color: "var(--text-muted)" }} />
        </div>

        <div
          className="card"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => router.push("/admin/faculty")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
              <User size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Manage Faculty</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>View, add, edit, or CSV import faculty</div>
            </div>
          </div>
          <ArrowRight size={18} style={{ color: "var(--text-muted)" }} />
        </div>

        <div
          className="card"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => router.push("/admin/disputes")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--danger-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }}>
              <ShieldAlert size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Attendance Disputes</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Review and resolve attendance corrections</div>
            </div>
          </div>
          <ArrowRight size={18} style={{ color: "var(--text-muted)" }} />
        </div>
      </div>

      {/* Live System Activity Feed */}
      <div className="section-header">
        <span className="section-title">Live Activity</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { text: "Lec 3: Data Structures (Div B) finalized", detail: "48 / 62 Present · Marked by Dr. Jaimin Patel", time: "10 mins ago", type: "success" },
          { text: "CSV Student Bulk Upload completed", detail: "Successfully imported 142 student profiles", time: "2 hours ago", type: "info" },
          { text: "Dispute raised: Student Rahul Sharma", detail: "For Lecture 2 (Engineering Mathematics 4)", time: "3 hours ago", type: "warning" },
        ].map((act, i) => (
          <div key={i} className="card" style={{ display: "flex", gap: 12 }}>
            <div style={{ marginTop: 2 }}>
              {act.type === "success" && <CheckCircle size={16} color="var(--success)" />}
              {act.type === "info" && <CheckCircle size={16} color="var(--info)" />}
              {act.type === "warning" && <Clock size={16} color="var(--warning)" />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{act.text}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{act.time}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{act.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
