"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Globe, Users, BookOpen, Building2, AlertTriangle, BarChart3,
  LogOut, Settings, Shield, Activity, Loader2,
  Plus, Trash2, ToggleLeft, ToggleRight,
  Database, Bell, Lock, Server, Check, X, CreditCard,
  GraduationCap, UserCog, ChevronDown, ChevronRight,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────

interface OrgDetail {
  id: string; name: string; code: string;
  departments: number; students: number; faculty: number; lectures: number;
  created_at: string; settings: Record<string, any>;
}
interface PlatformStats {
  total_orgs: number; total_users: number; total_students: number;
  total_faculty: number; total_lectures: number; total_attendance_records: number;
  open_disputes: number; organizations: OrgDetail[];
}
interface UserRow {
  id: string; email: string; role: string; org_name: string;
  is_active: boolean; created_at: string;
}
interface DeptRow {
  id: string; name: string; code: string; institute_name: string;
  org_id: string; org_name: string; student_count: number; faculty_count: number;
}
interface StudentRow {
  id: string; name: string; roll_no: string; enrollment_no: string;
  division: string; batch: string; semester: number;
  dept_id: string; dept_name: string; org_name: string; email: string;
}
interface FacultyRow {
  id: string; name: string; designation: string;
  dept_id: string; dept_name: string; org_name: string; email: string;
}

type Section = "overview" | "orgs" | "departments" | "students" | "faculty" | "users" | "settings";

const ROLE_COLOR: Record<string, string> = {
  super_admin: "#ff453a", org_admin: "#ff9f0a",
  dept_admin: "#ffd60a", faculty: "#30d158", student: "#0a84ff",
};

// ─── Small reusable components ─────────────────────────────

function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg.startsWith("✓");
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: ok ? "var(--success)" : "var(--danger)",
      color: "white", padding: "10px 20px", borderRadius: 99, fontSize: 13,
      fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      animation: "slideDown 0.3s ease", whiteSpace: "nowrap",
    }}>
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
      <Loader2 size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-muted)", fontSize: 13 }}>
      {label}
    </div>
  );
}

function IconBtn({ icon, color, onClick, title }: { icon: React.ReactNode; color: string; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 30, height: 30, borderRadius: 8, border: "none",
      background: `${color}22`, color, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      {icon}
    </button>
  );
}

