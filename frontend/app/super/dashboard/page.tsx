"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Globe, Users, BookOpen, Building2, AlertTriangle, BarChart3,
  LogOut, Settings, Shield, CreditCard, Activity, Loader2,
  Plus, Trash2, ToggleLeft, ToggleRight, ChevronRight,
  Database, Server, Bell, Lock, Check, X
} from "lucide-react";

interface OrgDetail {
  id: string;
  name: string;
  code: string;
  departments: number;
  students: number;
  faculty: number;
  lectures: number;
  created_at: string;
  settings: Record<string, any>;
}

interface PlatformStats {
  total_orgs: number;
  total_users: number;
  total_students: number;
  total_faculty: number;
  total_lectures: number;
  total_attendance_records: number;
  open_disputes: number;
  organizations: OrgDetail[];
}

interface UserRow {
  id: string;
  email: string;
  role: string;
  org_name: string;
  is_active: boolean;
  created_at: string;
}

type Section = "overview" | "orgs" | "users" | "settings" | "audit";

const ROLE_COLOR: Record<string, string> = {
  super_admin: "#ff453a",
  org_admin:   "#ff9f0a",
  dept_admin:  "#ffd60a",
  faculty:     "#30d158",
  student:     "#0a84ff",
};

export default function SuperDashboard() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [toast, setToast] = useState("");

  // New org form
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgCode, setNewOrgCode] = useState("");
  const [newOrgMin, setNewOrgMin] = useState(75);
  const [creatingOrg, setCreatingOrg] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function handleLogout() {
    localStorage.clear();
    router.replace("/login");
  }

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await apiFetch("/super/stats");
        if (res.ok) setStats(await res.json());
      } catch {}
      finally { setLoading(false); }
    }
    loadStats();
  }, []);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await apiFetch("/super/users");
      if (res.ok) setUsers(await res.json());
    } catch {} finally { setUsersLoading(false); }
  }

  useEffect(() => {
    if (section === "users") loadUsers();
  }, [section]);

  async function createOrg() {
    if (!newOrgName || !newOrgCode) return;
    setCreatingOrg(true);
    try {
      const res = await apiFetch("/super/orgs", {
        method: "POST",
        body: JSON.stringify({ name: newOrgName, code: newOrgCode, min_attendance: newOrgMin }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.detail || "Failed");
      }
      showToast(`✓ Organization "${newOrgName}" created`);
      setShowNewOrg(false);
      setNewOrgName(""); setNewOrgCode("");
      // Reload stats
      const statsRes = await apiFetch("/super/stats");
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e: any) {
      showToast("✗ " + e.message);
    } finally { setCreatingOrg(false); }
  }

  async function deleteOrg(id: string, name: string) {
    if (!confirm(`Delete organization "${name}"? This will delete all its data.`)) return;
    const res = await apiFetch(`/super/orgs/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(`✓ "${name}" deleted`);
      setStats(prev => prev ? { ...prev, organizations: prev.organizations.filter(o => o.id !== id) } : prev);
    }
  }

  async function toggleUser(id: string) {
    const res = await apiFetch(`/super/users/${id}/toggle`, { method: "PATCH" });
    if (res.ok) {
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: updated.is_active } : u));
      showToast(updated.is_active ? "✓ User activated" : "✓ User deactivated");
    }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user "${email}"?`)) return;
    const res = await apiFetch(`/super/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
      showToast(`✓ "${email}" deleted`);
    }
  }

  const statCards = stats ? [
    { icon: <Globe size={20} />, label: "Organizations", value: stats.total_orgs, color: "#0a84ff" },
    { icon: <Users size={20} />, label: "Total Users", value: stats.total_users, color: "#30d158" },
    { icon: <Building2 size={20} />, label: "Students", value: stats.total_students, color: "#5e5ce6" },
    { icon: <BookOpen size={20} />, label: "Faculty", value: stats.total_faculty, color: "#ff9f0a" },
    { icon: <BarChart3 size={20} />, label: "Lectures", value: stats.total_lectures, color: "#ff6b35" },
    { icon: <AlertTriangle size={20} />, label: "Open Disputes", value: stats.open_disputes, color: "#ff453a" },
  ] : [];

  const navItems: { id: Section; icon: React.ReactNode; label: string }[] = [
    { id: "overview", icon: <Activity size={18} />, label: "Overview" },
    { id: "orgs",     icon: <Globe size={18} />,    label: "Organizations" },
    { id: "users",    icon: <Users size={18} />,    label: "Users" },
    { id: "settings", icon: <Settings size={18} />, label: "Settings" },
    { id: "audit",    icon: <Database size={18} />, label: "Audit Logs" },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 90 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: toast.startsWith("✓") ? "var(--success)" : "var(--danger)",
          color: "white", padding: "10px 20px", borderRadius: 99, fontSize: 13,
          fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          animation: "slideDown 0.3s ease"
        }}>
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(12,10,24,0.92)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
        padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "linear-gradient(135deg, #ff453a, #ff9f0a)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Shield size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3 }}>AttendAI</div>
            <div style={{ fontSize: 10, color: "#ff9f0a", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Super Admin</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}
        >
          <LogOut size={15} /> Logout
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px 0" }}>

        {/* ── OVERVIEW ─────────────────────────────────────────────── */}
        {section === "overview" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 2 }}>Platform Control Center</p>
              <h2 style={{ fontSize: 22, fontWeight: 800 }}>Platform Overview</h2>
            </div>

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
                <Loader2 size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
              </div>
            ) : (
              <>
                {/* Stat grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  {statCards.map((s, i) => (
                    <div key={i} className="card" style={{ padding: "14px 16px" }}>
                      <div style={{ color: s.color, marginBottom: 8 }}>{s.icon}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Org list */}
                <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Organizations on Platform</span>
                  <button
                    onClick={() => setSection("orgs")}
                    style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                  >
                    Manage →
                  </button>
                </div>

                {stats?.organizations.map((org) => (
                  <div key={org.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{org.name}</div>
                        <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 8px", borderRadius: 99, fontWeight: 600 }}>{org.code}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Since {org.created_at}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, textAlign: "center" }}>
                      {[
                        { label: "Depts", value: org.departments },
                        { label: "Students", value: org.students },
                        { label: "Faculty", value: org.faculty },
                        { label: "Lectures", value: org.lectures },
                      ].map((s, i) => (
                        <div key={i} style={{ background: "var(--bg-card-2)", borderRadius: 8, padding: "8px 4px" }}>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* DB stats banner */}
                <div style={{ marginTop: 16, borderRadius: 14, padding: "14px 16px", background: "linear-gradient(135deg, #1b1437, var(--bg-card))", border: "1px solid var(--border-accent)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Database Records</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 13 }}>Attendance Records</div>
                    <div style={{ fontWeight: 700, color: "var(--accent)" }}>{stats?.total_attendance_records.toLocaleString()}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ORGANIZATIONS ─────────────────────────────────────────── */}
        {section === "orgs" && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Organizations</h2>
              <button
                className="btn btn-primary"
                style={{ height: 36, padding: "0 14px", fontSize: 13, gap: 6 }}
                onClick={() => setShowNewOrg(true)}
              >
                <Plus size={15} /> Add Org
              </button>
            </div>

            {/* New org form */}
            {showNewOrg && (
              <div className="card" style={{ marginBottom: 16, border: "1.5px solid var(--border-accent)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>New Organization</div>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="input" placeholder="University of..." value={newOrgName} onChange={e => setNewOrgName(e.target.value)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="form-group">
                  <div>
                    <label className="form-label">Code</label>
                    <input className="input" placeholder="SVGU" value={newOrgCode} onChange={e => setNewOrgCode(e.target.value.toUpperCase())} maxLength={8} />
                  </div>
                  <div>
                    <label className="form-label">Min Attendance %</label>
                    <input className="input" type="number" value={newOrgMin} onChange={e => setNewOrgMin(Number(e.target.value))} min={50} max={100} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, height: 40, fontSize: 13 }} onClick={createOrg} disabled={creatingOrg || !newOrgName || !newOrgCode}>
                    {creatingOrg ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Create</>}
                  </button>
                  <button className="btn btn-secondary" style={{ height: 40, padding: "0 14px", fontSize: 13 }} onClick={() => setShowNewOrg(false)}>
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
                <Loader2 size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
              </div>
            ) : stats?.organizations.map((org) => (
              <div key={org.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{org.name}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 8px", borderRadius: 99 }}>{org.code}</span>
                      <span style={{ fontSize: 11, background: "var(--bg-card-2)", color: "var(--text-secondary)", padding: "2px 8px", borderRadius: 99 }}>Min {org.settings?.minAttendancePercent ?? 75}%</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteOrg(org.id, org.name)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: "var(--danger-dim)", border: "1px solid var(--danger)", color: "var(--danger)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, textAlign: "center" }}>
                  {[
                    { label: "Depts", value: org.departments, color: "#0a84ff" },
                    { label: "Students", value: org.students, color: "#5e5ce6" },
                    { label: "Faculty", value: org.faculty, color: "#30d158" },
                    { label: "Lectures", value: org.lectures, color: "#ff9f0a" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "var(--bg-card-2)", borderRadius: 8, padding: "8px 4px" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>Created: {org.created_at}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── USERS ─────────────────────────────────────────────────── */}
        {section === "users" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>All Users</h2>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Platform-wide user management</p>
            </div>

            {usersLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
                <Loader2 size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {users.map(u => (
                  <div key={u.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, opacity: u.is_active ? 1 : 0.5 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: `${ROLE_COLOR[u.role] || "#888"}22`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: ROLE_COLOR[u.role] || "#888", fontWeight: 800, fontSize: 15,
                    }}>
                      {u.email[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: `${ROLE_COLOR[u.role] || "#888"}22`, color: ROLE_COLOR[u.role] || "#888", fontWeight: 700 }}>
                          {u.role.replace("_", " ")}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{u.org_name}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleUser(u.id)}
                        style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: u.is_active ? "var(--success-dim)" : "var(--bg-card-2)", color: u.is_active ? "var(--success)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title={u.is_active ? "Deactivate" : "Activate"}
                      >
                        {u.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button
                        onClick={() => deleteUser(u.id, u.email)}
                        style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "var(--danger-dim)", color: "var(--danger)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="Delete user"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ──────────────────────────────────────────────── */}
        {section === "settings" && (
          <div className="fade-up">
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Platform Settings</h2>

            {[
              {
                icon: <Lock size={18} />, title: "Authentication",
                desc: "JWT expiry, password policy, MFA settings",
                items: ["Access token: 60 min", "Refresh token: 30 days", "Password: Min 8 chars"]
              },
              {
                icon: <Bell size={18} />, title: "Notifications",
                desc: "Push notification and alert configuration",
                items: ["FCM push enabled", "Email alerts: enabled", "Dispute alerts: on"]
              },
              {
                icon: <Server size={18} />, title: "System",
                desc: "API version, environment, and infrastructure",
                items: ["API v1.0.0", "Environment: production", "DB: PostgreSQL + pgvector"]
              },
            ].map((s, i) => (
              <div key={i} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.desc}</div>
                  </div>
                </div>
                {s.items.map((item, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: j === 0 ? "1px solid var(--border)" : "none" }}>
                    <Check size={12} style={{ color: "var(--success)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* Subscriptions — Coming Soon */}
            <div className="card" style={{ marginBottom: 12, background: "linear-gradient(135deg, #1b1437, var(--bg-card))", border: "1px solid var(--border-accent)", textAlign: "center", padding: 24 }}>
              <CreditCard size={32} style={{ color: "var(--accent)", margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Subscriptions & Licensing</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>Manage org plans, billing cycles, and feature gating</div>
              <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", padding: "4px 14px", borderRadius: 99, fontWeight: 700 }}>🚀 Coming Soon</span>
            </div>
          </div>
        )}

        {/* ── AUDIT LOGS ────────────────────────────────────────────── */}
        {section === "audit" && (
          <div className="fade-up">
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Audit & Activity Logs</h2>

            {/* Mock audit trail — in production connect to /super/audit endpoint */}
            {[
              { time: "Just now",   action: "SEED", actor: "system",                  detail: "Database reseeded with 5 roles" },
              { time: "2 min ago",  action: "LOGIN", actor: "admin@svgu.edu",          detail: "Org admin logged in" },
              { time: "5 min ago",  action: "ATTEND", actor: "faculty@svgu.edu",       detail: "Finalized attendance — CSE-402 Lecture 4" },
              { time: "1 hr ago",   action: "DISPUTE", actor: "student@svgu.edu",      detail: "Opened dispute for Lecture 1" },
              { time: "2 hr ago",   action: "CREATE", actor: "superadmin@attendai.com", detail: "Organization SVGU created" },
            ].map((log, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0, fontSize: 10, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: log.action === "LOGIN" ? "rgba(48,209,88,0.12)" : log.action === "DISPUTE" ? "rgba(255,69,58,0.12)" : "var(--bg-card-2)",
                  color: log.action === "LOGIN" ? "var(--success)" : log.action === "DISPUTE" ? "var(--danger)" : "var(--accent)",
                }}>
                  {log.action}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{log.detail}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{log.actor} · {log.time}</div>
                </div>
              </div>
            ))}

            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Full audit log coming soon with filters</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(12,10,24,0.95)", backdropFilter: "blur(20px)",
        borderTop: "1px solid var(--border)",
        display: "flex", padding: "8px 0 20px",
      }}>
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => setSection(n.id)}
            style={{
              flex: 1, background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0",
              color: section === n.id ? "#ff9f0a" : "var(--text-muted)",
              transition: "color 0.15s",
            }}
          >
            {n.icon}
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{n.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}
