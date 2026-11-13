# The whole site in one image: the API (backend/) and the pages it serves
# (index.html, styles.css, frontend/). docker-compose.yml builds it for local
# work, and Render builds it for the test site (render.yaml).
FROM python:3.13-slim
WORKDIR /workspace/backend
ENV CARDMATICA_ROOT=/workspace PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/workspace/backend
COPY backend/ ./
RUN pip install --no-cache-dir -c requirements.lock . \
    && useradd --create-home --uid 10001 cardmatica \
    && mkdir -p /data/cache /data/images \
    && chown -R cardmatica:cardmatica /data
COPY index.html styles.css /workspace/
COPY frontend /workspace/frontend
USER cardmatica
EXPOSE 8000
# On every start: the database schema up to date and the bundled banlists in,
# then the site. PORT comes from the host (Render sets it); 8000 otherwise.
CMD ["sh", "-c", "alembic upgrade head && cardmatica import-banlist && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
