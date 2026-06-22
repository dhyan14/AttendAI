"""
AttendAI Face Recognition Service
===================================
Optimized for CLASSROOM PHOTOS — students at 2–15 metres from camera.

Speed architecture (target: 3 s per image / 10 s for 3 images in parallel on CPU):

  KEY INSIGHT: The frontend now pre-resizes all uploads to ≤ 1024 px wide
  (via Canvas API, runs in <50 ms on client). This alone removes 90% of
  the server-side work — the server no longer has to decode a 4096 px JPEG,
  upscale it, or chop it into tiles.

  Server-side pipeline (per image):
    Step 1 — Decode 1024px JPEG     : ~30 ms  (vs ~800 ms for 4096px)
    Step 2 — Mild upscale to 1366px : ~20 ms  (bilinear, 1024 × 1.33)
    Step 3 — Single ONNX pass 480px : ~1.5–2 s on CPU
    Step 4 — NMS (trivial)          : <1 ms
    Total                           : ~2–2.5 s per image

  3 images processed IN PARALLEL → total ≤ 6–8 s
  (parallel is safe now because images are small enough that
   ONNX finishes fast and doesn't thrash the CPU cache)

  Model tuning:
    - DET_SIZE = (480, 480)    — fastest viable detector resolution
    - UPSCALE_FACTOR = 1.33    — modest boost for faces at medium distance
    - NO TILING                — single pass only (1024px input is already
                                 well-matched to 480px detector; tiling adds
                                 2 extra passes = 2× overhead for tiny gain)
    - DET_SCORE_THRESH = 0.35  — catch small/distant faces
"""

from __future__ import annotations
import numpy as np
import asyncio
import concurrent.futures
from typing import Optional
from app.config import settings

# ─── Module-level constants ───────────────────────────────────────────────────
MATCH_THRESHOLD   = settings.FACE_RECOGNITION_THRESHOLD  # default 0.35
DET_SIZE          = (480, 480)   # SCRFD detector input size — fastest viable
DET_SCORE_THRESH  = 0.35         # minimum detection confidence
UPSCALE_FACTOR    = 1.33         # mild upscale: 1024px → 1362px
MAX_DET_WIDTH     = 1400         # hard cap after upscale


