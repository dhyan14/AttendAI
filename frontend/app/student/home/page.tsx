"use client";
import { useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { TrendingUp, AlertCircle, Award } from "lucide-react";

const SUBJECTS = [
  { name: "Engineering Mathematics 4", code: "EM4", percentage: 82, present: 18, total: 22, color: "var(--accent)" },
  { name: "Data Structures",           code: "DS",  percentage: 91, present: 20, total: 22, color: "var(--success)" },
  { name: "Physics",                   code: "PHY", percentage: 68, present: 15, total: 22, color: "var(--warning)" },
  { name: "Chemistry",                 code: "CHE", percentage: 55, present: 12, total: 22, color: "var(--danger)" },
  { name: "Digital Electronics",       code: "DE",  percentage: 77, present: 17, total: 22, color: "var(--accent-light)" },
];

function ProgressRing({ pct, size = 80, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-card-2)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color }}>
        {pct}%
      </div>
    </div>
  );
}

export default function StudentHomePage() {
  const router = useRouter();
  const overall = Math.round(SUBJECTS.reduce((a, s) => a + s.percentage, 0) / SUBJECTS.length);
  const low = SUBJECTS.filter(s => s.percentage < 75);

  return (
    <div className="page-content">
      <TopBar title="AttendAI" />

      {/* Overall Attendance Card */}
      <div className="card" style={{ marginBottom: 16, background: "linear-gradient(135deg, #1a1730 0%, var(--bg-card) 100%)", border: "1px solid var(--border-accent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ProgressRing pct={overall} size={90} stroke={8} />
          <div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Overall Attendance</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 2 }}>{overall}%</div>
            <div style={{ fontSize: 12, color: overall >= 75 ? "var(--success)" : "var(--danger)" }}>
              {overall >= 75 ? "✓ Good standing" : "⚠ Below required 75%"}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Present", value: SUBJECTS.reduce((a,s)=>a+s.present,0), color: "var(--success)" },
          { label: "Absent",  value: SUBJECTS.reduce((a,s)=>a+(s.total-s.present),0), color: "var(--danger)" },
          { label: "Total",   value: SUBJECTS.reduce((a,s)=>a+s.total,0), color: "var(--accent)" },
        ].map((st, i) => (
          <div key={i} className="card" style={{ textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: st.color }}>{st.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Low Attendance Alert */}
      {low.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: 16, flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <AlertCircle size={16} /> Low Attendance Warning
          </div>
          {low.map(s => (
            <div key={s.code} style={{ fontSize: 13, paddingLeft: 24 }}>
              • {s.name}: <strong>{s.percentage}%</strong>
            </div>
          ))}
        </div>
      )}

      {/* Subject List */}
      <div className="section-header">
        <span className="section-title">Subjects</span>
        <button onClick={() => router.push("/student/subjects")} style={{ background:"none", border:"none", color:"var(--accent)", fontSize:13, cursor:"pointer" }}>
          See all
        </button>
      </div>

      {SUBJECTS.map((s, i) => (
        <div key={i} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
          onClick={() => router.push("/student/subjects")}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"var(--accent)", flexShrink:0 }}>
            {s.code}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.name}</div>
            <div style={{ background: "var(--bg-card-2)", borderRadius: 99, height: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${s.percentage}%`, background: s.color, borderRadius: 99, transition: "width 0.5s ease" }} />
            </div>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: s.percentage >= 75 ? "var(--success)" : "var(--danger)", flexShrink:0 }}>
            {s.percentage}%
          </span>
        </div>
      ))}
    </div>
  );
}
