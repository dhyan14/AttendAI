"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Building2, Users, User, TrendingUp, Loader2, Plus, AlertCircle, ChevronLeft, ChevronRight, BookOpen, Trash2, Check, X } from "lucide-react";

interface DeptWithStats {
  id: string;
  name: string;
  code: string;
  institute_name: string | null;
  student_count: number;
  faculty_count: number;
  avg_attendance: number;
}

const DEPT_COLORS = ["var(--accent)", "var(--info)", "var(--warning)", "var(--danger)", "var(--success)"];

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<DeptWithStats[]>([]);
  const [orgName, setOrgName] = useState("Your Organization");
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newDept, setNewDept] = useState({ name: "", code: "", institute_name: "" });
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedDept, setSelectedDept] = useState<DeptWithStats | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [modal, setModal] = useState<"subject" | null>(null);
  const [saving, setSaving] = useState(false);
  const [fSubN, setFSubN] = useState("");
  const [fSubC, setFSubC] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };
  const closeModal = () => { setModal(null); setSaving(false); };

  useEffect(() => {
    async function loadData() {
      try {
        const statsRes = await apiFetch("/departments/stats");
        if (statsRes.ok) {
          const data = await statsRes.json();
          setDepartments(data.departments || []);
          setTotalStudents(data.total_students || 0);
        }
      } catch (err) {
        console.error("Failed to load department stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setAdding(true);
    try {
      const payload = {
        name: newDept.name,
        code: newDept.code.toUpperCase(),
        institute_name: newDept.institute_name || null,
      };

      const res = await apiFetch("/departments/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create department");
      }

      // Reload stats after adding
      const statsRes = await apiFetch("/departments/stats");
      if (statsRes.ok) {
        const data = await statsRes.json();
        setDepartments(data.departments || []);
        setTotalStudents(data.total_students || 0);
      }

      setShowAddModal(false);
      setNewDept({ name: "", code: "", institute_name: "" });
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function openSemester(sem: number) {
    if (!selectedDept) return;
    setSelectedSemester(sem);
    setSubjectsLoading(true);
    try {
      const r = await apiFetch(`/subjects/?dept_id=${selectedDept.id}&semester=${sem}`);
      if (r.ok) setSubjects(await r.json());
    } catch {}
    finally { setSubjectsLoading(false); }
  }

  async function createSubject() {
    if (!selectedDept || !selectedSemester || !fSubN || !fSubC) return;
    setSaving(true);
    try {
      const res = await apiFetch("/subjects/", {
        method: "POST",
        body: JSON.stringify({
          name: fSubN,
          code: fSubC.toUpperCase(),
          dept_id: selectedDept.id,
          semester: selectedSemester
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to add subject");
      }
      const s = await res.json();
      showToast(`✓ "${s.name}" added`);
      closeModal();
      setSubjects(p => [...p, s]);
    } catch (e: any) { showToast("✗ " + e.message); }
    finally { setSaving(false); }
  }

  async function deleteSubject(id: string, name: string) {
    if (!confirm(`Delete subject "${name}"?`)) return;
    try {
      const res = await apiFetch(`/subjects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to delete subject");
      }
      showToast(`✓ "${name}" deleted`);
      setSubjects(p => p.filter(s => s.id !== id));
    } catch (e: any) { showToast("✗ " + e.message); }
  }

  if (selectedDept) {
    const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
    const SEM_COLORS = ["#38bdf8", "#22d37a", "#a78bfa", "#f5c842", "#ff9f0a", "#f05a5a", "#e879f9", "#6ee7b7"];
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 100 }}>
        <Toast msg={toast} />
        <TopBar
          title={selectedSemester !== null ? `Semester ${selectedSemester} Subjects` : `${selectedDept.name} — Semesters`}
          showBack={true}
          onBack={() => {
            if (selectedSemester !== null) {
              setSelectedSemester(null);
              setSubjects([]);
            } else {
              setSelectedDept(null);
            }
          }}
        />

        {/* Header summary info */}
        <div style={{ padding: "0 16px", marginTop: 16 }} className="fade-up">
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Department Details
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>
              {selectedDept.name}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>
                {selectedDept.code}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {selectedDept.institute_name || "Institute of Technology"}
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {selectedSemester === null ? (
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
                      background: `linear-gradient(135deg, ${SEM_COLORS[idx % SEM_COLORS.length]}12, ${SEM_COLORS[idx % SEM_COLORS.length]}06)`,
                      border: `1px solid ${SEM_COLORS[idx % SEM_COLORS.length]}30`,
                      borderRadius: 16, padding: "20px 16px",
                      cursor: "pointer", textAlign: "left",
                      transition: "transform 0.15s, box-shadow 0.15s",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 900, color: SEM_COLORS[idx % SEM_COLORS.length], letterSpacing: -1, marginBottom: 4 }}>
                      {sem}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Semester</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10 }}>
                      <BookOpen size={12} style={{ color: SEM_COLORS[idx % SEM_COLORS.length] }} />
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>View subjects</span>
                      <ChevronRight size={11} style={{ color: SEM_COLORS[idx % SEM_COLORS.length], marginLeft: "auto" }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="fade-up">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>Subjects</h3>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Semester {selectedSemester}</p>
                </div>
                <button
                  onClick={() => { setFSubN(""); setFSubC(""); setModal("subject"); }}
                  className="btn btn-primary"
                  style={{ width: "auto", padding: "8px 14px", fontSize: 13, gap: 4, borderRadius: 10 }}
                >
                  <Plus size={15} /> Add Subject
                </button>
              </div>

              {subjectsLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                  <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
                </div>
              ) : subjects.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "48px 16px" }}>
                  <div style={{ color: "var(--text-muted)", display: "flex", justifyContent: "center", marginBottom: 10 }}>
                    <BookOpen size={32} />
                  </div>
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No subjects in Semester {selectedSemester} yet.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {subjects.map((s) => (
                    <div key={s.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                      <button
                        onClick={() => deleteSubject(s.id, s.name)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
                          background: `var(--danger-dim)`, color: "var(--danger)", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Subject Modal */}
        {modal === "subject" && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div className="card" style={{ width: "100%", maxWidth: 390, position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>Add Subject (Sem {selectedSemester})</span>
                <button onClick={closeModal} style={{ background: "var(--bg-card-2)", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", cursor: "pointer" }}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-group">
                <label className="form-label">Subject Name</label>
                <input className="input" placeholder="e.g. Data Structures" value={fSubN} onChange={e => setFSubN(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Subject Code</label>
                <input className="input" placeholder="e.g. CS301" value={fSubC} onChange={e => setFSubC(e.target.value.toUpperCase())} maxLength={12} required />
              </div>
              <button className="btn btn-primary" onClick={createSubject} disabled={saving || !fSubN || !fSubC}>
                {saving ? "Adding..." : "Add Subject"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="Departments" showBack={true} />

      {/* Header Stats */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, #1b1437 0%, var(--bg-card) 100%)", border: "1px solid var(--border-accent)" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>University Overview</p>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 6px" }}>Academic Departments</h2>
        <div style={{ display: "flex", gap: 12, fontSize: 13, color: "var(--text-secondary)", marginTop: 8, flexWrap: "wrap" }}>
          <span>🏢 {departments.length} Departments</span>
          <span>•</span>
          <span>🎓 {totalStudents} Enrolled Students</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span className="section-title">Academic Departments</span>
        <button className="btn btn-primary" style={{ width: "auto", padding: "8px 14px", fontSize: 13, gap: 4, borderRadius: 10 }} onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> Add Dept
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : departments.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-secondary)" }}>
          <Building2 size={48} style={{ color: "var(--text-muted)", marginBottom: 12, margin: "0 auto 12px" }} />
          <p>No departments found.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {departments.map((d, idx) => {
            const color = DEPT_COLORS[idx % DEPT_COLORS.length];
            return (
              <div
                key={d.id}
                className="card"
                style={{ borderLeft: `4px solid ${color}`, cursor: "pointer" }}
                onClick={() => setSelectedDept(d)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{d.name}</h3>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {d.institute_name || "Institute of Technology"}
                    </span>
                  </div>
                  <span className="badge" style={{ backgroundColor: "var(--bg-card-2)", color, fontSize: 11, fontWeight: 700, border: `1px solid ${color}` }}>
                    {d.code}
                  </span>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

                {/* Live Metrics Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Users size={15} style={{ color: "var(--text-secondary)" }} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{d.student_count}</span>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Students</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <User size={15} style={{ color: "var(--text-secondary)" }} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{d.faculty_count}</span>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Faculty</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TrendingUp size={15} style={{ color: d.avg_attendance >= 75 ? "var(--success)" : "var(--warning)" }} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: d.avg_attendance >= 75 ? "var(--success)" : "var(--warning)" }}>
                        {d.avg_attendance}%
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Avg Attend.</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Department Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 390, position: "relative" }}>
            <h3 style={{ marginBottom: 16 }}>Add Department</h3>
            <form onSubmit={handleCreateDepartment}>
              <div className="form-group">
                <label className="form-label">Department Name</label>
                <input type="text" className="input" placeholder="Computer Science & Engineering" value={newDept.name} onChange={e => setNewDept(prev => ({ ...prev, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Code / Abbreviation</label>
                <input type="text" className="input" placeholder="CSE" value={newDept.code} onChange={e => setNewDept(prev => ({ ...prev, code: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Institute Name (optional)</label>
                <input type="text" className="input" placeholder="Institute of Technology" value={newDept.institute_name} onChange={e => setNewDept(prev => ({ ...prev, institute_name: e.target.value }))} />
              </div>

              {errorMsg && (
                <div className="alert alert-danger" style={{ marginBottom: 14 }}>
                  <AlertCircle size={16} /> {errorMsg}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={adding}>
                  {adding ? "Adding..." : "Save Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}

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
