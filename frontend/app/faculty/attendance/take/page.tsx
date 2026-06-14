"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Upload, Camera, Trash2, CheckCircle2, XCircle, Loader2,
  ChevronRight, ChevronLeft, Users, ToggleLeft, ToggleRight,
  AlertTriangle, Sparkles, Check, Image as ImageIcon,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────
interface Lecture {
  id: string; subject_name: string; subject_code: string;
  division: string; batch: string; lecture_no: number;
  date: string; time: string; status: string;
  total_students: number; present_count: number;
}
interface DetectionResult {
  student_id: string; student_name: string; roll_no: string;
  status: "present" | "absent"; confidence: number; source: string;
}
interface AIResult {
  ai_used: boolean; mode: string; warning: string | null;
  images_processed: number; image_previews: string[];
  detected_faces: number; total_students: number;
  detection_results: DetectionResult[];
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
      whiteSpace: "nowrap", animation: "slideDown 0.3s ease",
    }}>{msg}</div>
  );
}

// Step indicator
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      background: done ? "#22d37a" : active ? "var(--accent)" : "var(--bg-card-2)",
      border: `2px solid ${done ? "#22d37a" : active ? "var(--accent)" : "var(--border)"}`,
      color: done ? "#fff" : active ? "#fff" : "var(--text-muted)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 800,
    }}>
      {done ? <Check size={14} /> : n}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────
