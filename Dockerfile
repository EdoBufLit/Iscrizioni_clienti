# =========================
# STAGE 1 — Frontend build
# =========================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend .
RUN npm run build


# =========================
# STAGE 2 — Backend
# =========================
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copia il build frontend nel backend
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

ENV FRONTEND_DIST=/app/frontend/dist

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