class FaceService:
    """
    InsightFace ArcFace wrapper.
    Target: ≤ 3 seconds per 1024px classroom photo on a CPU server.
    3 images processed in parallel = ≤ 10 s total.
    """

    def __init__(self):
        self.model       = None
        self.initialized = False
        self.load_error: Optional[str] = None
        self._loading    = False
        # 3 workers = one per image when processing in parallel
        self._executor   = concurrent.futures.ThreadPoolExecutor(max_workers=3)

    # ── Model Loading ─────────────────────────────────────────────────────────

    def _load_model(self):
        """Blocking load — runs in thread pool executor at startup."""
        import os

        MODEL_ROOT = "/app/insightface_models"
        os.environ["INSIGHTFACE_HOME"] = MODEL_ROOT

        print(f"[FaceService] Model root: {MODEL_ROOT}")
        models_dir = os.path.join(MODEL_ROOT, "models", "buffalo_s")
        if os.path.isdir(models_dir):
            print(f"[FaceService] buffalo_s files: {os.listdir(models_dir)}")
        else:
            print(f"[FaceService] ⚠ buffalo_s dir not found at {models_dir}")

        from insightface.app import FaceAnalysis
        model = FaceAnalysis(
            name="buffalo_s",
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"],
            root=MODEL_ROOT,
        )
        model.prepare(ctx_id=-1, det_size=DET_SIZE, det_thresh=DET_SCORE_THRESH)
        print(f"[FaceService] Ready — det_size={DET_SIZE}, det_thresh={DET_SCORE_THRESH}")
        return model

    async def initialize(self):
        if self.initialized or self._loading:
            return
        self._loading = True
        try:
            loop = asyncio.get_running_loop()
            print("[FaceService] Loading InsightFace buffalo_s…")
            self.model = await loop.run_in_executor(self._executor, self._load_model)
            self.initialized = True
            self.load_error  = None
            print("✅ InsightFace ready — single-pass 480px, parallel-safe")
        except Exception as e:
            import traceback
            self.load_error  = f"{type(e).__name__}: {e}"
            self.initialized = False
            print(f"⚠️ InsightFace load failed:\n{traceback.format_exc()}")
        finally:
            self._loading = False

    # ── Image Utilities ───────────────────────────────────────────────────────

    def _decode_image(self, image_bytes: bytes):
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image — unsupported format or corrupted file")
        return img

    def _upscale(self, img, factor: float, max_w: int):
        """Upscale image by factor, capping at max_w. Returns (img, actual_scale)."""
        import cv2
        h, w = img.shape[:2]
        new_w = min(int(w * factor), max_w)
        if new_w <= w:
            return img, 1.0
        new_h = int(h * (new_w / w))
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        return resized, new_w / w

    def _iou(self, a, b) -> float:
        x1 = max(a[0], b[0]); y1 = max(a[1], b[1])
        x2 = min(a[2], b[2]); y2 = min(a[3], b[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = (a[2]-a[0]) * (a[3]-a[1])
        area_b = (b[2]-b[0]) * (b[3]-b[1])
        return inter / (area_a + area_b - inter + 1e-6)

    def _nms(self, detections: list, iou_thresh: float = 0.40) -> list:
        if not detections:
            return []
        detections = sorted(detections, key=lambda d: d["det_score"], reverse=True)
        kept = []
        for det in detections:
            if not any(self._iou(det["bbox"], k["bbox"]) > iou_thresh for k in kept):
                kept.append(det)
        return kept

    # ── Core Detection ────────────────────────────────────────────────────────

    def _detect_on_img(self, img) -> list:
        """Single InsightFace inference pass. Returns list of dicts."""
        faces = self.model.get(img)
        results = []
        for face in faces:
            if face.det_score < DET_SCORE_THRESH:
                continue
            if face.normed_embedding is None:
                continue
            results.append({
                "bbox":      face.bbox.tolist(),
                "det_score": float(face.det_score),
                "embedding": face.normed_embedding.tolist(),
            })
        return results

    def _single_pass_detect(self, img) -> list:
        """
        Fast single-pass detection for pre-resized (≤1024px) images.

        Pipeline:
          1. Mild upscale to ~1366px (1024 × 1.33) — catches medium-far faces
             without the memory explosion of 2× upscale
          2. Single full-image ONNX pass at DET_SIZE=480
          3. Remap bboxes back to original (1024px) coordinates

        One pass = one ONNX call ≈ 1.5–2 s on CPU.
        No tiling needed: 1024px images are already well-matched to the 480px
        detector window. Tiling would cost 2 extra ONNX calls for tiny gain.
        """
        h_orig, w_orig = img.shape[:2]

        # Step 1: mild upscale
        img_up, up_scale = self._upscale(img, UPSCALE_FACTOR, MAX_DET_WIDTH)
        h_up, w_up = img_up.shape[:2]
        print(f"[FaceService] {w_orig}x{h_orig} → {w_up}x{h_up} (scale={up_scale:.2f})")

        # Step 2: single ONNX detection pass
        dets = self._detect_on_img(img_up)

        # Step 3: remap upscaled coords → original coords
        for det in dets:
            b = det["bbox"]
            det["bbox"] = [b[0]/up_scale, b[1]/up_scale, b[2]/up_scale, b[3]/up_scale]

        unique = self._nms(dets)
        print(f"[FaceService] {len(dets)} raw → {len(unique)} unique faces")
        return unique

    def _process_single_image(self, image_bytes: bytes) -> list:
        """
        Decode + detect one image. Runs in ThreadPoolExecutor.
        Returns list of (bbox, embedding) tuples.
        """
        img = self._decode_image(image_bytes)
        faces = self._single_pass_detect(img)
        return [(f["bbox"], f["embedding"]) for f in faces]

    # ── Public API ────────────────────────────────────────────────────────────

    def get_embeddings(self, image_bytes: bytes) -> list:
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        return self._process_single_image(image_bytes)

    async def get_embeddings_async(self, image_bytes: bytes) -> list:
        """Async: runs detection in thread pool, event loop stays free."""
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, self._process_single_image, image_bytes
        )

    def get_embedding_single(self, image_bytes: bytes) -> Optional[list]:
        """
        Enrollment photo (portrait) → single best face embedding.
        Does NOT tile (enrollment photos are close-up, one face).
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        img = self._decode_image(image_bytes)
        img_up, _ = self._upscale(img, 1.5, 1920)
        faces = self._detect_on_img(img_up)
        if not faces:
            return None
        best = max(faces, key=lambda f: f["det_score"])
        return best["embedding"]

    def match_faces(
        self,
        probe_embeddings: list,
        stored_embeddings: list,
        threshold: float = MATCH_THRESHOLD,
    ) -> list:
        """
        Match probe embeddings against stored student embeddings.
        Batched cosine similarity via numpy (O(P×S), very fast).
        Returns [{"student_id": str, "confidence": float}, ...]
        """
        if not probe_embeddings or not stored_embeddings:
            return []

        probe_arr   = np.array(probe_embeddings, dtype=np.float32)
        stored_vecs = np.array([s["embedding"] for s in stored_embeddings], dtype=np.float32)

        probe_norm  = probe_arr  / (np.linalg.norm(probe_arr,  axis=1, keepdims=True) + 1e-8)
        stored_norm = stored_vecs / (np.linalg.norm(stored_vecs, axis=1, keepdims=True) + 1e-8)

        sim_matrix = probe_norm @ stored_norm.T

        matched: dict[str, float] = {}
        for p_idx in range(len(probe_embeddings)):
            best_s_idx = int(np.argmax(sim_matrix[p_idx]))
            best_sim   = float(sim_matrix[p_idx, best_s_idx])
            if best_sim >= threshold:
                sid = stored_embeddings[best_s_idx]["student_id"]
                if sid not in matched or best_sim > matched[sid]:
                    matched[sid] = round(best_sim, 4)

        return [{"student_id": sid, "confidence": conf} for sid, conf in matched.items()]


face_service = FaceService()
