"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  Camera, Upload, Trash2, CheckCircle2, XCircle, ChevronLeft,
  Loader2, User, RefreshCw, AlertCircle, Eye, EyeOff,
  Package, Users, AlertTriangle, FileArchive, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────
interface Dept   { id: string; name: string; code: string; }
interface Stu    { id: string; name: string; roll_no: string; email: string; }
interface AngleInfo { id: string; angle: string; thumbnail: string | null; registered_at: string; }
interface FaceData {
  student_id: string; student_name: string; roll_no: string;
  total_registered: number;
  angles: { front: AngleInfo | null; left: AngleInfo | null; right: AngleInfo | null };
}

// Bulk upload result types
interface BulkStudentResult {
  roll_no: string;
  name: string | null;
  status: "success" | "partial" | "failed" | "unmatched";
  angles_registered: string[];
}
interface BulkError { roll_no: string; angle: string; reason: string; }
interface BulkResult {
  total_folders: number;
  matched_students: number;
  unmatched_folders: number;
  total_angles_registered: number;
  students: BulkStudentResult[];
  errors: BulkError[];
}

const ANGLES = ["front", "left", "right"] as const;
type Angle = typeof ANGLES[number];
const ANGLE_LABEL: Record<Angle, string> = { front: "Front", left: "Left", right: "Right" };
const ANGLE_HINT:  Record<Angle, string>  = {
  front: "Look straight at the camera",
  left:  "Turn slightly to the left",
  right: "Turn slightly to the right",
};
const ANGLE_ICON: Record<Angle, string> = { front: "⬆", left: "◀", right: "▶" };

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

// ─── Status Badge ────────────────────────────────────────────
function StatusBadge({ status }: { status: BulkStudentResult["status"] }) {
  const configs = {
    success:   { bg: "rgba(34,211,122,0.12)", color: "#22d37a", label: "✅ Success" },
    partial:   { bg: "rgba(245,200,66,0.12)",  color: "#f5c842", label: "⚠ Partial" },
    failed:    { bg: "rgba(240,90,90,0.12)",   color: "var(--danger)", label: "❌ Failed" },
    unmatched: { bg: "rgba(155,155,155,0.12)", color: "var(--text-muted)", label: "— Unmatched" },
  };
  const c = configs[status];
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color,
    }}>{c.label}</span>
  );
}

