import numpy as np
from typing import Optional


class FaceService:
    """InsightFace wrapper — initialized on app startup."""

    def __init__(self):
        self.model = None
        self.initialized = False

    async def initialize(self):
        """Load InsightFace buffalo_l model. Called once at startup."""
        try:
            import insightface
            from insightface.app import FaceAnalysis
            self.model = FaceAnalysis(
                name="buffalo_l",
                providers=["CPUExecutionProvider"]
            )
            self.model.prepare(ctx_id=-1, det_size=(640, 640))
            self.initialized = True
            print("✅ InsightFace buffalo_l model ready")
        except Exception as e:
            print(f"⚠️ InsightFace load failed: {e}")
            self.initialized = False

    def _decode_image(self, image_bytes: bytes):
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

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
        probe_embeddings: list[list[float]],
        stored_embeddings: list[dict],   # [{"student_id": str, "embedding": list[float], ...}]
        threshold: float = 0.45,
    ) -> list[dict]:
        """
        Match detected faces from a classroom image against stored student embeddings.

        Args:
            probe_embeddings: list of embedding vectors detected in the classroom image
            stored_embeddings: list of dicts with student_id + embedding vector
            threshold: cosine similarity threshold (higher = stricter match)

        Returns:
            list of {"student_id": str, "confidence": float} for matched students.
            Deduplicates: each student appears at most once (highest confidence).
        """
        if not probe_embeddings or not stored_embeddings:
            return []

        probe_arr   = np.array(probe_embeddings, dtype=np.float32)   # (P, 512)
        stored_vecs = np.array(
            [s["embedding"] for s in stored_embeddings], dtype=np.float32
        )  # (S, 512)

        # Normalize (embeddings from InsightFace are already unit-norm, but be safe)
        probe_norm  = probe_arr  / (np.linalg.norm(probe_arr,  axis=1, keepdims=True) + 1e-8)
        stored_norm = stored_vecs / (np.linalg.norm(stored_vecs, axis=1, keepdims=True) + 1e-8)

        # (P, S) cosine similarity matrix
        sim_matrix = probe_norm @ stored_norm.T

        matched: dict[str, float] = {}   # student_id → best confidence

        for p_idx in range(len(probe_embeddings)):
            best_s_idx  = int(np.argmax(sim_matrix[p_idx]))
            best_sim    = float(sim_matrix[p_idx, best_s_idx])
            if best_sim >= threshold:
                sid = stored_embeddings[best_s_idx]["student_id"]
                # Keep the highest confidence match per student
                if sid not in matched or best_sim > matched[sid]:
                    matched[sid] = round(best_sim, 4)

        return [{"student_id": sid, "confidence": conf} for sid, conf in matched.items()]

    def cosine_sim(self, a: list[float], b: list[float]) -> float:
        """Utility: cosine similarity between two vectors."""
        va = np.array(a, dtype=np.float32)
        vb = np.array(b, dtype=np.float32)
        denom = np.linalg.norm(va) * np.linalg.norm(vb)
        return float(np.dot(va, vb) / (denom + 1e-8))


face_service = FaceService()
