"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Users, Upload, Plus, Search, Filter, Loader2, CheckCircle, AlertCircle, Trash2, X } from "lucide-react";

interface Student {
  id: string;
  roll_no: string;
  enrollment_no: string | null;
  name: string;
  division: string | null;
  batch: string | null;
  semester: number | null;
  dept_id: string;
  email?: string;
  profile_image_url?: string | null;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("");
  const [batch, setBatch] = useState("");
  const [semester, setSemester] = useState("");

  const [loading, setLoading] = useState(false);
  const [deptsLoading, setDeptsLoading] = useState(true);

  // CSV Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  // Manual Add Student State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudent, setNewStudent] = useState({
    roll_no: "",
    enrollment_no: "",
    name: "",
    email: "",
    division: "",
    batch: "",
    semester: "",
  });
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<Student | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await apiFetch("/departments/");
        if (res.ok) {
          const data = await res.json();
          setDepartments(data);
          if (data.length > 0) {
            setSelectedDept(data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load departments:", err);
      } finally {
        setDeptsLoading(false);
      }
    }
    loadDepts();
  }, []);

  useEffect(() => {
    if (!selectedDept) return;
    async function loadStudents() {
      setLoading(true);
      try {
        let query = `/students/?dept_id=${selectedDept}`;
        if (division) query += `&division=${division}`;
        if (batch) query += `&batch=${batch}`;
        if (semester) query += `&semester=${semester}`;

        const res = await apiFetch(query);
        if (res.ok) {
          const data = await res.json();
          setStudents(data);
        }
      } catch (err) {
        console.error("Failed to load students:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStudents();
  }, [selectedDept, division, batch, semester]);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_no.toLowerCase().includes(search.toLowerCase())
  );

  async function handleImportCSV(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile || !selectedDept) return;

    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const res = await apiFetch(`/students/import?dept_id=${selectedDept}`, {
        method: "POST",
        headers: {
          // Note: fetch will auto-set boundary for FormData if header Content-Type is NOT json
          "Content-Type": "",
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to import CSV");
      }

      const result = await res.json();
      setImportResult(result);
      setImportFile(null);
      // Reload students list
      const reloadRes = await apiFetch(`/students/?dept_id=${selectedDept}`);
      if (reloadRes.ok) setStudents(await reloadRes.json());
    } catch (err: any) {
      alert(err.message || "Error importing CSV");
    } finally {
      setImporting(false);
    }
  }

  async function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setAdding(true);
    try {
      const payload = {
        ...newStudent,
        dept_id: selectedDept,
        semester: newStudent.semester ? parseInt(newStudent.semester) : null,
        division: newStudent.division || null,
        batch: newStudent.batch || null,
        enrollment_no: newStudent.enrollment_no || null,
      };

      const res = await apiFetch("/students/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create student");
      }

      const created = await res.json();
      setStudents(prev => [created, ...prev]);
      setShowAddModal(false);
      setNewStudent({
        roll_no: "",
        enrollment_no: "",
        name: "",
        email: "",
        division: "",
        batch: "",
        semester: "",
      });
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="Students" showBack={true} />

      {/* Main Controls Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">Select Department</label>
          {deptsLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
              <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
              Loading departments...
            </div>
          ) : (
            <select
              className="select-input"
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          )}
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            className="input"
            type="text"
            placeholder="Search by name or roll number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 44 }}
          />
          <Search size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        </div>

        {/* Quick Filters */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <select className="select-input" style={{ fontSize: 13, padding: "10px 8px" }} value={division} onChange={e => setDivision(e.target.value)}>
            <option value="">Div: All</option>
            <option value="A">Div A</option>
            <option value="B">Div B</option>
            <option value="C">Div C</option>
          </select>

          <select className="select-input" style={{ fontSize: 13, padding: "10px 8px" }} value={batch} onChange={e => setBatch(e.target.value)}>
            <option value="">Batch: All</option>
            <option value="All">All Lecture</option>
            <option value="B1">Batch B1</option>
            <option value="B2">Batch B2</option>
            <option value="B3">Batch B3</option>
          </select>

          <select className="select-input" style={{ fontSize: 13, padding: "10px 8px" }} value={semester} onChange={e => setSemester(e.target.value)}>
            <option value="">Sem: All</option>
            {[1,2,3,4,5,6,7,8].map(s => (
              <option key={s} value={s.toString()}>Sem {s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <button className="btn btn-secondary" style={{ padding: "12px 16px", gap: 6, fontSize: 14 }} onClick={() => setShowImportModal(true)}>
          <Upload size={16} /> Bulk Import (CSV)
        </button>
        <button className="btn btn-primary" style={{ padding: "12px 16px", gap: 6, fontSize: 14 }} onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Add Student
        </button>
      </div>

      {/* Students List */}
      <div className="section-header">
        <span className="section-title">Students ({filteredStudents.length})</span>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-secondary)" }}>
          <Users size={48} style={{ color: "var(--text-muted)", marginBottom: 12, margin: "0 auto 12px" }} />
          <p>No students found for the selected criteria.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredStudents.map(s => (
            <div
              key={s.id}
              className="card"
              onClick={() => { setSelectedStudentForProfile(s); setShowProfileModal(true); }}
              style={{ display: "flex", alignItems: "center", justifyItems: "center", gap: 12, cursor: "pointer" }}
            >
              {s.profile_image_url ? (
                <img
                  src={s.profile_image_url}
                  alt={s.name}
                  style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "var(--accent-dim)", color: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 16, flexShrink: 0
                }}>
                  {s.name.charAt(0)}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 15, marginBottom: 2 }}>{s.name}</h3>
                <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                  <span>Sem {s.semester || "?"}</span>
                  <span>•</span>
                  <span>Div {s.division || "?"}</span>
                  <span>•</span>
                  <span>Batch {s.batch || "?"}</span>
                </div>
              </div>
              <div className="badge badge-muted" style={{ fontSize: 10 }}>
                {s.roll_no}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* CSV Import Modal */}
      {showImportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 390, position: "relative" }}>
            <h3 style={{ marginBottom: 16 }}>Bulk Import Students</h3>
            <form onSubmit={handleImportCSV}>
              <div className="form-group">
                <label className="form-label">Choose CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  className="input"
                  onChange={e => setImportFile(e.target.files?.[0] || null)}
                  required
                />
              </div>

              {importResult && (
                <div style={{ margin: "16px 0", maxHeight: 180, overflowY: "auto" }}>
                  <div className="alert alert-success" style={{ marginBottom: 8 }}>
                    <CheckCircle size={16} /> Imported: {importResult.created} | Skipped: {importResult.skipped}
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="alert alert-danger" style={{ flexDirection: "column", gap: 4 }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        <AlertCircle size={16} /> Row Errors:
                      </div>
                      {importResult.errors.map((err, i) => (
                        <div key={i} style={{ fontSize: 11 }}>• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowImportModal(false); setImportResult(null); }}>
                  Close
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={importing || !importFile}>
                  {importing ? "Importing..." : "Upload & Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 390, maxHeight: "90dvh", overflowY: "auto", position: "relative" }}>
            <h3 style={{ marginBottom: 16 }}>Add Student</h3>
            <form onSubmit={handleCreateStudent}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" className="input" placeholder="Rahul Sharma" value={newStudent.name} onChange={e => setNewStudent(prev => ({ ...prev, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="input" placeholder="rahul@svgu.edu" value={newStudent.email} onChange={e => setNewStudent(prev => ({ ...prev, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Roll Number</label>
                <input type="text" className="input" placeholder="CS001" value={newStudent.roll_no} onChange={e => setNewStudent(prev => ({ ...prev, roll_no: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Enrollment Number (optional)</label>
                <input type="text" className="input" placeholder="EN2024001" value={newStudent.enrollment_no} onChange={e => setNewStudent(prev => ({ ...prev, enrollment_no: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Sem</label>
                  <input type="number" className="input" min="1" max="8" placeholder="4" value={newStudent.semester} onChange={e => setNewStudent(prev => ({ ...prev, semester: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Div</label>
                  <input type="text" className="input" placeholder="A" value={newStudent.division} onChange={e => setNewStudent(prev => ({ ...prev, division: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Batch</label>
                  <input type="text" className="input" placeholder="B1" value={newStudent.batch} onChange={e => setNewStudent(prev => ({ ...prev, batch: e.target.value }))} />
                </div>
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
                  {adding ? "Adding..." : "Save Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      {showProfileModal && selectedStudentForProfile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 390, position: "relative", padding: "24px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Student Profile</span>
              <button onClick={() => { setShowProfileModal(false); setSelectedStudentForProfile(null); }} style={{ background: "var(--bg-card-2)", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>

            {/* Profile Avatar & Name */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              {selectedStudentForProfile.profile_image_url ? (
                <img
                  src={selectedStudentForProfile.profile_image_url}
                  alt={selectedStudentForProfile.name}
                  style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", margin: "0 auto 12px", border: "2px solid var(--accent)" }}
                />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: "var(--accent-dim)", color: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 28, margin: "0 auto 12px"
                }}>
                  {selectedStudentForProfile.name.charAt(0)}
                </div>
              )}
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selectedStudentForProfile.name}</h2>
              <span className="badge badge-accent" style={{ fontSize: 11 }}>Student</span>
            </div>

            {/* Profile Info Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Email</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedStudentForProfile.email || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Roll Number</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedStudentForProfile.roll_no}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Enrollment No</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedStudentForProfile.enrollment_no || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Department</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {departments.find(d => d.id === selectedStudentForProfile.dept_id)?.name || "Unknown Department"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Academic Class</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  Sem {selectedStudentForProfile.semester || "?"} · Div {selectedStudentForProfile.division || "?"} · Batch {selectedStudentForProfile.batch || "?"}
                </span>
              </div>
            </div>
            
            <button
              onClick={() => { setShowProfileModal(false); setSelectedStudentForProfile(null); }}
              className="btn btn-secondary"
              style={{ width: "100%", marginTop: 24 }}
            >
              Close Profile
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
