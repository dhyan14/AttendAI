"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { Camera, Image as ImageIcon, Loader2, CheckCircle, AlertCircle } from "lucide-react";

type Mode = "ai" | "manual";
type Step = "setup" | "processing" | "review";

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface StudentRecord {
  id: string; // attendance record ID
  student_id: string;
  student_name: string;
  roll_no: string;
  status: string; // 'present' | 'absent'
  source: string;
  confidence: number | null;
}

export default function TakeAttendancePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [lectureNo, setLectureNo] = useState(1);
  const [division, setDivision] = useState("A");
  const [batch, setBatch] = useState("All");
  const [step, setStep] = useState<Step>("setup");
  const [images, setImages] = useState<File[]>([]);
  
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [lectureId, setLectureId] = useState<string | null>(null);
  
  // Review step state
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSubjects() {
      try {
        const res = await apiFetch("/subjects/");
        if (res.ok) {
          const data = await res.json();
          setSubjects(data);
          if (data.length > 0) {
            setSelectedSubject(data[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading subjects:", err);
      } finally {
        setLoadingSubjects(false);
      }
    }
    loadSubjects();
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setImages(prev => [...prev, ...Array.from(e.target.files!)]);
  }

  async function handleSubmit() {
    if (!selectedSubject) return;
    setStep("processing");
    setProcessingProgress(15);
    
    try {
      // 1. Create lecture session on backend
      const todayDate = new Date().toISOString().split("T")[0];
      const createRes = await apiFetch("/attendance/lectures", {
        method: "POST",
        body: JSON.stringify({
          subject_id: selectedSubject,
          division,
          batch,
          lecture_no: lectureNo,
          date: todayDate,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.detail || "Failed to create lecture session");
      }

      const lecture = await createRes.json();
      const currentLectureId = lecture.id;
      setLectureId(currentLectureId);
      setProcessingProgress(40);

      // 2. Trigger AI detection if in AI mode
      if (mode === "ai" && images.length > 0) {
        const formData = new FormData();
        formData.append("lecture_id", currentLectureId);
        formData.append("file", images[0]); // upload first image for processing
        
        const aiRes = await apiFetch("/attendance/take-ai", {
          method: "POST",
          headers: {
            "Content-Type": "", // Let browser set boundary
          },
          body: formData,
        });

        if (!aiRes.ok) {
          const err = await aiRes.json();
          throw new Error(err.detail || "AI recognition failed");
        }
      }

      setProcessingProgress(80);

      // 3. Load students list for review
      const detailRes = await apiFetch(`/attendance/lectures/${currentLectureId}`);
      if (!detailRes.ok) {
        throw new Error("Failed to load lecture details for review");
      }

      const detail = await detailRes.json();
      setStudents(detail.records);
      setProcessingProgress(100);
      setStep("review");
    } catch (err: any) {
      alert(err.message || "Error taking attendance");
      setStep("setup");
      setProcessingProgress(0);
    }
  }

  async function handleFinalize() {
    if (!lectureId) return;
    setSaving(true);
    try {
      const presentIds = students.filter(s => s.status === "present").map(s => s.student_id);
      const res = await apiFetch(`/attendance/lectures/${lectureId}/finalize`, {
        method: "PUT",
        body: JSON.stringify({
          present_student_ids: presentIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to finalize attendance");
      }

      // Success - redirect back to faculty home
      router.push("/faculty/home");
    } catch (err: any) {
      alert(err.message || "Error finalizing attendance");
    } finally {
      setSaving(false);
    }
  }

  function toggleStudentStatus(studentId: string) {
    setStudents(prev =>
      prev.map(s =>
        s.student_id === studentId
          ? { ...s, status: s.status === "present" ? "absent" : "present" }
          : s
      )
    );
  }

  const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  if (step === "processing") {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          background: "var(--accent-dim)", border: "3px solid var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24, boxShadow: "0 0 40px var(--accent-glow)"
        }} className="pulse">
          <Loader2 size={40} className="animate-spin" style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
        <h2 style={{ marginBottom: 8 }}>{mode === "ai" ? "Processing AI Scan" : "Initializing Session"}</h2>
        <p style={{ marginBottom: 24, color: "var(--text-secondary)", fontSize: 14 }}>
          {mode === "ai" ? "Extracting faces and matching with pgvector database..." : "Loading student checklist..."}
        </p>
        <div style={{ width: "100%", background: "var(--bg-card-2)", borderRadius: 99, height: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "var(--accent)", width: `${processingProgress}%`, transition: "width 0.2s ease", borderRadius: 99 }} />
        </div>
        <p style={{ marginTop: 12, fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>{processingProgress}%</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (step === "review") {
    const presentCount = students.filter(s => s.status === "present").length;
    const selectedSubjObj = subjects.find(s => s.id === selectedSubject);

    return (
      <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
        <TopBar title="Review List" />

        <div className="alert alert-info" style={{ margin: "12px 0 20px" }}>
          <span>✦</span> {mode === "ai" ? "AI marked" : "Initialized"} {presentCount}/{students.length} students. Review and correct if needed.
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Subject</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{selectedSubjObj?.name || "Subject"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Division</div>
              <div style={{ fontWeight: 600 }}>{division}</div>
            </div>
          </div>
          <div className="divider" style={{ margin: "12px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: "var(--success)" }}>{presentCount}</div><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Present</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: "var(--danger)" }}>{students.length - presentCount}</div><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Absent</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>{students.length}</div><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total</div></div>
          </div>
        </div>

        {students.map((s, i) => (
          <div key={s.student_id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
              {s.student_name.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{s.student_name}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {s.roll_no} {s.confidence ? `· ${Math.round(s.confidence * 100)}% match` : "· manual"}
              </div>
            </div>
            <button
              onClick={() => toggleStudentStatus(s.student_id)}
              style={{
                width: 36, height: 36, borderRadius: 99, border: "2px solid",
                borderColor: s.status === "present" ? "var(--success)" : "var(--danger)",
                background: s.status === "present" ? "var(--success-dim)" : "var(--danger-dim)",
                color: s.status === "present" ? "var(--success)" : "var(--danger)",
                cursor: "pointer", fontWeight: 700, fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}
            >
              {s.status === "present" ? "P" : "A"}
            </button>
          </div>
        ))}

        <button 
          className="btn btn-primary" 
          style={{ marginTop: 16, gap: 8 }}
          onClick={handleFinalize}
          disabled={saving}
        >
          {saving ? (
            <><Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} /> Finalizing...</>
          ) : (
            "✓ Finalize Attendance"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <TopBar title="Take Attendance" showBack />

      {/* AI / Manual Toggle */}
      <div style={{ padding: "12px 0 4px" }}>
        <div className="toggle-pill">
          <button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>
            <span>✦</span> AI based
          </button>
          <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>
            <span>📋</span> Manual
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "10px 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.6 }}>⇌</span>
          {mode === "ai"
            ? "Faces will be automatically recognized from lecture images."
            : "Mark attendance manually using a checklist."}
        </p>
      </div>

      {/* Subject */}
      <div className="form-group">
        <label className="form-label">Subject</label>
        {loadingSubjects ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 14 }}>
            <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
            Loading subjects...
          </div>
        ) : (
          <select className="select-input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        )}
      </div>

      {/* Lecture Number */}
      <div className="form-group">
        <label className="form-label">Lecture Number</label>
        <div className="lecture-selector">
          {[1,2,3,4,5,6].map(n => (
            <button
              key={n}
              className={`lecture-btn ${lectureNo === n ? "selected" : ""}`}
              onClick={() => setLectureNo(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Division + Batch */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="form-group">
        <div>
          <label className="form-label">Division</label>
          <select className="select-input" value={division} onChange={e => setDivision(e.target.value)}>
            {["A", "B", "C", "D"].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Batch</label>
          <select className="select-input" value={batch} onChange={e => setBatch(e.target.value)}>
            {["All", "B1", "B2", "B3"].map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Date & Time */}
      <div className="form-group" style={{ marginBottom: 24 }}>
        <label className="form-label">Attendance Date &amp; Time</label>
        <div style={{
          background: "var(--bg-input)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: "14px 16px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ color: "var(--accent)", fontSize: 18 }}>📅</span>
          <div>
            <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 500 }}>
              Current: {dateStr}, {timeStr}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Using current date &amp; time (Auto)</div>
          </div>
        </div>
      </div>

      {/* AI: Image Picker */}
      {mode === "ai" && (
        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label">Select Images</label>
          <div className="image-picker">
            <label className="image-picker-btn" style={{ cursor: "pointer" }}>
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
              <ImageIcon size={20} /> Gallery
            </label>
            <label className="image-picker-btn" style={{ cursor: "pointer" }}>
              <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: "none" }} />
              <Camera size={20} /> Camera
            </label>
          </div>
          {images.length > 0 && (
            <div className="alert alert-success" style={{ marginTop: 10 }}>
              <CheckCircle size={16} /> {images.length} image{images.length > 1 ? "s" : ""} selected
            </div>
          )}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={mode === "ai" && images.length === 0}
      >
        Take Attendance
      </button>
    </div>
  );
}
