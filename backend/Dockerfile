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
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Step 1: Install build prerequisites FIRST
# insightface 0.7.3 Cython extensions break with Cython>=3.0
RUN pip install --no-cache-dir "numpy==1.26.4" "Cython==0.29.37"

# Step 2: Install all other dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

# Shell form so $PORT env variable is expanded by Railway
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
