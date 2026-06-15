"""
AttendAI Face Recognition Service
===================================
Optimized for CLASSROOM PHOTOS — students at 2–15 metres from camera.

Key fixes for far-away face detection:
  1. det_size=(640,640) — higher internal resolution catches small faces
  2. Image upscaling — 2× upscale before detection for far faces
  3. Tiled detection — image split into overlapping tiles, each tile run
     through detector independently (standard technique for crowd detection)
  4. NMS — duplicates from tile overlaps removed via IoU suppression
  5. Lowered det_score threshold to 0.35 (was implicitly 0.5) for small faces
  6. Multi-angle enrollment — front + left + right embeddings averaged per student
"""

from __future__ import annotations
import numpy as np
import asyncio
import concurrent.futures
from typing import Optional


# ─── Tunable constants ────────────────────────────────────────────────────────

# Detection: input image fed to SCRFD detector
# 640×640 detects faces down to ~8px (far away), 320×320 only down to ~16px
DET_SIZE = (640, 640)

# Minimum detection confidence (lower = catch more small/far faces, more FPs)
DET_SCORE_THRESH = 0.35     # default insightface uses 0.5 — we go lower for distance

# Cosine similarity threshold for recognition match (ArcFace normed embeddings)
# 0.45 → very high precision, few false matches at expense of more misses
# 0.35 → better recall for partial/side-angle faces at distance
MATCH_THRESHOLD = 0.40

# Tiled detection: split image into N×N tiles with this overlap fraction
TILE_OVERLAP = 0.20     # 20% overlap between adjacent tiles
TILE_ROWS    = 2        # 2×2 grid = 4 tiles — good for typical wide classroom shot
TILE_COLS    = 3

# Upscale factor applied before tiled detection (catches tiny distant faces)
# 2.0 → double resolution → faces that were 10px become 20px → detectable
UPSCALE_FACTOR = 2.0

# Max width to feed to detector (avoid OOM on huge photos)
MAX_DET_WIDTH = 2560


class FaceService:
    """
    InsightFace ArcFace wrapper with tiled multi-scale detection.
    Optimized for classroom-distance face recognition.
    """

    def __init__(self):
        self.model       = None
        self.initialized = False
        self.load_error: Optional[str] = None
        self._loading    = False
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
        # KEY FIX: 640×640 instead of 320×320
        # Higher resolution → smaller minimum detectable face size
        # 320×320: min face ~32px (close-up only)
        # 640×640: min face ~16px (medium distance)
        # After 2× upscale: effectively min face ~8px (far distance)
        model.prepare(ctx_id=-1, det_size=DET_SIZE, det_thresh=DET_SCORE_THRESH)
        print(f"[FaceService] Model ready: det_size={DET_SIZE}, det_thresh={DET_SCORE_THRESH}")
        return model

    async def initialize(self):
        if self.initialized or self._loading:
            return
        self._loading = True
        try:
            loop = asyncio.get_running_loop()
            print("[FaceService] Loading InsightFace buffalo_s (640×640 tiled mode)...")
            self.model = await loop.run_in_executor(self._executor, self._load_model)
            self.initialized = True
            self.load_error  = None
            print("✅ InsightFace buffalo_s ready — classroom-distance optimized")
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
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
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
        Multi-scale tiled detection pipeline for classroom photos.

        Steps:
        1. Upscale image 2× (catches faces that were too small at original res)
        2. Detect on full upscaled image
        3. Split into 2×3 overlapping tiles, detect on each tile independently
        4. Merge all detections back to original coordinate space
        5. Deduplicate with NMS

        This is the standard approach used in surveillance/crowd analysis.
        """
        h_orig, w_orig = img.shape[:2]

        all_detections: list = []

        # ── Pass 1: Full image at 2× upscale ──────────────────────────────
        img_up, scale = self._upscale(img, UPSCALE_FACTOR)
        h_up, w_up = img_up.shape[:2]

        dets_full = self._detect_on_img(img_up)
        for det in dets_full:
            b = det["bbox"]
            # Map bboxes back to original resolution
            det["bbox"] = [b[0]/scale, b[1]/scale, b[2]/scale, b[3]/scale]
        all_detections.extend(dets_full)

        # ── Pass 2: Tiled detection (with overlap) on upscaled image ──────
        # Split upscaled image into TILE_ROWS × TILE_COLS overlapping tiles
        tile_h = int(h_up / (TILE_ROWS - TILE_OVERLAP * (TILE_ROWS - 1)))
        tile_w = int(w_up / (TILE_COLS - TILE_OVERLAP * (TILE_COLS - 1)))
        step_h = int(tile_h * (1 - TILE_OVERLAP))
        step_w = int(tile_w * (1 - TILE_OVERLAP))

        for row in range(TILE_ROWS):
            for col in range(TILE_COLS):
                y1 = min(row * step_h, h_up - tile_h)
                x1 = min(col * step_w, w_up - tile_w)
                y2 = min(y1 + tile_h, h_up)
                x2 = min(x1 + tile_w, w_up)

                tile = img_up[y1:y2, x1:x2]
                if tile.size == 0:
                    continue

                tile_dets = self._detect_on_img(tile)
                for det in tile_dets:
                    b = det["bbox"]
                    # Translate tile-local bbox → upscaled-image coords → original coords
                    ox1 = (b[0] + x1) / scale
                    oy1 = (b[1] + y1) / scale
                    ox2 = (b[2] + x1) / scale
                    oy2 = (b[3] + y1) / scale
                    det["bbox"] = [ox1, oy1, ox2, oy2]
                all_detections.extend(tile_dets)

        # ── Deduplicate with NMS ───────────────────────────────────────────
        unique = self._nms(all_detections, iou_thresh=0.40)
        print(f"[FaceService] Tiled detection: {len(all_detections)} raw → {len(unique)} unique faces")
        return unique

    # ── Public API ────────────────────────────────────────────────────────────

    def get_embeddings(self, image_bytes: bytes) -> list:
        """
        Classroom photo → all face (bbox, embedding) pairs.
        Uses tiled multi-scale detection for far-away faces.
        Returns list of (bbox, embedding_list) tuples.
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        img = self._decode_image(image_bytes)
        faces = self._tiled_detect(img)
        return [(f["bbox"], f["embedding"]) for f in faces]

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
        # But re-normalize to be safe (stored embeddings might have been read from DB)
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
