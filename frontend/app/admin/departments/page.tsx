"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Building2, Users, User, TrendingUp, Loader2, Plus, AlertCircle } from "lucide-react";

interface Department {
  id: string;
  name: string;
  code: string;
  institute_name: string | null;
}

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual Add Department State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDept, setNewDept] = useState({
    name: "",
    code: "",
    institute_name: "",
  });
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await apiFetch("/departments");
        if (res.ok) {
          const data = await res.json();
          setDepartments(data);
        }
      } catch (err) {
        console.error("Failed to load departments:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDepts();
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

      const created = await res.json();
      setDepartments(prev => [...prev, created]);
      setShowAddModal(false);
      setNewDept({
        name: "",
        code: "",
        institute_name: "",
      });
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setAdding(false);
    }
  }


  // Standard premium mock data to enrich the cards
  const deptDetails: Record<string, { students: number; faculty: number; avgAtt: number; color: string }> = {
    CSE: { students: 142, faculty: 6, avgAtt: 82.4, color: "var(--accent)" },
    IT:  { students: 128, faculty: 5, avgAtt: 79.1, color: "var(--info)" },
    ECE: { students: 96,  faculty: 4, avgAtt: 76.5, color: "var(--warning)" },
    ME:  { students: 110, faculty: 4, avgAtt: 74.8, color: "var(--danger)" },
  };

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="Departments" showBack={true} />

      {/* Header Stats */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, #1b1437 0%, var(--bg-card) 100%)", border: "1px solid var(--border-accent)" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>University Overview</p>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 6px" }}>Sardar Vallabhbhai Global University</h2>
        <div style={{ display: "flex", gap: 12, fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
          <span>🏢 {departments.length} Active Departments</span>
          <span>•</span>
          <span>🎓 ~476 Enrolled Students</span>
        </div>
      </div>

      <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span className="section-title" style={{ margin: 0 }}>Academic Departments</span>
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
          {departments.map((d) => {
            const details = deptDetails[d.code] || { students: 100, faculty: 4, avgAtt: 75.0, color: "var(--accent)" };
            return (
              <div 
                key={d.id} 
                className="card" 
                style={{ 
                  borderLeft: `4px solid ${details.color}`,
                  background: "var(--bg-card)",
                  transition: "transform 0.15s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{d.name}</h3>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {d.institute_name || "Institute of Technology"}
                    </span>
                  </div>
                  <span className="badge" style={{ backgroundColor: "var(--bg-card-2)", color: details.color, fontSize: 11, fontWeight: 700, border: `1px solid ${details.color}` }}>
                    {d.code}
                  </span>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

                {/* Metrics Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Users size={15} style={{ color: "var(--text-secondary)" }} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{details.students}</span>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Students</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <User size={15} style={{ color: "var(--text-secondary)" }} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{details.faculty}</span>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Faculty</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TrendingUp size={15} style={{ color: details.avgAtt >= 75 ? "var(--success)" : "var(--warning)" }} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: details.avgAtt >= 75 ? "var(--success)" : "var(--warning)" }}>
                        {details.avgAtt}%
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Avg Attendance</span>
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
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Computer Science & Engineering" 
                  value={newDept.name} 
                  onChange={e => setNewDept(prev => ({ ...prev, name: e.target.value }))} 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Code / Abbreviation</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="CSE" 
                  value={newDept.code} 
                  onChange={e => setNewDept(prev => ({ ...prev, code: e.target.value }))} 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Institute Name (optional)</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Institute of Technology" 
                  value={newDept.institute_name} 
                  onChange={e => setNewDept(prev => ({ ...prev, institute_name: e.target.value }))} 
                />
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
