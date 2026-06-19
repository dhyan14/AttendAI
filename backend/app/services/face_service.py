"""
AttendAI Face Recognition Service
===================================
Optimized for CLASSROOM PHOTOS — students at 2–15 metres from camera.

Speed-first tuning (target: ≤10 s for up to 3 photos on CPU):
  1. det_size=(480,480)  — 44% fewer pixels vs 640×640, ~2× faster per inference pass
  2. UPSCALE_FACTOR=1.5  — reduced upscale lowers memory pressure and resize time
  3. 1×2 tile grid        — 3 total passes (1 full + 2 tiles) vs old 7 passes (1+6)
     Trade-off: slightly less coverage for extreme-corner far faces, but 2.5× faster
  4. Parallel image processing via ThreadPoolExecutor — all uploaded photos run concurrently
  5. NMS — duplicates from tile overlaps removed via IoU suppression
  6. Lowered det_score threshold to 0.35 for small faces
  7. Multi-angle enrollment — front + left + right embeddings averaged per student
"""

from __future__ import annotations
import numpy as np
import asyncio
import concurrent.futures
from typing import Optional
from app.config import settings

# ─── Module-level constants (importable by other modules) ─────────────────────
MATCH_THRESHOLD   = settings.FACE_RECOGNITION_THRESHOLD  # dynamically loaded threshold (defaults to 0.35)
DET_SIZE          = (640, 640)    # SCRFD detector input resolution (reverted for accuracy)
DET_SCORE_THRESH  = 0.35          # minimum detection confidence
UPSCALE_FACTOR    = 2.0           # upscale before tiled detection (reverted to 2.0x for far faces)
MAX_DET_WIDTH     = 2560          # cap upscaled width
TILE_ROWS, TILE_COLS = 1, 2       # 1×2 grid → 3 total passes (fast and accurate)
TILE_OVERLAP      = 0.20


class FaceService:
    """
    InsightFace ArcFace wrapper with speed-optimized tiled detection.
    Target: ≤ 10 seconds for 3 classroom photos on a CPU server.
    """

    def __init__(self):
        self.model       = None
        self.initialized = False
        self.load_error: Optional[str] = None
        self._loading    = False
        # Use more workers to process photos in parallel
        self._executor   = concurrent.futures.ThreadPoolExecutor(max_workers=6)

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
        # 480×480 is the sweet spot — catches faces at medium-far distance,
        # but is ~2× faster per inference pass than 640×640
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
            print("✅ InsightFace buffalo_s ready — speed-optimized (1×2 tiles, 480px)")
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

    def _upscale(self, img, factor: float):
        """Upscale image for better small-face detection. Caps at MAX_DET_WIDTH."""
        import cv2
        h, w = img.shape[:2]
        new_w = min(int(w * factor), MAX_DET_WIDTH)
        new_h = int(h * (new_w / w))
        if new_w == w:
            return img, 1.0
        # Use INTER_LINEAR (bilinear) instead of LANCZOS4 — significantly faster
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        actual_scale = new_w / w
        return resized, actual_scale

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
        """
        Non-Maximum Suppression to deduplicate faces detected in overlapping tiles.
        detections: list of {"bbox": [x1,y1,x2,y2], "det_score": float, "embedding": list}
        """
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
        Speed-optimized tiled detection pipeline for classroom photos.

        Total inference passes = 3 (1 full-image + 1×2 tiles):
          - Pre-resize to ≤1920px wide (cap before upscale — avoids feeding 12MP into model)
          - Pass 1: Full image at UPSCALE_FACTOR upscale → catches medium-distance faces
          - Pass 2: Left half of upscaled image  → catches left-side far faces
          - Pass 3: Right half of upscaled image → catches right-side far faces
          - NMS to deduplicate overlapping detections
          - CRITICAL: remap bboxes back to ORIGINAL image coordinates before returning
        """
        import cv2
        h_orig, w_orig = img.shape[:2]
        all_detections: list = []

        # ── Pre-resize: cap to 1920px wide BEFORE upscale ─────────────────
        # Without this cap, a 4032×3024 photo gets upscaled to 8064×6048 → very slow.
        # IMPORTANT: track pre_scale so we can map detections back to ORIGINAL coords.
        MAX_INPUT_WIDTH = 1920
        pre_scale = 1.0   # scale factor: pre-resized / original
        if w_orig > MAX_INPUT_WIDTH:
            pre_scale = MAX_INPUT_WIDTH / w_orig
            cap_h = int(h_orig * pre_scale)
            img = cv2.resize(img, (MAX_INPUT_WIDTH, cap_h), interpolation=cv2.INTER_LINEAR)
            new_h, new_w = img.shape[:2]
            print(f"[FaceService] Pre-resized {w_orig}x{h_orig} → {new_w}x{new_h} (pre_scale={pre_scale:.3f})")

        # ── Pass 1: Full image at UPSCALE_FACTOR upscale ─────────────────
        img_up, scale = self._upscale(img, UPSCALE_FACTOR)
        h_up, w_up = img_up.shape[:2]
        print(f"[FaceService] Upscaled to {w_up}x{h_up} (det_scale={scale:.2f})")

        dets_full = self._detect_on_img(img_up)
        for det in dets_full:
            b = det["bbox"]
            # Undo upscale → coords now in pre-resized (1920px) space
            det["bbox"] = [b[0]/scale, b[1]/scale, b[2]/scale, b[3]/scale]
        all_detections.extend(dets_full)

        # ── Pass 2 & 3: 1×2 horizontal tile grid (left + right) ──────────
        tile_w = int(w_up / (TILE_COLS - TILE_OVERLAP * (TILE_COLS - 1)))
        step_w = int(tile_w * (1 - TILE_OVERLAP))

        for col in range(TILE_COLS):
            x1 = min(col * step_w, w_up - tile_w)
            x2 = min(x1 + tile_w, w_up)
            tile = img_up[0:h_up, x1:x2]
            if tile.size == 0:
                continue

            tile_dets = self._detect_on_img(tile)
            for det in tile_dets:
                b = det["bbox"]
                # Undo tile offset + upscale → coords now in pre-resized (1920px) space
                det["bbox"] = [
                    (b[0] + x1) / scale,
                    (b[1]     ) / scale,
                    (b[2] + x1) / scale,
                    (b[3]     ) / scale,
                ]
            all_detections.extend(tile_dets)

        # ── Deduplicate with NMS ───────────────────────────────────────────
        unique = self._nms(all_detections, iou_thresh=0.40)
        print(f"[FaceService] Tiled detection: {len(all_detections)} raw → {len(unique)} unique faces")

        # ── Map back to ORIGINAL image coordinates ─────────────────────────
        # At this point bboxes are in pre-resized 1920px space.
        # Divide by pre_scale to restore full-resolution original coordinates.
        # Without this step, boxes drawn on the 4032px original would be shifted
        # to the upper-left (placed as if the image were only 1920px wide).
        if pre_scale != 1.0:
            for det in unique:
                b = det["bbox"]
                det["bbox"] = [
                    b[0] / pre_scale,
                    b[1] / pre_scale,
                    b[2] / pre_scale,
                    b[3] / pre_scale,
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
        Returns list of (bbox, embedding_list) tuples.
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        return self._process_single_image(image_bytes)

    async def get_embeddings_async(self, image_bytes: bytes) -> list:
        """
        Async version: runs detection in the thread pool so the event loop stays free.
        Use this from async FastAPI endpoints for best throughput.
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
        # For enrollment: just upscale and run single pass (portrait, one face)
        img_up, _ = self._upscale(img, 1.5)
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
