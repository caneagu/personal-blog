#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

DOMAIN=""
LETSENCRYPT_EMAIL=""
REPO_URL=""
APP_DIR="/opt/personal-blog"
BRANCH="main"
DATA_DIR=""

usage() {
  cat <<'EOF'
Provision a public VM for personal-blog with Docker + Nginx + Let's Encrypt.

Usage:
  sudo ./scripts/provision_vm.sh \
    --domain blog.example.com \
    --email admin@example.com \
    --repo-url https://github.com/<owner>/personal-blog.git \
    [--app-dir /home/<user>/personal-blog] \
    [--data-dir /home/<user>/content] \
    [--branch main]

Notes:
  - DNS for --domain must already point to this VM.
  - Script targets Debian/Ubuntu systems with apt.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --email)
      LETSENCRYPT_EMAIL="${2:-}"
      shift 2
      ;;
    --repo-url)
      REPO_URL="${2:-}"
      shift 2
      ;;
    --app-dir)
      APP_DIR="${2:-}"
      shift 2
      ;;
    --data-dir)
      DATA_DIR="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${DOMAIN}" || -z "${LETSENCRYPT_EMAIL}" || -z "${REPO_URL}" ]]; then
  echo "Missing required args: --domain, --email, --repo-url" >&2
  usage
  exit 1
fi

if [[ -z "${DATA_DIR}" ]]; then
  APP_PARENT_DIR="$(dirname "${APP_DIR}")"
  DATA_DIR="${APP_PARENT_DIR}/content"
fi

CONTENT_DATA_DIR="${DATA_DIR}/content"
UPLOADS_DATA_DIR="${DATA_DIR}/uploads"

set_env_key() {
  local key="$1"
  local value="$2"
  local env_file="$3"
  if grep -qE "^${key}=" "${env_file}"; then
    sed -i "s#^${key}=.*#${key}=${value}#g" "${env_file}"
  else
    printf "%s=%s\n" "${key}" "${value}" >> "${env_file}"
  fi
}

echo "[1/7] Installing system packages..."
apt-get update -y
apt-get install -y \
  ca-certificates \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  docker.io \
  docker-compose-plugin \
  openssl

systemctl enable --now docker
systemctl enable --now nginx

echo "[2/7] Cloning/updating application repo..."
mkdir -p "${APP_DIR}"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch --all --prune
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

echo "[3/7] Preparing runtime files and environment..."
mkdir -p \
  "${CONTENT_DATA_DIR}" \
  "${CONTENT_DATA_DIR}/posts" \
  "${UPLOADS_DATA_DIR}"

if [[ -d "${APP_DIR}/content" ]] && ! find "${CONTENT_DATA_DIR}" -mindepth 1 -print -quit | grep -q .; then
  cp -a "${APP_DIR}/content/." "${CONTENT_DATA_DIR}/"
fi

if [[ -d "${APP_DIR}/static/uploads" ]] && ! find "${UPLOADS_DATA_DIR}" -mindepth 1 -print -quit | grep -q .; then
  cp -a "${APP_DIR}/static/uploads/." "${UPLOADS_DATA_DIR}/"
fi

chown -R 10001:10001 "${CONTENT_DATA_DIR}" "${UPLOADS_DATA_DIR}"
if [[ ! -f "${APP_DIR}/.env" ]]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
fi

ENV_FILE="${APP_DIR}/.env"
set_env_key "HOST_PORT" "127.0.0.1:8080" "${ENV_FILE}"
set_env_key "BLOG_CONTENT_DIR" "${CONTENT_DATA_DIR}" "${ENV_FILE}"
set_env_key "BLOG_UPLOADS_DIR" "${UPLOADS_DATA_DIR}" "${ENV_FILE}"
set_env_key "BLOG_TRUSTED_HOSTS" "${DOMAIN}" "${ENV_FILE}"
set_env_key "BLOG_TRUST_PROXY_HEADERS" "1" "${ENV_FILE}"
set_env_key "BLOG_SECURE_COOKIES" "1" "${ENV_FILE}"
set_env_key "BLOG_DEBUG" "0" "${ENV_FILE}"

CURRENT_SECRET="$(awk -F= '/^BLOG_SECRET_KEY=/{print $2}' "${ENV_FILE}" || true)"
if [[ -z "${CURRENT_SECRET}" || "${CURRENT_SECRET}" == "replace-with-a-long-random-secret" ]]; then
  set_env_key "BLOG_SECRET_KEY" "$(openssl rand -hex 48)" "${ENV_FILE}"
fi

CURRENT_HASH="$(awk -F= '/^BLOG_ADMIN_PASSWORD_HASH=/{print $2}' "${ENV_FILE}" || true)"
if [[ -z "${CURRENT_HASH}" || "${CURRENT_HASH}" == "pbkdf2:sha256:replace-with-generated-hash" ]]; then
  echo "BLOG_ADMIN_PASSWORD_HASH is not set in ${ENV_FILE}." >&2
  echo "Generate it, then rerun:" >&2
  echo "python3 -c \"from werkzeug.security import generate_password_hash; print(generate_password_hash('change-me', method='pbkdf2:sha256', salt_length=16))\"" >&2
  exit 1
fi

echo "[4/7] Configuring Nginx reverse proxy..."
NGINX_CONF="/etc/nginx/sites-available/personal-blog.conf"
cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
    }
}
EOF

ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/personal-blog.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[5/7] Building and starting app containers..."
docker compose -f "${APP_DIR}/docker-compose.yml" --env-file "${ENV_FILE}" up -d --build

echo "[6/7] Requesting Let's Encrypt certificate..."
certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --email "${LETSENCRYPT_EMAIL}" \
  -d "${DOMAIN}"

echo "[7/7] Final checks..."
systemctl reload nginx
docker compose -f "${APP_DIR}/docker-compose.yml" --env-file "${ENV_FILE}" ps

cat <<EOF

Provisioning complete.

App directory: ${APP_DIR}
Public URL: https://${DOMAIN}

Useful commands:
  docker compose -f ${APP_DIR}/docker-compose.yml --env-file ${ENV_FILE} logs -f blog
  docker compose -f ${APP_DIR}/docker-compose.yml --env-file ${ENV_FILE} pull
  docker compose -f ${APP_DIR}/docker-compose.yml --env-file ${ENV_FILE} up -d --build
EOF
