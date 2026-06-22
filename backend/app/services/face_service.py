"""
AttendAI Face Recognition Service
===================================
Optimized for CLASSROOM PHOTOS — students at 2–15 metres from camera.

## Architecture: Model Pool (thread-safe, concurrent-request-safe)

Problem solved: InsightFace's FaceAnalysis is NOT thread-safe.
Calling self.model.get(img) from multiple threads simultaneously
corrupts internal buffers → wrong/empty results for requests 2 & 3.

Solution: MODEL POOL
  - POOL_SIZE model instances are created at startup
  - Stored in a thread-safe queue.Queue
  - Each image detection grabs ONE model instance, uses it, returns it
  - Multiple concurrent requests each get their own model → truly parallel
  - If all models are busy, extra requests block until one is free

With POOL_SIZE=3:
  - Teacher A, B, C all submit attendance simultaneously
  - Each gets their own model instance immediately
  - All 3 complete in ~6-8s (parallel!) instead of ~18s (sequential)
  - A 4th teacher waits ~2s for a model to free up → graceful queuing

## Speed (per request, 1024px frontend pre-resize):
  Step 1 — Decode 1024px JPEG     : ~30 ms
  Step 2 — Mild upscale to 1366px : ~20 ms  (bilinear)
  Step 3 — Single ONNX pass 480px : ~1.5–2 s on CPU (exclusive model)
  Step 4 — NMS                    : <1 ms
  Total                           : ~2–2.5 s per image

## Memory per model instance (buffalo_s):
  SCRFD detection  : ~25 MB
  ArcFace recog.   : ~87 MB
  Total            : ~112 MB × 3 instances = ~336 MB
"""

from __future__ import annotations
import queue as _queue
import numpy as np
import asyncio
import concurrent.futures
import threading
from typing import Optional
from app.config import settings

# ─── Module-level constants ───────────────────────────────────────────────────
MATCH_THRESHOLD   = settings.FACE_RECOGNITION_THRESHOLD  # default 0.35
DET_SIZE          = (480, 480)   # SCRFD detector input size — fastest viable
DET_SCORE_THRESH  = 0.35         # minimum detection confidence
UPSCALE_FACTOR    = 1.33         # mild upscale: 1024px → 1362px
MAX_DET_WIDTH     = 1400         # hard cap after upscale
POOL_SIZE         = 3            # number of model instances (= max parallel inferences)


