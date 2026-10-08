# PWA-09 — TEST_PLAN Evidence Registration

- Date: 2026-10-08
- Project: Pudo-N
- Repository: sirvan-hub/N-PuDo-N
- Scope: documentation/evidence registration only
- Status: REGISTERED AS WORKING DOCUMENT
- Canonical baseline: PUDO-N-CANONICAL-BASELINE-2026-10-07

## 1. Purpose

This document registers the newer root `TEST_PLAN.md` as working evidence. It does not replace, modify, or supersede the frozen canonical test plan.

## 2. Hash reconciliation

| Document | SHA-256 | Size | Classification |
|---|---|---:|---|
| Root `TEST_PLAN.md` | E08EBDF42B745D18EB503335AAAEB1A5A59E2AAF11BCFA22E105984B099F1ADE | 5,161 bytes | WORKING_DOCUMENT / CANONICAL_CANDIDATE |
| Frozen canonical `baseline/2026-10-07-canonical/05_TESTS/canonical/TEST_PLAN.md` | 52171FE8D139062BD7DECA3DACA4BFBD8B0AB50F10B61EA0183F206BE4DF7159 | 5,171 bytes | FROZEN CANONICAL |

The hashes differ. The canonical file remains authoritative for the historical freeze.

## 3. Newer working evidence captured

The root working document contains newer backend execution/validation evidence, including:

- Backend target: `http://localhost:3000/v1`
- SQLite database: `dev.db`
- `test_flow.ps1` execution with 12 successful core-flow steps
- registration DTO validation cases
- authentication/authorization checks
- observation that a valid token produced an unexpected 401 in one validation path
- observed error-response behavior
- recommendations for automated tests, RBAC, DTO validation, and pagination/filtering/sorting

These observations are evidence for follow-up engineering work; they are not treated as proof of production readiness.

## 4. Preservation rule

The frozen canonical test plan must not be edited as part of PWA-09. Any future promotion of the newer working test plan requires an independent rerun, reconciliation against the canonical coverage, and an explicit decision record.

## 5. Acceptance criteria

- [x] Root TEST_PLAN hash recorded.
- [x] Frozen canonical TEST_PLAN hash recorded.
- [x] Difference explicitly classified.
- [x] Newer execution evidence preserved as working evidence.
- [x] No replacement of the frozen canonical document.
- [x] No implementation files changed by this documentation registration.
- [x] No unrelated working-tree changes included.

## 6. Next gate

Before promotion to a new canonical test plan, independently rerun the relevant backend/API tests, reconcile coverage against the frozen plan, resolve the observed authentication discrepancy, and record the resulting decision.
