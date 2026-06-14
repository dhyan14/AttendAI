"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  Camera, Upload, Trash2, CheckCircle2, XCircle, ChevronLeft,
  Loader2, User, RefreshCw, AlertCircle, Eye, EyeOff,
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

// ─── Main ───────────────────────────────────────────────────
export default function FaceRegisterPage() {
  const [toast, setToast]         = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const [depts, setDepts]         = useState<Dept[]>([]);
  const [selDept, setSelDept]     = useState<Dept | null>(null);
  const [students, setStudents]   = useState<Stu[]>([]);
  const [selStu, setSelStu]       = useState<Stu | null>(null);
  const [faceData, setFaceData]   = useState<FaceData | null>(null);
  const [loadingFace, setLoadingFace] = useState(false);

  // per-angle state
  const [uploading, setUploading] = useState<Record<Angle, boolean>>({ front: false, left: false, right: false });
  const [showCam, setShowCam]     = useState<Angle | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  // ── Load depts ──────────────────────────────────────────
  useEffect(() => {
    apiFetch("/departments/").then(r => r.ok ? r.json() : []).then(setDepts).catch(() => {});

  }, []);

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

  const registered = faceData ? ANGLES.filter(a => faceData.angles[a] !== null).length : 0;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 120px" }}>
      <Toast msg={toast} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4 }}>
          Face Registration
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Register 3 angles per student for accurate AI attendance
        </p>
      </div>

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
