"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiFetchForm } from "@/lib/api";
import {
  Upload, Camera, Trash2, CheckCircle2, Loader2,
  ChevronLeft, ToggleLeft, ToggleRight, AlertTriangle,
  Sparkles, Check, Hash, ZoomIn, ZoomOut, X, Users, UserCheck, UserX,
} from "lucide-react";


// ─── Types ──────────────────────────────────────────────────
interface Subject { id: string; name: string; code: string; dept_id: string; semester: number | null; }
interface Lecture {
  id: string; subject_name: string; subject_code: string;
  division: string; batch: string; lecture_no: number;
  date: string; status: string; total_students: number; present_count: number;
}
interface FaceBox {
  bbox: [number, number, number, number]; // [x1,y1,x2,y2] in ORIGINAL image coords
  matched: boolean;
  student_id: string | null;
  student_name: string | null;
  roll_no: string | null;
  confidence: number;
}
interface DetectionResult {
  student_id: string; student_name: string; roll_no: string;
  status: "present" | "absent"; confidence: number;
}
interface AIResult {
  ai_used: boolean; mode: string; warning: string | null;
  images_processed: number;
  image_previews: string[];         // 960px fast preview for display
  annotated_image_urls?: string[];  // full-quality baked annotations stored in DB
  image_annotations: FaceBox[][];   // per-image face boxes (for canvas overlay)
  detected_faces: number;
  matched_faces: number;
  total_students: number;
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

// ─── Annotated Photo Canvas ─────────────────────────────────
// Draws classroom photo with green/red bounding boxes directly on faces
function AnnotatedPhoto({
  src,
  annotations,
  onClose,
}: {
  src: string;
  annotations: FaceBox[];
  onClose?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom & Pan states for Lightbox
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onClose) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      setZoom(prev => {
        const z = Math.max(1, Math.min(prev * factor, 5));
        if (z === 1) setPan({ x: 0, y: 0 });
        return z;
      });
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [onClose]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1 || !onClose) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({
      x: panStart.current.x + dx / zoom,
      y: panStart.current.y + dy / zoom,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    if (!src) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Canvas size = image natural size (so bbox coords map 1:1)
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Draw the photo
      ctx.drawImage(img, 0, 0);

      if (!annotations || annotations.length === 0) return;

      const W = img.naturalWidth;
      const H = img.naturalHeight;

      // Track placed label rects to prevent overlap
      const occupiedRects: { x: number; y: number; w: number; h: number }[] = [];

      const overlaps = (ax: number, ay: number, aw: number, ah: number) =>
        occupiedRects.some(r =>
          ax < r.x + r.w && ax + aw > r.x &&
          ay < r.y + r.h && ay + ah > r.y
        );

      for (const face of annotations) {
        const [x1, y1, x2, y2] = face.bbox;
        const bw = x2 - x1;
        const bh = y2 - y1;
        if (bw <= 0 || bh <= 0) continue;

        const color = face.matched ? "#22d37a" : "#ff453a";
        const lineW = Math.max(1, Math.min(Math.round(bw / 80), 2));

        // ── Border rectangle ──────────────────────────────────────
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.globalAlpha = 0.85;
        ctx.strokeRect(x1, y1, bw, bh);
        ctx.globalAlpha = 1.0;

        // ── Compact label ─────────────────────────────────────────
        // Font: proportional to face width, hard-capped at 8px so it stays tiny
        const fontSize = Math.max(5, Math.min(Math.round(bw * 0.08), 8));
        ctx.font = `700 ${fontSize}px -apple-system, ui-sans-serif, sans-serif`;

        // Short text: matched → roll+% only, unknown → single "?" character
        const label = face.matched
          ? `${(face.roll_no || face.student_name || "?").slice(0, 8)}·${Math.round(face.confidence * 100)}%`
          : `?`;

        const tw  = ctx.measureText(label).width;
        const px  = 2;                   // fixed 2px horizontal padding
        const py  = 1;                   // fixed 1px vertical padding
        const tagW = tw + px * 2;
        const tagH = fontSize + py * 2;

        // ── Find non-overlapping Y position ───────────────────────
        // Prefer above the box; if that overlaps, try inside-top, then shift down
        let tagX = Math.max(0, Math.min(x1, W - tagW));
        let tagY = y1 - tagH; // default: above top edge

        // If above is off-screen, go inside the box top
        if (tagY < 0) tagY = y1 + lineW;

        // Nudge down until no overlap (max 3 nudges to avoid infinite loop)
        let attempts = 0;
        while (overlaps(tagX, tagY, tagW, tagH) && attempts < 4) {
          tagY += tagH + 1;
          attempts++;
        }
        // If still overlapping, try placing below the face box
        if (overlaps(tagX, tagY, tagW, tagH)) {
          tagY = y2 + lineW;
          if (tagY + tagH > H) tagY = Math.max(0, y1 - tagH);
        }

        // Register this label rect
        occupiedRects.push({ x: tagX, y: tagY, w: tagW, h: tagH });

        // ── Draw tag background ───────────────────────────────────
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(tagX, tagY, tagW, tagH, 2);
        } else {
          ctx.rect(tagX, tagY, tagW, tagH);
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Tag text
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${fontSize}px -apple-system, sans-serif`;
        ctx.fillText(label, tagX + px, tagY + py + fontSize * 0.85);
      }
    };
    img.src = src;
  }, [src, annotations]);

  // ── Fullscreen lightbox mode ───────────────────────────────
  if (onClose) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "#000",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        {/* Zoom controls */}
        <div style={{
          position: "absolute", top: 16, left: 16, zIndex: 10,
          display: "flex", gap: 8,
        }}>
          <button
            onClick={() => setZoom(prev => {
              const z = Math.max(1, prev - 0.5);
              if (z === 1) setPan({ x: 0, y: 0 });
              return z;
            })}
            disabled={zoom <= 1}
            style={{
              width: 38, height: 38, borderRadius: 8,
              background: "rgba(255,255,255,0.15)",
              border: "1.5px solid rgba(255,255,255,0.3)",
              color: "#fff", cursor: zoom <= 1 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)",
              opacity: zoom <= 1 ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            <ZoomOut size={16} />
          </button>
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 10px", borderRadius: 8,
            background: "rgba(0,0,0,0.6)",
            border: "1.5px solid rgba(255,255,255,0.15)",
            color: "#fff", fontSize: 12, fontWeight: 700,
            backdropFilter: "blur(8px)", minWidth: 40,
          }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(prev => Math.min(5, prev + 0.5))}
            disabled={zoom >= 5}
            style={{
              width: 38, height: 38, borderRadius: 8,
              background: "rgba(255,255,255,0.15)",
              border: "1.5px solid rgba(255,255,255,0.3)",
              color: "#fff", cursor: zoom >= 5 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)",
              opacity: zoom >= 5 ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            <ZoomIn size={16} />
          </button>
          {zoom > 1 && (
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              style={{
                padding: "0 12px", height: 38, borderRadius: 8,
                background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.3)",
                color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(8px)", fontSize: 11, fontWeight: 700,
              }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 10,
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(8px)",
            transition: "all 0.2s",
          }}
        >
          <X size={22} />
        </button>

        {/* Annotated canvas — fills screen & supports zoom/drag */}
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
          touchAction: "none",
        }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              maxWidth: "100vw", maxHeight: "100dvh",
              objectFit: "contain", display: "block",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.15s ease-out",
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
            }}
          />
        </div>

        {/* Legend */}
        <div style={{
          position: "absolute", bottom: 24,
          left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 20,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
          padding: "10px 24px", borderRadius: 99,
          border: "1px solid rgba(255,255,255,0.15)",
          pointerEvents: "none", // click through legend if zoom/drag is active
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#22d37a" }}>
            <div style={{ width: 14, height: 14, border: "2.5px solid #22d37a", borderRadius: 2 }} />
            Matched
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#ff453a" }}>
            <div style={{ width: 14, height: 14, border: "2.5px solid #ff453a", borderRadius: 2 }} />
            Unmatched
          </div>
        </div>
      </div>
    );
  }

  // ── Inline thumbnail mode (in the strip) ──────────────────
  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%", display: "block",
        borderRadius: 0, cursor: "zoom-in",
      }}
    />
  );
}


// ─── Fullscreen Image Viewer (no canvas — native pixel quality) ─────────────
// Displays a pre-annotated image at native resolution with zoom/pan support
function FullscreenImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart  = useRef({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom(prev => {
      const z = Math.max(1, Math.min(prev * factor, 8));
      if (z === 1) setPan({ x: 0, y: 0 });
      return z;
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current  = { ...pan };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({ x: panStart.current.x + (e.clientX - dragStart.current.x) / zoom,
             y: panStart.current.y + (e.clientY - dragStart.current.y) / zoom });
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) { setIsDragging(false); e.currentTarget.releasePointerCapture(e.pointerId); }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "#000",
               display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      onWheel={handleWheel}
    >
      {/* Zoom controls */}
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, display: "flex", gap: 8 }}>
        {[
          { label: <ZoomOut size={16} />, fn: () => setZoom(p => { const z = Math.max(1, p - 0.5); if (z === 1) setPan({ x: 0, y: 0 }); return z; }), disabled: zoom <= 1 },
          { label: `${Math.round(zoom * 100)}%`,  fn: undefined, disabled: false },
          { label: <ZoomIn size={16} />,  fn: () => setZoom(p => Math.min(8, p + 0.5)), disabled: zoom >= 8 },
        ].map((btn, i) => (
          <button key={i} onClick={btn.fn ?? undefined} disabled={btn.disabled}
            style={{ minWidth: 38, height: 38, borderRadius: 8, background: "rgba(255,255,255,0.15)",
                     border: "1.5px solid rgba(255,255,255,0.3)", color: "#fff", cursor: btn.disabled ? "not-allowed" : "pointer",
                     display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                     backdropFilter: "blur(8px)", opacity: btn.disabled ? 0.5 : 1, padding: "0 10px" }}>
            {btn.label}
          </button>
        ))}
        {zoom > 1 && (
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            style={{ padding: "0 12px", height: 38, borderRadius: 8, background: "rgba(255,255,255,0.15)",
                     border: "1.5px solid rgba(255,255,255,0.3)", color: "#fff", cursor: "pointer",
                     fontSize: 11, fontWeight: 700, backdropFilter: "blur(8px)" }}>Reset</button>
        )}
      </div>

      {/* Close */}
      <button onClick={onClose}
        style={{ position: "absolute", top: 16, right: 16, zIndex: 10, width: 44, height: 44, borderRadius: "50%",
                 background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)",
                 color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                 backdropFilter: "blur(8px)" }}>
        <X size={22} />
      </button>

      {/* Image — native resolution, no canvas re-encode, no quality loss */}
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                    justifyContent: "center", overflow: "hidden", touchAction: "none" }}>
        <img
          src={src}
          alt="Annotated classroom photo"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            maxWidth: "100vw", maxHeight: "100dvh", objectFit: "contain", display: "block",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.15s ease-out",
            cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
            imageRendering: "auto",  // let browser use high-quality bicubic interpolation
          }}
        />
      </div>

      {/* Legend */}
      <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                    display: "flex", gap: 20, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
                    padding: "10px 24px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.15)",
                    pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#22d37a" }}>
          <div style={{ width: 14, height: 14, border: "2.5px solid #22d37a", borderRadius: 2 }} /> Matched
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#ff453a" }}>
          <div style={{ width: 14, height: 14, border: "2.5px solid #ff453a", borderRadius: 2 }} /> Unmatched
        </div>
      </div>
    </div>
  );
}


// ─── Main Page ───────────────────────────────────────────────
export default function TakeAttendancePage() {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 1 ────────────────────────────────────────────────
  const [subjects, setSubjects]     = useState<Subject[]>([]);
  const [selSubject, setSelSubject] = useState<Subject | null>(null);
  const [lecNo, setLecNo]           = useState("");
  const [division, setDivision]     = useState("");
  const [batch, setBatch]           = useState("All");
  const today = new Date().toISOString().slice(0, 10);
  const [lecDate, setLecDate]       = useState(today);
  const [creating, setCreating]     = useState(false);
  const [lecture, setLecture]       = useState<Lecture | null>(null);

  // ── Photos ────────────────────────────────────────────────
  const [photos, setPhotos]           = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [showCam, setShowCam]         = useState(false);
  const [camStream, setCamStream]     = useState<MediaStream | null>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Step 2 ────────────────────────────────────────────────
  const [procProgress, setProcProgress] = useState(0);

  // ── Step 3 ────────────────────────────────────────────────
  const [aiResult, setAiResult]     = useState<AIResult | null>(null);
  const [overrides, setOverrides]   = useState<Record<string, boolean>>({});
  const [finalizing, setFinalizing] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null); // full-screen image index

  // ── Load subjects & Existing Lecture ───────────────────────
  const [loadingExisting, setLoadingExisting] = useState(false);

  const loadExistingLecture = useCallback(async (lecId: string) => {
    setLoadingExisting(true);
    try {
      const res = await apiFetch(`/attendance/lectures/${lecId}`);
      if (!res.ok) {
        showToast("✗ Failed to load lecture details");
        return;
      }
      const data = await res.json();
      const loadedLec = {
        id: data.id,
        subject_name: data.subject_name,
        subject_code: data.subject_code,
        division: data.division,
        batch: data.batch,
        lecture_no: data.lecture_no,
        date: data.date,
        status: data.status,
        total_students: data.records.length,
        present_count: data.records.filter((r: any) => r.status === "present").length,
      };
      setLecture(loadedLec);

      // Pre-populate fields in case we stay in Step 1
      setLecNo(data.lecture_no.toString());
      setDivision(data.division);
      setBatch(data.batch || "All");
      setLecDate(data.date);

      const init: Record<string, boolean> = {};
      data.records.forEach((r: any) => {
        init[r.student_id] = r.status === "present";
      });
      setOverrides(init);

      const hasImages = data.classroom_image_urls && data.classroom_image_urls.length > 0;
      const presentRecords = data.records.filter((r: any) => r.status === "present");
      if (data.status === "finalized" || hasImages) {
        setAiResult({
          ai_used: true,
          mode: "real_ai",
          warning: null,
          images_processed: data.classroom_image_urls?.length ?? 0,
          image_previews: data.classroom_image_urls ?? [],      // stored annotated originals
          annotated_image_urls: data.classroom_image_urls ?? [], // same — already annotated
          image_annotations: Array((data.classroom_image_urls ?? []).length).fill([]),
          detected_faces: presentRecords.length, // best approximation from stored data
          matched_faces: presentRecords.length,
          total_students: data.records.length,
          detection_results: data.records.map((r: any) => ({
            student_id: r.student_id,
            student_name: r.student_name,
            roll_no: r.roll_no,
            status: r.status,
            confidence: r.confidence ?? 1.0,
          })),
        });
        setStep(3);
      } else {
        setStep(1);
      }
    } catch (err) {
      console.error(err);
      showToast("✗ Error loading existing lecture");
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  useEffect(() => {
    apiFetch("/subjects/")
      .then(r => r.ok ? r.json() : [])
      .then(setSubjects)
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const lecId = params.get("lecture_id");
    if (lecId) {
      loadExistingLecture(lecId);
    }
  }, [loadExistingLecture]);

  // Pre-select subject once subjects list is loaded
  useEffect(() => {
    if (lecture && subjects.length > 0 && !selSubject) {
      const match = subjects.find(s => s.code === lecture.subject_code);
      if (match) setSelSubject(match);
    }
  }, [subjects, lecture, selSubject]);

  // ── Photo helpers ─────────────────────────────────────────
  /**
   * Resize a File/Blob to max MAX_UPLOAD_PX wide using a hidden Canvas.
   * This runs entirely on the client in <50ms and reduces server load by
   * 16× (4096px → 1024px = 16× fewer pixels for ONNX to process).
   * Result: each image takes ~2s on server instead of ~8s.
   */
  const MAX_UPLOAD_PX = 1024; // sweet spot: enough for 480px SCRFD detector

  const resizeImageFile = (file: File | Blob): Promise<{ file: File; preview: string }> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const { naturalWidth: w, naturalHeight: h } = img;

        // Already small enough — no resize needed
        if (w <= MAX_UPLOAD_PX) {
          const reader = new FileReader();
          reader.onload = e => resolve({
            file: file instanceof File ? file : new File([file], `classroom_${Date.now()}.jpg`, { type: "image/jpeg" }),
            preview: e.target?.result as string,
          });
          reader.readAsDataURL(file);
          return;
        }

        // Resize via Canvas
        const scale  = MAX_UPLOAD_PX / w;
        const newW   = MAX_UPLOAD_PX;
        const newH   = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width  = newW;
        canvas.height = newH;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, newW, newH);

        canvas.toBlob(blob => {
          if (!blob) { reject(new Error("Canvas toBlob failed")); return; }
          const resized = new File([blob], (file instanceof File ? file.name : `classroom_${Date.now()}.jpg`), { type: "image/jpeg" });
          const preview = canvas.toDataURL("image/jpeg", 0.88);
          resolve({ file: resized, preview });
        }, "image/jpeg", 0.88); // JPEG q=88: excellent quality, ~60-120 KB vs 3-8 MB
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const toAdd = Array.from(files).slice(0, 3 - photos.length);
    // Resize each image client-side before adding to state
    const resized = await Promise.all(toAdd.map(f => resizeImageFile(f)));
    setPhotos(p => [...p, ...resized.map(r => r.file)]);
    setPhotoPreviews(p => [...p, ...resized.map(r => r.preview)]);
  };

  const removePhoto = (i: number) => {
    setPhotos(p => p.filter((_, idx) => idx !== i));
    setPhotoPreviews(p => p.filter((_, idx) => idx !== i));
  };

  // ── Camera ────────────────────────────────────────────────
  const startCamera = async () => {
    setShowCam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCamStream(stream);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch { showToast("✗ Camera permission denied"); setShowCam(false); }
  };
  const stopCamera = () => { camStream?.getTracks().forEach(t => t.stop()); setCamStream(null); setShowCam(false); };
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current; const c = canvasRef.current;
    // Capture at native camera resolution first, then resize
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(async blob => {
      if (!blob) return;
      stopCamera();
      try {
        const { file, preview } = await resizeImageFile(blob);
        setPhotos(p => [...p, file]);
        setPhotoPreviews(p => [...p, preview]);
      } catch {
        // Fallback: use raw blob if resize fails
        const file = new File([blob], `classroom_${Date.now()}.jpg`, { type: "image/jpeg" });
        setPhotos(p => [...p, file]);
        const url = URL.createObjectURL(blob);
        setPhotoPreviews(p => [...p, url]);
      }
    }, "image/jpeg", 0.95);
  };

  // ── Create lecture + run AI ───────────────────────────────
  const startRecognition = async () => {
    if (!selSubject || !lecNo || photos.length < 3) return;
    if (!division) { showToast("✗ Please select a division"); return; }
    if (photos.length < 3) { showToast("✗ Upload exactly 3 classroom photos for best accuracy"); return; }

    setCreating(true);
    let lec: Lecture = lecture as Lecture;
    if (!lec) {
      try {
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
    }
    setCreating(false);

    setStep(2);
    setProcProgress(0);
    const tick = setInterval(() => setProcProgress(p => Math.min(p + 9, 90)), 200);

    try {
      const form = new FormData();
      form.append("lecture_id", lec.id);
      photos.forEach(f => form.append("files", f));

      const r2 = await apiFetchForm("/attendance/take-ai", form);
      clearInterval(tick);
      setProcProgress(100);

      if (!r2.ok) {
        const e = await r2.json();
        showToast("✗ " + (e.detail || "Recognition failed"));
        setStep(1);
        return;
      }

      const result: AIResult = await r2.json();

      // If backend signals no students were enrolled, show clear warning and go back
      if ((result as any).mode === "no_students") {
        showToast("✗ No students found for this division. Check division assignment.");
        setStep(1);
        return;
      }

      // Use annotated_image_urls if provided (full-quality baked annotations)
      // Otherwise fall back to image_previews
      const displayResult: AIResult = {
        ...result,
        image_previews: result.annotated_image_urls && result.annotated_image_urls.length > 0
          ? result.annotated_image_urls
          : result.image_previews,
      };

      setAiResult(displayResult);
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

  // ── Finalize ──────────────────────────────────────────────
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
  const canStart = !!selSubject && !!lecNo && !!division && photos.length >= 3;

  if (loadingExisting) {
    return (
      <div className="take-container" style={{ margin: "0 auto", padding: "80px 16px 120px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60dvh", gap: 14 }}>
        <Toast msg={toast} />
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "var(--accent-dim)", border: "1px solid var(--border-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Loader2 size={26} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading lecture details...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="take-container" style={{ margin: "0 auto", padding: "20px 16px 120px" }}>
      <Toast msg={toast} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Lightbox full-screen annotated photo — plain img for native pixel quality */}
      {lightboxIdx !== null && aiResult && aiResult.image_previews[lightboxIdx] && (
        <FullscreenImageViewer
          src={aiResult.image_previews[lightboxIdx]}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <button
          onClick={() => step === 1 ? router.back() : setStep(s => (s - 1) as any)}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", marginBottom: 10, padding: 0 }}
        >
          <ChevronLeft size={22} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 14 }}>Take Attendance</h1>

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
        <div className="step-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Subject selector */}
            <div className="card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>Subject</div>
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

            {/* Lecture details */}
            <div className="card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>Lecture Details</div>

              {/* Lecture Number — quick-pick buttons 1–8 */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 8 }}>Lecture No *</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
                  {[1,2,3,4,5,6,7,8].map(n => {
                    const selected = lecNo === String(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setLecNo(String(n))}
                        style={{
                          padding: "10px 4px",
                          borderRadius: 10,
                          border: selected ? "2px solid var(--accent)" : "1.5px solid var(--border)",
                          background: selected ? "var(--accent-dim)" : "var(--bg-card-2)",
                          color: selected ? "var(--accent)" : "var(--text-muted)",
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "all 0.18s cubic-bezier(0.34,1.2,0.64,1)",
                          transform: selected ? "scale(1.08)" : "scale(1)",
                          boxShadow: selected ? "0 0 12px rgba(0,212,255,0.25)" : "none",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                {/* Show currently selected */}
                {lecNo && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--accent)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <Hash size={11} /> Lecture {lecNo} selected
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {/* Division — dropdown */}
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Division *</label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={division}
                      onChange={e => setDivision(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 36px 10px 12px",
                        borderRadius: 10,
                        border: division ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                        background: division ? "var(--accent-dim)" : "var(--bg-card-2)",
                        outline: "none",
                        fontSize: 14,
                        fontWeight: 700,
                        color: division ? "var(--accent)" : "var(--text-muted)",
                        fontFamily: "inherit",
                        appearance: "none",
                        cursor: "pointer",
                        boxSizing: "border-box",
                        transition: "all 0.2s",
                        boxShadow: division ? "0 0 10px rgba(0,212,255,0.15)" : "none",
                      }}
                    >
                      <option value="">Choose...</option>
                      {["All", "A", "B", "C", "D", "E"].map(d => (
                        <option key={d} value={d}>{d === "All" ? "All Divisions" : `Division ${d}`}</option>
                      ))}
                    </select>
                    {/* Custom chevron */}
                    <svg
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke={division ? "var(--accent)" : "var(--text-muted)"} strokeWidth="2.5"
                    >
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </div>
                </div>

                {/* Batch */}
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Batch</label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={batch} onChange={e => setBatch(e.target.value)}
                      style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", outline: "none", fontSize: 13, color: "var(--text-primary)", fontFamily: "inherit", appearance: "none", cursor: "pointer", boxSizing: "border-box" }}
                    >
                      {["All", "B1", "B2", "B3", "B4"].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <svg
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="var(--text-muted)" strokeWidth="2.5"
                    >
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </div>
                </div>

                {/* Date */}
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>Date</label>
                  <input
                    type="date" value={lecDate} onChange={e => setLecDate(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card-2)", outline: "none", fontSize: 13, color: "var(--text-primary)", fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Photos */}
            <div className="card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Classroom Photos ({photos.length}/3)
              </div>
              {photoPreviews.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                  {photoPreviews.map((src, i) => (
                    <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4/3" }}>
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        onClick={() => removePhoto(i)}
                        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(240,90,90,0.9)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <Trash2 size={11} />
                      </button>
                      <div style={{ position: "absolute", bottom: 3, left: 4, background: "rgba(0,0,0,0.6)", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#fff", padding: "2px 5px" }}>#{i+1}</div>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < 3 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, cursor: "pointer" }}>
                    <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => addPhotos(e.target.files)} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", borderRadius: 12, border: "2px dashed var(--border)", background: "var(--bg-card-2)", color: "var(--text-secondary)", fontSize: 13, fontWeight: 700 }}>
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
              <div style={{ fontSize: 11, color: photos.length === 3 ? "#22d37a" : "var(--text-muted)", textAlign: "center", marginTop: 8, fontWeight: photos.length === 3 ? 700 : 400 }}>
                {photos.length === 3 ? "✓ 3 photos ready — optimized sequential processing ⚡" : `Add ${3 - photos.length} more photo${3 - photos.length !== 1 ? "s" : ""} — exactly 3 required for best accuracy`}
              </div>
            </div>
          </div>

          <div className="step-footer-full">
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
          </div>
        </div>
      )}

      {/* ══════════════ STEP 2 ══════════════ */}
      {step === 2 && (
        <div style={{ textAlign: "center", padding: "56px 16px" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--accent-dim)", margin: "0 auto 22px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={36} style={{ color: "var(--accent-2)" }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Analysing Faces…</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 28 }}>
            Scanning {photos.length} photos sequentially with multi-scale detection…
          </div>
          <div style={{ height: 8, background: "var(--bg-card-2)", borderRadius: 99, overflow: "hidden", maxWidth: 320, margin: "0 auto" }}>
            <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, var(--accent), #22d37a)", width: `${procProgress}%`, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{procProgress}%</div>
        </div>
      )}

      {/* ══════════════ STEP 3 — REVIEW ══════════════ */}
      {step === 3 && aiResult && (
        <div className="step3-grid">
          <div className="step3-left-col" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {aiResult.warning && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)" }}>
                <AlertTriangle size={15} style={{ color: "#f5c842", flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "#f5c842" }}>{aiResult.warning}</div>
              </div>
            )}

            {/* Lecture pill */}
            {lecture && (
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--bg-card-2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" }}>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{lecture.subject_name}</span>
                {" · "}Lec #{lecture.lecture_no} · Div {lecture.division}
                {lecture.batch !== "All" && ` · ${lecture.batch}`}
              </div>
            )}

            {/* Detection summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                { label: "Detected", value: aiResult.detected_faces, color: "var(--accent)", icon: <Users size={14} /> },
                { label: "Matched", value: aiResult.matched_faces ?? presentCount, color: "#22d37a", icon: <UserCheck size={14} /> },
                { label: "Present", value: presentCount, color: "#22d37a", icon: <Check size={14} /> },
                { label: "Absent", value: totalStudents - presentCount, color: "var(--danger)", icon: <UserX size={14} /> },
              ].map(({ label, value, color, icon }) => (
                <div key={label} className="card" style={{ textAlign: "center", padding: "12px 6px" }}>
                  <div style={{ color, marginBottom: 4, display: "flex", justifyContent: "center" }}>{icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* ── ANNOTATED PHOTO VIEWER ─────────────────────────────── */}
            {aiResult.image_previews.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                    📸 Tap photo to enlarge
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, fontWeight: 700 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#22d37a" }}>
                      <span style={{ width: 10, height: 10, border: "2px solid #22d37a", display: "inline-block", borderRadius: 1 }} />
                      Matched
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#ff453a" }}>
                      <span style={{ width: 10, height: 10, border: "2px solid #ff453a", display: "inline-block", borderRadius: 1 }} />
                      Unmatched
                    </span>
                  </div>
                </div>

                {/* Photos — show with baked annotations directly via <img>, no canvas redraw */}
                {aiResult.image_previews.map((src, i) => {
                  // image_previews is already the full-quality annotated version
                  // image_annotations will be empty for baked images — use global result stats
                  const annotations = aiResult.image_annotations?.[i] ?? [];
                  const hasAnnotations = annotations.length > 0;
                  const matched   = hasAnnotations ? annotations.filter(a => a.matched).length : aiResult.matched_faces;
                  const unmatched = hasAnnotations ? annotations.filter(a => !a.matched).length : Math.max(0, aiResult.detected_faces - aiResult.matched_faces);
                  const total     = matched + unmatched;
                  return (
                    <div
                      key={i}
                      onClick={() => setLightboxIdx(i)}
                      style={{
                        position: "relative",
                        cursor: "zoom-in",
                        borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      }}
                    >
                      {/* Use plain <img> so browser renders at native pixel quality — no canvas downsampling */}
                      <img
                        src={src}
                        alt={`Classroom photo ${i + 1}`}
                        style={{ width: "100%", display: "block", imageRendering: "auto" }}
                      />

                      {/* Face count overlay — bottom left */}
                      <div style={{
                        position: "absolute", bottom: 10, left: 10,
                        display: "flex", gap: 6, alignItems: "center",
                      }}>
                        {total > 0 && (
                          <div style={{
                            background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)",
                            borderRadius: 99, padding: "4px 12px",
                            fontSize: 12, fontWeight: 700,
                            display: "flex", gap: 10,
                          }}>
                            <span style={{ color: "#22d37a" }}>✓ {matched} matched</span>
                            {unmatched > 0 && <span style={{ color: "#ff453a" }}>✗ {unmatched} unknown</span>}
                          </div>
                        )}
                      </div>

                      {/* Zoom hint */}
                      <div style={{
                        position: "absolute", bottom: 10, right: 10,
                        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
                        borderRadius: "50%", width: 32, height: 32,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <ZoomIn size={16} color="#fff" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="step3-right-col" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Student list */}
            <div className="card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
                Review — tap to toggle
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

            {/* Finalize button — photo viewer disappears after this */}
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
                : <><Check size={18} /> Submit Attendance ({presentCount} present)</>}
            </button>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
              Tap any student to toggle. Photo annotations will clear after Submit.
            </div>
          </div>
        </div>
      )}

      {/* Camera modal */}
      {showCam && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 900, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Point camera at students</div>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxWidth: 400, borderRadius: 18, border: "3px solid var(--accent)", background: "#000" }} />
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={capturePhoto} style={{ padding: "14px 32px", borderRadius: 99, background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: 16, border: "none", cursor: "pointer", fontFamily: "inherit" }}>📸 Capture</button>
            <button onClick={stopCamera} style={{ padding: "14px 24px", borderRadius: 99, background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 700, fontSize: 14, border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
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
