# Calendar V2 allocation report review

Date: 2026-05-18
Scope: operational readiness review for the existing **read-only** Calendar V2 allocation backfill report. This review does **not** execute a real backfill, change schema, or change runtime behavior.

## 1. What was attempted

I inspected the existing report and the documented production path before attempting any runtime action:

- `backend/scripts/calendar-allocation-backfill-report.js`
- `backend/src/modules/internal-diagnostics/`
- `backend/test/calendar-allocation-backfill-report.spec.ts`
- `backend/test/internal-diagnostics.service.spec.ts`
- `backend/test/internal-diagnostics.controller.spec.ts`
- `backend/src/common/prisma/tenant-prisma.service.ts`
- `backend/src/modules/appointments/appointments.service.ts`
- `docs/calendar-v2-stabilization-audit.md`
- `docs/calendar-v2-production-gap-audit.md`
- `docs/calendar-v2-authoritative-scheduling-architecture.md`
- `frontend/src/components/admin/calendar-v2/README.md`

I then checked whether this workspace had enough runtime context to run the report safely for the actual pilot tenant.

## 2. Whether the report was actually run

**No.** The report was **not** run in this session.

The repository and current shell do not provide enough verified information to select the actual pilot tenant or access its runtime safely:

- `DATABASE_URL` is not present in the current shell.
- `ENABLE_INTERNAL_DIAGNOSTICS` is not present in the current shell.
- No deployed backend base URL is present in the current shell.
- No authenticated tenant `OWNER`/`ADMIN` session or bearer token is available in the current shell.
- The checked-in docs reviewed for this task do not identify the actual pilot tenant slug or schema name.

Because the target tenant is ambiguous and runtime credentials are unavailable, running a report here would require guessing. Per the task safety rules, no guess was made.

## 3. Runtime / environment used

Review environment only:

- Local repository: `saloniq`
- Branch: `main`
- Review date: `2026-05-18`
- Shell-visible runtime inputs checked, without reading or recording secrets:
  - `DATABASE_URL`: absent
  - `ENABLE_INTERNAL_DIAGNOSTICS`: absent
  - `BACKEND_URL`: absent
  - `DEFAULT_TENANT_SLUG`: absent
  - `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`: absent

No production, staging, or local database connection was used.

## 4. Tenant / schema reviewed

**No tenant schema was reviewed.**

The actual pilot tenant/schema was not stated in the checked-in material inspected for this task, and the task explicitly forbids guessing when the target tenant is ambiguous.

## 5. Read-only safety confirmation

The existing report path is verified as read-only:

1. `backend/scripts/calendar-allocation-backfill-report.js` starts `BEGIN READ ONLY` inside `runReadOnlyReport(...)`.
2. The report implementation uses inspection queries only and always issues `ROLLBACK` in a `finally` block.
3. The CLI `main()` calls `runReadOnlyReport(...)`; it does not call any allocation creation, appointment mutation, or backfill routine.
4. `GET /api/v1/internal/diagnostics/calendar-allocation-backfill-report` delegates to the same `runReadOnlyReport(...)` implementation through `InternalDiagnosticsService`.
5. The diagnostics endpoint is disabled unless `ENABLE_INTERNAL_DIAGNOSTICS=true`, requires authenticated JWT + tenant context + `OWNER`/`ADMIN`, and rejects a cross-tenant `schema` filter.
6. Tests assert the report path begins with `BEGIN READ ONLY`, ends with `ROLLBACK`, and emits no `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, or `TRUNCATE` statements.

**Confirmed:** no mutation/backfill code path was executed in this review, and no command that would mutate production data was run.

## 6. Report summary

Not available because the report was not run.

| Required field | Result in this review |
| --- | --- |
| Tenant schema/name | Not available |
| Report timestamp | Not available |
| Readiness status | Not available |
| Active standard appointments missing allocations | Not available |
| Orphan active appointment allocations | Not available |
| Terminal appointments with active allocations | Not available |
| Duplicate active allocations | Not available |
| Overlapping legacy appointment pairs | Not available |
| Buffer-only conflict pairs | Not available |
| Active exclusive allocation overlaps | Not available |
| Allocation infrastructure status | Not available |
| Exact recommended next step from report | Not available |

## 7. Pilot readiness verdict

### **Cannot determine because runtime/report access is unavailable**

From an allocation/conflict perspective, this review cannot classify the actual pilot tenant as safe, review-needed, or blocked because no tenant-scoped report output was available.

The current system-level audits already state that the pilot gate remains open until this read-only report is actually run and reviewed for the real pilot tenant data. This review does not change that status.

## 8. Exact blockers

The review is blocked by missing operational inputs, not by a discovered tenant-data anomaly:

1. Missing direct database path: no `DATABASE_URL` is available in the current shell.
2. Missing deployed diagnostics path inputs: no verified backend base URL, no confirmed `ENABLE_INTERNAL_DIAGNOSTICS=true` runtime window, and no authenticated tenant `OWNER`/`ADMIN` session/token are available here.
3. Missing target identification: the actual pilot tenant slug/schema was not supplied and was not identified in the inspected repository material.

No tenant-specific overlap, orphan, duplicate-allocation, or schema finding can be claimed until one of the supported read-only paths is run against the real pilot tenant.

## 9. Operator runbook

Use **one** of the two existing read-only paths below. Do not run a real backfill as part of this step.

### Option A — direct CLI report path

Use this when the operator has a valid database connection string and the exact pilot tenant schema.

Required inputs:

- `DATABASE_URL`
- Exact tenant schema name for the pilot tenant, for example `tenant_demo_business`

Exact command:

```bash
cd backend
DATABASE_URL="..." npm run report:calendar-allocation-backfill -- --schema=tenant_demo_business
```

For machine-readable capture:

```bash
cd backend
DATABASE_URL="..." npm run report:calendar-allocation-backfill -- --schema=tenant_demo_business --json
```

Replace `tenant_demo_business` with the **operator-confirmed** actual pilot tenant schema. Do not infer it.

Expected high-level output fields:

- `generatedAt`
- `mode` = `READ_ONLY`
- `tenants[].schemaName`
- `tenants[].readiness`
- `tenants[].activeStandardAppointments`
- `tenants[].activeAppointmentsMissingAllocations`
- `tenants[].orphanAllocations`
- `tenants[].terminalAppointmentsWithActiveAllocations`
- `tenants[].duplicateActiveAllocations`
- `tenants[].overlappingLegacyAppointmentPairs`
- `tenants[].bufferOnlyConflictPairs`
- `tenants[].existingAllocationOverlapPairs`
- `tenants[].infrastructure`

### Option B — authenticated internal diagnostics endpoint

Use this when the deployed backend is reachable and the diagnostics window is intentionally enabled.

Required runtime/config assumptions:

- `ENABLE_INTERNAL_DIAGNOSTICS=true` on the deployed backend for the review window
- Authenticated tenant `OWNER` or `ADMIN` session / bearer token
- Correct tenant context for the intended pilot tenant
- Correct tenant slug / host headers as required by the app deployment
- Optional `schema` query parameter only if it exactly matches the authenticated tenant schema

Endpoint path:

```text
GET /api/v1/internal/diagnostics/calendar-allocation-backfill-report
```

Optional focused form:

```text
GET /api/v1/internal/diagnostics/calendar-allocation-backfill-report?schema=tenant_demo_business
```

Illustrative request shape only; substitute the real deployed origin and real authenticated session/token:

```bash
curl -sS \
  -H "Authorization: Bearer <OWNER_OR_ADMIN_JWT>" \
  -H "Host: <tenant-host-required-by-deployment>" \
  "https://<deployed-backend-origin>/api/v1/internal/diagnostics/calendar-allocation-backfill-report"
