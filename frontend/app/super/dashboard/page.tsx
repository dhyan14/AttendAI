"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Globe, Users, Building2, Shield, Activity, LogOut, Settings,
  Plus, Trash2, ToggleLeft, ToggleRight, Loader2, ChevronRight,
  ChevronLeft, Check, X, GraduationCap, UserCog, CreditCard, Bell,
  Lock, Server, BarChart3, AlertTriangle, UserCheck, BookOpen,
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle,
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
  org_id: string | null; is_active: boolean; created_at: string;
}
interface SubjectRow {
  id: string; name: string; code: string; dept_id: string; semester: number;
}

type TopSection = "overview" | "orgs" | "users" | "settings";
type OrgTab     = "departments" | "faculty" | "students" | "admins";
type ModalType  = "org" | "dept" | "student" | "faculty" | "admin" | "bulk" | "subject" | null;

/* ═══════════════════════════════════════════════════════════
   MICRO COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg.startsWith("✓");
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      background: ok ? "var(--success)" : "var(--danger)",
      color: "white", padding: "10px 22px", borderRadius: 99,
      fontSize: 13, fontWeight: 700, zIndex: 9999,
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)", whiteSpace: "nowrap",
      animation: "slideDown 0.3s ease",
    }}>
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
    </div>
  );
}

function Empty({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px" }}>
      <div style={{ color: "var(--text-muted)", display: "flex", justifyContent: "center", marginBottom: 10 }}>{icon ?? <Building2 size={32} />}</div>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</p>
    </div>
  );
}

function IBtn({ icon, color, onClick, title }: { icon: React.ReactNode; color: string; onClick: (e: React.MouseEvent) => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
      background: `${color}18`, color, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {icon}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--bg-card)", borderRadius: "22px 22px 0 0",
        width: "100%", maxWidth: 430, padding: "24px 20px 40px",
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="form-group"><label className="form-label">{label}</label>{children}</div>;
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
      background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
      border: "none", borderRadius: 10, padding: "8px 14px",
      color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
      boxShadow: "0 4px 12px var(--accent-glow)",
    }}>
      <Plus size={15} /> {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROLE CHIP
   ═══════════════════════════════════════════════════════════ */
const ROLE_COLOR: Record<string, string> = {
  super_admin: "#f05a5a", org_admin: "#ff9f0a",
  dept_admin: "#f5c842",  faculty: "#22d37a", student: "#7c6fe0",
};

function RoleChip({ role }: { role: string }) {
  const c = ROLE_COLOR[role] || "#888";
  return (
    <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 99, background: `${c}18`, color: c, fontWeight: 700 }}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════ */
