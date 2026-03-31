# Personal Blog (Markdown Publishing)

A lightweight personal blog with:

- Home page with featured/latest article
- Articles archive page
- Individual article pages
- Auth-protected editor and settings
- Drag-and-drop image upload in the editor
- RSS feed at `/rss.xml`

## Prerequisites

- Python 3.11+ (3.12 recommended)
- `pip`
- Docker (for production container deployment)

## Local Setup

1. Create and activate a virtual environment.
2. Install dependencies.
3. Generate initial admin config.
4. Start the app.

```bash
cd .
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/setup.py
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000).

## Authentication and Secrets

The setup script writes `./content/config.yml` with:

- `admin_user`
- `admin_password_hash` (PBKDF2 via Werkzeug)
- `secret_key`

You can override config with environment variables (recommended for production).

Generate a password hash manually if needed:

```bash
python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('replace-me', method='pbkdf2:sha256', salt_length=16))"
```

## Environment Variables

| Variable | Default | Required in production | Purpose |
|---|---|---|---|
| `BLOG_ADMIN_USER` | `admin` | Yes | Admin username for `/login`. |
| `BLOG_ADMIN_PASSWORD` | empty | No | Plain password fallback (avoid in production). |
| `BLOG_ADMIN_PASSWORD_HASH` | empty | Yes | Preferred admin password source. |
| `BLOG_SECRET_KEY` | generated at startup if missing | Yes | Flask session signing key. |
| `BLOG_CONFIG_PATH` | `content/config.yml` under app root | No | Alternate config file path. |
| `BLOG_TRUSTED_HOSTS` | `localhost`, loopback hosts | Yes | Comma-separated allowed hostnames. |
| `BLOG_TRUST_PROXY_HEADERS` | `0` | No | Set to `1` only behind a trusted reverse proxy that rewrites `X-Forwarded-For`/`X-Real-IP`. |
| `BLOG_SECURE_COOKIES` | `1` in container | Yes | Keep `1` behind HTTPS. |
| `BLOG_DEBUG` | `0` | Yes | Keep `0` in production. |
| `BLOG_HOST` | `127.0.0.1` (local run) | No | Host bind for `python app.py`. |
| `BLOG_PORT` | `5000` (local run) | No | Port bind for `python app.py`. |
| `PORT` | `8080` in container | Yes | Gunicorn bind port in container/cloud. |
| `HOST_PORT` | `8080` | No | Host-side published port used by Docker Compose. |
| `BLOG_CONTENT_DIR` | `../content` | No | Host bind mount source for persistent content when using Docker Compose; with `~/personal-blog` this resolves to `~/content`. |
| `BLOG_UPLOADS_DIR` | `../content/uploads` | No | Host bind mount source for uploaded media when using Docker Compose. |
| `WEB_CONCURRENCY` | `2*CPU+1` (min 2) | No | Gunicorn workers count. |
| `GUNICORN_THREADS` | `4` | No | Threads per worker. |
| `GUNICORN_TIMEOUT` | `30` | No | Worker request timeout (seconds). |
| `GUNICORN_GRACEFUL_TIMEOUT` | `30` | No | Graceful shutdown timeout. |
| `GUNICORN_KEEPALIVE` | `5` | No | Keep-alive seconds. |
| `GUNICORN_MAX_REQUESTS` | `1000` | No | Worker recycle threshold. |
| `GUNICORN_MAX_REQUESTS_JITTER` | `50` | No | Random jitter for recycle threshold. |
| `GUNICORN_LOG_LEVEL` | `info` | No | Gunicorn log verbosity. |

## Docker Build and Run (Production)

Build image:

```bash
cd .
docker build -t personal-blog:prod .
```

Run container with persistence and hardening:

```bash
docker run -d --name personal-blog \
  --restart unless-stopped \
  -p 8080:8080 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  -e PORT=8080 \
  -e BLOG_SECRET_KEY="replace-with-a-long-random-secret" \
  -e BLOG_ADMIN_USER="admin" \
  -e BLOG_ADMIN_PASSWORD_HASH="pbkdf2:sha256:..." \
  -e BLOG_TRUSTED_HOSTS="blog.example.com,.example.com" \
  -e BLOG_SECURE_COOKIES=1 \
  -e BLOG_DEBUG=0 \
  -v /home/<user>/content:/app/content \
  -v /home/<user>/content/uploads:/app/static/uploads \
  personal-blog:prod
