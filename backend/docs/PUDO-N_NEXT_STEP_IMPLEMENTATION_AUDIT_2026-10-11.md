# Pudo-N implementation audit — 2026-10-11

**Scope:** Read-only review of Draft PR #5 at the time of inspection, focusing on the approved business blueprint, parcel state machine, and private evidence-storage integration.

**Safety boundary:** This audit does not authorize merge, deployment, Production database changes, live payment-provider calls, or payout transfers. PR #5 must remain Draft and unmerged.

## Verified branch and CI state

- Repository: `sirvan-hub/N-PuDo-N`
- PR: [#5 — feat: prepare PostgreSQL configuration and CI validation](https://github.com/sirvan-hub/N-PuDo-N/pull/5)
- Branch: `feat/postgres-migrations-ci`
- Inspected head: `9da2661b85f99dd74af8854d83452609356d4f90`
- PR state at inspection: open, Draft, not merged.
- CI associated with that head: PWA CI #126, Backend CI #670, PostgreSQL CI #645 — all completed successfully.

CI success proves only the tested code at that commit; it does not prove live Supabase bucket configuration, actual image capture/upload in the PWA/Android app, automated bank verification, or production readiness.

## Product contract to preserve

The controlling contract is `backend/docs/PUDO-N_MASTER_SYSTEM_BUSINESS_BLUEPRINT_v1.1.md`. It takes precedence over legacy state/status assumptions.

1. Invitation and explicit recipient consent precede official registration.
2. Registration captures the postal label image, barcode/tracking code, actual postal postage, and sender/recipient details. Pudo-N does not recalculate postal postage.
3. Network-entry fee (30–40% of actual postal postage) and storage/collection fee are separate Pudo-N charges.
4. Receipt upload is not payment verification. Without a selected authorized bank/provider source, payment reconciliation remains explicitly manual.
5. Hub custody is confirmed only after both courier and hub submit evidence for the same handover.
6. Storage timing starts at confirmed hub receipt.
7. Final collection requires verified payment, a single-use code valid for one hour, and the required hub/recipient handover evidence.
8. Allocate collected Pudo-N service revenue 30% courier / 30% hub / 40% platform; postal postage is excluded.
9. Storage tariff details and expiry/remediation rules remain unapproved; do not silently promote legacy 20/40/+50 or 168-hour assumptions to policy.

## Findings from code inspection

### F-01 — Label-photo upload is not represented by the evidence upload contract (P1)

The current `EvidenceCategory` values include entry-fee receipt, courier handover, hub receipt/release, and recipient handover, but no `LABEL_IMAGE` category. The parcel entity has a `label_image_ref` field and parcel creation requires a private reference, while the evidence adapter's documented upload API does not offer a label-photo category. This leaves the canonical label capture/upload path incomplete.

**Required fix:** add an explicitly authorized label-image upload category for the assigned courier; ensure the resulting private `pudo-evidence://` reference can be attached during registration; verify access controls and signed retrieval; add focused service/controller tests. Do not accept public URLs as a substitute.

### F-02 — PWA does not yet expose the full evidence upload/retrieval workflow (P1)

The PR description and `PRIVATE_EVIDENCE_STORAGE.md` identify the backend adapter, but the PWA still lacks complete camera/file capture, multipart upload, attachment, and authorized preview flows for label, entry-fee receipt, courier handover, hub receipt/release, and recipient handover evidence.

**Required fix:** implement role-aware upload controls and evidence previews using the authenticated backend endpoints. On mobile, offer camera capture (without claiming continuous video/live streaming); validate file size/type client-side for usability while retaining mandatory server-side validation. Handle expired signed URLs by requesting a fresh URL; never persist signed URLs as evidence references.

### F-03 — Status enum alone cannot be the business authorization gate (P1)

The current status graph remains a legacy-compatible projection and contains transitions such as `PENDING_APPROVAL → HUB_SELECTED` and `CUSTOMER_REQUEST → HUB_SELECTED`. The approved model requires additional independent gates: accepted invitation, verified entry-fee payment, dual-party custody evidence, verified storage payment, valid collection code, and final evidence. These gates must be enforced by transactional service logic even if legacy status values are retained.

**Required fix:** add regression tests that attempt to bypass each gate through direct service/API calls. A valid status transition must never, by itself, authorize hub selection, custody finalization, or collection.

### F-04 — Operational setup remains a separate prerequisite (P1)

The storage adapter is code-only until a private Supabase bucket and server-only environment variables are configured. No live Supabase project was changed during this work.

**Required fix:** before operational end-to-end verification, configure the private bucket and secrets through the approved deployment process, then test upload, attachment, authorization, signed retrieval expiry, and rejection of cross-parcel access. Do not put the service-role key in the PWA/Android bundle or source control.

## Recommended next implementation slice

1. Add the `LABEL_IMAGE` evidence category and courier-scoped upload/attachment contract.
2. Add PWA evidence upload and preview UI, starting with label image and entry-fee receipt, then custody and final-handover evidence.
3. Add direct-call bypass tests for invitation, entry-fee verification, dual-party custody, storage payment, collection code, and final evidence.
4. Run Backend CI, PWA CI, and disposable PostgreSQL CI on the new PR head; review logs and changed files.
5. Keep PR #5 Draft and unmerged. Do not touch `main`, Production data, Render/DNS/secrets, real bank integrations, or live payouts.

## Explicitly not completed

- No live bank/provider verification or automatic receipt matching.
- No approved final storage tariff or expiry policy.
- No complete Android evidence UI.
- No production Supabase bucket configuration or operational end-to-end photo verification.
- No production migration, deployment, merge, or external payout.
