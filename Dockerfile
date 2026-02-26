# syntax=docker/dockerfile:1.7

FROM python:3.12-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VENV_PATH=/opt/venv

WORKDIR /build

RUN python -m venv "${VENV_PATH}"
ENV PATH="${VENV_PATH}/bin:${PATH}"

COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt


FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    PORT=8080 \
    BLOG_HOST=0.0.0.0 \
    BLOG_PORT=8080 \
    BLOG_DEBUG=0 \
    BLOG_SECURE_COOKIES=1

WORKDIR /app

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home /app --shell /usr/sbin/nologin app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app app.py /app/app.py
COPY --chown=app:app gunicorn.conf.py /app/gunicorn.conf.py
COPY --chown=app:app templates /app/templates
COPY --chown=app:app static /app/static
COPY --chown=app:app content /app/content

RUN mkdir -p /app/content/posts /app/static/uploads \
    && chown -R app:app /app

USER app:app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os,sys,urllib.request; port=os.getenv('PORT','8080'); status=urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=3).getcode(); sys.exit(0 if status < 500 else 1)"

CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:app"]