export default function SuperDashboard() {
  const router = useRouter();

  const [topSection, setTopSection]       = useState<TopSection>("overview");
  const [selectedOrg, setSelectedOrg]     = useState<OrgDetail | null>(null);
  const [orgTab, setOrgTab]               = useState<OrgTab>("departments");

  // Dept drill-down
  const [selectedDept, setSelectedDept]   = useState<DeptRow | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [subjects, setSubjects]           = useState<SubjectRow[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // Platform data
  const [stats, setStats]         = useState<PlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Platform users (Users tab)
  const [allUsers, setAllUsers]           = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading]   = useState(false);

  // Org-scoped data
  const [depts, setDepts]                 = useState<DeptRow[]>([]);
  const [faculty, setFaculty]             = useState<FacultyRow[]>([]);
  const [students, setStudents]           = useState<StudentRow[]>([]);
  const [orgAdmins, setOrgAdmins]         = useState<UserRow[]>([]);
  const [orgDataLoading, setOrgDataLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  // Modal
  const [modal, setModal]   = useState<ModalType>(null);
  const [saving, setSaving] = useState(false);
  const closeModal = () => { setModal(null); setSaving(false); };

  // ── Form: Org
  const [fON, setFON] = useState(""); const [fOC, setFOC] = useState(""); const [fOM, setFOM] = useState(75);
  // ── Form: Dept
  const [fDN, setFDN] = useState(""); const [fDC, setFDC] = useState(""); const [fDI, setFDI] = useState("");
  // ── Form: Student
  const [fSN, setFSN] = useState(""); const [fSR, setFSR] = useState(""); const [fSE, setFSE] = useState("");
  const [fSEm, setFSEm] = useState(""); const [fSD, setFSD] = useState(""); const [fSB, setFSB] = useState("");
  const [fSSem, setFSSem] = useState(""); const [fSDept, setFSDept] = useState("");
  // ── Form: Faculty
  const [fFN, setFFN] = useState(""); const [fFE, setFFE] = useState(""); const [fFDes, setFFDes] = useState(""); const [fFDept, setFFDept] = useState("");
  // ── Form: Admin
  const [fAE, setFAE] = useState(""); const [fAN, setFAN] = useState(""); const [fAR, setFAR] = useState<"org_admin"|"dept_admin">("org_admin"); const [fADept, setFADept] = useState("");
  // ── Form: Subject
  const [fSubN, setFSubN] = useState(""); const [fSubC, setFSubC] = useState("");
  // ── Bulk import
  const [bulkFile, setBulkFile]         = useState<File | null>(null);
  const [bulkDeptId, setBulkDeptId]     = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult]     = useState<{ total_rows: number; success_count: number; error_count: number; created: any[]; errors: any[] } | null>(null);

  /* ── Loaders ─────────────────────────────────────────────── */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try { const r = await apiFetch("/admin/stats"); if (r.ok) setStats(await r.json()); }
    catch {} finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (topSection === "users") {
      setAllUsers([]);
      loadAllUsers();
    }
  }, [topSection]);

  async function loadAllUsers() {
    setUsersLoading(true);
    try { const r = await apiFetch("/admin/users"); if (r.ok) setAllUsers(await r.json()); }
    catch {} finally { setUsersLoading(false); }
  }

  /* ── Org drill-down loaders ──────────────────────────────── */
  async function openOrg(org: OrgDetail) {
    setSelectedOrg(org);
    setOrgTab("departments");
    setDepts([]); setFaculty([]); setStudents([]); setOrgAdmins([]);
    fetchDepts(org.id);
  }

  async function fetchDepts(orgId: string) {
    setOrgDataLoading(true);
    try { const r = await apiFetch(`/admin/departments?org_id=${orgId}`); if (r.ok) setDepts(await r.json()); }
    catch {} finally { setOrgDataLoading(false); }
  }

  async function fetchFaculty(orgId: string) {
    setOrgDataLoading(true);
    try { const r = await apiFetch(`/admin/faculty?org_id=${orgId}`); if (r.ok) setFaculty(await r.json()); }
    catch {} finally { setOrgDataLoading(false); }
  }

  async function fetchStudents(orgId: string) {
    setOrgDataLoading(true);
    try { const r = await apiFetch(`/admin/students?org_id=${orgId}`); if (r.ok) setStudents(await r.json()); }
    catch {} finally { setOrgDataLoading(false); }
  }

  async function fetchOrgAdmins(orgId: string) {
    setOrgDataLoading(true);
    try {
      const r = await apiFetch(`/admin/users?org_id=${orgId}&admin_only=true`);
      if (r.ok) setOrgAdmins(await r.json());
    }
    catch {} finally { setOrgDataLoading(false); }
  }

  function switchOrgTab(tab: OrgTab) {
    setOrgTab(tab);
    if (!selectedOrg) return;
    if (tab === "departments") { if (depts.length === 0)    fetchDepts(selectedOrg.id); }
    if (tab === "faculty")     { if (faculty.length === 0)  fetchFaculty(selectedOrg.id); }
    if (tab === "students")    { if (students.length === 0) fetchStudents(selectedOrg.id); }
    if (tab === "admins")      { fetchOrgAdmins(selectedOrg.id); }
  }

  /* ── Dept / Semester / Subject drill-down ────────────────── */
  async function openDept(dept: DeptRow) {
    setSelectedDept(dept);
    setSelectedSemester(null);
    setSubjects([]);
  }

  async function openSemester(sem: number) {
    if (!selectedDept) return;
    setSelectedSemester(sem);
    setSubjectsLoading(true);
    try {
      const r = await apiFetch(`/admin/subjects?dept_id=${selectedDept.id}&semester=${sem}`);
      if (r.ok) setSubjects(await r.json());
    } catch {}
    finally { setSubjectsLoading(false); }
  }

  async function createSubject() {
    if (!selectedDept || !selectedSemester || !fSubN || !fSubC) return;
    setSaving(true);
    try {
      const s = await api<SubjectRow>("/admin/subjects", {
        method: "POST",
        body: JSON.stringify({ name: fSubN, code: fSubC, dept_id: selectedDept.id, semester: selectedSemester }),
      });
      showToast(`✓ "${s.name}" added`);
      closeModal();
      setSubjects(p => [...p, s]);
    } catch (e: any) { showToast("✗ " + e.message); }
    finally { setSaving(false); }
  }

  async function deleteSubject(id: string, name: string) {
    if (!confirm(`Delete subject "${name}"?`)) return;
    try {
      await api(`/admin/subjects/${id}`, { method: "DELETE" });
      showToast(`✓ "${name}" deleted`);
      setSubjects(p => p.filter(s => s.id !== id));
    } catch (e: any) { showToast("✗ " + e.message); }
  }

  /* ── CRUD helpers ────────────────────────────────────────── */
  async function api<T = any>(url: string, opts?: RequestInit): Promise<T> {
    const r = await apiFetch(url, opts);
    if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Request failed"); }
    return r.json();
  }

  async function createOrg() {
    if (!fON || !fOC) return;
    setSaving(true);
    try {
      await api("/admin/orgs", { method: "POST", body: JSON.stringify({ name: fON, code: fOC, min_attendance: fOM }) });
      showToast(`✓ "${fON}" created`); closeModal(); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function createDept() {
    if (!selectedOrg || !fDN || !fDC) return;
    setSaving(true);
    try {
      const d = await api<DeptRow>("/admin/departments", { method: "POST", body: JSON.stringify({ org_id: selectedOrg.id, name: fDN, code: fDC, institute_name: fDI || null }) });
      showToast(`✓ "${fDN}" created`); closeModal();
      setDepts(p => [...p, d]); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function createStudent() {
    if (!fSN || !fSR || !fSEm || !fSDept) return;
    setSaving(true);
    try {
      const s = await api<StudentRow>("/admin/students", { method: "POST", body: JSON.stringify({ name: fSN, roll_no: fSR, enrollment_no: fSE || null, email: fSEm, division: fSD || null, batch: fSB || null, semester: fSSem ? Number(fSSem) : null, dept_id: fSDept }) });
      showToast(`✓ "${fSN}" added (pwd: Student@123)`); closeModal();
      setStudents(p => [...p, s]); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function createFaculty() {
    if (!fFN || !fFE || !fFDept) return;
    setSaving(true);
    try {
      const f = await api<FacultyRow>("/admin/faculty", { method: "POST", body: JSON.stringify({ name: fFN, email: fFE, designation: fFDes || null, dept_id: fFDept }) });
      showToast(`✓ "${fFN}" added (pwd: Faculty@123)`); closeModal();
      setFaculty(p => [...p, f]); loadStats();
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function createAdmin() {
    if (!fAE || !selectedOrg) return;
    if (fAR === "dept_admin" && !fADept) { showToast("✗ Select a department for Dept Admin"); return; }
    setSaving(true);
    try {
      const u = await api<UserRow>("/admin/admins", {
        method: "POST",
        body: JSON.stringify({ email: fAE, name: fAN || null, role: fAR, org_id: selectedOrg.id, dept_id: fAR === "dept_admin" ? fADept : null }),
      });
      showToast(`✓ ${fAR === "org_admin" ? "Org Admin" : "Dept Admin"} "${fAE}" created (pwd: Admin@123)`);
      closeModal();
      setOrgAdmins(p => [...p, u]);
    } catch (e: any) { showToast("✗ " + e.message); } finally { setSaving(false); }
  }

  async function deleteOrg(id: string, name: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm(`Delete "${name}"?\nAll departments, students, faculty, and records inside will be permanently deleted.`)) return;
    try {
      await api(`/admin/orgs/${id}`, { method: "DELETE" });
      showToast(`✓ "${name}" deleted`); loadStats();
      if (selectedOrg?.id === id) setSelectedOrg(null);
    } catch (err: any) { showToast("✗ " + err.message); }
  }

  async function deleteDept(id: string, name: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm(`Delete department "${name}"?`)) return;
    try {
      await api(`/admin/departments/${id}`, { method: "DELETE" });
      showToast(`✓ "${name}" deleted`);
      setDepts(p => p.filter(d => d.id !== id)); loadStats();
    } catch (err: any) { showToast("✗ " + err.message); }
  }

  async function deleteStudent(id: string, name: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm(`Delete student "${name}" and their account?`)) return;
    try {
      await api(`/admin/students/${id}`, { method: "DELETE" });
      showToast(`✓ "${name}" deleted`);
      setStudents(p => p.filter(s => s.id !== id)); loadStats();
    } catch (err: any) { showToast("✗ " + err.message); }
  }

  async function deleteFaculty(id: string, name: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm(`Delete faculty "${name}" and their account?`)) return;
    try {
      await api(`/admin/faculty/${id}`, { method: "DELETE" });
      showToast(`✓ "${name}" deleted`);
      setFaculty(p => p.filter(f => f.id !== id)); loadStats();
    } catch (err: any) { showToast("✗ " + err.message); }
  }

  async function deleteAdmin(id: string, email: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm(`Remove admin "${email}"? Their account will be deleted.`)) return;
    try {
      await api(`/admin/users/${id}`, { method: "DELETE" });
      showToast(`✓ "${email}" removed`);
      setOrgAdmins(p => p.filter(u => u.id !== id));
      setAllUsers(p => p.filter(u => u.id !== id));
    } catch (err: any) { showToast("✗ " + err.message); }
  }

  async function toggleUser(id: string, inOrgAdmins: boolean) {
    try {
      const u = await api<{ id: string; is_active: boolean }>(`/admin/users/${id}/toggle`, { method: "PATCH" });
      if (inOrgAdmins) setOrgAdmins(p => p.map(x => x.id === id ? { ...x, is_active: u.is_active } : x));
      else setAllUsers(p => p.map(x => x.id === id ? { ...x, is_active: u.is_active } : x));
      showToast(u.is_active ? "✓ User activated" : "✓ User deactivated");
    } catch (err: any) { showToast("✗ " + err.message); }
  }

  /* ═══════════════════════════════════════════════════════════
     DEPT DETAIL VIEW (Semester Grid → Subject List)
     ═══════════════════════════════════════════════════════════ */
  if (selectedDept) {
    const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
    const SEM_COLORS = ["#38bdf8","#22d37a","#a78bfa","#f5c842","#ff9f0a","#f05a5a","#e879f9","#6ee7b7"];

    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 24 }}>
        <Toast msg={toast} />

        {/* Sticky dept header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(8,7,15,0.97)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)", padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => {
                if (selectedSemester !== null) {
                  setSelectedSemester(null);
                  setSubjects([]);
                } else {
                  setSelectedDept(null);
                }
              }}
              style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-card-2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0 }}
            >
              <ChevronLeft size={20} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Breadcrumb */}
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "var(--accent-2)", cursor: "pointer" }} onClick={() => { setSelectedDept(null); setSelectedSemester(null); }}>
                  {selectedOrg?.name}
                </span>
                <ChevronRight size={10} />
                <span style={{ color: selectedSemester ? "var(--accent-2)" : "var(--text-primary)", cursor: selectedSemester ? "pointer" : "default" }}
                  onClick={() => { if (selectedSemester !== null) { setSelectedSemester(null); setSubjects([]); } }}>
                  {selectedDept.name}
                </span>
                {selectedSemester !== null && (
                  <>
                    <ChevronRight size={10} />
                    <span style={{ color: "var(--text-primary)" }}>Semester {selectedSemester}</span>
                  </>
                )}
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>
                {selectedSemester !== null ? `Semester ${selectedSemester} Subjects` : `${selectedDept.name} — Semesters`}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent-2)", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>{selectedDept.code}</span>
                {selectedDept.institute_name && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{selectedDept.institute_name}</span>}
              </div>
            </div>
            {selectedSemester !== null && (
              <button
                onClick={() => { setFSubN(""); setFSubC(""); setModal("subject"); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                  background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                  border: "none", borderRadius: 10, padding: "8px 14px",
                  color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 4px 12px var(--accent-glow)",
                }}
              >
                <Plus size={15} /> Add Subject
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {/* ── SEMESTER GRID ── */}
          {selectedSemester === null && (
            <div className="fade-up">
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>
                Select a semester to view and manage its subjects.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {SEMESTERS.map((sem, idx) => (
                  <button
                    key={sem}
                    onClick={() => openSemester(sem)}
                    style={{
                      background: `linear-gradient(135deg, ${SEM_COLORS[idx]}12, ${SEM_COLORS[idx]}06)`,
                      border: `1px solid ${SEM_COLORS[idx]}30`,
                      borderRadius: 16, padding: "20px 16px",
                      cursor: "pointer", textAlign: "left",
                      transition: "transform 0.15s, box-shadow 0.15s",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${SEM_COLORS[idx]}20`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = ""; }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 900, color: SEM_COLORS[idx], letterSpacing: -1, marginBottom: 4 }}>
                      {sem}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Semester</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10 }}>
                      <BookOpen size={12} style={{ color: SEM_COLORS[idx] }} />
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>View subjects</span>
                      <ChevronRight size={11} style={{ color: SEM_COLORS[idx], marginLeft: "auto" }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── SUBJECT LIST ── */}
          {selectedSemester !== null && (
            <div className="fade-up">
              {subjectsLoading ? <Spinner /> : subjects.length === 0 ? (
                <Empty
                  label={`No subjects in Semester ${selectedSemester} yet — click "Add Subject" above`}
                  icon={<BookOpen size={36} />}
                />
              ) : (
                <div>
                  {subjects.map((s, idx) => (
                    <div key={s.id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                        background: `${SEM_COLORS[(selectedSemester - 1) % SEM_COLORS.length]}15`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 10, color: SEM_COLORS[(selectedSemester - 1) % SEM_COLORS.length],
                        letterSpacing: -0.3,
                      }}>
                        {s.code}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {s.code} · Semester {s.semester}
                        </div>
                      </div>
                      <IBtn
                        icon={<Trash2 size={14} />}
                        color="var(--danger)"
                        onClick={() => deleteSubject(s.id, s.name)}
                        title="Delete subject"
                      />
                    </div>
                  ))}
                  <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(124,111,224,0.05)", borderRadius: 10, border: "1px solid var(--border-accent)", fontSize: 12, color: "var(--text-muted)" }}>
                    {subjects.length} subject{subjects.length !== 1 ? "s" : ""} in Semester {selectedSemester}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Subject Modal */}
        {modal === "subject" && selectedSemester !== null && (
          <Modal title={`Add Subject · Sem ${selectedSemester} · ${selectedDept.code}`} onClose={closeModal}>
            <F label="Subject Name"><input className="input" placeholder="e.g. Data Structures" value={fSubN} onChange={e => setFSubN(e.target.value)} autoFocus /></F>
            <F label="Subject Code"><input className="input" placeholder="e.g. CS301" value={fSubC} onChange={e => setFSubC(e.target.value.toUpperCase())} maxLength={12} /></F>
            <div style={{ padding: "10px 14px", background: "rgba(124,111,224,0.06)", borderRadius: 10, marginBottom: 16, border: "1px solid var(--border-accent)" }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Department: <strong style={{ color: "var(--accent-2)" }}>{selectedDept.name}</strong><br />
                Semester: <strong style={{ color: "#f5c842" }}>{selectedSemester}</strong>
              </p>
            </div>
            <button className="btn btn-primary" onClick={createSubject} disabled={saving || !fSubN || !fSubC}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Add Subject</>}
            </button>
          </Modal>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
          @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
          .fade-up { animation: fadeUp 0.25s ease; }
        `}</style>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     ORG DETAIL VIEW
     ═══════════════════════════════════════════════════════════ */
  if (selectedOrg) {
    const tabs: { id: OrgTab; label: string; icon: React.ReactNode; count: number }[] = [
      { id: "departments", label: "Depts",    icon: <Building2 size={16} />,    count: selectedOrg.departments },
      { id: "faculty",     label: "Faculty",  icon: <UserCog size={16} />,      count: selectedOrg.faculty },
      { id: "students",    label: "Students", icon: <GraduationCap size={16} />, count: selectedOrg.students },
      { id: "admins",      label: "Admins",   icon: <UserCheck size={16} />,    count: orgAdmins.length },
    ];

    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 24 }}>
        <Toast msg={toast} />

        {/* Sticky org header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(8,7,15,0.97)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)", padding: "14px 16px 0",
        }}>
          {/* Back + name + delete */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => setSelectedOrg(null)}
              style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-card-2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0 }}
            >
              <ChevronLeft size={20} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>{selectedOrg.name}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent-2)", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>{selectedOrg.code}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Min {selectedOrg.settings?.minAttendancePercent ?? 75}% attendance</span>
              </div>
            </div>
            <button
              onClick={e => deleteOrg(selectedOrg.id, selectedOrg.name, e)}
              style={{ width: 34, height: 34, borderRadius: 9, background: "var(--danger-dim)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--danger)", flexShrink: 0 }}
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10 }}>
            {[
              { l: "Departments", v: selectedOrg.departments, c: "#38bdf8" },
              { l: "Faculty",     v: selectedOrg.faculty,     c: "#22d37a" },
              { l: "Students",    v: selectedOrg.students,    c: "#a78bfa" },
              { l: "Lectures",    v: selectedOrg.lectures,    c: "#f5c842" },
            ].map((s, i) => (
              <div key={i} style={{ flexShrink: 0, background: "var(--bg-card-2)", borderRadius: 10, padding: "6px 14px", textAlign: "center", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Sub-tab bar */}
          <div style={{ display: "flex", borderTop: "1px solid var(--border)" }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => switchOrgTab(t.id)}
                style={{
                  flex: 1, background: "none", border: "none", cursor: "pointer",
                  padding: "11px 4px 10px",
                  color: orgTab === t.id ? "var(--accent-2)" : "var(--text-muted)",
                  borderBottom: orgTab === t.id ? "2px solid var(--accent-2)" : "2px solid transparent",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  fontSize: 10, fontWeight: 700, fontFamily: "inherit", letterSpacing: 0.3,
                  transition: "color 0.15s",
                }}
              >
                {t.icon}
                {t.label}
                {t.id === "admins" && orgAdmins.length > 0 && (
                  <span style={{ fontSize: 9, color: "var(--accent-2)" }}>{orgAdmins.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ padding: 16 }}>

          {/* ── DEPARTMENTS ── */}
          {orgTab === "departments" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Departments</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>in {selectedOrg.name} · tap to manage semesters</div>
                </div>
                <AddBtn label="Add" onClick={() => { setFDN(""); setFDC(""); setFDI(""); setModal("dept"); }} />
              </div>

              {orgDataLoading ? <Spinner /> : depts.length === 0 ? (
                <Empty label="No departments yet — add one above" icon={<Building2 size={36} />} />
              ) : depts.map(d => (
                <div
                  key={d.id}
                  className="card"
                  style={{ marginBottom: 10, cursor: "pointer", transition: "box-shadow 0.18s" }}
                  onClick={() => openDept(d)}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, color: "var(--accent-2)", letterSpacing: -0.3 }}>
                      {d.code}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{d.name}</div>
                      {d.institute_name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{d.institute_name}</div>}
                      <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                          <GraduationCap size={12} style={{ color: "#a78bfa" }} />
                          <strong style={{ color: "#a78bfa" }}>{d.student_count}</strong> students
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                          <UserCog size={12} style={{ color: "#22d37a" }} />
                          <strong style={{ color: "#22d37a" }}>{d.faculty_count}</strong> faculty
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <ChevronRight size={16} style={{ color: "var(--accent-2)" }} />
                      <IBtn icon={<Trash2 size={14} />} color="var(--danger)" onClick={e => deleteDept(d.id, d.name, e)} title="Delete department" />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── FACULTY ── */}
          {orgTab === "faculty" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Faculty</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>in {selectedOrg.name}</div>
                </div>
                <AddBtn label="Add" onClick={() => { setFFN(""); setFFE(""); setFFDes(""); setFFDept(depts[0]?.id || ""); setModal("faculty"); }} />
              </div>

              {orgDataLoading ? <Spinner /> : faculty.length === 0 ? (
                <Empty label="No faculty yet — add one above" icon={<UserCog size={36} />} />
              ) : faculty.map(f => (
                <div key={f.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: "rgba(34,211,122,0.10)", color: "#22d37a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17 }}>
                    {f.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{f.designation || "Faculty"} · {f.dept_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{f.email}</div>
                  </div>
                  <IBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={e => deleteFaculty(f.id, f.name, e)} />
                </div>
              ))}
            </>
          )}

          {/* ── STUDENTS ── */}
          {orgTab === "students" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Students</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>in {selectedOrg.name}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      setBulkFile(null);
                      setBulkResult(null);
                      setBulkDeptId(depts[0]?.id || "");
                      setModal("bulk");
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                      background: "rgba(34,211,122,0.10)", border: "1px solid rgba(34,211,122,0.2)",
                      borderRadius: 10, padding: "8px 14px",
                      color: "#22d37a", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    <FileSpreadsheet size={15} /> Import Excel
                  </button>
                  <AddBtn label="Add" onClick={() => { setFSN(""); setFSR(""); setFSE(""); setFSEm(""); setFSD(""); setFSB(""); setFSSem(""); setFSDept(depts[0]?.id || ""); setModal("student"); }} />
                </div>
              </div>

              {orgDataLoading ? <Spinner /> : students.length === 0 ? (
                <Empty label="No students yet — add one above" icon={<GraduationCap size={36} />} />
              ) : students.map(s => (
                <div key={s.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: "rgba(124,111,224,0.10)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17 }}>
                    {s.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
                      {s.roll_no} · {s.dept_name}
                      {s.division ? ` · Div ${s.division}` : ""}
                      {s.batch ? ` · ${s.batch}` : ""}
                      {s.semester ? ` · Sem ${s.semester}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{s.email}</div>
                  </div>
                  <IBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={e => deleteStudent(s.id, s.name, e)} />
                </div>
              ))}
            </>
          )}

          {/* ── ADMINS ── */}
          {orgTab === "admins" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Administrators</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Org admins & Dept admins in {selectedOrg.name}</div>
                </div>
                <AddBtn label="Add Admin" onClick={() => { setFAE(""); setFAN(""); setFAR("org_admin"); setFADept(depts[0]?.id || ""); setModal("admin"); }} />
              </div>

              {orgDataLoading ? <Spinner /> : orgAdmins.length === 0 ? (
                <Empty label="No admins yet — add an Org or Dept admin above" icon={<UserCheck size={36} />} />
              ) : orgAdmins.map(u => {
                const rc = ROLE_COLOR[u.role] || "#888";
                return (
                  <div key={u.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: u.is_active ? 1 : 0.55 }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: `${rc}15`, color: rc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17 }}>
                      {u.email[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                        <RoleChip role={u.role} />
                        {!u.is_active && <span style={{ fontSize: 10, color: "var(--danger)", fontWeight: 600 }}>Inactive</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <IBtn
                        icon={u.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                        color={u.is_active ? "var(--success)" : "var(--text-muted)"}
                        onClick={e => { e.stopPropagation(); toggleUser(u.id, true); }}
                        title={u.is_active ? "Deactivate" : "Activate"}
                      />
                      <IBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={e => deleteAdmin(u.id, u.email, e)} title="Remove admin" />
                    </div>
                  </div>
                );
              })}

              {/* Hint */}
              <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(124,111,224,0.06)", borderRadius: 12, border: "1px solid var(--border-accent)" }}>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--accent-2)" }}>Org Admin</strong> — manages all departments in this org.<br />
                  <strong style={{ color: "#f5c842" }}>Dept Admin</strong> — manages one department + has a faculty profile.<br />
                  Default password: <code style={{ color: "var(--accent-2)" }}>Admin@123</code>
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Org-context modals ── */}
        {modal === "dept" && (
          <Modal title={`New Department · ${selectedOrg.name}`} onClose={closeModal}>
            <F label="Department Name"><input className="input" placeholder="e.g. Computer Science" value={fDN} onChange={e => setFDN(e.target.value)} autoFocus /></F>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F label="Code"><input className="input" placeholder="CSE" value={fDC} onChange={e => setFDC(e.target.value.toUpperCase())} maxLength={8} /></F>
              <F label="Institute (opt)"><input className="input" placeholder="IoT / SoCS" value={fDI} onChange={e => setFDI(e.target.value)} /></F>
            </div>
            <button className="btn btn-primary" onClick={createDept} disabled={saving || !fDN || !fDC}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Create Department</>}
            </button>
          </Modal>
        )}

        {modal === "faculty" && (
          <Modal title={`Add Faculty · ${selectedOrg.name}`} onClose={closeModal}>
            <F label="Department">
              <select className="select-input" value={fFDept} onChange={e => setFFDept(e.target.value)}>
                <option value="">Select department...</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </F>
            <F label="Full Name"><input className="input" placeholder="Dr. Jaimin Patel" value={fFN} onChange={e => setFFN(e.target.value)} autoFocus /></F>
            <F label="Email"><input className="input" type="email" placeholder="faculty@college.edu" value={fFE} onChange={e => setFFE(e.target.value)} /></F>
            <F label="Designation (opt)"><input className="input" placeholder="Professor / Head of Dept" value={fFDes} onChange={e => setFFDes(e.target.value)} /></F>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Default password: <strong>Faculty@123</strong></p>
            <button className="btn btn-primary" onClick={createFaculty} disabled={saving || !fFN || !fFE || !fFDept}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Add Faculty</>}
            </button>
          </Modal>
        )}

        {modal === "student" && (
          <Modal title={`Add Student · ${selectedOrg.name}`} onClose={closeModal}>
            <F label="Department">
              <select className="select-input" value={fSDept} onChange={e => setFSDept(e.target.value)}>
                <option value="">Select department...</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </F>
            <F label="Full Name"><input className="input" placeholder="Rahul Sharma" value={fSN} onChange={e => setFSN(e.target.value)} autoFocus /></F>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F label="Roll No"><input className="input" placeholder="CS001" value={fSR} onChange={e => setFSR(e.target.value)} /></F>
              <F label="Enroll No (opt)"><input className="input" placeholder="EN2024001" value={fSE} onChange={e => setFSE(e.target.value)} /></F>
            </div>
            <F label="Email"><input className="input" type="email" placeholder="student@college.edu" value={fSEm} onChange={e => setFSEm(e.target.value)} /></F>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <F label="Division"><input className="input" placeholder="A" value={fSD} onChange={e => setFSD(e.target.value)} maxLength={2} /></F>
              <F label="Batch"><input className="input" placeholder="B1" value={fSB} onChange={e => setFSB(e.target.value)} maxLength={4} /></F>
              <F label="Semester"><input className="input" type="number" placeholder="4" value={fSSem} onChange={e => setFSSem(e.target.value)} min={1} max={10} /></F>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Default password: <strong>Student@123</strong></p>
            <button className="btn btn-primary" onClick={createStudent} disabled={saving || !fSN || !fSR || !fSEm || !fSDept}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Add Student</>}
            </button>
          </Modal>
        )}

        {modal === "bulk" && (
          <Modal title={`Bulk Import Students · ${selectedOrg.name}`} onClose={() => { closeModal(); if (bulkResult) { fetchStudents(selectedOrg.id); setBulkResult(null); } }}>
            {/* Step 1 — Download template */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <div style={{ padding: "14px", background: "rgba(124,111,224,0.07)", borderRadius: 12, border: "1px solid var(--border-accent)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Download size={16} style={{ color: "var(--accent-2)" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Step 1 — Download Template</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Fill dept_id, name, email, roll_no for each student</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const token = localStorage.getItem("access_token");
                    const r = await fetch(
                      `${process.env.NEXT_PUBLIC_API_URL || "https://attendai-production-f6cf.up.railway.app"}/admin/students/template`,
                      { headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (!r.ok) { showToast("✗ Could not download template"); return; }
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "student_import_template.xlsx"; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--border-accent)",
                    background: "var(--bg-card-2)", color: "var(--accent-2)", fontWeight: 700, fontSize: 13,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <Download size={15} /> Download student_import_template.xlsx
                </button>
              </div>

              {/* dept_id helper */}
              <div style={{ padding: "12px 14px", background: "rgba(34,211,122,0.05)", borderRadius: 10, border: "1px solid rgba(34,211,122,0.15)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#22d37a", marginBottom: 6 }}>📋 Dept IDs in {selectedOrg.name}</div>
                {depts.map(d => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.name}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(d.id); showToast(`✓ Copied ${d.code} ID`); }}
                      style={{ fontSize: 10, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px", color: "var(--text-muted)", cursor: "pointer", fontFamily: "monospace" }}
                    >
                      {d.id.substring(0, 8)}… copy
                    </button>
                  </div>
                ))}
              </div>

              {/* Step 2 — Upload */}
              <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: `2px dashed ${bulkFile ? "#22d37a" : "var(--border)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(34,211,122,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Upload size={16} style={{ color: "#22d37a" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Step 2 — Upload Filled File</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>.xlsx, .xls, or .csv · max 500 rows</div>
                  </div>
                </div>
                <label style={{ display: "block", cursor: "pointer" }}>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0] || null; setBulkFile(f); setBulkResult(null); }}
                  />
                  <div style={{
                    padding: "12px", borderRadius: 10, textAlign: "center",
                    background: bulkFile ? "rgba(34,211,122,0.08)" : "var(--bg-card-2)",
                    color: bulkFile ? "#22d37a" : "var(--text-muted)",
                    fontSize: 13, fontWeight: 600, border: "1px solid var(--border)",
                  }}>
                    {bulkFile ? `✓ ${bulkFile.name}` : "Tap to select file"}
                  </div>
                </label>
              </div>
            </div>

            {/* Upload button */}
            {!bulkResult && (
              <button
                className="btn btn-primary"
                disabled={!bulkFile || bulkUploading}
                onClick={async () => {
                  if (!bulkFile) return;
                  setBulkUploading(true);
                  try {
                    const token = localStorage.getItem("access_token");
                    const form = new FormData();
                    form.append("file", bulkFile);
                    const r = await fetch(
                      `${process.env.NEXT_PUBLIC_API_URL || "https://attendai-production-f6cf.up.railway.app"}/admin/students/bulk`,
                      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
                    );
                    if (!r.ok) { const e = await r.json(); showToast("✗ " + (e.detail || "Upload failed")); }
                    else { const res = await r.json(); setBulkResult(res); }
                  } catch (e: any) { showToast("✗ " + e.message); }
                  finally { setBulkUploading(false); }
                }}
              >
                {bulkUploading
                  ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Processing...</>
                  : <><Upload size={15} /> Upload & Import</>}
              </button>
            )}

            {/* Results */}
            {bulkResult && (
              <div style={{ marginTop: 4 }}>
                {/* Summary pills */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, padding: "10px", background: "rgba(34,211,122,0.10)", borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#22d37a" }}>{bulkResult.success_count}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Imported</div>
                  </div>
                  <div style={{ flex: 1, padding: "10px", background: "rgba(240,90,90,0.10)", borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "var(--danger)" }}>{bulkResult.error_count}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Skipped</div>
                  </div>
                  <div style={{ flex: 1, padding: "10px", background: "rgba(255,255,255,0.04)", borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text-secondary)" }}>{bulkResult.total_rows}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Total rows</div>
                  </div>
                </div>

                {/* Error rows */}
                {bulkResult.errors.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>⚠ Skipped rows</div>
                    {bulkResult.errors.map((e: any, i: number) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 10px", background: "rgba(240,90,90,0.07)", borderRadius: 8, marginBottom: 4 }}>
                        <XCircle size={13} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>{e.row} · {e.email || e.roll_no}</span>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{e.error}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Success rows */}
                {bulkResult.created.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#22d37a", marginBottom: 6 }}>✓ Successfully imported</div>
                    {bulkResult.created.slice(0, 10).map((s: any, i: number) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", background: "rgba(34,211,122,0.06)", borderRadius: 8, marginBottom: 3 }}>
                        <CheckCircle2 size={12} style={{ color: "#22d37a", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name} ({s.roll_no})</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.email}</span>
                      </div>
                    ))}
                    {bulkResult.created.length > 10 && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "6px 0" }}>+ {bulkResult.created.length - 10} more imported successfully</div>
                    )}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    closeModal();
                    fetchStudents(selectedOrg.id);
                    setBulkResult(null);
                    loadStats();
                  }}
                >
                  <Check size={15} /> Done — Refresh Student List
                </button>
              </div>
            )}
          </Modal>
        )}

        {modal === "admin" && (
          <Modal title={`Add Admin · ${selectedOrg.name}`} onClose={closeModal}>
            {/* Role selector */}
            <F label="Admin Type">
              <div className="toggle-pill">
                <button className={fAR === "org_admin" ? "active" : ""} onClick={() => setFAR("org_admin")}>
                  <Globe size={14} /> Org Admin
                </button>
                <button className={fAR === "dept_admin" ? "active" : ""} onClick={() => setFAR("dept_admin")}>
                  <Building2 size={14} /> Dept Admin
                </button>
              </div>
            </F>

            {fAR === "dept_admin" && (
              <F label="Department">
                <select className="select-input" value={fADept} onChange={e => setFADept(e.target.value)}>
                  <option value="">Select department...</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </F>
            )}

            {fAR === "dept_admin" && (
              <F label="Full Name (optional)"><input className="input" placeholder="Will be derived from email if blank" value={fAN} onChange={e => setFAN(e.target.value)} /></F>
            )}

            <F label="Email"><input className="input" type="email" placeholder={fAR === "org_admin" ? "orgadmin@university.edu" : "deptadmin@university.edu"} value={fAE} onChange={e => setFAE(e.target.value)} autoFocus /></F>

            <div style={{ padding: "10px 14px", background: "rgba(124,111,224,0.06)", borderRadius: 10, marginBottom: 16, border: "1px solid var(--border-accent)" }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {fAR === "org_admin"
                  ? "Org Admin can manage all departments, students, and faculty in this organization."
                  : "Dept Admin manages one department and also gets a Faculty profile for teaching."
                }<br />
                Default password: <strong style={{ color: "var(--accent-2)" }}>Admin@123</strong>
              </p>
            </div>

            <button className="btn btn-primary" onClick={createAdmin} disabled={saving || !fAE || (fAR === "dept_admin" && !fADept)}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Check size={15} /> Create {fAR === "org_admin" ? "Org Admin" : "Dept Admin"}</>}
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

  /* ═══════════════════════════════════════════════════════════
     TOP-LEVEL VIEW (Home / Orgs / Users / Settings)
     ═══════════════════════════════════════════════════════════ */
  const topNav = [
    { id: "overview" as TopSection, icon: <Activity size={20} />,  label: "Home" },
    { id: "orgs"     as TopSection, icon: <Globe size={20} />,     label: "Orgs" },
    { id: "users"    as TopSection, icon: <Users size={20} />,     label: "Users" },
    { id: "settings" as TopSection, icon: <Settings size={20} />,  label: "Settings" },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 88 }}>
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
            background: "linear-gradient(135deg, rgba(240,90,90,0.2), rgba(255,159,10,0.1))",
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
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: 4, transition: "color 0.2s" }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>

      <div style={{ padding: "16px" }}>

        {/* ── HOME ── */}
        {topSection === "overview" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>Platform Control Center</p>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Overview</h2>
            </div>

            {statsLoading ? <Spinner /> : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  {[
                    { l: "Organizations",  v: stats?.total_orgs,               c: "#38bdf8", icon: <Globe size={18} /> },
                    { l: "Total Users",    v: stats?.total_users,              c: "#22d37a", icon: <Users size={18} /> },
                    { l: "Students",       v: stats?.total_students,           c: "#a78bfa", icon: <GraduationCap size={18} /> },
                    { l: "Faculty",        v: stats?.total_faculty,            c: "#f5c842", icon: <UserCog size={18} /> },
                    { l: "Lectures",       v: stats?.total_lectures,           c: "#ff9f0a", icon: <BookOpen size={18} /> },
                    { l: "Open Disputes",  v: stats?.open_disputes,            c: "#f05a5a", icon: <AlertTriangle size={18} /> },
                  ].map((s, i) => (
                    <div key={i} className="stat-card">
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: `${s.c}15`, display: "flex", alignItems: "center", justifyContent: "center", color: s.c, marginBottom: 8 }}>{s.icon}</div>
                      <div className="stat-value" style={{ color: s.c, fontSize: 26 }}>{s.v ?? "—"}</div>
                      <div className="stat-label">{s.l}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Organizations</span>
                  <button onClick={() => setTopSection("orgs")} style={{ fontSize: 12, color: "var(--accent-2)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Manage →</button>
                </div>

                {stats?.organizations.length === 0 ? (
                  <Empty label="No organizations yet" icon={<Globe size={40} />} />
                ) : stats?.organizations.map(org => (
                  <div key={org.id} className="card" style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => openOrg(org)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.2, marginBottom: 4 }}>{org.name}</div>
                        <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent-2)", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>{org.code}</span>
                      </div>
                      <ChevronRight size={18} style={{ color: "var(--text-muted)", marginTop: 2 }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, textAlign: "center" }}>
                      {[
                        { l: "Depts",    v: org.departments, c: "#38bdf8" },
                        { l: "Students", v: org.students,    c: "#a78bfa" },
                        { l: "Faculty",  v: org.faculty,     c: "#22d37a" },
                        { l: "Lectures", v: org.lectures,    c: "#f5c842" },
                      ].map((s, i) => (
                        <div key={i} style={{ background: "var(--bg-card-2)", borderRadius: 8, padding: "7px 0" }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: s.c }}>{s.v}</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="card" style={{ marginTop: 16, background: "linear-gradient(135deg, #0e0b1e, var(--bg-card))", border: "1px solid var(--border-accent)", textAlign: "center", padding: "14px 16px" }}>
                  <BarChart3 size={18} style={{ color: "var(--accent-2)", display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{(stats?.total_attendance_records ?? 0).toLocaleString()}</strong> attendance records in database
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ORGS ── */}
        {topSection === "orgs" && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Organizations</h2>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Tap an org to manage its contents</p>
              </div>
              <AddBtn label="New Org" onClick={() => { setFON(""); setFOC(""); setFOM(75); setModal("org"); }} />
            </div>

            {statsLoading ? <Spinner /> : stats?.organizations.length === 0 ? (
              <Empty label="No organizations yet — create the first one" icon={<Globe size={40} />} />
            ) : stats?.organizations.map(org => (
              <div key={org.id} className="card" style={{ marginBottom: 12, cursor: "pointer" }} onClick={() => openOrg(org)}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
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
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Created {org.created_at} · Min {org.settings?.minAttendancePercent ?? 75}% attendance</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={e => deleteOrg(org.id, org.name, e)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "var(--danger-dim)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={18} style={{ color: "var(--text-muted)", alignSelf: "center" }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, textAlign: "center" }}>
                  {[
                    { l: "Depts",    v: org.departments, c: "#38bdf8" },
                    { l: "Students", v: org.students,    c: "#a78bfa" },
                    { l: "Faculty",  v: org.faculty,     c: "#22d37a" },
                    { l: "Lectures", v: org.lectures,    c: "#f5c842" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "var(--bg-card-2)", borderRadius: 8, padding: "7px 0" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── USERS ── */}
        {topSection === "users" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>All Users</h2>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Platform-wide · all roles</p>
            </div>
            {usersLoading ? <Spinner /> : allUsers.length === 0 ? (
              <Empty label="No users found" icon={<Users size={36} />} />
            ) : allUsers.map(u => (
              <div key={u.id} className="card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: u.is_active ? 1 : 0.52 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: `${ROLE_COLOR[u.role] || "#888"}15`, color: ROLE_COLOR[u.role] || "#888", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
                  {u.email[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
                    <RoleChip role={u.role} />
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{u.org_name}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <IBtn icon={u.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />} color={u.is_active ? "var(--success)" : "var(--text-muted)"} onClick={e => { e.stopPropagation(); toggleUser(u.id, false); }} />
                  <IBtn icon={<Trash2 size={13} />} color="var(--danger)" onClick={e => deleteAdmin(u.id, u.email, e)} />
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
              { icon: <Lock size={18} />,   title: "Authentication", items: ["JWT access: 60 min", "Refresh: 30 days", "Min password: 8 chars"] },
              { icon: <Bell size={18} />,   title: "Notifications",  items: ["FCM push configured", "Email alerts on", "Dispute alerts on"] },
              { icon: <Server size={18} />, title: "System",         items: ["API v1.0.0", "PostgreSQL + pgvector", "Next.js 14 frontend"] },
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
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        background: "rgba(8,7,15,0.97)", backdropFilter: "blur(20px)",
        borderTop: "1px solid var(--border)",
        display: "flex", padding: "10px 0 22px",
        maxWidth: 430, width: "100%",
      }}>
        {topNav.map(n => (
          <button
            key={n.id}
            onClick={() => setTopSection(n.id)}
            style={{
              flex: 1, background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              color: topSection === n.id ? "#ff9f0a" : "var(--text-muted)",
              transition: "color 0.15s", fontFamily: "inherit", padding: "4px 0",
            }}
          >
            {n.icon}
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{n.label}</span>
            {topSection === n.id && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ff9f0a" }} />}
          </button>
        ))}
      </div>

      {/* Create Org modal (top-level) */}
      {modal === "org" && (
        <Modal title="New Organization" onClose={closeModal}>
          <F label="Organization Name"><input className="input" placeholder="e.g. Gujarat University" value={fON} onChange={e => setFON(e.target.value)} autoFocus /></F>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <F label="Code (unique)"><input className="input" placeholder="GU" value={fOC} onChange={e => setFOC(e.target.value.toUpperCase())} maxLength={8} /></F>
            <F label="Min Attendance %"><input className="input" type="number" value={fOM} onChange={e => setFOM(Number(e.target.value))} min={50} max={100} /></F>
          </div>
          <button className="btn btn-primary" onClick={createOrg} disabled={saving || !fON || !fOC}>
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
