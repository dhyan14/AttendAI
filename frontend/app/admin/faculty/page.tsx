"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { User, Plus, Search, Loader2, Award, Briefcase, Mail, AlertCircle } from "lucide-react";

interface Faculty {
  id: string;
  name: string;
  designation: string | null;
  dept_id: string;
  email: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

export default function AdminFacultyPage() {
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [deptsLoading, setDeptsLoading] = useState(true);

  // Manual Add Faculty State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFaculty, setNewFaculty] = useState({
    name: "",
    email: "",
    designation: "",
    dept_id: "",
  });
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
    async function loadFaculty() {
      setLoading(true);
      try {
        const res = await apiFetch(`/faculty?dept_id=${selectedDept}`);
        if (res.ok) {
          const data = await res.json();
          setFacultyList(data);
        }
      } catch (err) {
        console.error("Failed to load faculty:", err);
      } finally {
        setLoading(false);
      }
    }
    loadFaculty();
  }, [selectedDept]);

  const filteredFaculty = facultyList.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreateFaculty(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setAdding(true);
    try {
      const payload = {
        ...newFaculty,
        dept_id: newFaculty.dept_id || selectedDept,
        designation: newFaculty.designation || null,
      };

      const res = await apiFetch("/faculty/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create faculty member");
      }

      const created = await res.json();
      setFacultyList(prev => [created, ...prev]);
      setShowAddModal(false);
      setNewFaculty({
        name: "",
        email: "",
        designation: "",
        dept_id: "",
      });
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="Faculty" showBack={true} />

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
        <div style={{ position: "relative", marginBottom: 0 }}>
          <input
            className="input"
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 44 }}
          />
          <Search size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        </div>
      </div>

      {/* Action Button */}
      <button className="btn btn-primary" style={{ marginBottom: 16, gap: 6 }} onClick={() => setShowAddModal(true)}>
        <Plus size={18} /> Add Faculty Member
      </button>

      {/* Faculty List */}
      <div className="section-header">
        <span className="section-title">Faculty List ({filteredFaculty.length})</span>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : filteredFaculty.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-secondary)" }}>
          <User size={48} style={{ color: "var(--text-muted)", marginBottom: 12, margin: "0 auto 12px" }} />
          <p>No faculty members found for this department.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredFaculty.map(f => (
            <div key={f.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "var(--accent-dim)", color: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 16
              }}>
                {f.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 15, marginBottom: 2 }}>{f.name}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "var(--text-secondary)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Briefcase size={12} />
                    <span>{f.designation || "Faculty Member"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Mail size={12} />
                    <span>{f.email}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Faculty Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 390, position: "relative" }}>
            <h3 style={{ marginBottom: 16 }}>Add Faculty Member</h3>
            <form onSubmit={handleCreateFaculty}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" className="input" placeholder="Dr. Jaimin Patel" value={newFaculty.name} onChange={e => setNewFaculty(prev => ({ ...prev, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="input" placeholder="jaimin@svgu.edu" value={newFaculty.email} onChange={e => setNewFaculty(prev => ({ ...prev, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Designation</label>
                <input type="text" className="input" placeholder="Professor / Assistant Professor" value={newFaculty.designation} onChange={e => setNewFaculty(prev => ({ ...prev, designation: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="select-input" value={newFaculty.dept_id || selectedDept} onChange={e => setNewFaculty(prev => ({ ...prev, dept_id: e.target.value }))} required>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
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
                  {adding ? "Adding..." : "Save Faculty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
