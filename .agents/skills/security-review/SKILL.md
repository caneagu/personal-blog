---
name: security-review
description: Review this Flask personal blog for exploitable security issues. Use when asked to audit authentication, session handling, CSRF, markdown rendering, file uploads, reverse-proxy trust, secret handling, or deployment hardening in this repository.
---

# Security Review

Use this skill for security audits of this repo. Focus on real attack paths and concrete abuse cases, not generic checklist noise.

## Review scope

- `app.py`: authentication, session state, CSRF enforcement, redirect validation, trusted host handling, markdown sanitization, upload handling, and filesystem writes.
- `templates/` and `static/editor.js`: rendering paths that use `safe` HTML, preview flows, CSRF token handling, and any browser-side behavior that can widen the attack surface.
- `.env.example`, `Dockerfile`, `docker-compose.yml`, `gunicorn.conf.py`, `scripts/provision_vm.sh`, and `README.md`: secret handling, cookie and proxy settings, container hardening, and deployment guidance.
- `content/` conventions and file write paths: publish, delete, settings, and image upload operations.

## Threat model

- Unauthenticated internet users hitting public endpoints.
- Authenticated admins using editor, preview, settings, and upload paths.
- Malicious content submitted through markdown, HTML, filenames, or image uploads.
- Reverse-proxy or host-header misconfiguration that changes the app's trust boundary.
- Accidental secret disclosure through committed files or insecure setup guidance.

## Review rules

1. Findings first, ordered by exploitability and impact.
2. Prefer concrete attack paths such as XSS, CSRF bypass, auth bypass, open redirect, path traversal, unsafe file handling, header spoofing, secret leakage, or denial of service.
3. Separate confirmed vulnerabilities from defense-in-depth suggestions.
4. State the conditions required for exploitability when a finding depends on deployment choices.
5. Cite exact file locations and recommend the smallest effective remediation.

## Repo-specific checks

- `SAFE_POST_ENDPOINTS`, `enforce_csrf()`, login/logout flow, and session lifetime handling.
- `client_ip()` and `BLOG_TRUST_PROXY_HEADERS`, including spoofing risks behind misconfigured proxies.
- Markdown sanitization, HTML-to-markdown conversion, and every template use of `| safe`.
- Upload validation, file naming, extension detection, maximum upload size, and write destinations under `static/uploads`.
- `is_safe_next_url()`, `TRUSTED_HOSTS`, cookie flags, CSP, and other response security headers.
- `.env`, `content/config.yml`, and docs or scripts that could normalize insecure production defaults.

## Output

- Report only real findings and high-signal risks.
- For each finding, include severity, exploit path, affected file references, and a concrete fix.
- If you find no material issues, say so explicitly and mention residual risk areas that were not validated by tests or runtime configuration.
