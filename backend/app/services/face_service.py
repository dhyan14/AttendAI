"""
AttendAI Face Recognition Service
===================================
Optimized for CLASSROOM PHOTOS — students at 2–15 metres from camera.

## Thread Safety (Concurrent Request Fix)

Problem: InsightFace's model.get(img) is NOT thread-safe.
  When 3 teachers submit attendance simultaneously, concurrent calls
  to model.get() corrupt each other's internal buffers → wrong results.

Fix: threading.Lock around model.get() — ONE inference at a time.
  • Simple, zero memory overhead (vs. 3× model pool = OOM risk)
  • All concurrent requests succeed — they just queue through the lock
  • Each inference: ~2s → 3 teachers: ~6-8s each, all get correct results

## Speed per request (1024px frontend pre-resize):
  Step 1 — Decode 1024px JPEG     : ~30 ms
  Step 2 — Mild upscale to 1366px : ~20 ms  (bilinear)
  Step 3 — Single ONNX pass 480px : ~1.5–2 s (serialized through lock)
  Step 4 — NMS                    : <1 ms
  Per image                       : ~2–2.5 s
  3 images per request            : ~6-7 s (images processed in parallel,
                                    inference serialized through lock)
"""

from __future__ import annotations
import threading
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
    InsightFace ArcFace wrapper — single model instance, thread-safe via lock.

    All public inference calls are protected by self._infer_lock so that
    concurrent HTTP requests never call model.get() simultaneously.
    Workers for I/O (decode, encode) run freely in parallel.
    """

    def __init__(self):
        self.model        = None
        self.initialized  = False
        self.load_error: Optional[str] = None
        self._loading     = False
        # Serializes all model.get() calls — the ONLY safe way to share one instance
        self._infer_lock  = threading.Lock()
        # Workers: inference (1 active at a time via lock) + I/O tasks (decode/encode)
        self._executor    = concurrent.futures.ThreadPoolExecutor(
            max_workers=4,
            thread_name_prefix="face_worker",
        )

    # ── Model Loading ─────────────────────────────────────────────────────────

    def _load_model(self):
        """Blocking — runs once in thread pool at startup."""
        import os
        from insightface.app import FaceAnalysis

        MODEL_ROOT = "/app/insightface_models"
        os.environ["INSIGHTFACE_HOME"] = MODEL_ROOT

        print(f"[FaceService] Model root: {MODEL_ROOT}")
        models_dir = os.path.join(MODEL_ROOT, "models", "buffalo_s")
        if os.path.isdir(models_dir):
            print(f"[FaceService] buffalo_s files: {os.listdir(models_dir)}")
        else:
            print(f"[FaceService] ⚠ buffalo_s dir not found at {models_dir}")

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
            self.model       = await loop.run_in_executor(self._executor, self._load_model)
            self.initialized = True
            self.load_error  = None
            print("✅ FaceService ready — thread-safe single model with inference lock")
        except Exception as e:
            import traceback
            self.load_error  = f"{type(e).__name__}: {e}"
            self.initialized = False
            print(f"⚠️ FaceService load failed:\n{traceback.format_exc()}")
        finally:
            self._loading = False

    # ── Image Utilities ───────────────────────────────────────────────────────

    def _decode_image(self, image_bytes: bytes):
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image — unsupported format or corrupted")
        return img

    def _upscale(self, img, factor: float, max_w: int):
        import cv2
        h, w  = img.shape[:2]
        new_w = min(int(w * factor), max_w)
        if new_w <= w:
            return img, 1.0
        new_h = int(h * (new_w / w))
        return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR), new_w / w

    def _iou(self, a, b) -> float:
        x1 = max(a[0], b[0]); y1 = max(a[1], b[1])
        x2 = min(a[2], b[2]); y2 = min(a[3], b[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        return inter / ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter + 1e-6)

    def _nms(self, dets: list, iou_thresh: float = 0.40) -> list:
        if not dets:
            return []
        dets = sorted(dets, key=lambda d: d["det_score"], reverse=True)
        kept = []
        for det in dets:
            if not any(self._iou(det["bbox"], k["bbox"]) > iou_thresh for k in kept):
                kept.append(det)
        return kept

    # ── Core Detection ────────────────────────────────────────────────────────

    def _detect_on_img(self, img) -> list:
        """
        Run InsightFace inference on one image.
        Protected by self._infer_lock — only ONE thread runs this at a time
        across ALL concurrent HTTP requests. Prevents model state corruption.
        """
        with self._infer_lock:        # ← serializes concurrent model calls
            faces = self.model.get(img)

        return [
            {
                "bbox":      face.bbox.tolist(),
                "det_score": float(face.det_score),
                "embedding": face.normed_embedding.tolist(),
            }
            for face in faces
            if face.det_score >= DET_SCORE_THRESH and face.normed_embedding is not None
        ]

    def _single_pass_detect(self, img) -> list:
        """
        Detect faces in one 1024px image using a mild upscale + single ONNX pass.
        """
        h_orig, w_orig = img.shape[:2]

        img_up, up_scale = self._upscale(img, UPSCALE_FACTOR, MAX_DET_WIDTH)
        h_up, w_up = img_up.shape[:2]
        print(f"[FaceService] {w_orig}x{h_orig} → {w_up}x{h_up} (scale={up_scale:.2f})")

        dets = self._detect_on_img(img_up)

        # Remap upscaled coords → original image coords
        for det in dets:
            b = det["bbox"]
            det["bbox"] = [b[0]/up_scale, b[1]/up_scale, b[2]/up_scale, b[3]/up_scale]

        unique = self._nms(dets)
        print(f"[FaceService] {len(dets)} raw → {len(unique)} unique faces")
        return unique

    def _process_single_image(self, image_bytes: bytes) -> list:
        """
        Decode + detect one image. Runs in thread pool executor.
        The inference lock ensures thread safety for concurrent callers.
        Returns list of (bbox, embedding) tuples.
        """
        img   = self._decode_image(image_bytes)
        faces = self._single_pass_detect(img)
        return [(f["bbox"], f["embedding"]) for f in faces]

    # ── Public API ────────────────────────────────────────────────────────────

    def get_embeddings(self, image_bytes: bytes) -> list:
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        return self._process_single_image(image_bytes)

    async def get_embeddings_async(self, image_bytes: bytes) -> list:
        """Async: detection in executor, event loop stays free."""
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, self._process_single_image, image_bytes
        )

    def get_embedding_single(self, image_bytes: bytes) -> Optional[list]:
        """Enrollment portrait → single best face embedding."""
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        img    = self._decode_image(image_bytes)
        img_up, _ = self._upscale(img, 1.5, 1920)
        faces  = self._detect_on_img(img_up)
        if not faces:
            return None
        return max(faces, key=lambda f: f["det_score"])["embedding"]

    def match_faces(
        self,
        probe_embeddings: list,
        stored_embeddings: list,
        threshold: float = MATCH_THRESHOLD,
    ) -> list:
        """
        Batched cosine similarity match — no model needed, no lock needed.
        Pure numpy, fully concurrent-safe.
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
            best_s = int(np.argmax(sim_matrix[p_idx]))
            best_v = float(sim_matrix[p_idx, best_s])
            if best_v >= threshold:
                sid = stored_embeddings[best_s]["student_id"]
                if sid not in matched or best_v > matched[sid]:
                    matched[sid] = round(best_v, 4)

        return [{"student_id": sid, "confidence": c} for sid, c in matched.items()]


face_service = FaceService()
