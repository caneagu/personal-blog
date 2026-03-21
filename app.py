from __future__ import annotations

import datetime as dt
import html
import hmac
import json
import logging
import os
import re
import secrets
import time
import uuid
from dataclasses import dataclass
from functools import wraps
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from flask import Flask, abort, g, jsonify, redirect, render_template, request, session, url_for
import markdown
from markdownify import markdownify as html_to_markdown
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import check_password_hash
import yaml

BASE_DIR = Path(__file__).parent
CONTENT_DIR = BASE_DIR / "content" / "posts"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
SETTINGS_PATH = BASE_DIR / "content" / "site_settings.yml"
APP_CONFIG_PATH = Path(os.getenv("BLOG_CONFIG_PATH", str(BASE_DIR / "content" / "config.yml")))
SITE_TITLE = "Personal Blog"
ALLOWED_MARKDOWN_TAGS = {
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "hr",
    "img",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "span",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
}
ALLOWED_MARKDOWN_ATTRIBUTES = {
    "a": ["href", "title", "rel"],
    "code": ["class"],
    "div": ["class"],
    "img": ["src", "alt", "data-size", "class"],
    "pre": ["class"],
    "span": ["class"],
    "th": ["colspan", "rowspan"],
    "td": ["colspan", "rowspan"],
}
ALLOWED_URL_PROTOCOLS = {"http", "https", "mailto", "tel"}
STRIP_CONTENT_TAGS = {"script", "style"}
VOID_TAGS = {"br", "hr", "img"}
DEFAULT_APP_CONFIG = {
    "admin_user": "admin",
    "admin_password": "",
    "admin_password_hash": "",
    "secret_key": "",
}
DEFAULT_SETTINGS = {
    "site_title": SITE_TITLE,
    "publisher_name": "Personal Blog",
    "profile_role": "Writer",
    "linkedin_url": "",
    "social_image_url": "",
    "typography_theme": "classic",
    "home_intro_primary": (
        "This is a minimalist article site focused on clear writing, long-form ideas, and durable links. "
        "It is designed as a clean writing-focused publication with your own content pipeline."
    ),
    "home_intro_secondary": (
        "All articles are authored in markdown and published through the built-in editor. "
        "You can publish new work at any time from the Publish page."
    ),
}
TYPOGRAPHY_THEMES: dict[str, dict[str, str]] = {
    "classic": {
        "label": "Classic Georgia + Open Sans",
        "description": "Original Georgia reading feel with clean Open Sans-style UI.",
    },
    "editorial": {
        "label": "Editorial Serif",
        "description": "A classic magazine-style serif body with neutral UI controls.",
    },
    "literary": {
        "label": "Literary Serif",
        "description": "A warmer book-like serif tone for long-form reading.",
    },
    "modern": {
        "label": "Modern Hybrid",
        "description": "A cleaner, more contemporary blend while keeping readable prose.",
    },
    "leva": {
        "label": "Leva Mono/Sans",
        "description": "System sans with mono accents and compact UI sizing.",
    },
}
CSRF_FIELD_NAME = "csrf_token"
CSRF_SESSION_KEY = "_csrf_token"
SAFE_POST_ENDPOINTS = {"preview"}
LOGIN_ATTEMPT_WINDOW_SECONDS = 300
LOGIN_ATTEMPT_LIMIT = 10
LOGIN_ATTEMPT_TRACK_LIMIT = 2048
LOGIN_ATTEMPTS: dict[str, list[float]] = {}
POSTS_CACHE: dict[str, object] = {"key": None, "posts": []}
SETTINGS_CACHE: dict[str, object] = {"stamp": None, "settings": DEFAULT_SETTINGS.copy()}
LOGGER = logging.getLogger(__name__)
IMAGE_SRC_PATTERN = re.compile(r"""<img[^>]+src=["']([^"']+)["']""", re.IGNORECASE)
MARKDOWN_FENCED_CODE_PATTERN = re.compile(r"```[\s\S]*?```", re.MULTILINE)
HTML_CODE_BLOCK_PATTERN = re.compile(r"<pre\b[\s\S]*?</pre>", re.IGNORECASE)
STORAGE_PERMISSION_HINT = (
    "Storage is not writable. Check bind-mount ownership/permissions on the host. "
    "For Docker deployments, ensure /app/content and /app/static/uploads are writable by uid/gid 10001."
)


class StorageWriteError(RuntimeError):
    pass


@dataclass
class Post:
    slug: str
    title: str
    published_at: dt.date
    summary: str
    body_markdown: str
    status: str = "published"

    @property
    def published_label(self) -> str:
        return self.published_at.strftime("%B %-d, %Y") if os.name != "nt" else self.published_at.strftime("%B %#d, %Y")

    @property
    def body_html(self) -> str:
        return render_markdown(self.body_markdown)

    @property
    def is_draft(self) -> bool:
        return self.status == "draft"


def load_app_config() -> dict[str, str]:
    config = DEFAULT_APP_CONFIG.copy()
    if APP_CONFIG_PATH.exists():
        payload = yaml.safe_load(APP_CONFIG_PATH.read_text(encoding="utf-8")) or {}
        if isinstance(payload, dict):
            for key in config:
                value = payload.get(key)
                if value is not None:
                    config[key] = str(value).strip()

    env_overrides = {
        "admin_user": os.getenv("BLOG_ADMIN_USER"),
        "admin_password": os.getenv("BLOG_ADMIN_PASSWORD"),
        "admin_password_hash": os.getenv("BLOG_ADMIN_PASSWORD_HASH"),
        "secret_key": os.getenv("BLOG_SECRET_KEY"),
    }
    for key, value in env_overrides.items():
        if value:
            config[key] = value.strip()

    if not config["secret_key"]:
        config["secret_key"] = secrets.token_urlsafe(48)
        LOGGER.warning("BLOG_SECRET_KEY is not set. Generated an ephemeral secret key for this process.")
    return config


