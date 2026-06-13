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

    def get_embeddings(self, image_bytes: bytes) -> list:
        """Extract face embeddings from image bytes. Returns list of (bbox, embedding) tuples."""
        if not self.initialized:
            raise RuntimeError("Face service not initialized")
        import numpy as np
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        faces = self.model.get(img)
        return [(face.bbox.tolist(), face.normed_embedding.tolist()) for face in faces]


face_service = FaceService()
