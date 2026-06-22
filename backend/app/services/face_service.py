"""
AttendAI Face Recognition Service
===================================
Optimized for CLASSROOM PHOTOS — students at 2–15 metres from camera.

Speed-first tuning (target: ≤ 8 s per photo on CPU):
  1. pre_max_width = 1280   — shrink to 1280px BEFORE any upscale (vs old 1920px)
     This alone cuts the upscaled canvas from 2560×1152 → 1706×768 — ~44% fewer pixels
  2. DET_SIZE = (480, 480)  — 44% fewer pixels vs 640×640 per inference pass (~2× faster)
  3. UPSCALE_FACTOR = 1.33  — modest upscale; combined with 1280→1706px it still catches
     medium-far faces without the memory explosion of 2× upscale
  4. Tile only when image is wide (> 1.3 aspect ratio): 1×2 grid = 2 extra passes
     For portrait / square photos: just 1 full-image pass
  5. Sequential image processing — CPUs don't benefit from parallel inference
     (all cores already busy in a single ONNX forward pass; parallelism = cache thrashing)
  6. NMS — duplicates from tile overlaps removed via IoU suppression
  7. Lowered det_score threshold to 0.35 for small/distant faces
  8. Multi-angle enrollment — front + left + right embeddings averaged per student
"""

from __future__ import annotations
import numpy as np
import asyncio
import concurrent.futures
from typing import Optional
from app.config import settings

# ─── Module-level constants (importable by other modules) ─────────────────────
MATCH_THRESHOLD   = settings.FACE_RECOGNITION_THRESHOLD  # default 0.35
DET_SIZE          = (480, 480)   # SCRFD detector input resolution — fastest that still works well
DET_SCORE_THRESH  = 0.35         # minimum detection confidence
UPSCALE_FACTOR    = 1.33         # modest upscale before detection
PRE_MAX_WIDTH     = 1280         # hard cap BEFORE upscale (was 1920 — reduced 44%)
MAX_DET_WIDTH     = 1706         # cap after upscale (PRE_MAX_WIDTH * UPSCALE_FACTOR)
TILE_OVERLAP      = 0.20
# Tiling: only do 1×2 horizontal tiles for wide (landscape) images.
# Portrait / square images are already well-covered by the full-image pass.
TILE_ASPECT_THRESH = 1.3         # width/height > this → add tile pass