```

If the app resolves tenant context through an `X-Tenant-Slug` header in the target environment, provide the operator-confirmed slug required by that environment; do not guess it.

### Readiness interpretation

| Report status | Pilot readiness verdict from allocation/conflict perspective | Required next step |
| --- | --- | --- |
| `READY_FOR_BACKFILL` | Allocation-safe for controlled Calendar V2 desktop pilot | Capture the report and proceed with the wider pilot checklist; do **not** treat this as a completed real backfill. |
| `NEEDS_MANUAL_REVIEW` | Needs manual review before pilot | Review orphan allocations, terminal appointments with active allocations, or duplicate active allocations. Create a follow-up plan only. |
| `BLOCKED_BY_OVERLAPS` | Blocked before pilot | Review overlapping legacy pairs, buffer-only conflicts, or active exclusive allocation overlaps. Create a follow-up plan only. |
| `BLOCKED_BY_SCHEMA` | Blocked before pilot | Restore missing allocation infrastructure prerequisites before any pilot decision or future backfill work. |
| No report output | Cannot determine because runtime/report access is unavailable | Supply the missing runtime access and actual tenant identity, then rerun one read-only path. |

Interpretation notes:

- Active standard appointments missing allocations are expected transitional backfill workload and are **not by themselves** a blocker when the overall status is `READY_FOR_BACKFILL`.
- Any non-`READY_FOR_BACKFILL` result must lead to a follow-up plan only. Do **not** auto-fix data, run a real backfill, or change scheduling semantics as part of this review step.

### Minimum evidence to capture after the operator run

Record these values in this document or a linked review note:

1. Tenant schema/name reviewed
2. Report timestamp
3. `mode`
4. Overall readiness status
5. Counts for each anomaly category
6. Allocation infrastructure status
7. Exact recommended next step
8. Who ran the report and which runtime path was used, without storing secrets

## 10. Recommended next task

Have an operator supply the exact pilot tenant identity and one usable read-only runtime path, then run the existing report once against the real pilot tenant and append the actual report summary here.

The smallest safe unblock is:

1. Confirm the actual pilot tenant slug and schema.
2. Choose either:
   - direct CLI with `DATABASE_URL`, or
   - deployed diagnostics endpoint with `ENABLE_INTERNAL_DIAGNOSTICS=true` and authenticated `OWNER`/`ADMIN` access.
3. Run the read-only report.
4. Record the returned readiness status and anomaly counts.
5. If the status is anything other than `READY_FOR_BACKFILL`, create a follow-up plan only and keep the pilot blocked until that review is complete.
