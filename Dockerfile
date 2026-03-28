# ── Stage 1: build the React SPA ──────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /frontend
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python application ───────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Overwrite frontend dir with only the built assets from stage 1
COPY --from=frontend-build /frontend/dist /app/frontend/dist

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
