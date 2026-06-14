"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Globe, Users, Building2, Shield, Activity, LogOut, Settings,
  Plus, Trash2, ToggleLeft, ToggleRight, Loader2, ChevronRight,
  ChevronLeft, Check, X, GraduationCap, UserCog, CreditCard, Bell,
  Lock, Server, BarChart3, AlertTriangle, UserCheck, BookOpen,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */
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
interface UserRow {
  id: string; email: string; role: string; org_name: string;
  is_active: boolean; created_at: string;
}

type TopSection = "overview" | "orgs" | "users" | "settings";
type OrgTab = "departments" | "faculty" | "students" | "admins";
type ModalType = "org" | "dept" | "student" | "faculty" | null;

/* ═══════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg.startsWith("✓");
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      background: ok ? "var(--success)" : "var(--danger)",
      color: "white", padding: "10px 22px", borderRadius: 99, fontSize: 13,
      fontWeight: 700, zIndex: 9999, boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      whiteSpace: "nowrap", animation: "slideDown 0.3s ease",
    }}>
      {msg}
    </div>
  );
}

function Spinner({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <Loader2 size={size} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
    </div>
  );
}

function EmptyState({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px" }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 10, display: "flex", justifyContent: "center" }}>
        {icon || <Building2 size={32} />}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</p>
    </div>
  );
}

function IconBtn({ icon, color, onClick, title }: { icon: React.ReactNode; color: string; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
      background: `${color}18`, color, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "background 0.15s",
    }}>
      {icon}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 500,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--bg-card)", borderRadius: "22px 22px 0 0",
        width: "100%", maxWidth: 430, padding: "24px 20px 36px",
        maxHeight: "92dvh", overflowY: "auto",
        animation: "slideUp 0.28s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>{title}</span>
          <button onClick={onClose} style={{ background: "var(--bg-card-2)", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="form-group"><label className="form-label">{label}</label>{children}</div>;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function SuperDashboard() {
  const router = useRouter();

  // Top-level navigation state
  const [topSection, setTopSection] = useState<TopSection>("overview");

  // Platform data
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);

  // Drill-down: selected org
  const [selectedOrg, setSelectedOrg] = useState<OrgDetail | null>(null);
  const [orgTab, setOrgTab] = useState<OrgTab>("departments");
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [faculty, setFaculty] = useState<FacultyRow[]>([]);
  const [orgDataLoading, setOrgDataLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState("");

  // Modal
  const [modal, setModal] = useState<ModalType>(null);
  const [saving, setSaving] = useState(false);

  // Form – Org
  const [fOrgName, setFOrgName] = useState(""); const [fOrgCode, setFOrgCode] = useState(""); const [fOrgMin, setFOrgMin] = useState(75);

  // Form – Dept
  const [fDeptName, setFDeptName] = useState(""); const [fDeptCode, setFDeptCode] = useState(""); const [fDeptInstitute, setFDeptInstitute] = useState("");

  // Form – Student
  const [fStName, setFStName] = useState(""); const [fStRoll, setFStRoll] = useState(""); const [fStEnroll, setFStEnroll] = useState("");
  const [fStEmail, setFStEmail] = useState(""); const [fStDiv, setFStDiv] = useState(""); const [fStBatch, setFStBatch] = useState("");
  const [fStSem, setFStSem] = useState(""); const [fStDeptId, setFStDeptId] = useState("");

  // Form – Faculty
  const [fFacName, setFFacName] = useState(""); const [fFacEmail, setFFacEmail] = useState("");
  const [fFacDesig, setFFacDesig] = useState(""); const [fFacDeptId, setFFacDeptId] = useState("");

  /* ── Helpers ─────────────────────────────────────────── */
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }
  function closeModal() { setModal(null); setSaving(false); }

  /* ── Loaders ─────────────────────────────────────────── */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await apiFetch("/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch {} finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (topSection === "users" && users.length === 0) loadUsers();
  }, [topSection]);

  async function loadUsers() {
    setUsersLoading(true);
    try { const r = await apiFetch("/admin/users"); if (r.ok) setUsers(await r.json()); }
    catch {} finally { setUsersLoading(false); }
  }

  // When an org is selected, load its data for the active tab
  async function openOrg(org: OrgDetail) {
    setSelectedOrg(org);
    setOrgTab("departments");
    setDepts([]); setStudents([]); setFaculty([]);
    loadOrgDepts(org.id);
  }

  async function loadOrgDepts(orgId: string) {
    setOrgDataLoading(true);
    try { const r = await apiFetch(`/admin/departments?org_id=${orgId}`); if (r.ok) setDepts(await r.json()); }
    catch {} finally { setOrgDataLoading(false); }
  }

  async function loadOrgStudents(orgId: string) {
    if (students.length > 0) return;
    setOrgDataLoading(true);
    try { const r = await apiFetch(`/admin/students?org_id=${orgId}`); if (r.ok) setStudents(await r.json()); }
    catch {} finally { setOrgDataLoading(false); }
  }

  async function loadOrgFaculty(orgId: string) {
    if (faculty.length > 0) return;
    setOrgDataLoading(true);
    try { const r = await apiFetch(`/admin/faculty?org_id=${orgId}`); if (r.ok) setFaculty(await r.json()); }
    catch {} finally { setOrgDataLoading(false); }
  }

  function switchOrgTab(tab: OrgTab) {
    setOrgTab(tab);
    if (!selectedOrg) return;
    if (tab === "departments") loadOrgDepts(selectedOrg.id);
    if (tab === "students") loadOrgStudents(selectedOrg.id);
    if (tab === "faculty") loadOrgFaculty(selectedOrg.id);
  }

  /* ── CRUD ────────────────────────────────────────────── */
  async function createOrg() {
    if (!fOrgName || !fOrgCode) return;
    setSaving(true);
    try {
      const r = await apiFetch("/admin/orgs", { method: "POST", body: JSON.stringify({ name: fOrgName, code: fOrgCode, min_attendance: fOrgMin }) });
      if (!r.ok) throw new Error((await r.json()).detail);
      showToast(`✓ "${fOrgName}" created`);
      closeModal(); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function createDept() {
    if (!selectedOrg || !fDeptName || !fDeptCode) return;
    setSaving(true);
    try {
      const r = await apiFetch("/admin/departments", { method: "POST", body: JSON.stringify({ org_id: selectedOrg.id, name: fDeptName, code: fDeptCode, institute_name: fDeptInstitute || null }) });
      if (!r.ok) throw new Error((await r.json()).detail);
      showToast(`✓ "${fDeptName}" created`);
      closeModal(); setDepts([]); loadOrgDepts(selectedOrg.id); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function createStudent() {
    if (!fStName || !fStRoll || !fStEmail || !fStDeptId) return;
    setSaving(true);
    try {
      const r = await apiFetch("/admin/students", { method: "POST", body: JSON.stringify({ name: fStName, roll_no: fStRoll, enrollment_no: fStEnroll || null, email: fStEmail, division: fStDiv || null, batch: fStBatch || null, semester: fStSem ? Number(fStSem) : null, dept_id: fStDeptId }) });
      if (!r.ok) throw new Error((await r.json()).detail);
      showToast(`✓ "${fStName}" added`);
      closeModal(); setStudents([]); if (selectedOrg) loadOrgStudents(selectedOrg.id); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function createFaculty() {
    if (!fFacName || !fFacEmail || !fFacDeptId) return;
    setSaving(true);
    try {
      const r = await apiFetch("/admin/faculty", { method: "POST", body: JSON.stringify({ name: fFacName, email: fFacEmail, designation: fFacDesig || null, dept_id: fFacDeptId }) });
      if (!r.ok) throw new Error((await r.json()).detail);
      showToast(`✓ "${fFacName}" added`);
      closeModal(); setFaculty([]); if (selectedOrg) loadOrgFaculty(selectedOrg.id); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function deleteOrg(id: string, name: string) {
    if (!confirm(`Delete "${name}"? All data will be lost permanently.`)) return;
    const r = await apiFetch(`/admin/orgs/${id}`, { method: "DELETE" });
    if (r.ok) { showToast(`✓ "${name}" deleted`); loadStats(); if (selectedOrg?.id === id) { setSelectedOrg(null); setTopSection("orgs"); } }
  }

  async function deleteDept(id: string, name: string) {
    if (!confirm(`Delete department "${name}"?`)) return;
    const r = await apiFetch(`/admin/departments/${id}`, { method: "DELETE" });
    if (r.ok) { showToast(`✓ "${name}" deleted`); setDepts(p => p.filter(d => d.id !== id)); loadStats(); }
  }

  async function deleteStudent(id: string, name: string) {
    if (!confirm(`Delete student "${name}"?`)) return;
    const r = await apiFetch(`/admin/students/${id}`, { method: "DELETE" });
    if (r.ok) { showToast(`✓ "${name}" deleted`); setStudents(p => p.filter(s => s.id !== id)); loadStats(); }
  }

  async function deleteFaculty(id: string, name: string) {
    if (!confirm(`Delete faculty "${name}"?`)) return;
    const r = await apiFetch(`/admin/faculty/${id}`, { method: "DELETE" });
    if (r.ok) { showToast(`✓ "${name}" deleted`); setFaculty(p => p.filter(f => f.id !== id)); loadStats(); }
  }

  async function toggleUser(id: string) {
    const r = await apiFetch(`/admin/users/${id}/toggle`, { method: "PATCH" });
    if (r.ok) { const u = await r.json(); setUsers(p => p.map(x => x.id === id ? { ...x, is_active: u.is_active } : x)); showToast(u.is_active ? "✓ Activated" : "✓ Deactivated"); }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user "${email}"?`)) return;
    const r = await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
    if (r.ok) { setUsers(p => p.filter(u => u.id !== id)); showToast(`✓ "${email}" deleted`); }
  }

  /* ── Derived: org admins from users list ─────────────── */
  const orgAdmins = users.filter(u => (u.role === "org_admin" || u.role === "dept_admin") && selectedOrg && u.org_name === selectedOrg.name);

  /* ═══════════════════════════════════════════════════════
     ORG DETAIL VIEW (full-screen drill-down)
     ═══════════════════════════════════════════════════════ */
  if (selectedOrg) {
    const orgTabItems: { id: OrgTab; label: string; icon: React.ReactNode; count?: number }[] = [
      { id: "departments", label: "Departments", icon: <Building2 size={16} />, count: selectedOrg.departments },
      { id: "faculty",     label: "Faculty",     icon: <UserCog size={16} />,   count: selectedOrg.faculty },
      { id: "students",    label: "Students",    icon: <GraduationCap size={16} />, count: selectedOrg.students },
      { id: "admins",      label: "Admins",      icon: <UserCheck size={16} /> },
    ];

    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 90 }}>
        <Toast msg={toast} />

        {/* Org header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(8,7,15,0.97)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)", padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setSelectedOrg(null)}
              style={{ background: "var(--bg-card-2)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0 }}
            >
              <ChevronLeft size={20} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>{selectedOrg.name}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent-2)", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>{selectedOrg.code}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Min {selectedOrg.settings?.minAttendancePercent ?? 75}% attendance</span>
              </div>
            </div>
            <button
              onClick={() => deleteOrg(selectedOrg.id, selectedOrg.name)}
              style={{ background: "var(--danger-dim)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--danger)", flexShrink: 0 }}
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Org stat pills */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 2 }}>
            {[
              { label: "Depts", value: selectedOrg.departments, color: "#38bdf8" },
              { label: "Faculty", value: selectedOrg.faculty, color: "#30d158" },
              { label: "Students", value: selectedOrg.students, color: "#a78bfa" },
              { label: "Lectures", value: selectedOrg.lectures, color: "#f5c842" },
            ].map((s, i) => (
              <div key={i} style={{ flexShrink: 0, background: "var(--bg-card-2)", borderRadius: 10, padding: "6px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sub-tab bar */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--bg)", position: "sticky", top: 117, zIndex: 90 }}>
          {orgTabItems.map(t => (
            <button
              key={t.id}
              onClick={() => switchOrgTab(t.id)}
              style={{
                flex: 1, background: "none", border: "none", cursor: "pointer",
                padding: "12px 4px 10px",
                color: orgTab === t.id ? "var(--accent-2)" : "var(--text-muted)",
                borderBottom: orgTab === t.id ? "2px solid var(--accent-2)" : "2px solid transparent",
                transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600, fontFamily: "inherit", letterSpacing: 0.2,
              }}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span style={{ fontSize: 9, color: orgTab === t.id ? "var(--accent-2)" : "var(--text-muted)", fontWeight: 700 }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: "16px" }}>

          {/* ── DEPARTMENTS TAB ── */}
          {orgTab === "departments" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Departments</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>in {selectedOrg.name}</div>
                </div>
                <button
                  onClick={() => { setFDeptName(""); setFDeptCode(""); setFDeptInstitute(""); setModal("dept"); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))", border: "none", borderRadius: 10, padding: "8px 14px", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                >
                  <Plus size={15} /> Add
                </button>
              </div>

              {orgDataLoading ? <Spinner /> : depts.length === 0 ? (
                <EmptyState label="No departments yet" icon={<Building2 size={36} />} />
              ) : (
                depts.map(dept => (
                  <div key={dept.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                          background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, fontSize: 10, color: "var(--accent-2)", letterSpacing: -0.3,
                        }}>
                          {dept.code}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{dept.name}</div>
                          {dept.institute_name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{dept.institute_name}</div>}
                          <div style={{ display: "flex", gap: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <GraduationCap size={12} style={{ color: "#a78bfa" }} />
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><strong style={{ color: "#a78bfa" }}>{dept.student_count}</strong> students</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <UserCog size={12} style={{ color: "#30d158" }} />
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><strong style={{ color: "#30d158" }}>{dept.faculty_count}</strong> faculty</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <IconBtn icon={<Trash2 size={14} />} color="var(--danger)" onClick={() => deleteDept(dept.id, dept.name)} />
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── FACULTY TAB ── */}
          {orgTab === "faculty" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Faculty</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>in {selectedOrg.name}</div>
                </div>
                <button
                  onClick={() => { setFFacName(""); setFFacEmail(""); setFFacDesig(""); setFFacDeptId(depts[0]?.id || ""); setModal("faculty"); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))", border: "none", borderRadius: 10, padding: "8px 14px", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                >
                  <Plus size={15} /> Add
                </button>
              </div>

              {orgDataLoading ? <Spinner /> : faculty.length === 0 ? (
                <EmptyState label="No faculty in this org" icon={<UserCog size={36} />} />
              ) : (
                faculty.map(f => (
                  <div key={f.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: "rgba(48,209,88,0.12)", color: "#30d158", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
                      {f.name[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{f.designation || "Faculty"} · {f.dept_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{f.email}</div>
                    </div>
                    <IconBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={() => deleteFaculty(f.id, f.name)} />
                  </div>
                ))
              )}
            </>
          )}

          {/* ── STUDENTS TAB ── */}
          {orgTab === "students" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Students</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>in {selectedOrg.name}</div>
                </div>
                <button
                  onClick={() => { setFStName(""); setFStRoll(""); setFStEnroll(""); setFStEmail(""); setFStDiv(""); setFStBatch(""); setFStSem(""); setFStDeptId(depts[0]?.id || ""); setModal("student"); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))", border: "none", borderRadius: 10, padding: "8px 14px", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                >
                  <Plus size={15} /> Add
                </button>
              </div>

              {orgDataLoading ? <Spinner /> : students.length === 0 ? (
                <EmptyState label="No students in this org" icon={<GraduationCap size={36} />} />
              ) : (
                students.map(s => (
                  <div key={s.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: "rgba(124,111,224,0.12)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
                      {s.name[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {s.roll_no} · {s.dept_name}
                        {[s.division && ` · Div ${s.division}`, s.batch && ` · B${s.batch}`, s.semester && ` · Sem ${s.semester}`].filter(Boolean).join("")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{s.email}</div>
                    </div>
                    <IconBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={() => deleteStudent(s.id, s.name)} />
                  </div>
                ))
              )}
            </>
          )}

          {/* ── ADMINS TAB ── */}
          {orgTab === "admins" && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Admins</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Org & Dept admins in {selectedOrg.name}</div>
              </div>
              {usersLoading ? <Spinner /> : (
                orgAdmins.length === 0 ? (
                  <EmptyState label="No admins found for this org" icon={<UserCheck size={36} />} />
                ) : (
                  orgAdmins.map(u => (
                    <div key={u.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: u.is_active ? 1 : 0.5 }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: u.role === "org_admin" ? "rgba(255,159,10,0.12)" : "rgba(255,214,10,0.12)", color: u.role === "org_admin" ? "#ff9f0a" : "#ffd60a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
                        {u.email[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: u.role === "org_admin" ? "rgba(255,159,10,0.12)" : "rgba(255,214,10,0.12)", color: u.role === "org_admin" ? "#ff9f0a" : "#ffd60a", fontWeight: 700 }}>
                          {u.role.replace(/_/g, " ")}
                        </span>
                      </div>
                      <IconBtn icon={u.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />} color={u.is_active ? "var(--success)" : "var(--text-muted)"} onClick={() => toggleUser(u.id)} title={u.is_active ? "Deactivate" : "Activate"} />
                    </div>
                  ))
                )
              )}
            </>
          )}
        </div>

        {/* Modals for org context */}
        {modal === "dept" && (
          <Modal title={`Add Department · ${selectedOrg.name}`} onClose={closeModal}>
            <Field label="Department Name"><input className="input" placeholder="e.g. Computer Science" value={fDeptName} onChange={e => setFDeptName(e.target.value)} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Code"><input className="input" placeholder="CSE" value={fDeptCode} onChange={e => setFDeptCode(e.target.value.toUpperCase())} maxLength={8} /></Field>
              <Field label="Institute (opt)"><input className="input" placeholder="e.g. IoT" value={fDeptInstitute} onChange={e => setFDeptInstitute(e.target.value)} /></Field>
            </div>
            <button className="btn btn-primary" onClick={createDept} disabled={saving || !fDeptName || !fDeptCode} style={{ marginTop: 4 }}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Create Department</>}
            </button>
          </Modal>
        )}
        {modal === "student" && (
          <Modal title={`Add Student · ${selectedOrg.name}`} onClose={closeModal}>
            <Field label="Department">
              <select className="select-input" value={fStDeptId} onChange={e => setFStDeptId(e.target.value)}>
                <option value="">Select department...</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Full Name"><input className="input" placeholder="Rahul Sharma" value={fStName} onChange={e => setFStName(e.target.value)} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Roll No"><input className="input" placeholder="CS001" value={fStRoll} onChange={e => setFStRoll(e.target.value)} /></Field>
              <Field label="Enroll No (opt)"><input className="input" placeholder="EN2024001" value={fStEnroll} onChange={e => setFStEnroll(e.target.value)} /></Field>
            </div>
            <Field label="Email"><input className="input" type="email" placeholder="student@college.edu" value={fStEmail} onChange={e => setFStEmail(e.target.value)} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Field label="Division"><input className="input" placeholder="A" value={fStDiv} onChange={e => setFStDiv(e.target.value)} maxLength={2} /></Field>
              <Field label="Batch"><input className="input" placeholder="B1" value={fStBatch} onChange={e => setFStBatch(e.target.value)} maxLength={4} /></Field>
              <Field label="Semester"><input className="input" type="number" placeholder="4" value={fStSem} onChange={e => setFStSem(e.target.value)} min={1} max={10} /></Field>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Default password: <strong>Student@123</strong></p>
            <button className="btn btn-primary" onClick={createStudent} disabled={saving || !fStName || !fStRoll || !fStEmail || !fStDeptId}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Add Student</>}
            </button>
          </Modal>
        )}
        {modal === "faculty" && (
          <Modal title={`Add Faculty · ${selectedOrg.name}`} onClose={closeModal}>
            <Field label="Department">
              <select className="select-input" value={fFacDeptId} onChange={e => setFFacDeptId(e.target.value)}>
                <option value="">Select department...</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Full Name"><input className="input" placeholder="Dr. Jaimin Patel" value={fFacName} onChange={e => setFFacName(e.target.value)} /></Field>
            <Field label="Email"><input className="input" type="email" placeholder="faculty@college.edu" value={fFacEmail} onChange={e => setFFacEmail(e.target.value)} /></Field>
            <Field label="Designation (opt)"><input className="input" placeholder="Professor / Head of Dept" value={fFacDesig} onChange={e => setFFacDesig(e.target.value)} /></Field>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Default password: <strong>Faculty@123</strong></p>
            <button className="btn btn-primary" onClick={createFaculty} disabled={saving || !fFacName || !fFacEmail || !fFacDeptId}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Add Faculty</>}
            </button>
          </Modal>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
          @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        `}</style>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     TOP-LEVEL VIEW
     ═══════════════════════════════════════════════════════ */
  const navItems = [
    { id: "overview" as TopSection, icon: <Activity size={20} />, label: "Home" },
    { id: "orgs"     as TopSection, icon: <Globe size={20} />,    label: "Orgs" },
    { id: "users"    as TopSection, icon: <Users size={20} />,    label: "Users" },
    { id: "settings" as TopSection, icon: <Settings size={20} />, label: "Settings" },
  ];

  const ROLE_COLOR: Record<string, string> = {
    super_admin: "#f05a5a", org_admin: "#ff9f0a", dept_admin: "#f5c842", faculty: "#22d37a", student: "#7c6fe0",
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 90 }}>
      <Toast msg={toast} />

      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,7,15,0.97)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)", padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #f05a5a44, #ff9f0a22)",
            border: "1px solid rgba(240,90,90,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={18} style={{ color: "#f05a5a" }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.3 }}>AttendAI</div>
            <div style={{ fontSize: 10, color: "#ff9f0a", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Super Admin</div>
          </div>
        </div>
        <button
          onClick={() => { localStorage.clear(); router.replace("/login"); }}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: 4 }}
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px" }}>

        {/* ── OVERVIEW ── */}
        {topSection === "overview" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>Platform Control</p>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Overview</h2>
            </div>

            {statsLoading ? <Spinner /> : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Organizations", value: stats?.total_orgs,               color: "#38bdf8", icon: <Globe size={18} /> },
                    { label: "Total Users",   value: stats?.total_users,              color: "#30d158", icon: <Users size={18} /> },
                    { label: "Students",      value: stats?.total_students,           color: "#a78bfa", icon: <GraduationCap size={18} /> },
                    { label: "Faculty",       value: stats?.total_faculty,            color: "#f5c842", icon: <UserCog size={18} /> },
                    { label: "Lectures",      value: stats?.total_lectures,           color: "#ff9f0a", icon: <BookOpen size={18} /> },
                    { label: "Open Disputes", value: stats?.open_disputes,            color: "#f05a5a", icon: <AlertTriangle size={18} /> },
                  ].map((s, i) => (
                    <div key={i} className="stat-card">
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 8 }}>{s.icon}</div>
                      <div className="stat-value" style={{ color: s.color, fontSize: 26 }}>{s.value ?? "—"}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Organizations</span>
                  <button onClick={() => setTopSection("orgs")} style={{ fontSize: 12, color: "var(--accent-2)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Manage →</button>
                </div>

                {stats?.organizations.map(org => (
                  <div
                    key={org.id}
                    className="card"
                    style={{ marginBottom: 10, cursor: "pointer", transition: "border-color 0.2s" }}
                    onClick={() => { openOrg(org); }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.2, marginBottom: 4 }}>{org.name}</div>
                        <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent-2)", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>{org.code}</span>
                      </div>
                      <ChevronRight size={18} style={{ color: "var(--text-muted)", marginTop: 2 }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, textAlign: "center" }}>
                      {[
                        { l: "Depts", v: org.departments, c: "#38bdf8" },
                        { l: "Students", v: org.students, c: "#a78bfa" },
                        { l: "Faculty", v: org.faculty, c: "#30d158" },
                        { l: "Lectures", v: org.lectures, c: "#f5c842" },
                      ].map((s, i) => (
                        <div key={i} style={{ background: "var(--bg-card-2)", borderRadius: 8, padding: "7px 4px" }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: s.c }}>{s.v}</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="card" style={{ marginTop: 16, background: "linear-gradient(135deg, #0e0b1e, var(--bg-card))", border: "1px solid var(--border-accent)", textAlign: "center", padding: "14px 16px" }}>
                  <BarChart3 size={18} style={{ color: "var(--accent-2)", marginBottom: 6, display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{stats?.total_attendance_records?.toLocaleString()}</strong> attendance records in database
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ORGANIZATIONS ── */}
        {topSection === "orgs" && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Organizations</h2>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Tap an org to manage its contents</p>
              </div>
              <button
                onClick={() => { setFOrgName(""); setFOrgCode(""); setFOrgMin(75); setModal("org"); }}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))", border: "none", borderRadius: 10, padding: "8px 14px", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, boxShadow: "0 4px 16px var(--accent-glow)" }}
              >
                <Plus size={15} /> New Org
              </button>
            </div>

            {statsLoading ? <Spinner /> : (stats?.organizations.length === 0 ? (
              <EmptyState label="No organizations yet" icon={<Globe size={40} />} />
            ) : (
              stats?.organizations.map(org => (
                <div
                  key={org.id}
                  className="card"
                  style={{ marginBottom: 12, cursor: "pointer" }}
                  onClick={() => openOrg(org)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 50, height: 50, borderRadius: 14, flexShrink: 0,
                      background: "linear-gradient(135deg, var(--accent-dim), rgba(168,85,247,0.05))",
                      border: "1px solid var(--border-accent)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 11, color: "var(--accent-2)", letterSpacing: -0.3,
                    }}>
                      {org.code}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.2, marginBottom: 2 }}>{org.name}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {org.departments} depts · {org.students} students · {org.faculty} faculty
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); deleteOrg(org.id, org.name); }}
                        style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "var(--danger-dim)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={18} style={{ color: "var(--text-muted)", alignSelf: "center" }} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 14, textAlign: "center" }}>
                    {[
                      { l: "Depts", v: org.departments, c: "#38bdf8" },
                      { l: "Students", v: org.students, c: "#a78bfa" },
                      { l: "Faculty", v: org.faculty, c: "#30d158" },
                      { l: "Lectures", v: org.lectures, c: "#f5c842" },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "var(--bg-card-2)", borderRadius: 8, padding: "7px 0" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: s.c }}>{s.v}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ))}
          </div>
        )}

        {/* ── USERS ── */}
        {topSection === "users" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>All Users</h2>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Platform-wide user management</p>
            </div>
            {usersLoading ? <Spinner /> : users.map(u => (
              <div key={u.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: u.is_active ? 1 : 0.5 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: `${ROLE_COLOR[u.role] || "#888"}18`, display: "flex", alignItems: "center", justifyContent: "center", color: ROLE_COLOR[u.role] || "#888", fontWeight: 800, fontSize: 15 }}>
                  {u.email[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: `${ROLE_COLOR[u.role] || "#888"}18`, color: ROLE_COLOR[u.role] || "#888", fontWeight: 700 }}>{u.role.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{u.org_name}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <IconBtn icon={u.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />} color={u.is_active ? "var(--success)" : "var(--text-muted)"} onClick={() => toggleUser(u.id)} />
                  <IconBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={() => deleteUser(u.id, u.email)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {topSection === "settings" && (
          <div className="fade-up">
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, marginBottom: 20 }}>Settings</h2>
            {[
              { icon: <Lock size={18} />, title: "Authentication", items: ["JWT access: 60 min", "Refresh: 30 days", "Min password: 8 chars"] },
              { icon: <Bell size={18} />, title: "Notifications",  items: ["FCM push enabled", "Email alerts on", "Dispute alerts on"] },
              { icon: <Server size={18} />, title: "System",       items: ["API v1.0.0", "PostgreSQL + pgvector", "Next.js 14 frontend"] },
            ].map((s, i) => (
              <div key={i} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-2)" }}>{s.icon}</div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</span>
                </div>
                {s.items.map((item, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: j === 0 ? "1px solid var(--border)" : "none" }}>
                    <Check size={12} style={{ color: "var(--success)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="card" style={{ background: "linear-gradient(135deg, #1a1035, var(--bg-card))", border: "1px solid var(--border-accent)", textAlign: "center", padding: 24 }}>
              <CreditCard size={30} style={{ color: "var(--accent-2)", display: "block", margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Subscriptions & Billing</div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>Manage org plans and feature gating</p>
              <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent-2)", padding: "4px 14px", borderRadius: 99, fontWeight: 700 }}>🚀 Coming Soon</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto",
        background: "rgba(8,7,15,0.97)", backdropFilter: "blur(20px)",
        borderTop: "1px solid var(--border)",
        display: "flex", padding: "10px 0 22px",
      }}>
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => setTopSection(n.id)}
            style={{
              flex: 1, background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              padding: "6px 4px", color: topSection === n.id ? "#ff9f0a" : "var(--text-muted)",
              transition: "color 0.15s", fontFamily: "inherit",
            }}
          >
            {n.icon}
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{n.label}</span>
            {topSection === n.id && (
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ff9f0a", display: "block" }} />
            )}
          </button>
        ))}
      </div>

      {/* Create Org modal */}
      {modal === "org" && (
        <Modal title="New Organization" onClose={closeModal}>
          <Field label="Name"><input className="input" placeholder="e.g. Gujarat University" value={fOrgName} onChange={e => setFOrgName(e.target.value)} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Code"><input className="input" placeholder="GU" value={fOrgCode} onChange={e => setFOrgCode(e.target.value.toUpperCase())} maxLength={8} /></Field>
            <Field label="Min Attendance %"><input className="input" type="number" value={fOrgMin} onChange={e => setFOrgMin(Number(e.target.value))} min={50} max={100} /></Field>
          </div>
          <button className="btn btn-primary" onClick={createOrg} disabled={saving || !fOrgName || !fOrgCode} style={{ marginTop: 4 }}>
            {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Create Organization</>}
          </button>
        </Modal>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}
