"use client";
import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Search } from "lucide-react";

const MOCK_STUDENTS = [
  { name: "Rahul Sharma",  roll: "CS001", div: "A", batch: "B1", semester: 4, attendance: 85 },
  { name: "Priya Patel",   roll: "CS002", div: "A", batch: "B2", semester: 4, attendance: 92 },
  { name: "Amit Singh",    roll: "CS003", div: "B", batch: "B1", semester: 4, attendance: 67 },
  { name: "Sneha Gupta",   roll: "CS004", div: "A", batch: "B1", semester: 4, attendance: 78 },
  { name: "Rohan Mehta",   roll: "CS005", div: "B", batch: "B2", semester: 4, attendance: 55 },
  { name: "Nisha Verma",   roll: "CS006", div: "A", batch: "B2", semester: 4, attendance: 90 },
  { name: "Deepak Kumar",  roll: "CS007", div: "B", batch: "B1", semester: 4, attendance: 74 },
  { name: "Kavya Reddy",   roll: "CS008", div: "A", batch: "B1", semester: 4, attendance: 88 },
];

export default function FacultyStudentsPage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_STUDENTS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.roll.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-content">
      <TopBar title="Select Department" />

      {/* Department card */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: "center", padding: 20, cursor: "pointer" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
            🎓
          </div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>BTech</div>
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
      {filtered.map((s, i) => (
        <div key={i} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>{s.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.roll} · Div {s.div} · {s.batch}</div>
          </div>
          <span className={`badge ${s.attendance >= 75 ? "badge-present" : "badge-absent"}`}>
            {s.attendance}%
          </span>
        </div>
      ))}
    </div>
  );
}
