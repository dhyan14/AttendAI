"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Upload, Camera, Trash2, CheckCircle2, Loader2,
  ChevronLeft, ToggleLeft, ToggleRight, AlertTriangle,
  Sparkles, Check, Hash,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────
interface Subject { id: string; name: string; code: string; dept_id: string; semester: number | null; }
interface Lecture {
  id: string; subject_name: string; subject_code: string;
  division: string; batch: string; lecture_no: number;
  date: string; status: string; total_students: number; present_count: number;
}
interface DetectionResult {
  student_id: string; student_name: string; roll_no: string;
  status: "present" | "absent"; confidence: number;
}
interface AIResult {
  ai_used: boolean; mode: string; warning: string | null;
  images_processed: number; image_previews: string[];
  detected_faces: number; total_students: number;
  detection_results: DetectionResult[];
}

// ─── Step dot ───────────────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: done ? "#22d37a" : active ? "var(--accent)" : "var(--bg-card-2)",
      border: `2px solid ${done ? "#22d37a" : active ? "var(--accent)" : "var(--border)"}`,
      color: done ? "#fff" : active ? "#fff" : "var(--text-muted)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 800, transition: "all 0.2s",
    }}>
      {done ? <Check size={13} /> : n}
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────
function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg.startsWith("✓");
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      background: ok ? "var(--success)" : "var(--danger)",
      color: "white", padding: "10px 22px", borderRadius: 99, fontSize: 13,
      fontWeight: 700, zIndex: 9999, boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      animation: "slideDown 0.3s ease",
    }}>{msg}</div>
  );
}

