"use client";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  BookOpen, Plus, Trash2, UserPlus, UserMinus, ChevronDown,
  ChevronUp, Loader2, CheckCircle2, AlertCircle, X,
} from "lucide-react";

interface Dept    { id: string; name: string; code: string; }
interface Subject { id: string; name: string; code: string; dept_id: string; semester: number | null; }
interface Faculty { id: string; name: string; designation: string | null; email: string; dept_id: string; }
interface Assignment { id: string; subject_id: string; faculty_id: string; faculty_name: string; division: string | null; batch: string | null; }

function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg.startsWith("✓");
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      background: ok ? "var(--success)" : "var(--danger)",
      color: "#fff", padding: "10px 22px", borderRadius: 99, fontSize: 13,
      fontWeight: 700, zIndex: 9999, boxShadow: "0 4px 24px rgba(0,0,0,0.4)", whiteSpace: "nowrap",
    }}>{msg}</div>
  );
}

export default function SubjectsPage() {
  const [toast, setToast]       = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const [depts, setDepts]       = useState<Dept[]>([]);
  const [selDept, setSelDept]   = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty]   = useState<Faculty[]>([]);
  const [loading, setLoading]   = useState(false);

  // Create subject
  const [showCreate, setShowCreate] = useState(false);
  const [newSubj, setNewSubj]   = useState({ name: "", code: "", semester: "" });
  const [creating, setCreating] = useState(false);

  // Assign subject modal
  const [assignSubj, setAssignSubj]       = useState<Subject | null>(null);
  const [assignments, setAssignments]     = useState<Assignment[]>([]);
  const [assignFacId, setAssignFacId]     = useState("");
  const [assignDiv, setAssignDiv]         = useState("");
  const [assignBatch, setAssignBatch]     = useState("All");
  const [assigning, setAssigning]         = useState(false);

  // ── Load depts ─────────────────────────────────────────
  useEffect(() => {
    apiFetch("/departments/").then(r => r.ok ? r.json() : []).then((d: Dept[]) => {
      setDepts(d);
      if (d.length > 0) setSelDept(d[0].id);
    }).catch(() => {});
  }, []);

  // ── Load subjects + faculty for selected dept ──────────
  const loadData = useCallback(async () => {
    if (!selDept) return;
    setLoading(true);
    try {
      const [sr, fr] = await Promise.all([
        apiFetch(`/subjects/?dept_id=${selDept}`).then(r => r.ok ? r.json() : []),
        apiFetch(`/faculty/?dept_id=${selDept}`).then(r => r.ok ? r.json() : []),
      ]);
      setSubjects(sr);
      setFaculty(fr);
    } finally { setLoading(false); }
  }, [selDept]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Load assignments for a subject ────────────────────
  const loadAssignments = async (subj: Subject) => {
    setAssignSubj(subj);
    setAssignFacId("");
    setAssignDiv("");
    setAssignBatch("All");
    const r = await apiFetch(`/subjects/assignments?dept_id=${subj.dept_id}`);
    const all: Assignment[] = r.ok ? await r.json() : [];
    setAssignments(all.filter(a => a.subject_id === subj.id));
  };

  // ── Create subject ────────────────────────────────────
  const createSubject = async () => {
    if (!newSubj.name.trim() || !newSubj.code.trim()) { showToast("✗ Name and Code are required"); return; }
    setCreating(true);
    try {
      const r = await apiFetch("/subjects/", {
        method: "POST",
        body: JSON.stringify({ name: newSubj.name.trim(), code: newSubj.code.trim(), dept_id: selDept, semester: newSubj.semester ? parseInt(newSubj.semester) : null }),
      });
      if (r.ok) {
        showToast("✓ Subject created");
        setNewSubj({ name: "", code: "", semester: "" });
        setShowCreate(false);
        loadData();
      } else {
        const e = await r.json();
        showToast("✗ " + (e.detail || "Failed"));
      }
    } finally { setCreating(false); }
  };

  // ── Delete subject ────────────────────────────────────
  const deleteSubject = async (s: Subject) => {
    if (!confirm(`Delete "${s.name}"? This removes all assignments too.`)) return;
    const r = await apiFetch(`/subjects/${s.id}`, { method: "DELETE" });
    if (r.ok) { showToast("✓ Subject deleted"); loadData(); }
    else { const e = await r.json(); showToast("✗ " + (e.detail || "Failed")); }
  };

  // ── Assign subject ────────────────────────────────────
  const assignSubject = async () => {
    if (!assignSubj || !assignFacId) { showToast("✗ Select a faculty member"); return; }
    setAssigning(true);
    try {
      const r = await apiFetch("/subjects/assign", {
        method: "POST",
        body: JSON.stringify({
          subject_id: assignSubj.id,
          faculty_id: assignFacId,
          division: assignDiv || null,
          batch: assignBatch !== "All" ? assignBatch : null,
        }),
      });
      if (r.ok) {
        showToast("✓ Subject assigned");
        loadAssignments(assignSubj);
        setAssignFacId(""); setAssignDiv(""); setAssignBatch("All");
      } else {
        const e = await r.json();
        showToast("✗ " + (e.detail || "Failed"));
      }
    } finally { setAssigning(false); }
  };

  // ── Unassign ─────────────────────────────────────────
  const unassign = async (asgId: string) => {
    const r = await apiFetch(`/subjects/assign/${asgId}`, { method: "DELETE" });
    if (r.ok && assignSubj) { showToast("✓ Unassigned"); loadAssignments(assignSubj); }
  };

  const selDeptName = depts.find(d => d.id === selDept)?.name ?? "";

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 120px" }}>
      <Toast msg={toast} />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <BookOpen size={22} style={{ color: "var(--accent-2)" }} />
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>Subjects</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Create subjects and assign them to faculty members
        </p>
      </div>

      {/* Dept selector */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Department</div>
        <select
          value={selDept}
          onChange={e => setSelDept(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none" }}
        >
          {depts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
        </select>
      </div>

      {/* Create subject button */}
      <button
        onClick={() => setShowCreate(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px", borderRadius: 12, marginBottom: 14,
          background: "var(--accent-dim)", border: "1px dashed var(--border-accent)",
          color: "var(--accent-2)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <Plus size={16} /> Add Subject to {selDeptName}
        {showCreate ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Create form */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>New Subject</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Subject Name *</label>
              <input
                value={newSubj.name} onChange={e => setNewSubj(v => ({ ...v, name: e.target.value }))}
                placeholder="e.g. Data Structures"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Code *</label>
              <input
                value={newSubj.code} onChange={e => setNewSubj(v => ({ ...v, code: e.target.value }))}
                placeholder="e.g. CS201"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Semester</label>
              <input
                type="number" min="1" max="8"
                value={newSubj.semester} onChange={e => setNewSubj(v => ({ ...v, semester: e.target.value }))}
                placeholder="e.g. 3"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <button
            onClick={createSubject} disabled={creating}
            style={{ padding: "10px 20px", borderRadius: 10, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: creating ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: creating ? 0.7 : 1 }}
          >
            {creating ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
            {creating ? "Creating…" : "Create Subject"}
          </button>
        </div>
      )}

      {/* Subject list */}
      {loading
        ? <div style={{ textAlign: "center", padding: "40px 0" }}><Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} /></div>
        : subjects.length === 0
          ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-muted)" }}>
              <BookOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700 }}>No subjects yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Add your first subject above</div>
            </div>
          )
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {subjects.map(s => (
                <div key={s.id} className="card" style={{ padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Icon */}
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-dim)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, flexShrink: 0 }}>
                      {s.code.slice(0, 3)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                        {s.code}{s.semester ? ` · Semester ${s.semester}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {/* Assign */}
                      <button
                        onClick={() => loadAssignments(s)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, background: "rgba(124,111,224,0.1)", color: "var(--accent-2)", border: "1px solid rgba(124,111,224,0.2)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        <UserPlus size={12} /> Assign
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => deleteSubject(s)}
                        style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: "rgba(240,90,90,0.08)", color: "var(--danger)", border: "1px solid rgba(240,90,90,0.18)", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

      {/* Assign Modal */}
      {assignSubj && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 0 0" }}>
          <div style={{ width: "100%", maxWidth: 600, background: "var(--bg-card)", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", maxHeight: "80vh", overflowY: "auto" }}>
            {/* Title */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Assign: {assignSubj.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{assignSubj.code}</div>
              </div>
              <button onClick={() => setAssignSubj(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}><X size={18} /></button>
            </div>

            {/* Current assignments */}
            {assignments.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Currently Assigned To</div>
                {assignments.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(34,211,122,0.06)", border: "1px solid rgba(34,211,122,0.15)", marginBottom: 6 }}>
                    <CheckCircle2 size={14} style={{ color: "#22d37a", flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
                      {a.faculty_name}
                      {(a.division || a.batch) && <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}> · {[a.division, a.batch].filter(Boolean).join(" / ")}</span>}
                    </div>
                    <button onClick={() => unassign(a.id)} style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(240,90,90,0.1)", color: "var(--danger)", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center" }}>
                      <UserMinus size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new assignment */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>Assign to Faculty</div>

            {faculty.length === 0
              ? <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>No faculty in this department. Add faculty first.</div>
              : (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Faculty *</label>
                    <select
                      value={assignFacId} onChange={e => setAssignFacId(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                    >
                      <option value="">-- Select Faculty --</option>
                      {faculty.map(f => (
                        <option key={f.id} value={f.id}>{f.name} {f.designation ? `(${f.designation})` : ""}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Division (optional)</label>
                      <input
                        value={assignDiv} onChange={e => setAssignDiv(e.target.value)}
                        placeholder="e.g. A"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Batch (optional)</label>
                      <select
                        value={assignBatch} onChange={e => setAssignBatch(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                      >
                        {["All", "B1", "B2", "B3", "B4"].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={assignSubject} disabled={assigning || !assignFacId}
                    style={{ width: "100%", padding: "13px", borderRadius: 12, background: assigning || !assignFacId ? "var(--bg-card-2)" : "var(--accent)", color: assigning || !assignFacId ? "var(--text-muted)" : "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: assigning || !assignFacId ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    {assigning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <UserPlus size={14} />}
                    {assigning ? "Assigning…" : "Assign Subject"}
                  </button>
                </>
              )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
