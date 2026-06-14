"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { User, Mail, BookOpen, Hash, Layers, Loader2 } from "lucide-react";

interface StudentProfile {
  id: string;
  roll_no: string;
  enrollment_no: string | null;
  name: string;
  division: string | null;
  batch: string | null;
  semester: number | null;
  dept_id: string;
}

interface AttendanceStats {
  total_lectures: number;
  present: number;
  absent: number;
  percentage: number;
}

export default function StudentProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [email, setEmail] = useState("");
  const [deptName, setDeptName] = useState("");
  const [attStats, setAttStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const [meRes, profileRes] = await Promise.all([
          apiFetch("/users/me"),
          apiFetch("/students/me"),
        ]);
        if (meRes.ok) {
          const meData = await meRes.json();
          setEmail(meData.email);
        }
        if (profileRes.ok) {
          const studentData = await profileRes.json();
          setProfile(studentData);

          // Fetch dept name
          const deptsRes = await apiFetch("/departments");
          if (deptsRes.ok) {
            const depts = await deptsRes.json();
            const dept = depts.find((d: any) => d.id === studentData.dept_id);
            if (dept) setDeptName(dept.name);
          }

          // Fetch attendance stats
          const attRes = await apiFetch(`/students/${studentData.id}/attendance`);
          if (attRes.ok) {
            setAttStats(await attRes.json());
          }
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  function handleSignOut() {
    localStorage.clear();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading profile...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="Profile" />

      {/* Avatar + Name */}
      <div style={{ textAlign: "center", padding: "20px 0 28px" }}>
        <div className="avatar" style={{ width: 90, height: 90, fontSize: 30, margin: "0 auto 14px" }}>
          {profile?.name ? profile.name.charAt(0) : "S"}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{profile?.name || "Student"}</h2>
        <span className="badge badge-accent">Student</span>
      </div>

      {/* Personal Information */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Personal Information</div>
        <div className="info-row">
          <div className="info-row-icon"><User size={16} /></div>
          <div className="info-row-content">
            <div className="info-row-label">Name</div>
            <div className="info-row-value">{profile?.name}</div>
          </div>
        </div>
        <div className="info-row">
          <div className="info-row-icon"><Mail size={16} /></div>
          <div className="info-row-content">
            <div className="info-row-label">Email</div>
            <div className="info-row-value">{email}</div>
          </div>
        </div>
      </div>

      {/* Academic Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Academic Details</div>
        {[
          { icon: <Hash size={16} />, label: "Roll Number", value: profile?.roll_no },
          { icon: <BookOpen size={16} />, label: "Enrollment", value: profile?.enrollment_no || "Not Registered" },
          { icon: <Layers size={16} />, label: "Division / Batch", value: `Div ${profile?.division || "?"} · ${profile?.batch || "?"}` },
          { icon: <BookOpen size={16} />, label: "Semester", value: `Semester ${profile?.semester || "?"}` },
          { icon: <Layers size={16} />, label: "Department", value: deptName || profile?.dept_id || "—" },
        ].map((row, i) => (
          <div key={i} className="info-row">
            <div className="info-row-icon">{row.icon}</div>
            <div className="info-row-content">
              <div className="info-row-label">{row.label}</div>
              <div className="info-row-value">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Attendance Summary */}
      {attStats && (
        <div className="card" style={{ marginBottom: 16, background: "linear-gradient(135deg, #16122d 0%, var(--bg-card) 100%)", border: "1px solid var(--border-accent)" }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Attendance Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            {[
              { label: "Present", value: attStats.present, color: "var(--success)" },
              { label: "Absent", value: attStats.absent, color: "var(--danger)" },
              { label: "Total", value: attStats.total_lectures, color: "var(--accent)" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: "var(--bg-card-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${attStats.percentage}%`, background: attStats.percentage >= 75 ? "var(--success)" : "var(--warning)", borderRadius: 99, transition: "width 0.5s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Overall Attendance</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: attStats.percentage >= 75 ? "var(--success)" : "var(--warning)" }}>{attStats.percentage}%</span>
          </div>
        </div>
      )}

      {/* Logout */}
      <button
        className="btn btn-secondary"
        style={{ width: "100%", color: "var(--danger)", borderColor: "var(--danger-dim)" }}
        onClick={handleSignOut}
      >
        Sign Out
      </button>
    </div>
  );
}
