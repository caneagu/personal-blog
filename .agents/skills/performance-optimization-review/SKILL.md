---
name: performance-optimization-review
description: Review this Flask personal blog for backend, frontend, and deployment performance issues. Use when asked to audit latency, repeated disk or YAML work, markdown rendering cost, cache behavior, large JavaScript or CSS hotspots, or scaling limits, especially when recommendations must keep the code simple and understandable.
---

# Performance Optimization Review

Use this skill for review-only audits of this repo. The goal is to find the highest-leverage performance improvements without turning a small Flask app into an over-engineered system.

## Review scope

- `app.py`: request flow, markdown rendering, YAML and filesystem I/O, cache invalidation, SEO generation, feed generation, login throttling memory growth, and upload handling.
- `static/editor.js`, `static/base.js`, `static/styles.css`: bundle size, synchronous DOM work, repeated serialization, blocking UI behavior, and unnecessary reflows.
- `templates/`: repeated work inside request-time rendering, payload bloat, and expensive template patterns.
- `Dockerfile`, `docker-compose.yml`, `gunicorn.conf.py`, and `README.md`: worker sizing, process-local caching tradeoffs, and deployment-level bottlenecks.

## Review rules

1. Prefer clarity-preserving fixes. Do not recommend complexity-heavy abstractions unless the payoff is material.
2. Prioritize user-visible latency, avoidable repeated work, unnecessary disk I/O, memory growth, and scaling bottlenecks.
3. Distinguish confirmed issues from inferred hotspots. If you infer, say so explicitly.
4. Favor changes that fit the current architecture: Flask, filesystem-backed content, Jinja templates, and vanilla JavaScript.
5. Call out when a theoretically faster change would make the code harder to maintain and is not worth it.

## Repo-specific checks

- Repeated post parsing and markdown rendering across page requests.
- Cache behavior in `POSTS_CACHE` and `SETTINGS_CACHE`, especially with multiple Gunicorn workers.
- RSS, sitemap, and SEO generation paths that may repeat expensive work.
- Editor preview and markdown conversion paths that may do redundant serialization.
- Frontend code in `static/editor.js` that can trigger expensive DOM traversals or unnecessary state churn.
- Upload and image flows that may do more work than needed on the request path.

## Output

- Present findings first, ordered by severity or impact.
- For each finding, include the user-facing impact, why it happens, the simplest viable fix, and concrete file references.
- Prefer small, actionable fixes over broad rewrites.
- If there are no material findings, say so explicitly and mention any measurement gaps or areas you could not validate.