class FaceService:
    """
    InsightFace ArcFace wrapper with a model pool for concurrent-request safety.

    Key guarantee: each call to self.model.get(img) always uses a
    dedicated model instance — no shared state, no corruption under
    concurrent load from multiple HTTP requests.
    """

    def __init__(self):
        self._pool: _queue.Queue = _queue.Queue()   # pool of FaceAnalysis instances
        self.initialized  = False
        self.load_error: Optional[str] = None
        self._loading     = False
        self._init_lock   = threading.Lock()
        # Workers: POOL_SIZE for inference + 2 extras for encode/decode I/O
        self._executor    = concurrent.futures.ThreadPoolExecutor(
            max_workers=POOL_SIZE + 2,
            thread_name_prefix="face_worker",
        )

    # ── Model Loading ─────────────────────────────────────────────────────────

    def _create_model_instance(self) -> object:
        """
        Create ONE InsightFace FaceAnalysis instance.
        Called POOL_SIZE times — each instance is independent.
        """
        import os
        from insightface.app import FaceAnalysis

        MODEL_ROOT = "/app/insightface_models"
        os.environ["INSIGHTFACE_HOME"] = MODEL_ROOT

        model = FaceAnalysis(
            name="buffalo_s",
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"],
            root=MODEL_ROOT,
        )
        model.prepare(ctx_id=-1, det_size=DET_SIZE, det_thresh=DET_SCORE_THRESH)
        return model

    def _load_pool(self):
        """
        Blocking: load POOL_SIZE model instances and fill the pool queue.
        Runs once in thread pool at startup.
        """
        import os
        MODEL_ROOT = "/app/insightface_models"
        models_dir = os.path.join(MODEL_ROOT, "models", "buffalo_s")
        print(f"[FaceService] Loading {POOL_SIZE} model instances…")
        if os.path.isdir(models_dir):
            print(f"[FaceService] buffalo_s files: {os.listdir(models_dir)}")

        for i in range(POOL_SIZE):
            m = self._create_model_instance()
            self._pool.put(m)
            print(f"[FaceService] ✓ Model instance {i+1}/{POOL_SIZE} ready")

    async def initialize(self):
        with self._init_lock:
            if self.initialized or self._loading:
                return
            self._loading = True

        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(self._executor, self._load_pool)
            self.initialized = True
            self.load_error  = None
            print(f"✅ FaceService: {POOL_SIZE} model instances ready (concurrent-safe)")
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
        h, w   = img.shape[:2]
        new_w  = min(int(w * factor), max_w)
        if new_w <= w:
            return img, 1.0
        new_h  = int(h * (new_w / w))
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

    # ── Core Detection (model passed explicitly — never shared between calls) ─

    def _detect_on_img(self, model, img) -> list:
        """
        Run InsightFace on one image using the GIVEN model instance.
        The model instance is exclusively owned by the calling thread
        (acquired from pool, not returned until this call is complete).
        Thread-safe by construction: no shared model state.
        """
        faces = model.get(img)
        return [
            {
                "bbox":      face.bbox.tolist(),
                "det_score": float(face.det_score),
                "embedding": face.normed_embedding.tolist(),
            }
            for face in faces
            if face.det_score >= DET_SCORE_THRESH and face.normed_embedding is not None
        ]

    def _single_pass_detect(self, model, img) -> list:
        """
        Detect faces in one 1024px image using a mild upscale.
        Model instance is passed explicitly (pool-managed).
        """
        h_orig, w_orig = img.shape[:2]

        img_up, up_scale = self._upscale(img, UPSCALE_FACTOR, MAX_DET_WIDTH)
        h_up, w_up = img_up.shape[:2]
        print(f"[FaceService] {w_orig}x{h_orig} → {w_up}x{h_up} (scale={up_scale:.2f})")

        dets = self._detect_on_img(model, img_up)

        # Remap upscaled coords → original coords
        for det in dets:
            b = det["bbox"]
            det["bbox"] = [b[0]/up_scale, b[1]/up_scale, b[2]/up_scale, b[3]/up_scale]

        unique = self._nms(dets)
        print(f"[FaceService] {len(dets)} raw → {len(unique)} unique faces")
        return unique

    def _process_single_image(self, image_bytes: bytes) -> list:
        """
        Decode + detect one image.
        Acquires a model from the pool → exclusive use → releases on completion.
        Called via run_in_executor (non-blocking for the event loop).

        Concurrency guarantee: multiple threads may call this simultaneously.
        Each gets its own model instance from the pool.
        Pool blocks (thread sleeps) if all instances are busy — no data corruption.
        """
        model = self._pool.get()     # ← blocks until a model is available
        try:
            img   = self._decode_image(image_bytes)
            faces = self._single_pass_detect(model, img)
            return [(f["bbox"], f["embedding"]) for f in faces]
        finally:
            self._pool.put(model)    # ← always released, even on exception

    # ── Public API ────────────────────────────────────────────────────────────

    def get_embeddings(self, image_bytes: bytes) -> list:
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        return self._process_single_image(image_bytes)

    async def get_embeddings_async(self, image_bytes: bytes) -> list:
        """Async: runs detection in executor, event loop stays free."""
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, self._process_single_image, image_bytes
        )

    def get_embedding_single(self, image_bytes: bytes) -> Optional[list]:
        """Enrollment photo → single best face embedding (portrait, one face)."""
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        model = self._pool.get()
        try:
            img    = self._decode_image(image_bytes)
            img_up, _ = self._upscale(img, 1.5, 1920)
            faces  = self._detect_on_img(model, img_up)
            if not faces:
                return None
            return max(faces, key=lambda f: f["det_score"])["embedding"]
        finally:
            self._pool.put(model)

    def match_faces(
        self,
        probe_embeddings: list,
        stored_embeddings: list,
        threshold: float = MATCH_THRESHOLD,
    ) -> list:
        """
        Match probe embeddings against stored student embeddings.
        Batched cosine similarity via numpy — no model needed, no pool needed.
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