```

Container details:

- Runs as non-root user `uid=10001`.
- Uses Gunicorn (`gunicorn.conf.py`).
- Includes container `HEALTHCHECK` against `/`.

## Docker Compose (Recommended)

1. Copy environment template and set real values.
2. Build and start the service.
3. Verify container status and logs.

```bash
cd .
cp .env.example .env
```

Edit `.env` and set at minimum:

- `BLOG_SECRET_KEY`
- `BLOG_ADMIN_PASSWORD_HASH`
- `BLOG_TRUSTED_HOSTS`

Start:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f blog
```

Stop:

```bash
docker compose down
```

Update after code changes:

```bash
docker compose up -d --build
```

Compose notes:

- Service definition is in `docker-compose.yml`.
- Runtime secrets and tuning are loaded from `.env`.
- Data persists via bind mounts controlled by `BLOG_CONTENT_DIR` and `BLOG_UPLOADS_DIR`.
- By default, Compose mounts a sibling `~/content` directory outside the repo checkout.
- Keep those paths outside the git checkout so article edits do not dirty the deploy branch.
- The container runs as `uid=10001`; those host bind mounts must be writable by `10001:10001`.
- The same hardening flags are applied (`read_only`, `tmpfs`, dropped capabilities, `no-new-privileges`).

## Cloud Deployment Checklist

1. Put the app behind HTTPS (reverse proxy or managed LB).
2. Set `BLOG_TRUSTED_HOSTS` to exact public hostnames.
3. Set `BLOG_SECRET_KEY` to a long random value and rotate safely.
4. Use `BLOG_ADMIN_PASSWORD_HASH` instead of plain `BLOG_ADMIN_PASSWORD`.
5. Persist `/app/content` and `/app/static/uploads` with durable volumes.
6. Back up `content/` regularly.
7. Keep `BLOG_DEBUG=0`.
8. Keep `BLOG_SECURE_COOKIES=1`.

## VM Provisioning (Nginx + Let's Encrypt)

For a public Ubuntu/Debian VM, use the provisioning script:

```bash
sudo ./scripts/provision_vm.sh \
  --domain blog.example.com \
  --email admin@example.com \
  --repo-url https://github.com/<owner>/personal-blog.git \
  --app-dir /home/<user>/personal-blog \
  --data-dir /home/<user>/content \
  --branch main
```

What it configures:

- Installs Docker, Docker Compose plugin, Nginx, Certbot.
- Clones/updates the repo in `/home/<user>/personal-blog` (or your `--app-dir`).
- Stores mutable runtime data outside the git checkout in a sibling content directory by default.
- Creates/updates `.env` with production-safe proxy settings:
  - `HOST_PORT=127.0.0.1:8080`
  - `BLOG_CONTENT_DIR=/home/<user>/content`
  - `BLOG_UPLOADS_DIR=/home/<user>/content/uploads`
  - `BLOG_TRUSTED_HOSTS=<your domain>`
  - `BLOG_TRUST_PROXY_HEADERS=1`
  - `BLOG_SECURE_COOKIES=1`
- Starts the app with Docker Compose.
- Provisions and installs Let's Encrypt certs in Nginx with HTTPS redirect.
- Repairs ownership on the host content directory so the non-root container can write settings, posts, and uploads.

Requirements before running:

1. DNS `A/AAAA` for your domain must point to the VM.
2. Ports `80` and `443` must be reachable.
3. Set a real `BLOG_ADMIN_PASSWORD_HASH` in `./.env` (the script exits if placeholder is still present).

## Updating a Server That Also Publishes Articles

If you publish articles from the live server, do not keep the writable content directories inside the deployment checkout. Otherwise each article edit becomes a local git change and later `git pull` operations will conflict.

Recommended production layout:

- App code checkout in `~/personal-blog`
- Writable content in `~/content` or another host path outside the repo
- Uploaded images in `~/content/uploads`

One-time migration for an existing server:

