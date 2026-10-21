FROM python:3.13-slim
WORKDIR /workspace/backend
ENV CARDMATICA_ROOT=/workspace PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/workspace/backend
COPY . .
RUN pip install --no-cache-dir -c requirements.lock . \
    && useradd --create-home --uid 10001 cardmatica \
    && mkdir -p /data/cache /data/images \
    && chown -R cardmatica:cardmatica /data
USER cardmatica
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