def env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def configured_trusted_hosts() -> list[str]:
    default_hosts = {"127.0.0.1", "localhost", ".localhost", "::1", "[::1]"}
    raw_hosts = os.getenv("BLOG_TRUSTED_HOSTS", "")
    env_hosts = {host.strip() for host in raw_hosts.split(",") if host.strip()}
    hosts = sorted(default_hosts | env_hosts)
    return hosts


def sanitize_url(url_value: str) -> str:
    candidate = (url_value or "").strip()
    if not candidate:
        return ""
    parsed = urlparse(candidate)
    if parsed.scheme and parsed.scheme.lower() not in ALLOWED_URL_PROTOCOLS:
        return ""
    if candidate.lower().startswith("javascript:"):
        return ""
    return candidate


def sanitize_image_classes(class_value: str) -> str:
    allowed = {"img-size-25", "img-size-50", "img-size-75", "img-size-100"}
    classes = [token for token in (class_value or "").split() if token in allowed]
    unique_classes = sorted(set(classes))
    return " ".join(unique_classes)


def sanitize_image_size(size_value: str) -> str:
    allowed = {"25", "50", "75", "100"}
    candidate = (size_value or "").strip()
    return candidate if candidate in allowed else "100"


def static_asset_url(filename: str) -> str:
    path = BASE_DIR / "static" / filename
    version = ""
    try:
        stat = path.stat()
        version = str(stat.st_mtime_ns)
    except FileNotFoundError:
        version = ""
    return url_for("static", filename=filename, v=version) if version else url_for("static", filename=filename)


class HTMLFragmentSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_stack: list[str] = []
        self.strip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if normalized_tag in STRIP_CONTENT_TAGS:
            self.strip_depth += 1
            return
        if self.strip_depth > 0 or normalized_tag not in ALLOWED_MARKDOWN_TAGS:
            return

        allowed = ALLOWED_MARKDOWN_ATTRIBUTES.get(normalized_tag, [])
        rendered_attrs: list[str] = []
        for key, value in attrs:
            normalized_key = key.lower()
            if normalized_key not in allowed:
                continue
            attr_value = value or ""
            if normalized_key in {"href", "src"}:
                attr_value = sanitize_url(attr_value)
                if not attr_value:
                    continue
            if normalized_tag == "img" and normalized_key == "data-size":
                attr_value = sanitize_image_size(attr_value)
            if normalized_tag == "img" and normalized_key == "class":
                attr_value = sanitize_image_classes(attr_value)
                if not attr_value:
                    continue
            escaped = html.escape(attr_value, quote=True)
            rendered_attrs.append(f'{normalized_key}="{escaped}"')

        attrs_fragment = (" " + " ".join(rendered_attrs)) if rendered_attrs else ""
        self.parts.append(f"<{normalized_tag}{attrs_fragment}>")
        if normalized_tag not in VOID_TAGS:
            self.open_stack.append(normalized_tag)

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if normalized_tag in STRIP_CONTENT_TAGS:
            self.strip_depth = max(0, self.strip_depth - 1)
            return
        if self.strip_depth > 0:
            return
        if normalized_tag in VOID_TAGS:
            return
        if self.open_stack and self.open_stack[-1] == normalized_tag:
            self.open_stack.pop()
            self.parts.append(f"</{normalized_tag}>")

    def handle_data(self, data: str) -> None:
        if self.strip_depth > 0:
            return
        self.parts.append(html.escape(data))

    def handle_entityref(self, name: str) -> None:
        if self.strip_depth > 0:
            return
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self.strip_depth > 0:
            return
        self.parts.append(f"&#{name};")

    def get_output(self) -> str:
        while self.open_stack:
            self.parts.append(f"</{self.open_stack.pop()}>")
        return "".join(self.parts)


def sanitize_html_fragment(html_content: str) -> str:
    sanitizer = HTMLFragmentSanitizer()
    sanitizer.feed(html_content or "")
    sanitizer.close()
    return sanitizer.get_output()


def highlight_html_code_blocks(html_content: str) -> str:
    soup = BeautifulSoup(html_content or "", "html.parser")
    formatter = HtmlFormatter(nowrap=True)

    for pre in soup.find_all("pre"):
        code = pre.find("code")
        if code is None:
            continue
        if code.find("span") is not None:
            continue

        class_tokens = code.get("class", [])
        language = ""
        for token in class_tokens:
            if token.startswith("language-"):
                language = token.split("-", 1)[1].strip().lower()
                break

        source = code.get_text()
        if not source.strip():
            continue

        try:
            lexer = get_lexer_by_name(language) if language else get_lexer_by_name("text")
        except ClassNotFound:
            lexer = get_lexer_by_name("text")

        highlighted = highlight(source, lexer, formatter)
        code.clear()
        fragment = BeautifulSoup(highlighted, "html.parser")
        for node in list(fragment.contents):
            code.append(node)

        pre_classes = pre.get("class", [])
        if "codehilite" not in pre_classes:
            pre["class"] = [*pre_classes, "codehilite"]

    return str(soup)


