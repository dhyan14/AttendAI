FROM python:3.11-slim

WORKDIR /app

# System dependencies for InsightFace + OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    curl \
    unzip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Step 1: Install build prerequisites FIRST
# insightface 0.7.3 Cython extensions break with Cython>=3.0
RUN pip install --no-cache-dir "numpy==1.26.4" "Cython==0.29.37"

# Step 2: Install all other dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Pre-download InsightFace buffalo_s model (bake into image layer) ─────────
# Stores model at /app/insightface_models/models/buffalo_s/
# so at runtime there is ZERO network dependency.
ENV INSIGHTFACE_HOME=/app/insightface_models
RUN python - <<'PYEOF'
import os, urllib.request, zipfile

dest = '/app/insightface_models/models/buffalo_s'
os.makedirs(dest, exist_ok=True)

url = 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip'
zip_path = '/tmp/buffalo_s.zip'

print('Downloading insightface buffalo_s model pack...')
urllib.request.urlretrieve(url, zip_path)
print(f'Downloaded {os.path.getsize(zip_path)} bytes')

with zipfile.ZipFile(zip_path, 'r') as zf:
    members = zf.namelist()
    print(f'ZIP contains: {members}')
    for m in members:
        zf.extract(m, dest)

os.remove(zip_path)
files = os.listdir(dest)
print(f'buffalo_s model files at {dest}: {files}')
assert any(f.endswith('.onnx') for f in files), 'No ONNX files extracted!'
print('buffalo_s model baked into image successfully')
PYEOF

# Copy application code
COPY . .

EXPOSE 8000

# Use sh -c so $PORT is properly expanded at runtime
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
