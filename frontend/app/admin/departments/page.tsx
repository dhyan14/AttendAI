"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Building2, Users, User, TrendingUp, Loader2 } from "lucide-react";

interface Department {
  id: string;
  name: string;
  code: string;
  institute_name: string | null;
}

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

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

      <div className="section-header">
        <span className="section-title">Academic Departments</span>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