def render_markdown(markdown_text: str) -> str:
    html_content = markdown.markdown(
        markdown_text or "",
        extensions=["fenced_code", "codehilite", "tables", "toc", "nl2br"],
        extension_configs={
            "codehilite": {
                "css_class": "codehilite",
                "guess_lang": False,
                "use_pygments": True,
            }
        },
        output_format="html5",
    )
    html_content = highlight_html_code_blocks(html_content)
    return sanitize_html_fragment(html_content)


APP_CONFIG = load_app_config()


app = Flask(__name__)
app.config["TRUSTED_HOSTS"] = configured_trusted_hosts()
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25MB uploads
app.config["SECRET_KEY"] = APP_CONFIG["secret_key"]
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = env_flag("BLOG_SECURE_COOKIES", True)
app.config["PERMANENT_SESSION_LIFETIME"] = dt.timedelta(hours=12)


SLUG_PATTERN = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    candidate = SLUG_PATTERN.sub("-", text.lower()).strip("-")
    return candidate or "untitled"


def parse_post(path: Path) -> Post:
    text = path.read_text(encoding="utf-8")
    if text.startswith("---") and text.count("---") >= 2:
        _, fm, body = text.split("---", 2)
        parsed_metadata = yaml.safe_load(fm) or {}
        metadata = parsed_metadata if isinstance(parsed_metadata, dict) else {}
    else:
        metadata = {}
        body = text

    title = metadata.get("title") or path.stem.replace("-", " ").title()
    published_raw = metadata.get("published_at") or dt.date.today().isoformat()
    summary = metadata.get("summary") or ""
    status = str(metadata.get("status") or "published").strip().lower()
    if status not in {"published", "draft"}:
        status = "published"

    try:
        published_at = dt.date.fromisoformat(str(published_raw))
    except ValueError:
        published_at = dt.date.today()
    return Post(
        slug=path.stem,
        title=title,
        published_at=published_at,
        summary=summary,
        body_markdown=body.strip(),
        status=status,
    )


def list_posts(include_drafts: bool = False) -> list[Post]:
    posts = load_all_posts_cached()
    if include_drafts:
        return posts
    return [post for post in posts if not post.is_draft]


def content_state_stamp() -> tuple[tuple[str, int, int], ...]:
    if not CONTENT_DIR.exists():
        return ()
    files: list[tuple[str, int, int]] = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        stat = path.stat()
        files.append((path.name, stat.st_mtime_ns, stat.st_size))
    return tuple(files)


def invalidate_posts_cache() -> None:
    POSTS_CACHE["key"] = None
    POSTS_CACHE["posts"] = []


def load_all_posts_cached() -> list[Post]:
    state = content_state_stamp()
    if POSTS_CACHE.get("key") == state:
        return list(POSTS_CACHE.get("posts", []))

    if not CONTENT_DIR.exists():
        parsed_posts: list[Post] = []
    else:
        parsed_posts = []
        for path in CONTENT_DIR.glob("*.md"):
            try:
                parsed_posts.append(parse_post(path))
            except Exception:
                LOGGER.exception("Skipping invalid post file: %s", path)
    sorted_posts = sorted(parsed_posts, key=lambda p: p.published_at, reverse=True)
    POSTS_CACHE["key"] = state
    POSTS_CACHE["posts"] = sorted_posts
    return list(sorted_posts)


def get_post(slug: str) -> Post | None:
    safe_slug = slugify(slug)
    for post in load_all_posts_cached():
        if post.slug == safe_slug:
            return post
    return None


def delete_post(slug: str) -> bool:
    safe_slug = slugify(slug)
    path = CONTENT_DIR / f"{safe_slug}.md"
    if not path.exists():
        return False
    try:
        path.unlink()
    except OSError as exc:
        LOGGER.exception("Failed to delete post file: %s", path)
        raise StorageWriteError(f"Cannot delete {path.name}. {STORAGE_PERMISSION_HINT}") from exc
    invalidate_posts_cache()
    return True


def save_post(
    title: str,
    published_at: str,
    summary: str,
    body: str,
    slug: str | None = None,
    original_slug: str | None = None,
    status: str = "published",
) -> str:
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    normalized_title = title.strip()
    if not normalized_title:
        raise ValueError("Title is required.")
    if len(normalized_title) > 180:
        raise ValueError("Title must be at most 180 characters.")
    try:
        dt.date.fromisoformat(published_at)
    except ValueError as exc:
        raise ValueError("Publish date must be a valid ISO date (YYYY-MM-DD).") from exc

    cleaned_slug = slugify(slug or normalized_title)
    cleaned_original_slug = slugify(original_slug) if original_slug else ""
    path = CONTENT_DIR / f"{cleaned_slug}.md"
    if path.exists() and cleaned_slug != cleaned_original_slug:
        raise ValueError("Slug already exists. Choose a different slug or edit the existing article.")

    previous_path: Path | None = None
    if cleaned_original_slug and cleaned_original_slug != cleaned_slug:
        previous_path = CONTENT_DIR / f"{cleaned_original_slug}.md"

    metadata = {
        "title": normalized_title,
        "published_at": published_at,
        "summary": summary.strip()[:500],
        "status": "draft" if status == "draft" else "published",
    }

    payload = "---\n" + yaml.safe_dump(metadata, sort_keys=False).strip() + "\n---\n\n" + body.strip() + "\n"
    try:
        path.write_text(payload, encoding="utf-8")
        if previous_path and previous_path.exists():
            previous_path.unlink()
    except OSError as exc:
        LOGGER.exception("Failed to write post file: %s", path)
        raise StorageWriteError(f"Cannot write {path.name}. {STORAGE_PERMISSION_HINT}") from exc
    invalidate_posts_cache()
    return cleaned_slug


