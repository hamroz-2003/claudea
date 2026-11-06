# FlowCraft engine for a free Hugging Face Space (Docker SDK, "CPU basic").
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# Spaces run containers as uid 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    FLOWCRAFT_HOST=0.0.0.0 \
    FLOWCRAFT_PORT=7860 \
    FLOWCRAFT_DATA=/home/user/data
WORKDIR /home/user/app

COPY --chown=user requirements-cloud.txt .
RUN pip install --no-cache-dir --user -r requirements-cloud.txt

COPY --chown=user apps/core-engine apps/core-engine
COPY --chown=user apps/web-ui apps/web-ui
COPY --chown=user assets assets

EXPOSE 7860
CMD ["python", "apps/core-engine/main.py"]
