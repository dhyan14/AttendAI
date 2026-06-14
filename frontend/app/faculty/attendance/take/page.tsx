"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, API_URL } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import {
  Camera, Image as ImageIcon, Loader2, CheckCircle, XCircle,
  Trash2, ChevronRight, Users, Award, Sparkles, RefreshCw,
  AlertTriangle
} from "lucide-react";

type Mode = "ai" | "manual";
type Step = "setup" | "camera" | "processing" | "review";

interface Subject { id: string; name: string; code: string; }
interface DetectionResult {
  student_id: string;
  student_name: string;
  roll_no: string;
  status: "present" | "absent";
  confidence: number;
  source: string;
}
interface StudentRecord {
  id: string;
  student_id: string;
  student_name: string;
  roll_no: string;
  status: "present" | "absent";
  source: string;
  confidence: number | null;
}

const API_BASE = API_URL;

export default function TakeAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("ai");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [lectureNo, setLectureNo] = useState(1);
  const [division, setDivision] = useState("A");
  const [batch, setBatch] = useState("All");
  const [step, setStep] = useState<Step>("setup");

  // Image / capture state
  const [capturedImage, setCapturedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Processing
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");

  // Results
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [error, setError] = useState("");

  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    // Pre-select lecture if lecture_id is provided in query
    const qLectureId = searchParams.get("lecture_id");
    if (qLectureId) {
      setLectureId(qLectureId);
      // Load lecture details and jump to review
      loadExistingLecture(qLectureId);
      return;
    }

    async function loadSubjects() {
      try {
        const res = await apiFetch("/subjects/");
        if (res.ok) {
          const data = await res.json();
          setSubjects(data);
          if (data.length > 0) setSelectedSubject(data[0].id);
        }
      } catch (err) {
        console.error("Error loading subjects:", err);
      } finally {
        setLoadingSubjects(false);
      }
    }
    loadSubjects();
  }, []);

  async function loadExistingLecture(id: string) {
    try {
      const res = await apiFetch(`/attendance/lectures/${id}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.records);
        setStep("review");
      }
    } catch {}
    setLoadingSubjects(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  function clearImage() {
    setCapturedImage(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function animateProgress(from: number, to: number, durationMs: number, label: string) {
    setProcessingStatus(label);
    const steps = 20;
    const delay = durationMs / steps;
    const increment = (to - from) / steps;
    for (let i = 0; i < steps; i++) {
      await new Promise(r => setTimeout(r, delay));
      setProcessingProgress(prev => Math.min(to, prev + increment));
    }
  }

  async function handleSubmit() {
    if (!selectedSubject) return;
    setError("");
    setStep("processing");
    setProcessingProgress(5);

    try {
      // Step 1: Create lecture
      await animateProgress(5, 30, 600, "Creating lecture session...");
      const todayDate = new Date().toISOString().split("T")[0];
      const createRes = await apiFetch("/attendance/lectures", {
        method: "POST",
        body: JSON.stringify({ subject_id: selectedSubject, division, batch, lecture_no: lectureNo, date: todayDate }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.detail || "Failed to create lecture session");
      }
      const lecture = await createRes.json();
      const currentLectureId = lecture.id;
      setLectureId(currentLectureId);

      if (mode === "manual") {
        // Manual mode — load student list directly
        await animateProgress(30, 90, 400, "Loading student roster...");
        const detailRes = await apiFetch(`/attendance/lectures/${currentLectureId}`);
        if (!detailRes.ok) throw new Error("Failed to load student list");
        const detail = await detailRes.json();
        setStudents(detail.records);
        await animateProgress(90, 100, 200, "Ready!");
        setStep("review");
        return;
      }

      // Step 2: Upload photo for AI detection
      await animateProgress(30, 50, 300, "Uploading class photo...");

      const formData = new FormData();
      formData.append("lecture_id", currentLectureId);
      formData.append("file", capturedImage!);

      const token = localStorage.getItem("access_token");
      const aiRes = await fetch(`${API_BASE}/attendance/take-ai`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      await animateProgress(50, 75, 800, "Running face recognition...");

      if (!aiRes.ok) {
        const err = await aiRes.json();
        throw new Error(err.detail || "AI recognition failed");
      }

      const aiData = await aiRes.json();
      setProcessedImageUrl(aiData.image_preview || imagePreviewUrl);
      setDetectionResults(aiData.detection_results || []);

      await animateProgress(75, 95, 400, "Loading student review list...");

      // Step 3: Load updated records
      const detailRes = await apiFetch(`/attendance/lectures/${currentLectureId}`);
      if (!detailRes.ok) throw new Error("Failed to load lecture details");
      const detail = await detailRes.json();
      setStudents(detail.records);

      await animateProgress(95, 100, 200, "Complete!");
      setStep("review");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
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
        body: JSON.stringify({ present_student_ids: presentIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to finalize attendance");
      }
      router.push("/faculty/home");
    } catch (err: any) {
      setError(err.message || "Error finalizing attendance");
    } finally {
      setSaving(false);
    }
  }

  function toggleStatus(studentId: string) {
    setStudents(prev =>
      prev.map(s =>
        s.student_id === studentId
          ? { ...s, status: s.status === "present" ? "absent" : "present", source: "manual" }
          : s
      )
    );
  }

  // ─── Processing Screen ──────────────────────────────────
  if (step === "processing") {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", background: "var(--bg)" }}>
        {/* Animated Scanner */}
        <div style={{ position: "relative", width: 120, height: 120, marginBottom: 32 }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "3px solid var(--accent)", opacity: 0.2,
            animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"
          }} />
          <div style={{
            position: "absolute", inset: 8, borderRadius: "50%",
            border: "3px solid var(--accent)", opacity: 0.4,
            animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s"
          }} />
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "var(--accent-dim)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {mode === "ai"
              ? <Sparkles size={40} style={{ color: "var(--accent)" }} />
              : <Users size={40} style={{ color: "var(--accent)" }} />
            }
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          {mode === "ai" ? "AI Processing" : "Setting Up Session"}
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 32, maxWidth: 260 }}>
          {processingStatus}
        </p>

        {/* Progress bar */}
        <div style={{ width: "100%", maxWidth: 280 }}>
          <div style={{ background: "var(--bg-card-2)", borderRadius: 99, height: 8, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: "linear-gradient(90deg, var(--accent), var(--accent-light))",
              width: `${processingProgress}%`,
              transition: "width 0.3s ease",
              boxShadow: "0 0 10px var(--accent-glow)"
            }} />
          </div>
          <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>{Math.round(processingProgress)}%</span>
        </div>

        {imagePreviewUrl && mode === "ai" && (
          <div style={{ marginTop: 32, position: "relative", width: 180, height: 120, borderRadius: 12, overflow: "hidden", border: "2px solid var(--border-accent)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreviewUrl} alt="Uploaded" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {/* Scan line animation */}
            <div style={{
              position: "absolute", left: 0, right: 0, height: 2,
              background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
              animation: "scanline 1.5s linear infinite",
              boxShadow: "0 0 8px var(--accent-glow)"
            }} />
          </div>
        )}

        <style>{`
          @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
          @keyframes scanline { 0% { top: 0%; } 100% { top: 100%; } }
        `}</style>
      </div>
    );
  }

  // ─── Review Screen ──────────────────────────────────────
  if (step === "review") {
    const presentCount = students.filter(s => s.status === "present").length;
    const absentCount = students.length - presentCount;
    const selectedSubjObj = subjects.find(s => s.id === selectedSubject);

    return (
      <div className="page-content fade-up" style={{ paddingBottom: 120 }}>
        <TopBar title="Review Attendance" />

        {/* Uploaded Photo Preview */}
        {(processedImageUrl || imagePreviewUrl) && mode === "ai" && (
          <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 16, height: 180, border: "1.5px solid var(--border-accent)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={processedImageUrl || imagePreviewUrl || ""}
              alt="Classroom photo"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {/* Overlay label */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "16px 12px 12px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              display: "flex", justifyContent: "space-between", alignItems: "flex-end"
            }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>Class Photo Analyzed</div>
                <div style={{ fontSize: 13, color: "white", fontWeight: 600 }}>{presentCount} faces detected</div>
              </div>
              <span className="badge" style={{ background: "var(--accent)", color: "white", fontSize: 11 }}>
                ✦ AI Processed
              </span>
            </div>
          </div>
        )}

        {/* Summary Card */}
        <div style={{
          borderRadius: 16, padding: "16px 20px", marginBottom: 16,
          background: "linear-gradient(135deg, #16122d 0%, var(--bg-card) 100%)",
          border: "1px solid var(--border-accent)"
        }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            {selectedSubjObj?.name || "Lecture"} · Div {division}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            {mode === "ai"
              ? `${presentCount}/${students.length} students auto-detected. Tap a student to toggle.`
              : `Tap each student to mark present/absent.`
            }
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--success)", lineHeight: 1 }}>{presentCount}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Present</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--danger)", lineHeight: 1 }}>{absentCount}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Absent</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{students.length}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Total</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 16, height: 4, borderRadius: 99, background: "var(--bg-card-2)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: "linear-gradient(90deg, var(--success), var(--accent))",
              width: `${students.length > 0 ? (presentCount / students.length) * 100 : 0}%`,
              transition: "width 0.4s ease"
            }} />
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Student List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {students.map((s) => {
            const isPresent = s.status === "present";
            const confidence = s.confidence ? Math.round(s.confidence * 100) : null;
            const isManual = s.source === "manual";

            return (
              <button
                key={s.student_id}
                onClick={() => toggleStatus(s.student_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", textAlign: "left",
                  padding: "12px 14px", borderRadius: 14,
                  border: `1.5px solid ${isPresent ? "var(--success)" : "var(--border)"}`,
                  background: isPresent ? "rgba(52,199,89,0.06)" : "var(--bg-card)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  background: isPresent ? "rgba(52,199,89,0.15)" : "var(--bg-card-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isPresent ? "var(--success)" : "var(--text-muted)",
                  fontWeight: 700, fontSize: 15,
                }}>
                  {s.student_name.charAt(0)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{s.student_name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{s.roll_no}</span>
                    {confidence !== null && mode === "ai" && !isManual && (
                      <>
                        <span style={{ opacity: 0.4 }}>·</span>
                        <span style={{ color: confidence >= 80 ? "var(--success)" : confidence >= 50 ? "var(--warning)" : "var(--danger)" }}>
                          {confidence}% match
                        </span>
                      </>
                    )}
                    {isManual && (
                      <>
                        <span style={{ opacity: 0.4 }}>·</span>
                        <span style={{ color: "var(--text-muted)" }}>manual</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status pill */}
                <div style={{
                  width: 64, height: 28, borderRadius: 99, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 12,
                  background: isPresent ? "var(--success)" : "var(--danger-dim)",
                  color: isPresent ? "white" : "var(--danger)",
                  border: isPresent ? "none" : "1px solid var(--danger)",
                }}>
                  {isPresent ? "Present" : "Absent"}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 28px", background: "var(--bg)", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <button
            className="btn btn-secondary"
            style={{ flex: "0 0 auto", padding: "0 16px", height: 48 }}
            onClick={() => { setStep("setup"); setStudents([]); }}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1, height: 48, fontSize: 15, fontWeight: 700, gap: 8 }}
            onClick={handleFinalize}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Saving...</>
            ) : (
              <><CheckCircle size={18} /> Finalize Attendance</>
            )}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ─── Setup Screen ───────────────────────────────────────
  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <TopBar title="Take Attendance" showBack />

      {/* Mode Toggle */}
      <div style={{ padding: "12px 0 20px" }}>
        <div className="toggle-pill">
          <button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>
            <Sparkles size={14} /> AI Face Scan
          </button>
          <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>
            <Users size={14} /> Manual
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "10px 0 0" }}>
          {mode === "ai"
            ? "📸 Upload a classroom photo — AI will automatically detect and mark attendance."
            : "📋 Review the student roster and mark present/absent manually."}
        </p>
      </div>

      {/* Date Banner */}
      <div style={{
        background: "linear-gradient(135deg, #16122d, var(--bg-card))",
        border: "1px solid var(--border-accent)",
        borderRadius: 14, padding: "12px 16px", marginBottom: 20,
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Session Date</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{dateStr}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Current Time</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{timeStr}</div>
        </div>
      </div>

      {/* Subject */}
      <div className="form-group">
        <label className="form-label">Subject</label>
        {loadingSubjects ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 14 }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
            Loading subjects...
          </div>
        ) : subjects.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "10px 0" }}>
            No subjects assigned. Contact your admin.
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
            <button
              key={n}
              onClick={() => setLectureNo(n)}
              style={{
                width: 44, height: 44, borderRadius: 10, border: "1.5px solid",
                borderColor: lectureNo === n ? "var(--accent)" : "var(--border)",
                background: lectureNo === n ? "var(--accent-dim)" : "var(--bg-input)",
                color: lectureNo === n ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: lectureNo === n ? 700 : 400, fontSize: 15,
                cursor: "pointer", transition: "all 0.15s"
              }}
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

      {/* AI: Image Uploader */}
      {mode === "ai" && (
        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label">Class Photo</label>

          {!imagePreviewUrl ? (
            <div style={{
              border: "2px dashed var(--border-accent)", borderRadius: 16,
              padding: "32px 20px", textAlign: "center",
              background: "var(--bg-card)", cursor: "pointer"
            }}>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "center", gap: 24 }}>
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                    id="camera-input"
                  />
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: "var(--accent-dim)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Camera size={24} style={{ color: "var(--accent)" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Camera</span>
                </label>

                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                  />
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: "var(--bg-card-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <ImageIcon size={24} style={{ color: "var(--text-secondary)" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Gallery</span>
                </label>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Capture or upload a clear photo of the classroom</p>
            </div>
          ) : (
            <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "2px solid var(--border-accent)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreviewUrl} alt="Preview" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px",
                background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
                display: "flex", alignItems: "center", justifyContent: "space-between"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle size={14} color="var(--success)" />
                  <span style={{ fontSize: 13, color: "white", fontWeight: 500 }}>{capturedImage?.name || "Photo ready"}</span>
                </div>
                <button
                  onClick={clearImage}
                  style={{ background: "rgba(255,0,0,0.2)", border: "none", borderRadius: 8, padding: "4px 8px", color: "var(--danger)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Submit Button */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 28px", background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
        <button
          className="btn btn-primary"
          style={{ width: "100%", height: 52, fontSize: 16, fontWeight: 700, gap: 10 }}
          onClick={handleSubmit}
          disabled={(mode === "ai" && !capturedImage) || !selectedSubject || loadingSubjects}
        >
          {mode === "ai" ? (
            <><Sparkles size={18} /> Scan & Mark Attendance</>
          ) : (
            <><ChevronRight size={18} /> Open Student Roster</>
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