def make_summary(text: str) -> str:
    source = text or ""
    source = MARKDOWN_FENCED_CODE_PATTERN.sub(" ", source)
    source = HTML_CODE_BLOCK_PATTERN.sub(" ", source)
    return plain_text_excerpt(source, 180)


def plain_text_excerpt(text: str, limit: int = 160) -> str:
    normalized = html.unescape(text or "")
    normalized = re.sub(r"<[^>]+>", " ", normalized)
    cleaned = re.sub(r"\s+", " ", re.sub(r"[#>*`_~\-\|]", " ", normalized)).strip()
    if len(cleaned) <= limit:
        return cleaned
    if limit <= 3:
        return cleaned[:limit]
    return cleaned[: limit - 3].rstrip() + "..."


def page_title(primary: str, site_name: str) -> str:
    normalized_primary = plain_text_excerpt(primary, 90)
    normalized_site_name = plain_text_excerpt(site_name, 60)
    if not normalized_primary:
        return normalized_site_name
    if not normalized_site_name or normalized_primary == normalized_site_name:
        return normalized_primary
    return f"{normalized_primary} | {normalized_site_name}"


def site_meta_description(settings: dict[str, str]) -> str:
    publisher_name = settings.get("publisher_name", "").strip()
    profile_role = settings.get("profile_role", "").strip()
    intro = " ".join(
        part.strip()
        for part in (
            settings.get("home_intro_primary", ""),
            settings.get("home_intro_secondary", ""),
        )
        if part.strip()
    )
    parts: list[str] = []
    if publisher_name and profile_role:
        parts.append(f"{publisher_name} is a {profile_role}.")
    elif publisher_name:
        parts.append(f"Writing and essays from {publisher_name}.")
    if intro:
        parts.append(intro)
    description = " ".join(parts).strip()
    if description:
        return plain_text_excerpt(description, 160)
    return plain_text_excerpt(settings.get("site_title", SITE_TITLE), 160)


def default_share_image(settings: dict[str, str]) -> str:
    return sanitize_url(settings.get("social_image_url", "").strip())


def absolute_url(url_value: str) -> str:
    candidate = sanitize_url(url_value)
    if not candidate:
        return ""
    parsed = urlparse(candidate)
    if parsed.scheme:
        return candidate
    return urljoin(request.url_root, candidate)


def extract_first_image_url(html_content: str) -> str:
    match = IMAGE_SRC_PATTERN.search(html_content or "")
    if not match:
        return ""
    return absolute_url(match.group(1))


def webpage_schema(title: str, description: str, canonical_url: str, page_type: str = "WebPage") -> dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": page_type,
        "name": title,
        "description": description,
        "url": canonical_url,
    }


def person_schema(settings: dict[str, str], canonical_url: str, description: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": settings.get("publisher_name", "").strip() or settings.get("site_title", SITE_TITLE),
        "description": description,
        "url": canonical_url,
    }
    profile_role = settings.get("profile_role", "").strip()
    linkedin_url = settings.get("linkedin_url", "").strip()
    if profile_role:
        payload["jobTitle"] = profile_role
    if linkedin_url:
        payload["sameAs"] = [linkedin_url]
    return payload


def website_schema(settings: dict[str, str], canonical_url: str, description: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": settings.get("site_title", SITE_TITLE),
        "description": description,
        "url": canonical_url,
    }
    publisher_name = settings.get("publisher_name", "").strip()
    if publisher_name:
        payload["publisher"] = {"@type": "Person", "name": publisher_name}
    return payload


def article_schema(
    post: Post,
    settings: dict[str, str],
    canonical_url: str,
    description: str,
    image_url: str,
) -> dict[str, Any]:
    author_name = settings.get("publisher_name", "").strip() or settings.get("site_title", SITE_TITLE)
    author_payload: dict[str, Any] = {
        "@type": "Person",
        "name": author_name,
    }
    linkedin_url = settings.get("linkedin_url", "").strip()
    if linkedin_url:
        author_payload["sameAs"] = [linkedin_url]

    payload: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": description,
        "datePublished": post.published_at.isoformat(),
        "dateModified": post.published_at.isoformat(),
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical_url},
        "url": canonical_url,
        "author": author_payload,
        "publisher": author_payload,
    }
    if image_url:
        payload["image"] = [image_url]
    return payload


def build_seo_metadata(
    *,
    settings: dict[str, str],
    title: str,
    description: str,
    canonical_url: str = "",
    robots: str = "index,follow",
    og_type: str = "website",
    image_url: str = "",
    structured_data: list[dict[str, Any]] | None = None,
    author_name: str = "",
    published_time: str = "",
    modified_time: str = "",
) -> dict[str, str]:
    canonical = absolute_url(canonical_url or request.base_url)
    resolved_image_url = absolute_url(image_url or default_share_image(settings))
    g.robots_directive = robots

    json_ld = ""
    if structured_data:
        payload: dict[str, Any] | list[dict[str, Any]]
        payload = structured_data[0] if len(structured_data) == 1 else structured_data
        json_ld = json.dumps(payload, ensure_ascii=False)

    return {
        "title": page_title(title, settings.get("site_title", SITE_TITLE)),
        "description": plain_text_excerpt(description or title, 160),
        "canonical_url": canonical,
        "robots": robots,
        "og_type": og_type,
        "image_url": resolved_image_url,
        "image_alt": plain_text_excerpt(title or settings.get("site_title", SITE_TITLE), 120),
        "site_name": settings.get("site_title", SITE_TITLE),
        "author_name": plain_text_excerpt(author_name, 120),
        "published_time": published_time,
        "modified_time": modified_time,
        "json_ld": json_ld,
        "twitter_card": "summary_large_image" if resolved_image_url else "summary",
    }