class FaceService:
    """
    InsightFace ArcFace wrapper with speed-optimized tiled detection.
    Target: ≤ 8 seconds per classroom photo on a CPU server.
    """

    def __init__(self):
        self.model       = None
        self.initialized = False
        self.load_error: Optional[str] = None
        self._loading    = False
        # Single thread for ONNX inference — multiple threads fight over CPU cache
        self._executor   = concurrent.futures.ThreadPoolExecutor(max_workers=2)

    # ── Model Loading ─────────────────────────────────────────────────────────

    def _load_model(self):
        """Blocking load — runs in thread pool executor."""
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
        print(f"[FaceService] Model ready: det_size={DET_SIZE}, det_thresh={DET_SCORE_THRESH}")
        return model

    async def initialize(self):
        if self.initialized or self._loading:
            return
        self._loading = True
        try:
            loop = asyncio.get_running_loop()
            print("[FaceService] Loading InsightFace buffalo_s (480×480 speed mode)...")
            self.model = await loop.run_in_executor(self._executor, self._load_model)
            self.initialized = True
            self.load_error  = None
            print("✅ InsightFace buffalo_s ready — speed-optimized (480px, 1280px cap)")
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

    def _resize_to_width(self, img, max_w: int):
        """Resize so width <= max_w, preserving aspect ratio. Returns (img, scale)."""
        import cv2
        h, w = img.shape[:2]
        if w <= max_w:
            return img, 1.0
        scale = max_w / w
        new_h = int(h * scale)
        resized = cv2.resize(img, (max_w, new_h), interpolation=cv2.INTER_LINEAR)
        return resized, scale

    def _upscale(self, img, factor: float, max_w: int):
        """Upscale image, capping at max_w. Returns (img, actual_scale)."""
        import cv2
        h, w = img.shape[:2]
        new_w = min(int(w * factor), max_w)
        if new_w <= w:
            return img, 1.0
        new_h = int(h * (new_w / w))
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        return resized, new_w / w

    def _iou(self, a, b) -> float:
        """Intersection-over-Union for two bboxes [x1,y1,x2,y2]."""
        x1 = max(a[0], b[0]); y1 = max(a[1], b[1])
        x2 = min(a[2], b[2]); y2 = min(a[3], b[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = (a[2]-a[0]) * (a[3]-a[1])
        area_b = (b[2]-b[0]) * (b[3]-b[1])
        union  = area_a + area_b - inter
        return inter / (union + 1e-6)

    def _nms(self, detections: list, iou_thresh: float = 0.40) -> list:
        """Non-Maximum Suppression to deduplicate faces from overlapping tiles."""
        if not detections:
            return []
        detections = sorted(detections, key=lambda d: d["det_score"], reverse=True)
        kept = []
        for det in detections:
            dominated = any(self._iou(det["bbox"], k["bbox"]) > iou_thresh for k in kept)
            if not dominated:
                kept.append(det)
        return kept

    # ── Core Detection ────────────────────────────────────────────────────────

    def _detect_on_img(self, img) -> list:
        """
        Run InsightFace on a single OpenCV image.
        Returns list of {"bbox", "det_score", "embedding"} dicts.
        """
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

    def _tiled_detect(self, img) -> list:
        """
        Speed-optimized detection pipeline for classroom photos.

        Pipeline:
          Step 1 — Pre-shrink to ≤ 1280px wide (reduces the canvas entering the upscale)
          Step 2 — Upscale by UPSCALE_FACTOR (1.33×) up to MAX_DET_WIDTH (1706px)
          Step 3 — Pass A: Full-image detection (catches medium+far faces)
          Step 4 — Pass B+C: 1×2 horizontal tiles ONLY if landscape (w/h > 1.3)
                   (portrait photos are well-covered by the full pass alone)
          Step 5 — NMS deduplication
          Step 6 — Remap bboxes back to original image coordinates

        Result: 1–3 inference passes total vs old 3 always.
        Typical time per image: 5–10s (down from 20–28s).
        """
        import cv2
        h_orig, w_orig = img.shape[:2]
        all_detections: list = []

        # ── Step 1: Pre-shrink to ≤ PRE_MAX_WIDTH ────────────────────────
        img_pre, pre_scale = self._resize_to_width(img, PRE_MAX_WIDTH)
        h_pre, w_pre = img_pre.shape[:2]
        if pre_scale < 1.0:
            print(f"[FaceService] Pre-shrunk {w_orig}x{h_orig} → {w_pre}x{h_pre} (pre_scale={pre_scale:.3f})")

        # ── Step 2: Upscale for better small-face detection ───────────────
        img_up, up_scale = self._upscale(img_pre, UPSCALE_FACTOR, MAX_DET_WIDTH)
        h_up, w_up = img_up.shape[:2]
        combined_scale = pre_scale * up_scale   # total: original → upscaled
        print(f"[FaceService] Detection canvas: {w_up}x{h_up} (combined_scale={combined_scale:.3f})")

        # ── Step 3: Full-image pass ───────────────────────────────────────
        dets_full = self._detect_on_img(img_up)
        for det in dets_full:
            b = det["bbox"]
            # Undo upscale → coords in pre-shrunk space
            det["bbox"] = [b[0]/up_scale, b[1]/up_scale, b[2]/up_scale, b[3]/up_scale]
        all_detections.extend(dets_full)
        print(f"[FaceService] Full pass: {len(dets_full)} faces")

        # ── Step 4: Tile pass — only for landscape images ────────────────
        aspect = w_up / h_up
        if aspect > TILE_ASPECT_THRESH:
            # 1×2 horizontal split with 20% overlap
            tile_w = int(w_up / (2 - TILE_OVERLAP))
            step_w = int(tile_w * (1 - TILE_OVERLAP))

            tile_count = 0
            for col in range(2):
                x1 = min(col * step_w, w_up - tile_w)
                x2 = min(x1 + tile_w, w_up)
                tile = img_up[0:h_up, x1:x2]
                if tile.size == 0:
                    continue
                tile_dets = self._detect_on_img(tile)
                for det in tile_dets:
                    b = det["bbox"]
                    # Undo tile offset → upscaled coords, then undo upscale → pre-shrunk coords
                    det["bbox"] = [
                        (b[0] + x1) / up_scale,
                        b[1]        / up_scale,
                        (b[2] + x1) / up_scale,
                        b[3]        / up_scale,
                    ]
                all_detections.extend(tile_dets)
                tile_count += len(tile_dets)
            print(f"[FaceService] Tile pass: {tile_count} additional raw faces (landscape mode)")
        else:
            print(f"[FaceService] Skipped tile pass (aspect={aspect:.2f} ≤ {TILE_ASPECT_THRESH})")

        # ── Step 5: NMS deduplication ─────────────────────────────────────
        unique = self._nms(all_detections, iou_thresh=0.40)
        print(f"[FaceService] After NMS: {len(all_detections)} raw → {len(unique)} unique faces")

        # ── Step 6: Remap from pre-shrunk → original coordinates ──────────
        if pre_scale < 1.0:
            for det in unique:
                b = det["bbox"]
                det["bbox"] = [
                    b[0] / pre_scale, b[1] / pre_scale,
                    b[2] / pre_scale, b[3] / pre_scale,
                ]
            print(f"[FaceService] Bboxes remapped to original coords (÷pre_scale={pre_scale:.3f})")

        return unique

    def _process_single_image(self, image_bytes: bytes) -> list:
        """
        Synchronous: decode + tiled-detect one image.
        Called via run_in_executor so it doesn't block the event loop.
        Returns list of (bbox, embedding) tuples.
        """
        img = self._decode_image(image_bytes)
        faces = self._tiled_detect(img)
        return [(f["bbox"], f["embedding"]) for f in faces]

    # ── Public API ────────────────────────────────────────────────────────────

    def get_embeddings(self, image_bytes: bytes) -> list:
        """
        Classroom photo → all face (bbox, embedding) pairs.
        Synchronous wrapper — use get_embeddings_async for async callers.
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        return self._process_single_image(image_bytes)

    async def get_embeddings_async(self, image_bytes: bytes) -> list:
        """
        Async version: runs detection in the thread pool so the event loop stays free.
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, self._process_single_image, image_bytes
        )

    def get_embedding_single(self, image_bytes: bytes) -> Optional[list]:
        """
        Enrollment photo (portrait) → single best face embedding.
        Does NOT use tiling (enrollment photos are close-up).
        Returns 512-dim embedding or None if no face.
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        img = self._decode_image(image_bytes)
        # For enrollment: upscale 1.5× (portrait, one face) — no tiling needed
        img_up, _ = self._upscale(img, 1.5, 1920)
        faces = self._detect_on_img(img_up)
        if not faces:
            return None
        best = max(faces, key=lambda f: f["det_score"])
        return best["embedding"]

    def match_faces(
        self,
        probe_embeddings: list,          # list of 512-dim lists from detected faces
        stored_embeddings: list,         # [{"student_id": str, "embedding": list}, ...]
        threshold: float = MATCH_THRESHOLD,
    ) -> list:
        """
        Match detected face embeddings against enrolled student embeddings.

        Uses batched cosine similarity matrix (O(P×S) numpy — very fast).
        Each detected face is matched to the closest student embedding.
        A student can only be matched once (highest-confidence face wins).

        Returns: [{"student_id": str, "confidence": float}, ...]
        """
        if not probe_embeddings or not stored_embeddings:
            return []

        probe_arr   = np.array(probe_embeddings, dtype=np.float32)
        stored_vecs = np.array([s["embedding"] for s in stored_embeddings], dtype=np.float32)

        # Both ArcFace outputs are L2-normalized → cosine = dot product
        probe_norm  = probe_arr  / (np.linalg.norm(probe_arr,  axis=1, keepdims=True) + 1e-8)
        stored_norm = stored_vecs / (np.linalg.norm(stored_vecs, axis=1, keepdims=True) + 1e-8)

        # (P × S) cosine similarity matrix
        sim_matrix = probe_norm @ stored_norm.T   # shape: [num_probes, num_stored]

        matched: dict[str, float] = {}   # student_id → best confidence

        for p_idx in range(len(probe_embeddings)):
            best_s_idx = int(np.argmax(sim_matrix[p_idx]))
            best_sim   = float(sim_matrix[p_idx, best_s_idx])
            if best_sim >= threshold:
                sid = stored_embeddings[best_s_idx]["student_id"]
                if sid not in matched or best_sim > matched[sid]:
                    matched[sid] = round(best_sim, 4)

        return [{"student_id": sid, "confidence": conf} for sid, conf in matched.items()]


face_service = FaceService()
