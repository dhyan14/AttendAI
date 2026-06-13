"use client";
import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Camera, Image as ImageIcon, Loader2, CheckCircle } from "lucide-react";

type Mode = "ai" | "manual";
type Step = "setup" | "processing" | "review";

const SUBJECTS = ["Engineering Mathematics 2", "Engineering Mathematics 4", "Data Structures", "Physics", "Chemistry"];
const DIVISIONS = ["A", "B", "C", "D"];
const BATCHES  = ["All", "B1", "B2", "B3"];

export default function TakeAttendancePage() {
  const [mode, setMode]         = useState<Mode>("ai");
  const [subject, setSubject]   = useState(SUBJECTS[0]);
  const [lectureNo, setLectureNo] = useState(1);
  const [division, setDivision] = useState("A");
  const [batch, setBatch]       = useState("All");
  const [step, setStep]         = useState<Step>("setup");
  const [images, setImages]     = useState<File[]>([]);
  const [progress, setProgress] = useState(0);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setImages(Array.from(e.target.files));
  }

  async function handleSubmit() {
    setStep("processing");
    // Simulate progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 200));
      setProgress(i);
    }
    setStep("review");
  }

  const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  if (step === "processing") return <ProcessingStep progress={progress} />;
  if (step === "review")     return <ReviewStep subject={subject} division={division} onBack={() => setStep("setup")} />;

  return (
    <div className="page-content">
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
        <label className="form-label">Subjects</label>
        <select className="select-input" value={subject} onChange={e => setSubject(e.target.value)}>
          {SUBJECTS.map(s => <option key={s}>{s}</option>)}
        </select>
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
            {DIVISIONS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Batch</label>
          <select className="select-input" value={batch} onChange={e => setBatch(e.target.value)}>
            {BATCHES.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Date & Time */}
      <div className="form-group">
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
        <div className="form-group">
          <label className="form-label">Select Images</label>
          <div className="image-picker">
            <label className="image-picker-btn" style={{ cursor: "pointer" }}>
              <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: "none" }} />
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
        style={{ marginTop: 8, marginBottom: 8 }}
        onClick={handleSubmit}
        disabled={mode === "ai" && images.length === 0}
      >
        Take Attendance
      </button>
    </div>
  );
}

function ProcessingStep({ progress }: { progress: number }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
      <div style={{
        width: 96, height: 96, borderRadius: "50%",
        background: "var(--accent-dim)", border: "3px solid var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 24, boxShadow: "0 0 40px var(--accent-glow)"
      }} className="pulse">
        <Loader2 size={40} color="var(--accent)" style={{ animation: "spin 1s linear infinite" }} />
      </div>
      <h2 style={{ marginBottom: 8 }}>Recognizing Faces</h2>
      <p style={{ marginBottom: 24 }}>AI is analyzing the classroom image...</p>
      <div style={{ width: "100%", background: "var(--bg-card-2)", borderRadius: 99, height: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "var(--accent)", width: `${progress}%`, transition: "width 0.2s ease", borderRadius: 99 }} />
      </div>
      <p style={{ marginTop: 12, fontSize: 13, color: "var(--accent)" }}>{progress}%</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ReviewStep({ subject, division, onBack }: { subject: string; division: string; onBack: () => void }) {
  const mockStudents = [
    { name: "Rahul Sharma",  roll: "CS001", present: true,  confidence: 0.97 },
    { name: "Priya Patel",   roll: "CS002", present: true,  confidence: 0.94 },
    { name: "Amit Singh",    roll: "CS003", present: false, confidence: null },
    { name: "Sneha Gupta",   roll: "CS004", present: true,  confidence: 0.91 },
    { name: "Rohan Mehta",   roll: "CS005", present: true,  confidence: 0.88 },
  ];
  const [students, setStudents] = useState(mockStudents);

  function toggle(i: number) {
    setStudents(prev => prev.map((s, idx) => idx === i ? { ...s, present: !s.present } : s));
  }

  const presentCount = students.filter(s => s.present).length;

  return (
    <div className="page-content">
      <TopBar title="Review Attendance" showBack />

      <div className="alert alert-info" style={{ margin: "12px 0 20px" }}>
        <span>✦</span> AI marked {presentCount}/{students.length} students. Review and correct if needed.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Subject</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{subject}</div>
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
        <div key={i} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
            {s.name[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {s.roll} {s.confidence ? `· ${Math.round(s.confidence * 100)}% match` : "· Manual"}
            </div>
          </div>
          <button
            onClick={() => toggle(i)}
            style={{
              width: 36, height: 36, borderRadius: 99, border: "2px solid",
              borderColor: s.present ? "var(--success)" : "var(--danger)",
              background: s.present ? "var(--success-dim)" : "var(--danger-dim)",
              color: s.present ? "var(--success)" : "var(--danger)",
              cursor: "pointer", fontWeight: 700, fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}
          >
            {s.present ? "P" : "A"}
          </button>
        </div>
      ))}

      <button className="btn btn-primary" style={{ marginTop: 8 }}>
        ✓ Finalize Attendance
      </button>
    </div>
  );
}