def resolve_editor_body(raw_html: str, submitted_markdown: str) -> tuple[str, str]:
    markdown_body = (submitted_markdown or "").strip()
    if markdown_body:
        return markdown_body, render_markdown(markdown_body)

    sanitized_html = sanitize_html_fragment(raw_html or "")
    if sanitized_html:
        return sanitized_html, sanitized_html

    fallback_markdown = html_to_markdown(raw_html or "").strip() if raw_html else ""
    if fallback_markdown:
        return fallback_markdown, render_markdown(fallback_markdown)
    return "", ""


def csrf_token() -> str:
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def request_has_valid_csrf() -> bool:
    expected = session.get(CSRF_SESSION_KEY)
    provided = request.form.get(CSRF_FIELD_NAME) or request.headers.get("X-CSRF-Token")
    if not expected or not provided:
        return False
    return hmac.compare_digest(expected, provided)


def is_safe_next_url(next_url: str | None) -> bool:
    if not next_url:
        return False
    parsed = urlparse(next_url)
    return not parsed.scheme and not parsed.netloc and next_url.startswith("/")


def client_ip() -> str:
    remote_addr = request.remote_addr or "unknown"
    # Proxy headers are user-controlled unless a trusted reverse proxy strips/sets them.
    if not env_flag("BLOG_TRUST_PROXY_HEADERS", False):
        return remote_addr

    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        candidate = forwarded_for.split(",")[0].strip()
        if candidate:
            return candidate
    real_ip = request.headers.get("X-Real-IP", "").strip()
    return real_ip or remote_addr


def prune_login_attempts(now: float | None = None) -> None:
    current = now if now is not None else time.time()
    stale_ips: list[str] = []
    for ip, attempts in LOGIN_ATTEMPTS.items():
        active = [stamp for stamp in attempts if current - stamp <= LOGIN_ATTEMPT_WINDOW_SECONDS]
        if active:
            LOGIN_ATTEMPTS[ip] = active
        else:
            stale_ips.append(ip)
    for ip in stale_ips:
        LOGIN_ATTEMPTS.pop(ip, None)

    if len(LOGIN_ATTEMPTS) <= LOGIN_ATTEMPT_TRACK_LIMIT:
        return

    recent_entries = sorted(
        LOGIN_ATTEMPTS.items(),
        key=lambda item: item[1][-1] if item[1] else 0.0,
        reverse=True,
    )[:LOGIN_ATTEMPT_TRACK_LIMIT]
    LOGIN_ATTEMPTS.clear()
    LOGIN_ATTEMPTS.update(recent_entries)


def too_many_login_attempts(ip: str) -> bool:
    now = time.time()
    prune_login_attempts(now)
    attempts = LOGIN_ATTEMPTS.get(ip, [])
    return len(attempts) >= LOGIN_ATTEMPT_LIMIT


def record_failed_login(ip: str) -> None:
    now = time.time()
    prune_login_attempts(now)
    attempts = list(LOGIN_ATTEMPTS.get(ip, []))
    attempts.append(now)
    LOGIN_ATTEMPTS[ip] = attempts


def clear_failed_logins(ip: str) -> None:
    LOGIN_ATTEMPTS.pop(ip, None)


def resolve_image_extension(stream) -> str:
    stream.seek(0)
    header = stream.read(64)
    stream.seek(0)

    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if header.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
        return ".gif"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return ".webp"
    return ""


def load_site_settings() -> dict[str, str]:
    stamp: tuple[int, int] | None = None
    if SETTINGS_PATH.exists():
        stat = SETTINGS_PATH.stat()
        stamp = (stat.st_mtime_ns, stat.st_size)
    if SETTINGS_CACHE.get("stamp") == stamp:
        return dict(SETTINGS_CACHE.get("settings", DEFAULT_SETTINGS.copy()))

    settings = DEFAULT_SETTINGS.copy()
    if SETTINGS_PATH.exists():
        payload = yaml.safe_load(SETTINGS_PATH.read_text(encoding="utf-8")) or {}
        if isinstance(payload, dict):
            for key in settings:
                value = payload.get(key)
                if value is not None:
                    settings[key] = str(value).strip()
            if not settings["publisher_name"]:
                settings["publisher_name"] = str(payload.get("site_title", DEFAULT_SETTINGS["publisher_name"])).strip()
    SETTINGS_CACHE["stamp"] = stamp
    SETTINGS_CACHE["settings"] = settings
    return settings


def save_site_settings(settings: dict[str, str]) -> None:
    try:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        SETTINGS_PATH.write_text(yaml.safe_dump(settings, sort_keys=False), encoding="utf-8")
    except OSError as exc:
        LOGGER.exception("Failed to write site settings: %s", SETTINGS_PATH)
        raise StorageWriteError(f"Cannot save site settings. {STORAGE_PERMISSION_HINT}") from exc
    SETTINGS_CACHE["stamp"] = None


