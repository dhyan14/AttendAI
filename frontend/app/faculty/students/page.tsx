"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Search, Users, Loader2 } from "lucide-react";

interface Student {
  id: string;
  name: string;
  roll_no: string;
  division: string | null;
  batch: string | null;
  semester: number | null;
  attendance_percentage: number | null;
}

export default function FacultyStudentsPage() {
  const [facultyDept, setFacultyDept] = useState<{ id: string; name: string; code: string } | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const facRes = await apiFetch("/faculty/me");
        if (facRes.ok) {
          const facData = await facRes.json();
          setFacultyDept({
            id: facData.dept_id,
            name: facData.dept_name,
            code: facData.dept_name.split(" ")[0], // abbreviation
          });

          const studentsRes = await apiFetch(`/students?dept_id=${facData.dept_id}`);
          if (studentsRes.ok) {
            setStudents(await studentsRes.json());
          }
        }
      } catch (err) {
        console.error("Error loading faculty students page:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_no.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="My Department" />

      {/* Department card */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, #101935 0%, var(--bg-card) 100%)", border: "1px solid var(--border-accent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "var(--accent)" }}>
            🏫
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Active Department</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{facultyDept?.name || "Loading..."}</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          style={{ paddingLeft: 40 }}
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Student List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-secondary)" }}>
          <Users size={48} style={{ color: "var(--text-muted)", marginBottom: 12, margin: "0 auto 12px" }} />
          <p>No students found.</p>
        </div>
      ) : (
        filtered.map((s, i) => {
          const attendance = s.attendance_percentage ?? 0;
          return (
            <div key={s.id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>{s.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {s.roll_no} · Div {s.division || "?"} · {s.batch || "?"}
                </div>
              </div>
              <span className={`badge ${attendance >= 75 ? "badge-present" : "badge-absent"}`}>
                {attendance}%
              </span>
            </div>
          );
        })
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