```bash
mkdir -p ~/content ~/content/uploads
cp -a ~/personal-blog/content/. ~/content/
cp -a ~/personal-blog/static/uploads/. ~/content/uploads/
sudo chown -R 10001:10001 ~/content
```

Set these in `~/personal-blog/.env`:

```bash
BLOG_CONTENT_DIR=/home/<user>/content
BLOG_UPLOADS_DIR=/home/<user>/content/uploads
```

Then rebuild:

```bash
cd ~/personal-blog
docker compose up -d --build
```

After that, article edits stop modifying tracked files in the repo, so updating the app is just:

```bash
cd ~/personal-blog
git pull --ff-only origin main
docker compose up -d --build
```

## Content and Publishing

Writing flow:

1. Go to `/editor` (requires login).
2. Fill title/date/summary/markdown.
3. Save draft or publish.
4. Posts are written to `content/posts/<slug>.md` in the mounted content directory.
5. Uploaded images are written to the host path behind `BLOG_UPLOADS_DIR`.

Post format:

```md
---
title: Example
published_at: 2026-02-17
summary: Short description
status: published
---

# Body markdown
```

## Important Routes

- `/` home
- `/articles` list page
- `/article/<slug>` article page
- `/editor` editor (auth required)
- `/settings` site settings (auth required)
- `/login` admin login
- `/rss.xml` RSS feed

## Project Layout

- `./app.py`: Flask app and core logic
- `./Dockerfile`: multi-stage production image
- `./docker-compose.yml`: production compose service definition
- `./.env.example`: environment template for compose
- `./gunicorn.conf.py`: Gunicorn runtime config
- `./templates/`: Jinja templates
- `./static/`: CSS and client-side assets
- `./static/base.js`: global UI/theme script
- `./static/editor.js`: editor interactions and image uploads
- `./config.example.yml`: config template
- `./scripts/setup.py`: interactive setup script

## Security and Performance Review (2026-02-26)

Implemented in code:

- Login rate limiting now ignores proxy IP headers by default; enable with `BLOG_TRUST_PROXY_HEADERS=1` only when you trust your proxy.
- Login-attempt tracking now prunes stale entries and caps tracked IPs (`2048`) to prevent unbounded memory growth.
- Added lightweight file-state caching for post parsing and site settings loading to reduce repeat disk/YAML work across requests.
- Moved inline JavaScript into `/static/base.js` and `/static/editor.js`, and tightened CSP to `script-src 'self'` and `style-src 'self'`.
- Pinned `Werkzeug==3.1.5` in `requirements.txt` for reproducible installs.

Remaining hardening items (recommended before high-traffic public exposure):

- Add nonce-based CSP reporting (`Content-Security-Policy-Report-Only`) if you want violation telemetry before tightening further directives.
- Login throttling is process-local memory; in multi-worker or multi-instance deployments, use shared rate limiting (Redis or edge proxy limits).
- `.env`, the mounted content directory, and uploaded files must never be committed; they are ignored by `.gitignore`.

## Pre-Push Validation

Run these before pushing:

```bash
cd .
.venv/bin/python -m py_compile app.py scripts/setup.py
.venv/bin/python - <<'PY'
from app import app
c = app.test_client()
for path in ["/", "/articles", "/rss.xml", "/login", "/editor"]:
    r = c.get(path, follow_redirects=False)
    print(path, r.status_code, r.headers.get("Location", ""))
PY
```

## Troubleshooting

- Login always fails: verify `BLOG_ADMIN_USER` and `BLOG_ADMIN_PASSWORD_HASH`, and ensure hash format is Werkzeug PBKDF2.
- 400 invalid CSRF token: ensure forms send CSRF token and cookies are preserved by browser/proxy.
- Login rate limit appears ineffective behind proxy: set `BLOG_TRUST_PROXY_HEADERS=1` only if your proxy sanitizes forwarding headers.
- Host header rejected: include deployed domain in `BLOG_TRUSTED_HOSTS`.
- Content disappears after restart: verify `BLOG_CONTENT_DIR` and `BLOG_UPLOADS_DIR` point to persistent host paths outside the repo.
- Settings save or publishing fails with `PermissionError` on `/app/content` or `/app/static/uploads`: run `sudo chown -R 10001:10001 ~/content` or the configured host content path, then restart the container.