def sanitize_typography_theme(value: str) -> str:
    candidate = (value or "").strip().lower()
    return candidate if candidate in TYPOGRAPHY_THEMES else DEFAULT_SETTINGS["typography_theme"]


def admin_username() -> str:
    return APP_CONFIG["admin_user"]


def admin_password_hash() -> str:
    return APP_CONFIG["admin_password_hash"]


def verify_admin_password(password: str) -> bool:
    provided_hash = admin_password_hash()
    if provided_hash:
        return check_password_hash(provided_hash, password)
    configured_password = APP_CONFIG["admin_password"]
    if not configured_password or configured_password == "admin123":
        return False
    return hmac.compare_digest(password, configured_password)


def is_authenticated() -> bool:
    return bool(session.get("authenticated"))


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_authenticated():
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


@app.before_request
def enforce_csrf() -> None:
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    if request.endpoint in SAFE_POST_ENDPOINTS:
        return
    if request.endpoint == "static":
        return
    if not request_has_valid_csrf():
        abort(400, description="Invalid CSRF token.")


@app.after_request
def set_response_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data:; "
        "style-src 'self'; "
        "script-src 'self'; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "form-action 'self'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'"
    )
    robots_directive = getattr(g, "robots_directive", "")
    if robots_directive:
        response.headers["X-Robots-Tag"] = robots_directive
    return response


@app.context_processor
def inject_template_globals():
    host = request.host.split(":")[0] if request.host else "localhost"
    back_href = None
    back_label = None
    endpoint = request.endpoint or ""
    if endpoint == "article_detail":
        back_href = url_for("articles")
        back_label = "Back to Articles"
    elif endpoint == "articles":
        back_href = url_for("home")
        back_label = "Back to Main Page"
    return {
        "site_settings": load_site_settings(),
        "is_authenticated": is_authenticated(),
        "csrf_token": csrf_token(),
        "header_domain": host,
        "public_back_href": back_href,
        "public_back_label": back_label,
        "static_asset_url": static_asset_url,
    }


@app.get("/")
def home():
    settings = load_site_settings()
    posts = list_posts()
    featured = posts[0] if posts else None
    description = site_meta_description(settings)
    canonical_url = url_for("home", _external=True)
    home_title = settings["publisher_name"] or settings["site_title"]
    if settings.get("profile_role", "").strip():
        home_title = f"{home_title}, {settings['profile_role']}"
    seo = build_seo_metadata(
        settings=settings,
        title=home_title,
        description=description,
        canonical_url=canonical_url,
        og_type="website",
        image_url=extract_first_image_url(featured.body_html) if featured else "",
        structured_data=[
            website_schema(settings, canonical_url, description),
            person_schema(settings, canonical_url, description),
            webpage_schema(home_title, description, canonical_url),
        ],
        author_name=settings["publisher_name"],
    )
    return render_template(
        "home.html",
        site_title=settings["site_title"],
        featured=featured,
        posts=posts[:6],
        seo=seo,
    )


@app.get("/articles")
def articles():
    settings = load_site_settings()
    posts = list_posts()
    description = plain_text_excerpt(
        f"Published articles by {settings['publisher_name'] or settings['site_title']}. {site_meta_description(settings)}",
        160,
    )
    canonical_url = url_for("articles", _external=True)
    seo = build_seo_metadata(
        settings=settings,
        title=f"Articles by {settings['publisher_name'] or settings['site_title']}",
        description=description,
        canonical_url=canonical_url,
        og_type="website",
        image_url=extract_first_image_url(posts[0].body_html) if posts else "",
        structured_data=[webpage_schema("Articles", description, canonical_url, page_type="CollectionPage")],
        author_name=settings["publisher_name"],
    )
    return render_template("articles.html", site_title=settings["site_title"], posts=posts, seo=seo)


@app.get("/article/<slug>")
def article_detail(slug: str):
    settings = load_site_settings()
    post = get_post(slug)
    if not post:
        abort(404)
    if post.is_draft and not is_authenticated():
        abort(404)
    description = plain_text_excerpt(post.summary or post.body_markdown or post.body_html, 160)
    canonical_url = url_for("article_detail", slug=post.slug, _external=True)
    image_url = extract_first_image_url(post.body_html)
    robots = "noindex,nofollow,noarchive" if post.is_draft else "index,follow"
    seo = build_seo_metadata(
        settings=settings,
        title=post.title,
        description=description,
        canonical_url=canonical_url,
        robots=robots,
        og_type="article",
        image_url=image_url,
        structured_data=[
            article_schema(post, settings, canonical_url, description, image_url),
            webpage_schema(post.title, description, canonical_url),
        ],
        author_name=settings["publisher_name"],
        published_time=post.published_at.isoformat(),
        modified_time=post.published_at.isoformat(),
    )
    return render_template("article_detail.html", site_title=settings["site_title"], post=post, seo=seo)


@app.get("/essays")
def essays_legacy():
    return redirect(url_for("articles"), code=301)


@app.get("/essay/<slug>")
def essay_detail_legacy(slug: str):
    return redirect(url_for("article_detail", slug=slug), code=301)


