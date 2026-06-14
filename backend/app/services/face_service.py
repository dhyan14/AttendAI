import numpy as np
import asyncio
import concurrent.futures
from typing import Optional


class FaceService:
    """InsightFace wrapper — lazily initialized on first use."""

    def __init__(self):
        self.model = None
        self.initialized = False
        self.load_error: Optional[str] = None
        self._loading = False  # guard against concurrent init calls
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

    def _load_model(self):
        """Blocking model load — runs in a thread pool."""
        import os
        import traceback as tb

        # Use the models baked into the image at build time (no runtime download needed)
        MODEL_ROOT = "/app/insightface_models"
        os.environ["INSIGHTFACE_HOME"] = MODEL_ROOT

        print(f"[FaceService] Model root: {MODEL_ROOT}")
        # Print what files are present so we can diagnose missing-file issues in Railway logs
        models_dir = os.path.join(MODEL_ROOT, "models", "buffalo_s")
        if os.path.isdir(models_dir):
            files = os.listdir(models_dir)
            print(f"[FaceService] buffalo_s files: {files}")
        else:
            print(f"[FaceService] ⚠ buffalo_s dir not found at {models_dir}")

        from insightface.app import FaceAnalysis
        model = FaceAnalysis(
            name="buffalo_s",
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"],
            root=MODEL_ROOT,
        )
        model.prepare(ctx_id=-1, det_size=(320, 320))
        return model

    async def initialize(self):
        """Load InsightFace buffalo_s model in a thread (non-blocking).
        Uses get_running_loop() which works correctly in Python 3.10+.
        Guards against concurrent init calls.
        """
        if self.initialized or self._loading:
            return
        self._loading = True
        try:
            loop = asyncio.get_running_loop()
            print("[FaceService] Loading InsightFace buffalo_s model...")
            self.model = await loop.run_in_executor(self._executor, self._load_model)
            self.initialized = True
            self.load_error = None
            print("✅ InsightFace buffalo_s model ready")
        except Exception as e:
            import traceback
            full_tb = traceback.format_exc()
            self.load_error = f"{type(e).__name__}: {e}"
            self.initialized = False
            print(f"⚠️ InsightFace load failed:\n{full_tb}")
        finally:
            self._loading = False


    def _decode_image(self, image_bytes: bytes):
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image — unsupported format or corrupted file")
        return img

    def get_embeddings(self, image_bytes: bytes) -> list:
        """
        Extract ALL face embeddings from an image (for classroom photos).
        Returns list of (bbox, embedding_list) tuples.
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        img = self._decode_image(image_bytes)
        faces = self.model.get(img)
        return [(face.bbox.tolist(), face.normed_embedding.tolist()) for face in faces]

    def get_embedding_single(self, image_bytes: bytes) -> Optional[list]:
        """
        Extract a single face embedding from a portrait image (for registration).
        Returns the embedding of the largest/best face, or None if no face found.
        """
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        img = self._decode_image(image_bytes)
        faces = self.model.get(img)
        if not faces:
            return None
        # Pick the face with the largest bounding box area
        best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return best.normed_embedding.tolist()

    def match_faces(
        self,
        probe_embeddings: list,
        stored_embeddings: list,   # [{"student_id": str, "embedding": list[float], ...}]
        threshold: float = 0.40,
    ) -> list:
        """
        Match detected faces against stored student embeddings using cosine similarity.
        Returns list of {"student_id": str, "confidence": float} for matched students.
        """
        if not probe_embeddings or not stored_embeddings:
            return []

        probe_arr   = np.array(probe_embeddings, dtype=np.float32)
        stored_vecs = np.array(
            [s["embedding"] for s in stored_embeddings], dtype=np.float32
        )

        # Normalize rows to unit vectors
        probe_norm  = probe_arr  / (np.linalg.norm(probe_arr,  axis=1, keepdims=True) + 1e-8)
        stored_norm = stored_vecs / (np.linalg.norm(stored_vecs, axis=1, keepdims=True) + 1e-8)

        # (P, S) cosine similarity matrix
        sim_matrix = probe_norm @ stored_norm.T

        matched: dict = {}   # student_id → best confidence

        for p_idx in range(len(probe_embeddings)):
            best_s_idx = int(np.argmax(sim_matrix[p_idx]))
            best_sim   = float(sim_matrix[p_idx, best_s_idx])
            if best_sim >= threshold:
                sid = stored_embeddings[best_s_idx]["student_id"]
                if sid not in matched or best_sim > matched[sid]:
                    matched[sid] = round(best_sim, 4)

        return [{"student_id": sid, "confidence": conf} for sid, conf in matched.items()]


face_service = FaceService()
