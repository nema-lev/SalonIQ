# Project Overview

`SalonIQ` is a multi-tenant SaaS booking platform. The repository primarily contains a `frontend/` app, a `backend/` API, and `docs/` reference material. Focus on the code paths that affect booking reliability, tenant resolution, and clean behavior across local, preview, and future SaaS deployments.

# Product Direction

- One platform serving multiple business types over time.
- Public client portal, business owner admin portal, and super admin portal.
- Near-term priority: reliable core booking flows and correct multi-tenant behavior in dev, preview, and production-like environments.
- Optimize for correctness, clarity, reliability, and maintainability over cleverness.

# Repository Map

- `frontend/`: public portal, owner-facing UI, and shared client-side/SSR tenant behavior.
- `backend/`: source of truth for tenant resolution, booking APIs, auth, and business rules.
- `docs/`: reference material; not the first place to make product decisions unless the task asks for documentation updates.
- Root scripts/config: deployment, environment examples, and repo-wide setup support.
- Research `.docx` files: context only, not implementation sources.

# Working Rules

- Scope the task before editing. Identify the user-visible behavior, the owning layer, and the smallest set of files needed.
- Planning, specification, and review tasks must not make code changes, commits, or pushes.
- Prefer the smallest clean solution that preserves future SaaS extensibility.
- Do not redesign architecture for a local fix.
- Do not change unrelated product behavior while fixing a scoped issue.
- Preserve support for future custom domains and SaaS multi-tenancy.
- Follow existing patterns before introducing new helpers, abstractions, or cross-cutting refactors.

# Task Routing

- Tenant resolution, auth boundaries, booking rules, and notification rules belong in `backend/` unless the task is clearly UI-only.
- Public booking UX, admin screens, and tenant-aware SSR/client behavior belong in `frontend/`.
- Documentation-only work belongs in `docs/`.
- Keep tenant logic, booking logic, admin logic, and notification logic clearly separated. Do not blend concerns just to save a few lines.

# Edit Strategy

- Read only the files required for the task.
- Start from the owning feature/module, then inspect directly related callers, types, tests, and config.
- Reuse existing patterns and utilities when they fit.
- Add new abstractions only when repetition or coupling clearly justifies them.
- Keep fixes local when possible; expand scope only when correctness requires it.

# Validation Strategy

- Prefer targeted builds/tests/checks for the affected area first.
- Do not default to the heaviest full-project workflow if a smaller relevant check is enough.
- Validate the changed path end-to-end when practical, especially for tenant resolution, booking flow, auth, and notifications.
- If no automated check is available, describe the smallest meaningful manual verification.

# Output Expectations

- Summarize what changed and why.
- List the files changed.
- Include exact env vars, migrations, seeds, or manual test steps if relevant.
- Call out risks, follow-ups, or things intentionally not changed.
- For implementation tasks, default to this handoff unless the task is explicitly planning-only or the user explicitly says not to push: make the requested change, run the smallest relevant validation, create a concise git commit, push to the current branch, and report the commit SHA.
- If push fails, say so clearly.
- Never claim code is pushed unless the push actually succeeded.

# Avoid Unless Required

- Do not spend time in research `.docx` files unless the task explicitly asks for them.
- Avoid `node_modules/`, `.next/`, `dist/`, `archives/`, temp folders, and generated files unless the task explicitly requires them.
- Avoid broad repo scans when the task is clearly scoped to one layer or feature.
- Avoid using `docs/` as the main source of truth for behavior unless the task is documentation-focused.