@app.route("/publish", methods=["GET", "POST"], endpoint="publish")
@app.route("/editor", methods=["GET", "POST"])
@login_required
def editor():
    settings = load_site_settings()
    message = ""
    initial = {
        "title": "",
        "published_at": dt.date.today().isoformat(),
        "summary": "",
        "body": "",
        "body_html": "",
        "slug": "",
        "original_slug": "",
        "status": "draft",
    }

    if request.method == "POST":
        raw_html = request.form.get("body_html", "")
        submitted_markdown = request.form.get("body", "")
        body_storage, body_html = resolve_editor_body(raw_html, submitted_markdown)

        summary = request.form.get("summary", "").strip()
        if not summary:
            summary = make_summary(body_storage)

        action = request.form.get("action", "publish").strip().lower()
        status = "draft" if action == "draft" else "published"
        initial = {
            "title": request.form.get("title", ""),
            "published_at": request.form.get("published_at", dt.date.today().isoformat()),
            "summary": summary,
            "body": body_storage,
            "body_html": body_html,
            "slug": request.form.get("slug", ""),
            "original_slug": request.form.get("original_slug", ""),
            "status": status,
        }
        try:
            if status == "published" and not initial["body"].strip():
                raise ValueError("Add some content before publishing.")
            slug = save_post(
                title=initial["title"],
                published_at=initial["published_at"],
                summary=initial["summary"],
                body=initial["body"],
                slug=initial["slug"],
                original_slug=initial["original_slug"],
                status=initial["status"],
            )
            initial["slug"] = slug
            initial["original_slug"] = slug
            if status == "draft":
                message = f"Draft saved: /publish/{slug}"
            else:
                message = f"Published successfully: /article/{slug}"
        except (ValueError, StorageWriteError) as exc:
            message = str(exc)

    posts = list_posts(include_drafts=True)
    drafts = [post for post in posts if post.is_draft]
    seo = build_seo_metadata(
        settings=settings,
        title="Publish",
        description="Write, save drafts, and publish articles.",
        canonical_url=url_for("publish", _external=True),
        robots="noindex,nofollow,noarchive",
        author_name=settings["publisher_name"],
    )
    return render_template(
        "editor.html",
        site_title=settings["site_title"],
        message=message,
        initial=initial,
        posts=posts,
        drafts=drafts,
        seo=seo,
    )


@app.get("/publish/<slug>", endpoint="publish_existing")
@app.get("/editor/<slug>")
@login_required
def editor_existing(slug: str):
    settings = load_site_settings()
    post = get_post(slug)
    if not post:
        abort(404)

    posts = list_posts(include_drafts=True)
    initial = {
        "title": post.title,
        "published_at": post.published_at.isoformat(),
        "summary": post.summary,
        "body": post.body_markdown,
        "body_html": post.body_html,
        "slug": post.slug,
        "original_slug": post.slug,
        "status": post.status,
    }
    drafts = [item for item in posts if item.is_draft]
    seo = build_seo_metadata(
        settings=settings,
        title=f"Edit {post.title}",
        description="Update an existing article draft or published post.",
        canonical_url=url_for("publish_existing", slug=post.slug, _external=True),
        robots="noindex,nofollow,noarchive",
        author_name=settings["publisher_name"],
    )
    return render_template(
        "editor.html",
        site_title=settings["site_title"],
        message="Editing existing article",
        initial=initial,
        posts=posts,
        drafts=drafts,
        seo=seo,
    )


@app.post("/api/preview")
def preview():
    payload = request.get_json(silent=True) if request.is_json else None
    body = payload.get("body", "") if isinstance(payload, dict) else ""
    html_content = render_markdown(body)
    return jsonify({"html": html_content})


@app.post("/preview")
@login_required
def preview_article():
    settings = load_site_settings()
    title = request.form.get("title", "").strip() or "Untitled preview"
    summary = request.form.get("summary", "").strip()
    raw_html = request.form.get("body_html", "")
    submitted_markdown = request.form.get("body", "")
    body_storage, _body_html = resolve_editor_body(raw_html, submitted_markdown)
    if not summary:
        summary = make_summary(body_storage)
    published_raw = request.form.get("published_at", "").strip()
    try:
        published_at = dt.date.fromisoformat(published_raw) if published_raw else dt.date.today()
    except ValueError:
        published_at = dt.date.today()

    post = Post(
        slug="preview",
        title=title,
        published_at=published_at,
        summary=summary,
        body_markdown=body_storage,
        status="draft",
    )
    seo = build_seo_metadata(
        settings=settings,
        title=f"Preview: {post.title}",
        description=plain_text_excerpt(post.summary or post.body_markdown, 160),
        canonical_url=url_for("publish", _external=True),
        robots="noindex,nofollow,noarchive",
        og_type="article",
        image_url=extract_first_image_url(post.body_html),
        author_name=settings["publisher_name"],
    )
    return render_template("preview.html", site_title=settings["site_title"], post=post, seo=seo)


@app.post("/api/upload-image")
@login_required
def upload_image():
    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "No image file provided"}), 400

    extension = resolve_image_extension(file.stream)
    if not extension:
        return jsonify({"error": f"Unsupported image format: {extension or 'unknown'}"}), 400

    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored_name
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        file.save(destination)
    except OSError as exc:
        LOGGER.exception("Failed to save uploaded image: %s", destination)
        return jsonify({"error": f"Cannot store uploads. {STORAGE_PERMISSION_HINT}"}), 500

    return jsonify({"url": url_for("static", filename=f"uploads/{stored_name}")})