// ─── Main ───────────────────────────────────────────────────
export default function FaceRegisterPage() {
  const [toast, setToast]         = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  // ── Shared state ──
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [depts, setDepts]         = useState<Dept[]>([]);
  const [selDept, setSelDept]     = useState<Dept | null>(null);

  // ── Single-student state ──
  const [students, setStudents]   = useState<Stu[]>([]);
  const [selStu, setSelStu]       = useState<Stu | null>(null);
  const [faceData, setFaceData]   = useState<FaceData | null>(null);
  const [loadingFace, setLoadingFace] = useState(false);

  // AI model status
  const [modelStatus, setModelStatus] = useState<"unknown" | "ready" | "loading" | "failed">("unknown");
  const [modelError, setModelError]   = useState<string | null>(null);
  const [warmingUp, setWarmingUp]     = useState(false);

  // per-angle state
  const [uploading, setUploading] = useState<Record<Angle, boolean>>({ front: false, left: false, right: false });
  const [showCam, setShowCam]     = useState<Angle | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  // ── Bulk upload state ──
  const [bulkDept, setBulkDept]         = useState<Dept | null>(null);
  const [bulkZipFile, setBulkZipFile]   = useState<File | null>(null);
  const [bulkDragging, setBulkDragging] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult]     = useState<BulkResult | null>(null);
  const [showErrors, setShowErrors]     = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  // ── Check AI model status ─────────────────────────────
  const checkModelStatus = useCallback(async () => {
    try {
      const r = await apiFetch("/face/status");
      if (r.ok) {
        const data = await r.json();
        setModelStatus(data.initialized ? "ready" : data.loading ? "loading" : "failed");
        setModelError(data.load_error || null);
      }
    } catch {}
  }, []);

  const warmUpModel = async () => {
    setWarmingUp(true);
    try {
      await checkModelStatus();
      const form = new FormData();
      form.append("student_id", "00000000-0000-0000-0000-000000000001");
      form.append("angle", "front");
      form.append("file", new File([""], "dummy.jpg", { type: "image/jpeg" }));
      await apiFetch("/face/register", { method: "POST", body: form });
    } catch {}
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      await checkModelStatus();
      if (modelStatus === "ready" || tries > 20) {
        clearInterval(poll);
        setWarmingUp(false);
      }
    }, 3000);
  };

  // ── Load depts ──────────────────────────────────────
  useEffect(() => {
    apiFetch("/departments/").then(r => r.ok ? r.json() : []).then(setDepts).catch(() => {});
    checkModelStatus();
  }, [checkModelStatus]);

  // ── Load students in dept ────────────────────────────────
  useEffect(() => {
    if (!selDept) { setStudents([]); return; }
    apiFetch(`/students/?dept_id=${selDept.id}`)
      .then(r => r.ok ? r.json() : []).then(setStudents).catch(() => setStudents([]));
  }, [selDept]);

  // ── Load face data for selected student ─────────────────
  const loadFaceData = useCallback(async (stu: Stu) => {
    setLoadingFace(true);
    try {
      const r = await apiFetch(`/face/student/${stu.id}`);
      if (r.ok) setFaceData(await r.json());
    } catch {} finally { setLoadingFace(false); }
  }, []);

  useEffect(() => {
    if (selStu) loadFaceData(selStu);
    else setFaceData(null);
  }, [selStu, loadFaceData]);

  // ── Camera helpers ───────────────────────────────────────
  const startCamera = async (angle: Angle) => {
    setShowCam(angle);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setCamStream(stream);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch { showToast("✗ Camera permission denied"); setShowCam(null); }
  };

  const stopCamera = () => {
    camStream?.getTracks().forEach(t => t.stop());
    setCamStream(null);
    setShowCam(null);
  };

  const captureFromCamera = async (angle: Angle) => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], `${angle}.jpg`, { type: "image/jpeg" });
      stopCamera();
      await uploadFace(angle, file);
    }, "image/jpeg", 0.9);
  };

  // ── Upload / register face ───────────────────────────────
  const uploadFace = async (angle: Angle, file: File) => {
    if (!selStu) return;
    setUploading(u => ({ ...u, [angle]: true }));
    try {
      const form = new FormData();
      form.append("student_id", selStu.id);
      form.append("angle", angle);
      form.append("file", file);
      const r = await apiFetch("/face/register", { method: "POST", body: form });
      if (r.ok) {
        showToast(`✓ ${ANGLE_LABEL[angle]} face registered`);
        await loadFaceData(selStu);
      } else {
        const e = await r.json();
        showToast("✗ " + (e.detail || "Upload failed"));
      }
    } catch { showToast("✗ Network error"); }
    finally { setUploading(u => ({ ...u, [angle]: false })); }
  };

  // ── Delete embedding ─────────────────────────────────────
  const deleteEmbedding = async (embId: string, angle: Angle) => {
    try {
      const r = await apiFetch(`/face/embedding/${embId}`, { method: "DELETE" });
      if (r.ok) {
        showToast(`✓ ${ANGLE_LABEL[angle]} removed`);
        if (selStu) await loadFaceData(selStu);
      }
    } catch { showToast("✗ Delete failed"); }
  };

  // ── Bulk Upload handlers ─────────────────────────────────
  const handleBulkDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setBulkDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".zip")) {
      setBulkZipFile(file);
      setBulkResult(null);
    } else {
      showToast("✗ Please drop a .zip file");
    }
  };

  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setBulkZipFile(file); setBulkResult(null); }
    e.target.value = "";
  };

  const runBulkUpload = async () => {
    if (!bulkDept || !bulkZipFile) return;
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const form = new FormData();
      form.append("dept_id", bulkDept.id);
      form.append("zip_file", bulkZipFile);
      const r = await apiFetch("/face/bulk-upload", { method: "POST", body: form });
      const data = await r.json();
      if (r.ok) {
        setBulkResult(data);
        showToast(`✓ Done — ${data.total_angles_registered} angles registered`);
      } else {
        showToast("✗ " + (data.detail || "Upload failed"));
      }
    } catch { showToast("✗ Network error during bulk upload"); }
    finally { setBulkUploading(false); }
  };

  const registered = faceData ? ANGLES.filter(a => faceData.angles[a] !== null).length : 0;

  const tabStyle = (active: boolean) => ({
    padding: "10px 24px", borderRadius: 12, fontWeight: 800, fontSize: 14,
    cursor: "pointer", fontFamily: "inherit", border: "none",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--text-muted)",
    transition: "all 0.2s ease",
  } as React.CSSProperties);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px 120px" }}>
      <Toast msg={toast} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4 }}>
          Face Registration
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Register student faces for AI-powered attendance
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        background: "var(--bg-card-2)", padding: 4, borderRadius: 16,
        border: "1px solid var(--border)",
      }}>
        <button id="tab-single" onClick={() => setActiveTab("single")} style={tabStyle(activeTab === "single")}>
          <User size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Single Student
        </button>
        <button id="tab-bulk" onClick={() => setActiveTab("bulk")} style={tabStyle(activeTab === "bulk")}>
          <Package size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Bulk Upload
        </button>
      </div>

      {/* AI Model Status Banner — shared */}
      {modelStatus !== "ready" && (
        <div style={{
          marginBottom: 14, padding: "12px 14px", borderRadius: 12,
          background: modelStatus === "unknown" ? "rgba(124,111,224,0.08)"
            : modelStatus === "failed" ? "rgba(240,90,90,0.1)"
            : "rgba(245,200,66,0.1)",
          border: `1px solid ${modelStatus === "failed" ? "rgba(240,90,90,0.3)" : "rgba(245,200,66,0.3)"}`,
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <AlertCircle size={18} style={{
            color: modelStatus === "failed" ? "var(--danger)" : "#f5c842",
            flexShrink: 0, marginTop: 1,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
              {modelStatus === "unknown" && "⏳ Checking AI model status…"}
              {modelStatus === "loading" && "⏳ AI model is loading — please wait ~30–60 seconds"}
              {modelStatus === "failed" && "❌ AI model failed to load"}
            </div>
            {modelError && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
                {modelError}
              </div>
            )}
            {(modelStatus === "failed" || modelStatus === "not_started" as any) && !warmingUp && (
              <button
                onClick={warmUpModel}
                style={{
                  marginTop: 8, padding: "6px 14px", borderRadius: 8, fontSize: 12,
                  fontWeight: 700, background: "var(--accent)", color: "#fff",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                🔄 Retry / Warm Up Model
              </button>
            )}
            {warmingUp && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Warming up… checking every 3s
              </div>
            )}
            <button
              onClick={checkModelStatus}
              style={{
                marginTop: 8, padding: "6px 12px", borderRadius: 8, fontSize: 11,
                fontWeight: 600, background: "transparent", color: "var(--text-muted)",
                border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              <RefreshCw size={10} /> Refresh Status
            </button>
          </div>
        </div>
      )}

      {modelStatus === "ready" && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 12,
          background: "rgba(34,211,122,0.08)", border: "1px solid rgba(34,211,122,0.2)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <CheckCircle2 size={15} style={{ color: "#22d37a", flexShrink: 0 }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "#22d37a" }}>
            ✅ AI Face Recognition model is ready — registrations will use real embeddings
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SINGLE STUDENT TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "single" && (
        <>
          {/* Step 1 — Select Department */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
              1 · Department
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {depts.length === 0
                ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No departments found</div>
                : depts.map(d => (
                  <button
                    key={d.id}
                    onClick={() => { setSelDept(d); setSelStu(null); setFaceData(null); }}
                    style={{
                      padding: "8px 14px", borderRadius: 10, border: "1px solid",
                      borderColor: selDept?.id === d.id ? "var(--accent)" : "var(--border)",
                      background: selDept?.id === d.id ? "var(--accent-dim)" : "transparent",
                      color: selDept?.id === d.id ? "var(--accent-2)" : "var(--text-secondary)",
                      fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {d.code} — {d.name}
                  </button>
                ))}
            </div>
          </div>

          {/* Step 2 — Select Student */}
          {selDept && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                2 · Student
              </div>
              {students.length === 0
                ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No students in {selDept.name}</div>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                    {students.map(s => {
                      const isSelected = selStu?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelStu(isSelected ? null : s)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 14px", borderRadius: 10, border: "1px solid",
                            borderColor: isSelected ? "var(--accent)" : "var(--border)",
                            background: isSelected ? "var(--accent-dim)" : "var(--bg-card-2)",
                            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                            background: isSelected ? "var(--accent)" : "rgba(124,111,224,0.15)",
                            color: isSelected ? "#fff" : "var(--accent-2)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: 15,
                          }}>
                            {s.name[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? "var(--accent-2)" : "var(--text)" }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.roll_no} · {s.email}</div>
                          </div>
                          {isSelected && <CheckCircle2 size={16} style={{ color: "var(--accent-2)", flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          )}

          {/* Step 3 — Face Registration */}
          {selStu && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                    3 · Register Faces · {selStu.name}
                  </div>
                  {loadingFace
                    ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
                    : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700,
                          color: registered === 3 ? "#22d37a" : registered > 0 ? "#f5c842" : "var(--text-muted)",
                        }}>
                          {registered}/3 angles registered
                        </div>
                        {registered === 3 && <CheckCircle2 size={14} style={{ color: "#22d37a" }} />}
                      </div>
                    )}
                </div>
                <button
                  onClick={() => loadFaceData(selStu)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
                >
                  <RefreshCw size={15} />
                </button>
              </div>

              {/* Angle cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {ANGLES.map(angle => {
                  const info = faceData?.angles[angle] ?? null;
                  const isBusy = uploading[angle];

                  return (
                    <div
                      key={angle}
                      style={{
                        padding: "14px", borderRadius: 14,
                        border: `1.5px solid ${info ? "#22d37a44" : "var(--border)"}`,
                        background: info ? "rgba(34,211,122,0.04)" : "var(--bg-card-2)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {/* Thumbnail / placeholder */}
                        <div style={{
                          width: 70, height: 70, borderRadius: 12, flexShrink: 0,
                          border: `2px solid ${info ? "#22d37a66" : "var(--border)"}`,
                          background: "var(--bg)",
                          overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {info?.thumbnail
                            ? <img src={info.thumbnail} alt={angle} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 26 }}>{ANGLE_ICON[angle]}</span>}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 800 }}>{ANGLE_LABEL[angle]}</span>
                            {info
                              ? <CheckCircle2 size={13} style={{ color: "#22d37a" }} />
                              : <XCircle      size={13} style={{ color: "var(--text-muted)" }} />}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                            {info ? `Registered ${new Date(info.registered_at).toLocaleDateString()}` : ANGLE_HINT[angle]}
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {/* Upload */}
                            <label style={{ cursor: "pointer" }}>
                              <input
                                type="file" accept="image/*" style={{ display: "none" }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFace(angle, f); e.target.value = ""; }}
                                disabled={isBusy}
                              />
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                                background: "var(--accent-dim)", color: "var(--accent-2)",
                                border: "1px solid var(--border-accent)", cursor: "pointer",
                                opacity: isBusy ? 0.5 : 1,
                              }}>
                                {isBusy ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={12} />}
                                {info ? "Replace" : "Upload"}
                              </span>
                            </label>

                            {/* Camera */}
                            <button
                              onClick={() => startCamera(angle)}
                              disabled={isBusy}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                                background: "rgba(34,211,122,0.08)", color: "#22d37a",
                                border: "1px solid rgba(34,211,122,0.2)", cursor: "pointer",
                                fontFamily: "inherit", opacity: isBusy ? 0.5 : 1,
                              }}
                            >
                              <Camera size={12} /> Camera
                            </button>

                            {/* Delete */}
                            {info && (
                              <button
                                onClick={() => deleteEmbedding(info.id, angle)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 5,
                                  padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                                  background: "rgba(240,90,90,0.08)", color: "var(--danger)",
                                  border: "1px solid rgba(240,90,90,0.18)", cursor: "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {registered === 3 && (
                <div style={{
                  marginTop: 16, padding: "12px 14px", borderRadius: 12,
                  background: "rgba(34,211,122,0.08)", border: "1px solid rgba(34,211,122,0.2)",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <CheckCircle2 size={18} style={{ color: "#22d37a", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#22d37a" }}>All 3 angles registered</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{selStu.name} is ready for AI attendance</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          BULK UPLOAD TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "bulk" && (
        <>
          {/* Step 1 — Select Department */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
              1 · Select Department
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {depts.length === 0
                ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No departments found</div>
                : depts.map(d => (
                  <button
                    key={d.id}
                    onClick={() => { setBulkDept(d); setBulkResult(null); }}
                    style={{
                      padding: "8px 14px", borderRadius: 10, border: "1px solid",
                      borderColor: bulkDept?.id === d.id ? "var(--accent)" : "var(--border)",
                      background: bulkDept?.id === d.id ? "var(--accent-dim)" : "transparent",
                      color: bulkDept?.id === d.id ? "var(--accent-2)" : "var(--text-secondary)",
                      fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {d.code} — {d.name}
                  </button>
                ))}
            </div>
          </div>

          {/* Step 2 — ZIP format helper */}
          <div style={{
            marginBottom: 14, padding: "12px 14px", borderRadius: 12,
            background: "rgba(124,111,224,0.06)", border: "1px solid rgba(124,111,224,0.18)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--accent-2)" }}>
              📦 Expected ZIP Structure
            </div>
            <pre style={{
              fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8,
              fontFamily: "monospace", margin: 0, overflowX: "auto",
            }}>{`faces.zip
├── CS001/          ← folder name = roll_no
│   ├── img_a.jpg  → front  (1st alphabetically)
│   ├── img_b.jpg  → left   (2nd alphabetically)
│   └── img_c.jpg  → right  (3rd alphabetically)
├── CS002/
│   ├── photo1.jpg → front
│   ├── photo2.jpg → left
│   └── photo3.jpg → right
└── ...`}</pre>
          </div>

          {/* Step 3 — Drop Zone */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>
              2 · Upload ZIP File
            </div>

            <div
              id="bulk-drop-zone"
              onDragOver={e => { e.preventDefault(); setBulkDragging(true); }}
              onDragLeave={() => setBulkDragging(false)}
              onDrop={handleBulkDrop}
              onClick={() => bulkInputRef.current?.click()}
              style={{
                border: `2px dashed ${bulkDragging ? "var(--accent)" : bulkZipFile ? "#22d37a" : "var(--border)"}`,
                borderRadius: 16,
                padding: "32px 20px",
                textAlign: "center",
                cursor: "pointer",
                background: bulkDragging
                  ? "rgba(124,111,224,0.08)"
                  : bulkZipFile
                  ? "rgba(34,211,122,0.05)"
                  : "var(--bg-card-2)",
                transition: "all 0.2s ease",
              }}
            >
              <input
                ref={bulkInputRef}
                type="file"
                accept=".zip"
                style={{ display: "none" }}
                onChange={handleBulkFileSelect}
              />
              {bulkZipFile ? (
                <>
                  <FileArchive size={36} style={{ color: "#22d37a", margin: "0 auto 10px" }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#22d37a" }}>{bulkZipFile.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {(bulkZipFile.size / 1024 / 1024).toFixed(2)} MB — click to change
                  </div>
                </>
              ) : (
                <>
                  <Upload size={36} style={{ color: "var(--text-muted)", margin: "0 auto 10px" }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    Drag & drop ZIP here
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    or click to browse — .zip only
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Step 4 — Upload Button */}
          <button
            id="bulk-upload-btn"
            onClick={runBulkUpload}
            disabled={!bulkDept || !bulkZipFile || bulkUploading || modelStatus !== "ready"}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 14,
              background: (!bulkDept || !bulkZipFile || bulkUploading || modelStatus !== "ready")
                ? "rgba(124,111,224,0.3)"
                : "var(--accent)",
              color: "#fff", fontWeight: 800, fontSize: 16,
              border: "none", cursor: (!bulkDept || !bulkZipFile || bulkUploading || modelStatus !== "ready") ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              marginBottom: 20,
              transition: "background 0.2s",
            }}
          >
            {bulkUploading
              ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Processing…</>
              : <><Package size={18} /> Start Bulk Upload</>}
          </button>

          {!bulkDept && (
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: -14, marginBottom: 14 }}>
              ↑ Select a department first
            </div>
          )}

          {/* Results Panel */}
          {bulkResult && (
            <div className="card">
              {/* Summary stats */}
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, color: "var(--text)" }}>
                📊 Upload Results
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Folders Processed", value: bulkResult.total_folders, color: "var(--text)" },
                  { label: "Students Matched", value: bulkResult.matched_students, color: "#22d37a" },
                  { label: "Angles Registered", value: bulkResult.total_angles_registered, color: "var(--accent-2)" },
                  { label: "Unmatched Folders", value: bulkResult.unmatched_folders, color: bulkResult.unmatched_folders > 0 ? "#f5c842" : "var(--text-muted)" },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: "12px 14px", borderRadius: 12,
                    background: "var(--bg-card-2)", border: "1px solid var(--border)",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-student table */}
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>
                Per Student
              </div>
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                {/* Header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "120px 1fr 140px 1fr",
                  background: "var(--bg-card-2)", padding: "8px 14px",
                  fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span>Roll No</span>
                  <span>Name</span>
                  <span>Status</span>
                  <span>Angles</span>
                </div>
                {/* Rows */}
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {bulkResult.students.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid", gridTemplateColumns: "120px 1fr 140px 1fr",
                        padding: "10px 14px", alignItems: "center",
                        borderBottom: i < bulkResult.students.length - 1 ? "1px solid var(--border)" : "none",
                        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>
                        {s.roll_no}
                      </span>
                      <span style={{ fontSize: 12, color: s.name ? "var(--text)" : "var(--text-muted)", fontStyle: s.name ? "normal" : "italic" }}>
                        {s.name || "—"}
                      </span>
                      <span><StatusBadge status={s.status} /></span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {s.angles_registered.length > 0
                          ? s.angles_registered.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(", ")
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Errors section */}
              {bulkResult.errors.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <button
                    onClick={() => setShowErrors(v => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontSize: 12, fontWeight: 700, color: "var(--danger)",
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "inherit", padding: 0, marginBottom: 8,
                    }}
                  >
                    <AlertTriangle size={14} />
                    {bulkResult.errors.length} Error{bulkResult.errors.length !== 1 ? "s" : ""}
                    {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showErrors && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {bulkResult.errors.map((err, i) => (
                        <div key={i} style={{
                          padding: "8px 12px", borderRadius: 10,
                          background: "rgba(240,90,90,0.06)", border: "1px solid rgba(240,90,90,0.18)",
                          fontSize: 12,
                        }}>
                          <span style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>{err.roll_no}</span>
                          <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>·</span>
                          <span style={{ color: "#f5c842", fontWeight: 600 }}>{err.angle}</span>
                          <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>→</span>
                          <span style={{ color: "var(--danger)" }}>{err.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Camera Modal */}
      {showCam && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 900,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 16, padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            {ANGLE_LABEL[showCam]} — {ANGLE_HINT[showCam]}
          </div>

          <video
            ref={videoRef}
            autoPlay playsInline muted
            style={{
              width: "100%", maxWidth: 380, borderRadius: 18,
              border: "3px solid var(--accent)", background: "#000",
            }}
          />

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => captureFromCamera(showCam)}
              style={{
                padding: "14px 32px", borderRadius: 99, background: "var(--accent)",
                color: "#fff", fontWeight: 800, fontSize: 16, border: "none",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              📸 Capture
            </button>
            <button
              onClick={stopCamera}
              style={{
                padding: "14px 24px", borderRadius: 99,
                background: "rgba(255,255,255,0.08)", color: "#fff",
                fontWeight: 700, fontSize: 14, border: "1px solid rgba(255,255,255,0.18)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
