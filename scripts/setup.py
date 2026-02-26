from __future__ import annotations

from getpass import getpass
from pathlib import Path
import secrets

import yaml
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = BASE_DIR / "content" / "config.yml"


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