@app.post("/publish/delete/<slug>")
@login_required
def delete_article(slug: str):
    deleted_slug = slugify(slug)
    try:
        delete_post(slug)
    except StorageWriteError as exc:
        abort(500, description=str(exc))
    requested_next = request.form.get("next", "")
    referrer_path = urlparse(request.referrer).path if request.referrer else ""
    next_url = requested_next if is_safe_next_url(requested_next) else referrer_path

    # Avoid redirecting back to a just-deleted editor page (e.g. /publish/<slug>).
    slug_route_match = re.fullmatch(r"/(?:publish|editor)/([^/]+)", next_url or "")
    if slug_route_match:
        target_slug = slugify(slug_route_match.group(1))
        if target_slug == deleted_slug:
            next_url = url_for("publish")

    if not is_safe_next_url(next_url):
        next_url = url_for("publish")
    return redirect(next_url)


@app.errorhandler(RequestEntityTooLarge)
def handle_large_upload(_error):
    max_mb = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return jsonify({"error": f"Image is too large. Max size is {max_mb}MB."}), 413


@app.get("/rss.xml")
def rss_feed():
    settings = load_site_settings()
    posts = list_posts()[:20]
    feed_items = []
    for post in posts:
        feed_items.append(
            {
                "title": html.escape(post.title),
                "link": url_for("article_detail", slug=post.slug, _external=True),
                "pub_date": post.published_at.strftime("%a, %d %b %Y 00:00:00 +0000"),
                "description": html.escape(post.summary),
            }
        )

    xml = render_template("rss.xml", site_title=settings["site_title"], items=feed_items)
    return app.response_class(xml, mimetype="application/rss+xml")


@app.get("/sitemap.xml")
def sitemap():
    posts = list_posts()
    items = [
        {"loc": url_for("home", _external=True), "lastmod": ""},
        {"loc": url_for("articles", _external=True), "lastmod": ""},
    ]
    for post in posts:
        items.append(
            {
                "loc": url_for("article_detail", slug=post.slug, _external=True),
                "lastmod": post.published_at.isoformat(),
            }
        )

    xml = render_template("sitemap.xml", items=items)
    return app.response_class(xml, mimetype="application/xml")


@app.get("/robots.txt")
def robots_txt():
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /login",
        "Disallow: /settings",
        "Disallow: /editor",
        "Disallow: /publish",
        "Disallow: /preview",
        "Disallow: /api/",
        f"Sitemap: {url_for('sitemap', _external=True)}",
    ]
    return app.response_class("\n".join(lines) + "\n", mimetype="text/plain")


@app.route("/login", methods=["GET", "POST"])
def login():
    settings = load_site_settings()
    message = ""
    seo = build_seo_metadata(
        settings=settings,
        title="Login",
        description="Admin login for publishing and site settings.",
        canonical_url=url_for("login", _external=True),
        robots="noindex,nofollow,noarchive",
        author_name=settings["publisher_name"],
    )
    if request.method == "POST":
        ip = client_ip()
        if too_many_login_attempts(ip):
            message = "Too many failed attempts. Please try again in a few minutes."
            return render_template("login.html", site_title=settings["site_title"], message=message, seo=seo), 429
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if username == admin_username() and verify_admin_password(password):
            clear_failed_logins(ip)
            session.permanent = True
            session["authenticated"] = True
            session["username"] = username
            next_candidate = request.args.get("next", "")
            next_url = next_candidate if is_safe_next_url(next_candidate) else url_for("publish")
            return redirect(next_url)
        record_failed_login(ip)
        message = "Invalid username or password"
    return render_template("login.html", site_title=settings["site_title"], message=message, seo=seo)


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


@app.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    current = load_site_settings()
    current["typography_theme"] = sanitize_typography_theme(current.get("typography_theme", ""))
    message = ""
    if request.method == "POST":
        linkedin_url = sanitize_url(request.form.get("linkedin_url", "").strip())
        if linkedin_url and not urlparse(linkedin_url).scheme:
            linkedin_url = sanitize_url(f"https://{linkedin_url}")
        updated = {
            "site_title": request.form.get("site_title", "").strip() or DEFAULT_SETTINGS["site_title"],
            "publisher_name": request.form.get("publisher_name", "").strip() or DEFAULT_SETTINGS["publisher_name"],
            "profile_role": request.form.get("profile_role", "").strip() or DEFAULT_SETTINGS["profile_role"],
            "linkedin_url": linkedin_url,
            "social_image_url": sanitize_url(request.form.get("social_image_url", "").strip()),
            "typography_theme": sanitize_typography_theme(request.form.get("typography_theme", "")),
            "home_intro_primary": request.form.get("home_intro_primary", "").strip() or DEFAULT_SETTINGS["home_intro_primary"],
            "home_intro_secondary": request.form.get("home_intro_secondary", "").strip()
            or DEFAULT_SETTINGS["home_intro_secondary"],
        }
        try:
            save_site_settings(updated)
            current = updated
            message = "Settings saved."
        except StorageWriteError as exc:
            message = str(exc)
    seo = build_seo_metadata(
        settings=current,
        title="Settings",
        description="Update site branding, homepage copy, and publishing settings.",
        canonical_url=url_for("settings", _external=True),
        robots="noindex,nofollow,noarchive",
        author_name=current["publisher_name"],
    )
    return render_template(
        "settings.html",
        site_title=current["site_title"],
        settings=current,
        typography_themes=TYPOGRAPHY_THEMES,
        message=message,
        seo=seo,
    )


if __name__ == "__main__":
    host = os.getenv("BLOG_HOST", "127.0.0.1")
    port = int(os.getenv("BLOG_PORT", "5000"))
    debug_mode = env_flag("BLOG_DEBUG", False)
    app.run(host=host, port=port, debug=debug_mode)