// ─── Modal shell ───────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 430, padding: 24, maxHeight: "90dvh", overflowY: "auto",
        animation: "slideUp 0.25s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export default function SuperDashboard() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [stats, setStats]         = useState<PlatformStats | null>(null);
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [depts, setDepts]         = useState<DeptRow[]>([]);
  const [students, setStudents]   = useState<StudentRow[]>([]);
  const [faculty, setFaculty]     = useState<FacultyRow[]>([]);
  const [orgs, setOrgs]           = useState<OrgDetail[]>([]);

  const [loading, setLoading]         = useState(true);
  const [subLoading, setSubLoading]   = useState(false);
  const [toast, setToast]             = useState("");

  // Filter state
  const [filterOrgId, setFilterOrgId] = useState("");

  // Modal state
  type ModalType = "org" | "dept" | "student" | "faculty" | null;
  const [modal, setModal] = useState<ModalType>(null);

  // Form state – org
  const [fOrgName, setFOrgName]   = useState("");
  const [fOrgCode, setFOrgCode]   = useState("");
  const [fOrgMin, setFOrgMin]     = useState(75);

  // Form state – dept
  const [fDeptOrgId, setFDeptOrgId]         = useState("");
  const [fDeptName, setFDeptName]           = useState("");
  const [fDeptCode, setFDeptCode]           = useState("");
  const [fDeptInstitute, setFDeptInstitute] = useState("");

  // Form state – student
  const [fStName, setFStName]           = useState("");
  const [fStRoll, setFStRoll]           = useState("");
  const [fStEnroll, setFStEnroll]       = useState("");
  const [fStEmail, setFStEmail]         = useState("");
  const [fStDiv, setFStDiv]             = useState("");
  const [fStBatch, setFStBatch]         = useState("");
  const [fStSem, setFStSem]             = useState("");
  const [fStDeptId, setFStDeptId]       = useState("");

  // Form state – faculty
  const [fFacName, setFFacName]             = useState("");
  const [fFacEmail, setFFacEmail]           = useState("");
  const [fFacDesig, setFFacDesig]           = useState("");
  const [fFacDeptId, setFFacDeptId]         = useState("");

  const [saving, setSaving] = useState(false);

  // ─── Helpers ───────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function closeModal() {
    setModal(null);
    setSaving(false);
  }

  function handleLogout() {
    localStorage.clear();
    router.replace("/login");
  }

  // ─── Data loaders ──────────────────────────────────────

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/admin/stats");
      if (res.ok) {
        const data: PlatformStats = await res.json();
        setStats(data);
        setOrgs(data.organizations);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (section === "users") loadUsers();
    if (section === "departments") loadDepts();
    if (section === "students") loadStudents();
    if (section === "faculty") loadFaculty();
  }, [section]);

  async function loadUsers() {
    setSubLoading(true);
    try {
      const res = await apiFetch("/admin/users");
      if (res.ok) setUsers(await res.json());
    } catch {} finally { setSubLoading(false); }
  }

  async function loadDepts(orgId?: string) {
    setSubLoading(true);
    const url = orgId ? `/admin/departments?org_id=${orgId}` : "/admin/departments";
    try {
      const res = await apiFetch(url);
      if (res.ok) setDepts(await res.json());
    } catch {} finally { setSubLoading(false); }
  }

  async function loadStudents(orgId?: string) {
    setSubLoading(true);
    const url = orgId ? `/admin/students?org_id=${orgId}` : "/admin/students";
    try {
      const res = await apiFetch(url);
      if (res.ok) setStudents(await res.json());
    } catch {} finally { setSubLoading(false); }
  }

  async function loadFaculty(orgId?: string) {
    setSubLoading(true);
    const url = orgId ? `/admin/faculty?org_id=${orgId}` : "/admin/faculty";
    try {
      const res = await apiFetch(url);
      if (res.ok) setFaculty(await res.json());
    } catch {} finally { setSubLoading(false); }
  }

  function applyOrgFilter(oid: string) {
    setFilterOrgId(oid);
    if (section === "departments") loadDepts(oid || undefined);
    if (section === "students")   loadStudents(oid || undefined);
    if (section === "faculty")    loadFaculty(oid || undefined);
  }

  // ─── Create actions ────────────────────────────────────

  async function createOrg() {
    if (!fOrgName || !fOrgCode) return;
    setSaving(true);
    try {
      const res = await apiFetch("/admin/orgs", {
        method: "POST",
        body: JSON.stringify({ name: fOrgName, code: fOrgCode, min_attendance: fOrgMin }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      showToast(`✓ Organization "${fOrgName}" created`);
      closeModal();
      loadStats();
    } catch (e: any) { showToast("✗ " + e.message); }
    finally { setSaving(false); }
  }

  async function createDept() {
    if (!fDeptOrgId || !fDeptName || !fDeptCode) return;
    setSaving(true);
    try {
      const res = await apiFetch("/admin/departments", {
        method: "POST",
        body: JSON.stringify({ org_id: fDeptOrgId, name: fDeptName, code: fDeptCode, institute_name: fDeptInstitute || null }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      showToast(`✓ Department "${fDeptName}" created`);
      closeModal();
      loadDepts(filterOrgId || undefined);
      loadStats();
    } catch (e: any) { showToast("✗ " + e.message); }
    finally { setSaving(false); }
  }

  async function createStudent() {
    if (!fStName || !fStRoll || !fStEmail || !fStDeptId) return;
    setSaving(true);
    try {
      const res = await apiFetch("/admin/students", {
        method: "POST",
        body: JSON.stringify({
          name: fStName, roll_no: fStRoll, enrollment_no: fStEnroll || null,
          email: fStEmail, division: fStDiv || null, batch: fStBatch || null,
          semester: fStSem ? Number(fStSem) : null, dept_id: fStDeptId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      showToast(`✓ Student "${fStName}" created (password: Student@123)`);
      closeModal();
      loadStudents(filterOrgId || undefined);
      loadStats();
    } catch (e: any) { showToast("✗ " + e.message); }
    finally { setSaving(false); }
  }

  async function createFaculty() {
    if (!fFacName || !fFacEmail || !fFacDeptId) return;
    setSaving(true);
    try {
      const res = await apiFetch("/admin/faculty", {
        method: "POST",
        body: JSON.stringify({ name: fFacName, email: fFacEmail, designation: fFacDesig || null, dept_id: fFacDeptId }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      showToast(`✓ Faculty "${fFacName}" created (password: Faculty@123)`);
      closeModal();
      loadFaculty(filterOrgId || undefined);
      loadStats();
    } catch (e: any) { showToast("✗ " + e.message); }
    finally { setSaving(false); }
  }

  // ─── Delete actions ────────────────────────────────────

  async function deleteOrg(id: string, name: string) {
    if (!confirm(`Delete organization "${name}"? ALL data will be lost.`)) return;
    const res = await apiFetch(`/admin/orgs/${id}`, { method: "DELETE" });
    if (res.ok) { showToast(`✓ "${name}" deleted`); loadStats(); }
  }

  async function deleteDept(id: string, name: string) {
    if (!confirm(`Delete department "${name}"?`)) return;
    const res = await apiFetch(`/admin/departments/${id}`, { method: "DELETE" });
    if (res.ok) { showToast(`✓ "${name}" deleted`); loadDepts(filterOrgId || undefined); loadStats(); }
  }

  async function deleteStudent(id: string, name: string) {
    if (!confirm(`Delete student "${name}" and their account?`)) return;
    const res = await apiFetch(`/admin/students/${id}`, { method: "DELETE" });
    if (res.ok) { showToast(`✓ "${name}" deleted`); loadStudents(filterOrgId || undefined); loadStats(); }
  }

  async function deleteFaculty(id: string, name: string) {
    if (!confirm(`Delete faculty "${name}" and their account?`)) return;
    const res = await apiFetch(`/admin/faculty/${id}`, { method: "DELETE" });
    if (res.ok) { showToast(`✓ "${name}" deleted`); loadFaculty(filterOrgId || undefined); loadStats(); }
  }

  async function toggleUser(id: string) {
    const res = await apiFetch(`/admin/users/${id}/toggle`, { method: "PATCH" });
    if (res.ok) {
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: updated.is_active } : u));
      showToast(updated.is_active ? "✓ User activated" : "✓ User deactivated");
    }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user "${email}"?`)) return;
    const res = await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) { setUsers(prev => prev.filter(u => u.id !== id)); showToast(`✓ "${email}" deleted`); }
  }

  // ─── Stat cards ────────────────────────────────────────

  const statCards = stats ? [
    { icon: <Globe size={20} />,         label: "Organizations", value: stats.total_orgs,               color: "#0a84ff" },
    { icon: <Users size={20} />,         label: "Total Users",   value: stats.total_users,              color: "#30d158" },
    { icon: <GraduationCap size={20} />, label: "Students",      value: stats.total_students,           color: "#5e5ce6" },
    { icon: <BookOpen size={20} />,      label: "Faculty",       value: stats.total_faculty,            color: "#ff9f0a" },
    { icon: <BarChart3 size={20} />,     label: "Lectures",      value: stats.total_lectures,           color: "#ff6b35" },
    { icon: <AlertTriangle size={20} />, label: "Open Disputes", value: stats.open_disputes,            color: "#ff453a" },
  ] : [];

  const navItems: { id: Section; icon: React.ReactNode; label: string }[] = [
    { id: "overview",    icon: <Activity size={18} />,       label: "Home" },
    { id: "orgs",        icon: <Globe size={18} />,          label: "Orgs" },
    { id: "departments", icon: <Building2 size={18} />,      label: "Depts" },
    { id: "students",    icon: <GraduationCap size={18} />,  label: "Students" },
    { id: "faculty",     icon: <UserCog size={18} />,        label: "Faculty" },
    { id: "users",       icon: <Users size={18} />,          label: "Users" },
    { id: "settings",    icon: <Settings size={18} />,       label: "Settings" },
  ];

  // ─── Org filter dropdown (shared for depts/students/faculty)

  function OrgFilter() {
    return (
      <select
        className="select-input"
        value={filterOrgId}
        onChange={e => applyOrgFilter(e.target.value)}
        style={{ marginBottom: 16, fontSize: 13, padding: "10px 12px", height: 40 }}
      >
        <option value="">All Organizations</option>
        {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
      </select>
    );
  }

  // ─── Section: Add button row ────────────────────────────

  function SectionHeader({ title, sub, onAdd, addLabel }: { title: string; sub?: string; onAdd?: () => void; addLabel?: string }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
          {sub && <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{sub}</p>}
        </div>
        {onAdd && (
          <button className="btn btn-primary" style={{ height: 36, padding: "0 14px", fontSize: 13, width: "auto", gap: 6 }} onClick={onAdd}>
            <Plus size={15} /> {addLabel}
          </button>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 90 }}>

      <Toast msg={toast} />

      {/* Top bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(12,10,24,0.95)", backdropFilter: "blur(20px)",
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
            <div style={{ fontSize: 14, fontWeight: 700 }}>AttendAI</div>
            <div style={{ fontSize: 10, color: "#ff9f0a", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Super Admin</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <LogOut size={15} /> Logout
        </button>
      </div>

      {/* Page content */}
      <div style={{ padding: "16px 16px 0" }}>

        {/* ── OVERVIEW ─────────────────────────────────────── */}
        {section === "overview" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 2 }}>Platform Control Center</p>
              <h2 style={{ fontSize: 22, fontWeight: 800 }}>Platform Overview</h2>
            </div>

            {loading ? <Spinner /> : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  {statCards.map((s, i) => (
                    <div key={i} className="card" style={{ padding: "14px 16px" }}>
                      <div style={{ color: s.color, marginBottom: 8 }}>{s.icon}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Organizations</span>
                  <button onClick={() => setSection("orgs")} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Manage →</button>
                </div>

                {stats?.organizations.map(org => (
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

        {/* ── ORGANIZATIONS ─────────────────────────────────── */}
        {section === "orgs" && (
          <div className="fade-up">
            <SectionHeader title="Organizations" sub="Manage all institutions on the platform" onAdd={() => setModal("org")} addLabel="Add Org" />
            {loading ? <Spinner /> : (
              stats?.organizations.length === 0 ? <EmptyState label="No organizations yet" /> :
              stats?.organizations.map(org => (
                <div key={org.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{org.name}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 8px", borderRadius: 99 }}>{org.code}</span>
                        <span style={{ fontSize: 11, background: "var(--bg-card-2)", color: "var(--text-secondary)", padding: "2px 8px", borderRadius: 99 }}>Min {org.settings?.minAttendancePercent ?? 75}%</span>
                      </div>
                    </div>
                    <IconBtn icon={<Trash2 size={14} />} color="var(--danger)" onClick={() => deleteOrg(org.id, org.name)} title="Delete org" />
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
              ))
            )}
          </div>
        )}

        {/* ── DEPARTMENTS ────────────────────────────────────── */}
        {section === "departments" && (
          <div className="fade-up">
            <SectionHeader title="Departments" sub="Manage departments across all orgs" onAdd={() => { setFDeptOrgId(orgs[0]?.id || ""); setModal("dept"); }} addLabel="Add Dept" />
            <OrgFilter />
            {subLoading ? <Spinner /> : depts.length === 0 ? <EmptyState label="No departments found" /> : (
              depts.map(dept => (
                <div key={dept.id} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{dept.name}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 8px", borderRadius: 99 }}>{dept.code}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{dept.org_name}</span>
                        {dept.institute_name && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{dept.institute_name}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><span style={{ fontWeight: 700, color: "#5e5ce6" }}>{dept.student_count}</span> students</span>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><span style={{ fontWeight: 700, color: "#30d158" }}>{dept.faculty_count}</span> faculty</span>
                      </div>
                    </div>
                    <IconBtn icon={<Trash2 size={14} />} color="var(--danger)" onClick={() => deleteDept(dept.id, dept.name)} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── STUDENTS ───────────────────────────────────────── */}
        {section === "students" && (
          <div className="fade-up">
            <SectionHeader title="Students" sub="All students across the platform" onAdd={() => { setFStDeptId(depts[0]?.id || ""); setModal("student"); }} addLabel="Add Student" />
            <OrgFilter />
            {subLoading ? <Spinner /> : students.length === 0 ? <EmptyState label="No students found" /> : (
              students.map(s => (
                <div key={s.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(94,92,230,0.15)", color: "#5e5ce6",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15,
                  }}>
                    {s.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {s.roll_no} · {s.dept_name} · {s.org_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {[s.division && `Div ${s.division}`, s.batch && `Batch ${s.batch}`, s.semester && `Sem ${s.semester}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <IconBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={() => deleteStudent(s.id, s.name)} />
                </div>
              ))
            )}
          </div>
        )}

        {/* ── FACULTY ────────────────────────────────────────── */}
        {section === "faculty" && (
          <div className="fade-up">
            <SectionHeader title="Faculty" sub="All faculty members across the platform" onAdd={() => { setFFacDeptId(depts[0]?.id || ""); setModal("faculty"); }} addLabel="Add Faculty" />
            <OrgFilter />
            {subLoading ? <Spinner /> : faculty.length === 0 ? <EmptyState label="No faculty found" /> : (
              faculty.map(f => (
                <div key={f.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(48,209,88,0.12)", color: "#30d158",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15,
                  }}>
                    {f.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {f.designation || "Faculty"} · {f.dept_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{f.email} · {f.org_name}</div>
                  </div>
                  <IconBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={() => deleteFaculty(f.id, f.name)} />
                </div>
              ))
            )}
          </div>
        )}

        {/* ── USERS ──────────────────────────────────────────── */}
        {section === "users" && (
          <div className="fade-up">
            <SectionHeader title="All Users" sub="Platform-wide user management" />
            {subLoading ? <Spinner /> : users.length === 0 ? <EmptyState label="No users found" /> : (
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
                          {u.role.replace(/_/g, " ")}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{u.org_name}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <IconBtn
                        icon={u.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        color={u.is_active ? "var(--success)" : "var(--text-muted)"}
                        onClick={() => toggleUser(u.id)}
                        title={u.is_active ? "Deactivate" : "Activate"}
                      />
                      <IconBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={() => deleteUser(u.id, u.email)} title="Delete user" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ───────────────────────────────────────── */}
        {section === "settings" && (
          <div className="fade-up">
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Platform Settings</h2>
            {[
              { icon: <Lock size={18} />, title: "Authentication", desc: "JWT expiry, password policy, MFA settings", items: ["Access token: 60 min", "Refresh token: 30 days", "Password: Min 8 chars"] },
              { icon: <Bell size={18} />, title: "Notifications", desc: "Push notification and alert configuration", items: ["FCM push enabled", "Email alerts: enabled", "Dispute alerts: on"] },
              { icon: <Server size={18} />, title: "System", desc: "API version, environment, and infrastructure", items: ["API v1.0.0", "Environment: production", "DB: PostgreSQL + pgvector"] },
            ].map((s, i) => (
              <div key={i} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>{s.icon}</div>
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
            <div className="card" style={{ background: "linear-gradient(135deg, #1b1437, var(--bg-card))", border: "1px solid var(--border-accent)", textAlign: "center", padding: 24 }}>
              <CreditCard size={32} style={{ color: "var(--accent)", margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Subscriptions & Licensing</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>Manage org plans, billing cycles, and feature gating</div>
              <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", padding: "4px 14px", borderRadius: 99, fontWeight: 700 }}>🚀 Coming Soon</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(12,10,24,0.95)", backdropFilter: "blur(20px)",
        borderTop: "1px solid var(--border)",
        display: "flex", padding: "8px 0 20px", overflowX: "auto",
      }}>
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => { setSection(n.id); setFilterOrgId(""); }}
            style={{
              flex: 1, minWidth: 52, background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 4px",
              color: section === n.id ? "#ff9f0a" : "var(--text-muted)",
              transition: "color 0.15s",
            }}
          >
            {n.icon}
            <span style={{ fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{n.label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════════ */}

      {/* Create Org */}
      {modal === "org" && (
        <Modal title="New Organization" onClose={closeModal}>
          <Field label="Organization Name">
            <input className="input" placeholder="e.g. Gujarat University" value={fOrgName} onChange={e => setFOrgName(e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Code">
              <input className="input" placeholder="GU" value={fOrgCode} onChange={e => setFOrgCode(e.target.value.toUpperCase())} maxLength={8} />
            </Field>
            <Field label="Min Attendance %">
              <input className="input" type="number" value={fOrgMin} onChange={e => setFOrgMin(Number(e.target.value))} min={50} max={100} />
            </Field>
          </div>
          <button className="btn btn-primary" onClick={createOrg} disabled={saving || !fOrgName || !fOrgCode} style={{ marginTop: 4 }}>
            {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Create Organization</>}
          </button>
        </Modal>
      )}

      {/* Create Department */}
      {modal === "dept" && (
        <Modal title="New Department" onClose={closeModal}>
          <Field label="Organization">
            <select className="select-input" value={fDeptOrgId} onChange={e => setFDeptOrgId(e.target.value)}>
              <option value="">Select org...</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
            </select>
          </Field>
          <Field label="Department Name">
            <input className="input" placeholder="e.g. Computer Science & Engineering" value={fDeptName} onChange={e => setFDeptName(e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Code">
              <input className="input" placeholder="CSE" value={fDeptCode} onChange={e => setFDeptCode(e.target.value.toUpperCase())} maxLength={8} />
            </Field>
            <Field label="Institute Name (optional)">
              <input className="input" placeholder="Institute of Tech" value={fDeptInstitute} onChange={e => setFDeptInstitute(e.target.value)} />
            </Field>
          </div>
          <button className="btn btn-primary" onClick={createDept} disabled={saving || !fDeptOrgId || !fDeptName || !fDeptCode} style={{ marginTop: 4 }}>
            {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Create Department</>}
          </button>
        </Modal>
      )}

      {/* Create Student */}
      {modal === "student" && (
        <Modal title="Add Student" onClose={closeModal}>
          <Field label="Department">
            <select className="select-input" value={fStDeptId} onChange={e => setFStDeptId(e.target.value)}>
              <option value="">Select department...</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name} — {d.org_name}</option>)}
            </select>
          </Field>
          <Field label="Full Name">
            <input className="input" placeholder="Rahul Sharma" value={fStName} onChange={e => setFStName(e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Roll No">
              <input className="input" placeholder="CS001" value={fStRoll} onChange={e => setFStRoll(e.target.value)} />
            </Field>
            <Field label="Enrollment No (opt)">
              <input className="input" placeholder="EN2024001" value={fStEnroll} onChange={e => setFStEnroll(e.target.value)} />
            </Field>
          </div>
          <Field label="Email">
            <input className="input" type="email" placeholder="student@college.edu" value={fStEmail} onChange={e => setFStEmail(e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Division">
              <input className="input" placeholder="A" value={fStDiv} onChange={e => setFStDiv(e.target.value)} maxLength={2} />
            </Field>
            <Field label="Batch">
              <input className="input" placeholder="B1" value={fStBatch} onChange={e => setFStBatch(e.target.value)} maxLength={4} />
            </Field>
            <Field label="Semester">
              <input className="input" type="number" placeholder="4" value={fStSem} onChange={e => setFStSem(e.target.value)} min={1} max={10} />
            </Field>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Default password: <strong>Student@123</strong></p>
          <button className="btn btn-primary" onClick={createStudent} disabled={saving || !fStName || !fStRoll || !fStEmail || !fStDeptId}>
            {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Add Student</>}
          </button>
        </Modal>
      )}

      {/* Create Faculty */}
      {modal === "faculty" && (
        <Modal title="Add Faculty" onClose={closeModal}>
          <Field label="Department">
            <select className="select-input" value={fFacDeptId} onChange={e => setFFacDeptId(e.target.value)}>
              <option value="">Select department...</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name} — {d.org_name}</option>)}
            </select>
          </Field>
          <Field label="Full Name">
            <input className="input" placeholder="Dr. Jaimin Patel" value={fFacName} onChange={e => setFFacName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" placeholder="faculty@college.edu" value={fFacEmail} onChange={e => setFFacEmail(e.target.value)} />
          </Field>
          <Field label="Designation (optional)">
            <input className="input" placeholder="Professor / Head of Dept" value={fFacDesig} onChange={e => setFFacDesig(e.target.value)} />
          </Field>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Default password: <strong>Faculty@123</strong></p>
          <button className="btn btn-primary" onClick={createFaculty} disabled={saving || !fFacName || !fFacEmail || !fFacDeptId}>
            {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Add Faculty</>}
          </button>
        </Modal>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        :root { --bg: #0c0a18; }
      `}</style>
    </div>
  );
}