export default function TakeAttendancePage() {
  const router  = useRouter();
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const [step, setStep]           = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [lectures, setLectures]   = useState<Lecture[]>([]);
  const [selLec, setSelLec]       = useState<Lecture | null>(null);
  const [photos, setPhotos]       = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [showCam, setShowCam]     = useState(false);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  // Step 2 state
  const [processing, setProcessing] = useState(false);
  const [procProgress, setProcProgress] = useState(0);

  // Step 3 state
  const [aiResult, setAiResult]   = useState<AIResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [finalizing, setFinalizing] = useState(false);

  // ── Load pending lectures ──────────────────────────────────
  useEffect(() => {
    apiFetch("/attendance/lectures")
      .then(r => r.ok ? r.json() : [])
      .then((all: Lecture[]) => setLectures(all.filter(l => l.status === "pending")))
      .catch(() => {});
  }, []);

  // ── Photo helpers ──────────────────────────────────────────
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const remaining = 5 - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const newFiles = [...photos, ...toAdd];
    setPhotos(newFiles);
    Promise.all(toAdd.map(f => new Promise<string>(res => {
      const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.readAsDataURL(f);
    }))).then(prev => setPhotoPreviews(p => [...p, ...prev]));
  };

  const removePhoto = (idx: number) => {
    setPhotos(p => p.filter((_, i) => i !== idx));
    setPhotoPreviews(p => p.filter((_, i) => i !== idx));
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
  const stopCamera = () => { camStream?.getTracks().forEach(t => t.stop()); setCamStream(null); setShowCam(false); }
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current; const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `classroom_${Date.now()}.jpg`, { type: "image/jpeg" });
      stopCamera();
      addPhotos(([file] as unknown) as FileList);
    }, "image/jpeg", 0.85);
  };

  // ── Step 1 → 2: Run AI ────────────────────────────────────
  const runRecognition = async () => {
    if (!selLec || photos.length === 0) return;
    setStep(2);
    setProcessing(true);
    setProcProgress(0);

    // Fake progress animation
    const tick = setInterval(() => setProcProgress(p => Math.min(p + 8, 88)), 300);

    try {
      const form = new FormData();
      form.append("lecture_id", selLec.id);
      photos.forEach(f => form.append("files", f));

      const r = await apiFetch("/attendance/take-ai", { method: "POST", body: form });
      clearInterval(tick);
      setProcProgress(100);

      if (!r.ok) {
        const e = await r.json();
        showToast("✗ " + (e.detail || "Recognition failed"));
        setStep(1); setProcessing(false); return;
      }

      const result: AIResult = await r.json();
      setAiResult(result);

      // Init overrides from AI result
      const init: Record<string, boolean> = {};
      result.detection_results.forEach(d => { init[d.student_id] = d.status === "present"; });
      setOverrides(init);

      setTimeout(() => { setProcessing(false); setStep(3); }, 500);
    } catch (e: any) {
      clearInterval(tick);
      showToast("✗ " + e.message);
      setStep(1); setProcessing(false);
    }
  };

  // ── Step 3: Finalize ─────────────────────────────────────
  const finalize = async () => {
    if (!selLec || !aiResult) return;
    setFinalizing(true);
    try {
      const presentIds = aiResult.detection_results
        .filter(d => overrides[d.student_id] !== false && (overrides[d.student_id] === true || d.status === "present"))
        .map(d => d.student_id)
        // actually use override map
      const presentIdsReal = Object.entries(overrides)
        .filter(([, v]) => v).map(([k]) => k);

      const r = await apiFetch(`/attendance/lectures/${selLec.id}/finalize`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ present_student_ids: presentIdsReal }),
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

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 120px" }}>
      <Toast msg={toast} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Header + Steps */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => { if (step === 1) router.back(); else setStep(s => (s - 1) as any); }}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", marginBottom: 12, padding: 0 }}
        >
          <ChevronLeft size={22} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 16 }}>
          Take Attendance
        </h1>
        {/* Step progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {([
            [1, "Select Lecture & Photos"],
            [2, "AI Processing"],
            [3, "Review & Finalize"],
          ] as [number, string][]).map(([n, label], i) => (
            <>
              <StepDot key={n} n={n} active={step === n} done={step > n} />
              {i < 2 && (
                <div key={`line-${n}`} style={{
                  flex: 1, height: 2,
                  background: step > n ? "#22d37a" : "var(--border)",
                  borderRadius: 2,
                }} />
              )}
            </>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {["Lecture + Photos", "Processing", "Review"].map((l, i) => (
            <span key={i} style={{ fontSize: 10, color: step === i + 1 ? "var(--accent-2)" : "var(--text-muted)", fontWeight: step === i + 1 ? 700 : 400 }}>
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* ══ STEP 1 ══════════════════════════════════════════════ */}
      {step === 1 && (
        <>
          {/* Lecture selector */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Select Lecture
            </div>
            {lectures.length === 0
              ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>No pending lectures</div>
                  <button
                    onClick={() => router.push("/faculty/attendance")}
                    style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-2)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Create a lecture first →
                  </button>
                </div>
              )
              : lectures.map(l => (
                <div
                  key={l.id}
                  onClick={() => setSelLec(selLec?.id === l.id ? null : l)}
                  style={{
                    display: "flex", gap: 12, alignItems: "center",
                    padding: "12px 14px", borderRadius: 12,
                    border: `1.5px solid ${selLec?.id === l.id ? "var(--accent)" : "var(--border)"}`,
                    background: selLec?.id === l.id ? "var(--accent-dim)" : "var(--bg-card-2)",
                    marginBottom: 8, cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{l.subject_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {l.subject_code} · Lec #{l.lecture_no} · Div {l.division} · {l.date}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {l.total_students} students enrolled
                    </div>
                  </div>
                  {selLec?.id === l.id && <CheckCircle2 size={16} style={{ color: "var(--accent-2)", flexShrink: 0 }} />}
                </div>
              ))}
          </div>

          {/* Photo upload */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Classroom Photos ({photos.length}/5)
            </div>

            {/* Photo grid */}
            {photoPreviews.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                {photoPreviews.map((src, i) => (
                  <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4/3" }}>
                    <img src={src} alt={`Photo ${i+1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      onClick={() => removePhoto(i)}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(240,90,90,0.9)", border: "none",
                        color: "#fff", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                    <div style={{
                      position: "absolute", bottom: 4, left: 4,
                      background: "rgba(0,0,0,0.6)", borderRadius: 4,
                      fontSize: 9, fontWeight: 700, color: "#fff", padding: "2px 5px",
                    }}>#{i+1}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Add buttons */}
            {photos.length < 5 && (
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1, cursor: "pointer" }}>
                  <input
                    type="file" accept="image/*" multiple style={{ display: "none" }}
                    onChange={e => addPhotos(e.target.files)}
                  />
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "12px", borderRadius: 12, border: "2px dashed var(--border)",
                    background: "var(--bg-card-2)", color: "var(--text-secondary)",
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>
                    <Upload size={15} /> Upload Photos
                  </div>
                </label>
                <button
                  onClick={startCamera}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "12px", borderRadius: 12, border: "2px dashed rgba(34,211,122,0.3)",
                    background: "rgba(34,211,122,0.05)", color: "#22d37a",
                    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Camera size={15} /> Camera
                </button>
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              Upload up to 5 photos from different angles for best accuracy
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={runRecognition}
            disabled={!selLec || photos.length === 0}
            style={{
              width: "100%", padding: "16px", borderRadius: 16,
              background: !selLec || photos.length === 0 ? "var(--bg-card-2)" : "var(--accent)",
              color: !selLec || photos.length === 0 ? "var(--text-muted)" : "#fff",
              fontWeight: 800, fontSize: 16, border: "none", cursor: !selLec || photos.length === 0 ? "not-allowed" : "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}
          >
            <Sparkles size={18} /> Start AI Recognition
          </button>
        </>
      )}

      {/* ══ STEP 2 ══════════════════════════════════════════════ */}
      {step === 2 && (
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "var(--accent-dim)", margin: "0 auto 24px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles size={36} style={{ color: "var(--accent-2)", animation: "pulse 1.5s ease infinite" }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Analysing Faces…</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 28 }}>
            Processing {photos.length} classroom {photos.length === 1 ? "photo" : "photos"} for {selLec?.total_students} students
          </div>

          {/* Progress bar */}
          <div style={{ height: 8, background: "var(--bg-card-2)", borderRadius: 99, overflow: "hidden", maxWidth: 320, margin: "0 auto" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: "linear-gradient(90deg, var(--accent), #22d37a)",
              width: `${procProgress}%`, transition: "width 0.3s ease",
            }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{procProgress}%</div>

          <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.9)} }`}</style>
        </div>
      )}

      {/* ══ STEP 3 ══════════════════════════════════════════════ */}
      {step === 3 && aiResult && (
        <>
          {/* AI info banner */}
          {aiResult.warning && (
            <div style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "12px 14px", borderRadius: 12, marginBottom: 14,
              background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)",
            }}>
              <AlertTriangle size={16} style={{ color: "#f5c842", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: "#f5c842" }}>{aiResult.warning}</div>
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            <div className="card" style={{ textAlign: "center", padding: "14px 10px" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#22d37a" }}>{presentCount}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Present</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "14px 10px" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: "var(--danger)" }}>{totalStudents - presentCount}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Absent</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "14px 10px" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text-secondary)" }}>{totalStudents}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Total</div>
            </div>
          </div>

          {/* Classroom photo previews */}
          {aiResult.image_previews.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Processed Photos
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {aiResult.image_previews.map((src, i) => (
                  <img
                    key={i} src={src} alt={`Image ${i+1}`}
                    style={{ height: 80, width: 106, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid var(--border)" }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Student list */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                Attendance Review
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Tap to toggle ↕
              </div>
            </div>

            {aiResult.detection_results.map(d => {
              const isPresent = overrides[d.student_id] ?? (d.status === "present");
              const wasChanged = (overrides[d.student_id] !== undefined) && (overrides[d.student_id] !== (d.status === "present"));
              const conf = Math.round((d.confidence ?? 0) * 100);

              return (
                <div
                  key={d.student_id}
                  onClick={() => setOverrides(o => ({ ...o, [d.student_id]: !isPresent }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0", borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: isPresent ? "rgba(34,211,122,0.12)" : "rgba(240,90,90,0.10)",
                    color: isPresent ? "#22d37a" : "var(--danger)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 15,
                  }}>
                    {d.student_name[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      {d.student_name}
                      {wasChanged && (
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: "rgba(245,200,66,0.15)", color: "#f5c842", fontWeight: 700 }}>
                          EDITED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {d.roll_no} · AI: {conf}% {isPresent ? "✓" : "✗"}
                    </div>
                  </div>

                  {/* Toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: isPresent ? "#22d37a" : "var(--danger)",
                    }}>
                      {isPresent ? "Present" : "Absent"}
                    </span>
                    {isPresent
                      ? <ToggleRight size={22} style={{ color: "#22d37a" }} />
                      : <ToggleLeft  size={22} style={{ color: "var(--text-muted)" }} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Finalize button */}
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

          <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
            Toggle any student before finalizing. Changes are saved permanently.
          </div>
        </>
      )}

      {/* Camera Modal */}
      {showCam && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 900,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Classroom Photo — point at students</div>
          <video
            ref={videoRef} autoPlay playsInline muted
            style={{ width: "100%", maxWidth: 400, borderRadius: 18, border: "3px solid var(--accent)", background: "#000" }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={capturePhoto}
              style={{ padding: "14px 32px", borderRadius: 99, background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: 16, border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              📸 Capture
            </button>
            <button
              onClick={stopCamera}
              style={{ padding: "14px 24px", borderRadius: 99, background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 700, fontSize: 14, border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}