// ─── Main ───────────────────────────────────────────────────
export default function TakeAttendancePage() {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 1: inline lecture setup ────────────────────────
  const [subjects, setSubjects]       = useState<Subject[]>([]);
  const [selSubject, setSelSubject]   = useState<Subject | null>(null);
  const [lecNo, setLecNo]             = useState("");
  const [division, setDivision]       = useState("");
  const [batch, setBatch]             = useState("All");
  const today = new Date().toISOString().slice(0, 10);
  const [lecDate, setLecDate]         = useState(today);
  const [creating, setCreating]       = useState(false);
  const [lecture, setLecture]         = useState<Lecture | null>(null);

  // ── Photos ───────────────────────────────────────────────
  const [photos, setPhotos]           = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [showCam, setShowCam]         = useState(false);
  const [camStream, setCamStream]     = useState<MediaStream | null>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Step 2 ───────────────────────────────────────────────
  const [procProgress, setProcProgress] = useState(0);

  // ── Step 3 ───────────────────────────────────────────────
  const [aiResult, setAiResult]       = useState<AIResult | null>(null);
  const [overrides, setOverrides]     = useState<Record<string, boolean>>({});
  const [finalizing, setFinalizing]   = useState(false);

  // ── Load subjects for this faculty ──────────────────────
  useEffect(() => {
    apiFetch("/subjects/")
      .then(r => r.ok ? r.json() : [])
      .then(setSubjects)
      .catch(() => {});
  }, []);

  // ── Photo helpers ──────────────────────────────────────
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const toAdd = Array.from(files).slice(0, 5 - photos.length);
    setPhotos(p => [...p, ...toAdd]);
    Promise.all(toAdd.map(f => new Promise<string>(res => {
      const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.readAsDataURL(f);
    }))).then(prev => setPhotoPreviews(p => [...p, ...prev]));
  };
  const removePhoto = (i: number) => {
    setPhotos(p => p.filter((_, idx) => idx !== i));
    setPhotoPreviews(p => p.filter((_, idx) => idx !== i));
  };

  // Camera
  const startCamera = async () => {
    setShowCam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCamStream(stream);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch { showToast("✗ Camera permission denied"); setShowCam(false); }
  };
  const stopCamera = () => { camStream?.getTracks().forEach(t => t.stop()); setCamStream(null); setShowCam(false); };
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current; const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(blob => {
      if (!blob) return;
      stopCamera();
      const file = new File([blob], `classroom_${Date.now()}.jpg`, { type: "image/jpeg" });
      setPhotos(p => [...p, file]);
      const url = URL.createObjectURL(blob);
      setPhotoPreviews(p => [...p, url]);
    }, "image/jpeg", 0.85);
  };

  // ── Create lecture + run AI ────────────────────────────
  const startRecognition = async () => {
    if (!selSubject || !lecNo || photos.length === 0) return;
    if (!division.trim()) { showToast("✗ Enter a division (e.g. A)"); return; }

    setCreating(true);
    let lec: Lecture;
    try {
      // 1. Create the lecture
      const r = await apiFetch("/attendance/lectures", {
        method: "POST",
        body: JSON.stringify({
          subject_id: selSubject.id,
          division: division.trim().toUpperCase(),
          batch: batch || "All",
          lecture_no: parseInt(lecNo, 10),
          date: lecDate,
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        showToast("✗ " + (e.detail || "Failed to create lecture"));
        setCreating(false);
        return;
      }
      lec = await r.json();
      setLecture(lec);
    } catch {
      showToast("✗ Network error creating lecture");
      setCreating(false);
      return;
    }
    setCreating(false);

    // 2. Move to step 2 and run AI
    setStep(2);
    setProcProgress(0);
    const tick = setInterval(() => setProcProgress(p => Math.min(p + 7, 88)), 280);

    try {
      const form = new FormData();
      form.append("lecture_id", lec.id);
      photos.forEach(f => form.append("files", f));

      const r2 = await apiFetch("/attendance/take-ai", { method: "POST", body: form });
      clearInterval(tick);
      setProcProgress(100);

      if (!r2.ok) {
        const e = await r2.json();
        showToast("✗ " + (e.detail || "Recognition failed"));
        setStep(1);
        return;
      }

      const result: AIResult = await r2.json();
      setAiResult(result);
      const init: Record<string, boolean> = {};
      result.detection_results.forEach(d => { init[d.student_id] = d.status === "present"; });
      setOverrides(init);
      setTimeout(() => setStep(3), 400);
    } catch (e: any) {
      clearInterval(tick);
      showToast("✗ " + e.message);
      setStep(1);
    }
  };

  // ── Finalize ──────────────────────────────────────────
  const finalize = async () => {
    if (!lecture) return;
    setFinalizing(true);
    try {
      const presentIds = Object.entries(overrides).filter(([, v]) => v).map(([k]) => k);
      const r = await apiFetch(`/attendance/lectures/${lecture.id}/finalize`, {
        method: "PUT",
        body: JSON.stringify({ present_student_ids: presentIds }),
      });
      if (r.ok) {
        showToast("✓ Attendance finalized!");
        setTimeout(() => router.push("/faculty/attendance"), 1500);
      } else {
        const e = await r.json();
        showToast("✗ " + (e.detail || "Finalize failed"));
      }
    } catch { showToast("✗ Network error"); }
    finally { setFinalizing(false); }
  };

  const presentCount  = Object.values(overrides).filter(Boolean).length;
  const totalStudents = aiResult?.total_students ?? 0;
  const canStart      = !!selSubject && !!lecNo && !!division && photos.length > 0;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 120px" }}>
      <Toast msg={toast} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <button
          onClick={() => step === 1 ? router.back() : setStep(s => (s - 1) as any)}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", marginBottom: 10, padding: 0 }}
        >
          <ChevronLeft size={22} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 14 }}>Take Attendance</h1>

        {/* Steps */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StepDot n={1} active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 2, background: step > 1 ? "#22d37a" : "var(--border)", borderRadius: 2, transition: "background 0.3s" }} />
          <StepDot n={2} active={step === 2} done={step > 2} />
          <div style={{ flex: 1, height: 2, background: step > 2 ? "#22d37a" : "var(--border)", borderRadius: 2, transition: "background 0.3s" }} />
          <StepDot n={3} active={step === 3} done={false} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          {["Setup", "Processing", "Review"].map((l, i) => (
            <span key={l} style={{ fontSize: 10, color: step === i + 1 ? "var(--accent-2)" : "var(--text-muted)", fontWeight: step === i + 1 ? 700 : 400 }}>{l}</span>
          ))}
        </div>
      </div>

      {/* ══════════════ STEP 1 ══════════════ */}
      {step === 1 && (
        <>
          {/* Subject selector */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Subject
            </div>
            {subjects.length === 0
              ? <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No subjects found. Ask admin to add subjects.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {subjects.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelSubject(sel => sel?.id === s.id ? null : s)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                        borderRadius: 12,
                        border: `1.5px solid ${selSubject?.id === s.id ? "var(--accent)" : "var(--border)"}`,
                        background: selSubject?.id === s.id ? "var(--accent-dim)" : "var(--bg-card-2)",
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: selSubject?.id === s.id ? "var(--accent-2)" : "var(--text)" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                          {s.code}{s.semester ? ` · Sem ${s.semester}` : ""}
                        </div>
                      </div>
                      {selSubject?.id === s.id && <CheckCircle2 size={15} style={{ color: "var(--accent-2)", flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}
          </div>

          {/* Lecture details row */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Lecture Details
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {/* Lecture No */}
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Lecture No *</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)" }}>
                  <Hash size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <input
                    type="number" min="1" value={lecNo}
                    onChange={e => setLecNo(e.target.value)}
                    placeholder="e.g. 1"
                    style={{ background: "none", border: "none", outline: "none", fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "inherit", width: "100%" }}
                  />
                </div>
              </div>

              {/* Division */}
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Division *</label>
                <input
                  type="text" value={division}
                  onChange={e => setDivision(e.target.value)}
                  placeholder="e.g. A"
                  maxLength={5}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--bg-card-2)",
                    outline: "none", fontSize: 14, fontWeight: 700, color: "var(--text)",
                    fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Batch */}
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Batch</label>
                <select
                  value={batch}
                  onChange={e => setBatch(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--bg-card-2)",
                    outline: "none", fontSize: 13, color: "var(--text)",
                    fontFamily: "inherit", appearance: "none",
                  }}
                >
                  {["All", "B1", "B2", "B3", "B4"].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Date */}
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Date</label>
                <input
                  type="date" value={lecDate}
                  onChange={e => setLecDate(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--bg-card-2)",
                    outline: "none", fontSize: 13, color: "var(--text)",
                    fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Photos */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Classroom Photos ({photos.length}/5)
            </div>

            {photoPreviews.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                {photoPreviews.map((src, i) => (
                  <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4/3" }}>
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      onClick={() => removePhoto(i)}
                      style={{
                        position: "absolute", top: 4, right: 4, width: 22, height: 22,
                        borderRadius: "50%", background: "rgba(240,90,90,0.9)",
                        border: "none", color: "#fff", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                    <div style={{ position: "absolute", bottom: 3, left: 4, background: "rgba(0,0,0,0.6)", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#fff", padding: "2px 5px" }}>#{i+1}</div>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 5 && (
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1, cursor: "pointer" }}>
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => addPhotos(e.target.files)} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", borderRadius: 12, border: "2px dashed var(--border)", background: "var(--bg-card-2)", color: "var(--text-secondary)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    <Upload size={15} /> Upload
                  </div>
                </label>
                <button
                  onClick={startCamera}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", borderRadius: 12, border: "2px dashed rgba(34,211,122,0.3)", background: "rgba(34,211,122,0.05)", color: "#22d37a", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  <Camera size={15} /> Camera
                </button>
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
              Upload up to 5 classroom photos for best accuracy
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={startRecognition}
            disabled={!canStart || creating}
            style={{
              width: "100%", padding: "16px", borderRadius: 16,
              background: canStart && !creating ? "var(--accent)" : "var(--bg-card-2)",
              color: canStart && !creating ? "#fff" : "var(--text-muted)",
              fontWeight: 800, fontSize: 16, border: "none",
              cursor: canStart && !creating ? "pointer" : "not-allowed",
              fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.2s",
            }}
          >
            {creating
              ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Creating lecture…</>
              : <><Sparkles size={18} /> Start AI Recognition</>}
          </button>

          {!selSubject && <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Select a subject to continue</div>}
          {selSubject && !lecNo && <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Enter lecture number to continue</div>}
          {selSubject && lecNo && photos.length === 0 && <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Add at least 1 classroom photo</div>}
        </>
      )}

      {/* ══════════════ STEP 2 ══════════════ */}
      {step === 2 && (
        <div style={{ textAlign: "center", padding: "56px 16px" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--accent-dim)", margin: "0 auto 22px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={36} style={{ color: "var(--accent-2)" }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Analysing Faces…</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 28 }}>
            Scanning {photos.length} {photos.length === 1 ? "photo" : "photos"} · {selSubject?.name}
          </div>
          <div style={{ height: 8, background: "var(--bg-card-2)", borderRadius: 99, overflow: "hidden", maxWidth: 320, margin: "0 auto" }}>
            <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, var(--accent), #22d37a)", width: `${procProgress}%`, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{procProgress}%</div>
        </div>
      )}

      {/* ══════════════ STEP 3 ══════════════ */}
      {step === 3 && aiResult && (
        <>
          {aiResult.warning && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, marginBottom: 12, background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)" }}>
              <AlertTriangle size={15} style={{ color: "#f5c842", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: "#f5c842" }}>{aiResult.warning}</div>
            </div>
          )}

          {/* Lecture info pill */}
          {lecture && (
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--bg-card-2)", border: "1px solid var(--border)", marginBottom: 12, fontSize: 12, color: "var(--text-secondary)" }}>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{lecture.subject_name}</span>
              {" · "}Lec #{lecture.lecture_no} · Div {lecture.division}
              {lecture.batch !== "All" && ` · ${lecture.batch}`}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
            {[
              { label: "Present", value: presentCount, color: "#22d37a" },
              { label: "Absent",  value: totalStudents - presentCount, color: "var(--danger)" },
              { label: "Total",   value: totalStudents, color: "var(--text-secondary)" },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{ textAlign: "center", padding: "14px 8px" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Image previews */}
          {aiResult.image_previews.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Scanned Photos</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                {aiResult.image_previews.map((src, i) => (
                  <img key={i} src={src} alt="" style={{ height: 72, width: 96, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid var(--border)" }} />
                ))}
              </div>
            </div>
          )}

          {/* Student list */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>Review — tap to toggle</div>
            </div>
            {aiResult.detection_results.map(d => {
              const isPresent = overrides[d.student_id] ?? (d.status === "present");
              const wasChanged = overrides[d.student_id] !== undefined && overrides[d.student_id] !== (d.status === "present");
              return (
                <div
                  key={d.student_id}
                  onClick={() => setOverrides(o => ({ ...o, [d.student_id]: !isPresent }))}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: isPresent ? "rgba(34,211,122,0.12)" : "rgba(240,90,90,0.10)", color: isPresent ? "#22d37a" : "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
                    {d.student_name[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      {d.student_name}
                      {wasChanged && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: "rgba(245,200,66,0.15)", color: "#f5c842", fontWeight: 700 }}>EDITED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {d.roll_no} · {Math.round((d.confidence ?? 0) * 100)}% confidence
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isPresent ? "#22d37a" : "var(--danger)" }}>
                      {isPresent ? "Present" : "Absent"}
                    </span>
                    {isPresent ? <ToggleRight size={22} style={{ color: "#22d37a" }} /> : <ToggleLeft size={22} style={{ color: "var(--text-muted)" }} />}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={finalize}
            disabled={finalizing}
            style={{
              width: "100%", padding: "16px", borderRadius: 16,
              background: finalizing ? "var(--bg-card-2)" : "#22d37a",
              color: finalizing ? "var(--text-muted)" : "#fff",
              fontWeight: 800, fontSize: 16, border: "none",
              cursor: finalizing ? "not-allowed" : "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}
          >
            {finalizing
              ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Finalizing…</>
              : <><Check size={18} /> Finalize Attendance ({presentCount} present)</>}
          </button>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
            Tap any student to toggle. Changes are permanent after finalizing.
          </div>
        </>
      )}

      {/* Camera modal */}
      {showCam && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 900, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Point camera at students</div>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxWidth: 400, borderRadius: 18, border: "3px solid var(--accent)", background: "#000" }} />
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={capturePhoto} style={{ padding: "14px 32px", borderRadius: 99, background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: 16, border: "none", cursor: "pointer", fontFamily: "inherit" }}>📸 Capture</button>
            <button onClick={stopCamera}   style={{ padding: "14px 24px", borderRadius: 99, background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 700, fontSize: 14, border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}
