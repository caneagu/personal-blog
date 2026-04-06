from __future__ import annotations

from getpass import getpass
import os
from pathlib import Path
import secrets

import yaml
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parents[1]
REPO_CONTENT_ROOT = BASE_DIR / "content"
DEFAULT_CONTENT_ROOT = REPO_CONTENT_ROOT if REPO_CONTENT_ROOT.exists() else BASE_DIR.parent / "content"


def resolve_path(raw_value: str | None, default: Path) -> Path:
    if not raw_value:
        return default
    path = Path(raw_value).expanduser()
    if path.is_absolute():
        return path
    return (BASE_DIR / path).resolve()


CONTENT_ROOT = resolve_path(os.getenv("BLOG_CONTENT_ROOT") or os.getenv("BLOG_CONTENT_DIR"), DEFAULT_CONTENT_ROOT)
CONFIG_PATH = resolve_path(os.getenv("BLOG_CONFIG_PATH"), CONTENT_ROOT / "config.yml")


def prompt(label: str, default: str) -> str:
    value = input(f"{label} [{default}]: ").strip()
    return value or default


def main() -> None:
    print("Blog setup")
    print("----------")

    admin_user = prompt("Admin username", "admin")

    while True:
        password = getpass("Admin password: ").strip()
        if not password:
            print("Password cannot be empty.")
            continue
        confirm = getpass("Confirm password: ").strip()
        if password != confirm:
            print("Passwords do not match. Try again.")
            continue
        break

    secret_key = secrets.token_urlsafe(32)
    config = {
        "admin_user": admin_user,
        "admin_password": "",
        "admin_password_hash": generate_password_hash(password, method="pbkdf2:sha256", salt_length=16),
        "secret_key": secret_key,
    }

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")

    print(f"Wrote {CONFIG_PATH}")
    print("You can override any value with env vars: BLOG_ADMIN_USER, BLOG_ADMIN_PASSWORD, BLOG_ADMIN_PASSWORD_HASH, BLOG_SECRET_KEY")


if __name__ == "__main__":
    main()
