# PUDO-N Master System & Business Blueprint v1.1

**Status:** Authoritative business specification approved by the product owner on 2026-10-10.
**Applies to:** Pudo-N Android, PWA, backend, PostgreSQL schema, operational workflows, and financial ledgers.
**Implementation branch:** `feat/postgres-migrations-ci` (PR #5 remains Draft and unmerged).
**Change policy:** This specification supersedes conflicting older assumptions, implementation defaults, and legacy tariff/share rules. Existing code is evidence of current behavior, not the source of business truth.
**Environment safety:** This document does not authorize merge, deployment, Production database changes, Render/DNS/secrets changes, or external payment/bank integration.

## 1. Business purpose and boundaries

Pudo-N is a neighborhood trusted-hub distribution network that lets a postal courier, with the recipient's explicit consent, route a parcel to a trusted local hub for out-of-hours collection.

- The postal service's postage amount is supplied from the postal label/record. Pudo-N does **not** recalculate or replace the postal service's postage tariff.
- Pudo-N separately charges for entering its network and for any applicable hub storage/collection service.
- Postal postage amount is evidence and a pricing basis for the network-entry fee; it is not itself Pudo-N revenue and must not be included in the 30/30/40 revenue split.
- Every material action must be attributable and auditable: actor ID/role, parcel ID, timestamp, old/new state, transaction/correlation ID, and relevant evidence references.

## 2. Roles and permissions

- **Courier (سفیر):** invite a recipient; after consent, register parcel/label details; record physical handover evidence; see assigned parcel and hub workflow.
- **Recipient (مشتری/گیرنده):** accept/reject the invitation; review parcel label/details; upload payment receipts; pay/confirm network fees; choose a hub; view storage tariff/timer; receive a one-time collection code; provide collection evidence.
- **Hub owner (هاب‌دار):** see parcels assigned to their hub; confirm physical receipt with photo evidence; participate in custody dispute resolution; enter a recipient's code at final handover; record handover evidence.
- **System administrator (مدیر سیستم):** manage approved tariffs and revenue-share configuration; review ambiguous payment evidence; resolve custody disputes; review payout requests; view audit trail.
- Access must be enforced server-side and scoped to the relevant actor, parcel, assigned hub, or recipient. A UI-only role restriction is not sufficient.

## 3. Canonical end-to-end parcel workflow

### Stage 1 — Courier invitation and recipient consent

1. Courier sends an in-app invitation to the recipient's phone/account, proposing Pudo-N for an out-of-hours delivery.
2. Recipient sees the invitation in their own authenticated panel and explicitly accepts or rejects it.
3. No official Pudo-N network registration, payable network-entry invoice, hub assignment, or custody transition may occur before acceptance.
4. Acceptance/rejection, actor, time, and decision are auditable. Rejection closes this invitation without registering the parcel.

### Stage 2 — Courier registers the parcel after acceptance

The registration form becomes available only after accepted consent and records:

- photo of the postal label/package;
- barcode;
- postal tracking code;
- postage amount printed/recorded by the postal service;
- sender and recipient details;
- Pudo-N internal parcel identifier.

The original label image must remain linked to the parcel and be visible to authorized actors in later stages. Store an object/storage reference and metadata; do not rely on a transient browser image or a public unauthenticated URL. Apply upload validation, access control, and audit logging.

### Stage 3 — Recipient verifies details and pays the network-entry fee

1. Recipient receives an in-app notice with the label image and the barcode, postal tracking code, postal postage amount, and sender/recipient details.
2. Recipient reviews the details and uploads the payment receipt through their private panel.
3. The network-entry fee is a configurable **30–40% of the postal postage amount**. Pudo-N must not recompute the postal postage itself.
4. The configured rate, applicable rules, calculated amount, currency unit, and tariff/configuration version are snapshotted for the parcel/payment request. Later configuration changes must not reprice an existing request.
5. Payment evidence is checked against a trustworthy bank/provider source. SMS notifications and an uploaded image alone are not sufficient proof by themselves. Unmatched, duplicated, delayed, or ambiguous evidence must go to manual administrator review; no automatic approval from a weak text/image match.
6. Only after verified payment may the system notify the courier that the parcel is accepted into the Pudo-N network and enable recipient hub selection.

**Integration boundary:** a real bank/payment-provider verification source is not yet selected. Until a secure, authorized source is integrated, the system must label this flow as pending/manual reconciliation and must not claim automatic bank verification.

### Stage 4 — Recipient selects a hub; courier and hub confirm custody

1. Recipient chooses an eligible nearby hub from the available list/map.
2. Notify the courier and selected hub owner.
3. Courier records the physical handover and captures a fresh camera photo from the device.
4. Hub owner independently records receipt and captures a fresh camera photo.
5. Custody changes to the hub only after both parties have confirmed the same handover, parcel, and destination hub. A single confirmation is an incomplete handover, not proof of final custody.
6. If the parties disagree, photos are missing, or parcel/hub identifiers do not match, freeze normal progression and create an administrator review case. Do not silently choose one party's assertion.
7. Notify the recipient after confirmed hub receipt and show the receipt evidence permitted by access policy.

“Live camera” in this specification means opening the device camera to capture a new photo in the app/PWA; it does not imply continuous video streaming.

### Stage 5 — Hub storage and time-based fee

1. The storage timer starts at the confirmed hub-receipt timestamp, not when the parcel was first registered or when the courier selected a hub.
2. Show the recipient the elapsed/remaining storage time, the applicable pricing steps, and the projected fee before collection.
3. Stop the storage timer at the confirmed final handover timestamp and issue the storage/collection invoice using a snapshot of the tariff and elapsed time.
4. Storage brackets, grace period, amount per step, rounding, maximum duration, and expiry/remediation behavior must be driven by an approved, versioned tariff. Legacy rules (20% under 12 hours, 40% through 24 hours, +50 percentage points per additional started 24-hour interval, 168-hour expiry) are **not authoritative merely because current code uses them**. They must not be presented as final business policy until explicitly approved in the tariff schedule.
5. Expiry must not destroy parcel/custody history. It must move the parcel into a defined, auditable exception/remediation path.

### Stage 6 — Recipient pays storage fee and receives parcel

1. Recipient pays the invoice and uploads the receipt.
2. The system verifies the payment from the authorized payment source; ambiguous cases go to manual review.
3. Only after confirmed payment does the system notify the assigned hub that final release is permitted.
4. Generate a cryptographically random, single-use collection code and deliver it only to the authenticated recipient's private in-app inbox until a secure alternative channel is approved.
5. The code is valid for **one hour from issuance**. Store only a salted cryptographic hash in the custody ledger, enforce one-time use, expiry, attempt limits, resend throttling, and audit events. Never return the raw code to the hub owner's API or write it into logs.
6. The hub owner verifies the code through the server before final handover. Code verification alone is not sufficient to complete the physical handover.
7. Both the hub owner and recipient capture fresh photos confirming the same final handover. The parcel may be marked collected/delivered only after payment, code verification, and both evidence confirmations succeed. Any mismatch routes to administrator review.

### Stage 7 — Revenue allocation and payout

The product owner's intended revenue allocation is:

- **30% — courier (سفیر)**
- **30% — hub owner (هاب)**
- **40% — Pudo-N system/platform (سیستم)**

The split totals 100%. It applies to **Pudo-N service revenue actually collected** (network-entry service fee and storage/collection service fee), excluding the postal postage amount itself. Each fee/payment record must snapshot its own distributable Pudo-N service-fee amount and the three allocation rates/amounts. Do not count a receipt upload or unverified payment as collected revenue. Refunds/corrections must use compensating ledger entries and reverse the corresponding allocations according to an approved refund policy.

- Courier and hub balances must be tracked separately with an immutable, idempotent ledger.
- Hub and courier may choose weekly or monthly settlement preference and submit a payout request from their panel, subject to available balance, identity/bank-account validation, and review controls.
- Payout requests reserve funds atomically; rejection releases the reserve; completed external transfer requires a provider/bank reference and audit evidence.
- A request schedule does not itself move money. No payout should be described as paid until transfer completion is independently verified.
- The 30/30/40 split replaces the older “30% hub / remaining 70% unallocated / platform fee 0” implementation assumption.

## 4. Financial and evidence invariants

- Keep postal postage, network-entry service fee, storage/collection fee, collected Pudo-N revenue, and payout liabilities as distinct values.
- Use integer whole-toman amounts unless an approved currency policy says otherwise. Define rounding explicitly in each versioned tariff.
- Snapshot the applied entry-fee rate and storage tariff at the time each charge is created.
- Payment state is distinct from receipt-upload state and from bank/provider verification state.
- Receipt images and label/transfer photos must be private, access-controlled, linked to the relevant parcel/payment/transfer, and covered by retention policy.
- Each custody confirmation records actor, role, timestamp, parcel, hub/from-to parties, evidence references, and state transition.
- No stage may be skipped by calling an endpoint directly; backend authorization and state validation must enforce the workflow.
- Registration, custody handover, payment, revenue allocation, and payout are separate events. None is inferred from another.

## 5. Canonical state/workflow model

The business workflow must represent these separately, even if the existing status enum is retained temporarily for compatibility:

1. invitation pending;
2. recipient accepted / rejected;
3. parcel registration pending / registered;
4. entry-fee receipt submitted;
5. entry-fee payment pending verification / verified / rejected-manual-review;
6. hub selection pending / selected;
7. courier handover evidence pending / submitted;
8. hub receipt evidence pending / submitted;
9. custody confirmed at hub / dispute review;
10. storage active / expired-exception;
11. storage invoice issued;
12. storage-fee receipt submitted / payment pending verification / verified;
13. collection code issued / expired / attempts locked / verified;
14. final handover evidence pending / courier/hub/recipient evidence confirmed;
15. collected / dispute review;
16. revenue allocated / payout requested / reserved / approved / rejected / transfer completed.

Do not collapse all these into a single parcel status when doing so would lose payment, custody, evidence, or payout semantics. Use related records/events and explicit transitions. Existing status names can remain as a compatibility projection during an additive migration.

## 6. Reconciliation against the current feature branch

The current implementation is not yet fully aligned. The following are known conflicts and required work:

| Priority | Existing behavior / legacy assumption | Authoritative behavior | Required work |
|---|---|---|---|
| P0 | Parcel creation can occur before explicit recipient consent; recipient hub selection is used as an initial PUDO request | Invitation and explicit acceptance must precede official registration | Add invitation/consent records, APIs, recipient UI, and gate parcel creation |
| P0 | Hub receipt can be finalized from the hub owner's confirmation alone | Courier and hub both submit evidence; custody commits only after both confirmations | Add handover evidence/confirmation records, photo references, dispute workflow and integration tests |
| P0 | Delivery code expires after 10 minutes | Delivery code expires after 1 hour | Align generator, recipient notification, verification, tests and docs to 60 minutes |
| P0 | One storage invoice/settlement flow; no distinct entry-fee payment workflow | Entry fee and storage fee are distinct charge/payment stages | Add separate charge types, receipt upload and verification states; do not mark payments verified from receipt image alone |
| P0 | Hub share defaults to 30%, platform fee remains 0, courier/platform share is unallocated | 30% courier / 30% hub / 40% platform on collected Pudo-N service revenue | Implement immutable per-charge allocation snapshots and balanced ledgers; reconcile existing invoice and wallet assumptions |
| P0 | Payment reconciliation records an externally verified payment but no source/provider integration exists | Bank/provider verification must be secure; ambiguous evidence requires manual review | Preserve manual-review labeling until provider/bank verification source is approved and implemented |
| P1 | Legacy storage tariff is hard-coded/seeded as 20/40/+50, 168h expiry | Storage schedule must be versioned and approved; current legacy numbers are not automatically authoritative | Keep tariff-driven configuration; flag the legacy tariff as provisional and do not treat it as final policy |
| P1 | Receipt, label and custody evidence are not yet a complete private upload workflow | Evidence must be private, validated, linked, and visible only to authorized actors | Add storage abstraction, access checks, upload metadata, retention and evidence views |
| P1 | Hub payout request exists; courier payout preference/workflow is incomplete | Courier and hub choose weekly/monthly and request payout | Extend payout workflow with actor-scoped balance, preference, reservation, bank-account validation, review and transfer evidence |
| P1 | Parcel state machine does not express all independent invitation/payment/evidence states | Distinct domain events and related state records must prevent skipped stages | Additive domain model and transition/integration tests; retain compatibility mapping while migrating |
| P1 | Current tariff and invoice models use postage base as storage pricing basis | Postal postage is input/reference; Pudo-N charges remain separate service-fee lines | Separate fee components and ensure postal postage is not booked as Pudo-N revenue |

## 7. Safe implementation sequence

1. **Specification and schema design:** preserve this blueprint as the controlling product contract; map current endpoints/entities/migrations to each workflow stage.
2. **Invitation/consent vertical slice:** recipient inbox invitation, accept/reject, server-side registration gate, audit and tests.
3. **Evidence/custody vertical slice:** private image storage contract, courier handover evidence, hub receipt evidence, two-party custody finalization, dispute cases and tests.
4. **Payment separation:** network-entry fee, storage fee, receipt submission, verification states, manual review, and payment-source adapter interface. No claim of automated bank verification before a real source exists.
5. **Financial allocation:** separate charge ledger and 30/30/40 allocation for verified collected Pudo-N service revenue; idempotency, concurrency, refunds/compensation, wallet reconciliation and tests.
6. **Delivery code:** one-hour validity, recipient-private inbox, single-use verification, rate limits and tests.
7. **Approved storage tariff:** only after the exact schedule is approved; versioned snapshots and boundary tests.
8. **Payouts:** weekly/monthly preference, courier and hub request flows, reserve/release, admin review and verified external-transfer adapter.
9. **PWA/Android integration and end-to-end tests:** align all role panels and camera/photo flows with backend authorization and the canonical state model.
10. **Independent verification:** review diff and run Backend, PWA and disposable PostgreSQL CI. Keep PR #5 Draft and unmerged; no Production changes.

## 8. Open operational decisions that require evidence, not assumptions

These items do not block recording the core business model, but implementation must expose them as configuration/interfaces or manual-review states until approved:

- the exact storage tariff steps, grace period, rounding, expiry and post-expiry remediation;
- the authorized bank/payment-provider data source and the matching/reconciliation protocol;
- private object storage provider, file retention and deletion policy;
- identity and bank-account validation requirements for courier/hub payouts;
- refund/cancellation and chargeback allocation rules;
- legal/consent wording and retention policy for recipient details and parcel photographs.

## 9. Acceptance criteria

- No official registration or charge before recipient acceptance.
- Postal postage is never recalculated by Pudo-N and never treated as Pudo-N distributable revenue.
- Entry-fee and storage-fee charge/payment lifecycles are separate.
- Receipt upload is not payment verification.
- Hub custody requires independent courier and hub evidence.
- Final collection requires verified payment, valid single-use one-hour code, and the required handover evidence from both parties.
- Pudo-N service revenue allocation is 30/30/40 and snapshots the applied amounts/rates per charge.
- Courier and hub payout workflows are actor-scoped, idempotent and ledger-backed.
- All critical state transitions and financial/custody events are auditable and covered by regression/integration tests.
- No merge, deployment, production data operation, or live provider transfer occurs as part of this branch work.


## 10. Implementation progress and verified boundaries (2026-10-10)

The following vertical slices have now been added to the feature branch; they must still pass the current head's CI before being treated as verified:

- Recipient invitation/acceptance records, private in-app notification, audit events, PWA accept/reject actions, and an atomic backend gate requiring the matching accepted invitation before parcel registration.
- Parcel registration now separates actual postal postage from Pudo-N tariff values and records barcode, sender details, and a private label-image reference. A distinct network-entry charge is calculated from the actual postal postage amount using `PUDO_ENTRY_FEE_PERCENT` (default 30%, constrained to 30–40%) and snapshots its rate/amount.
- Recipient receipt references, administrator review/rejection, and manual reconciliation of externally verified entry-fee payments are implemented. Hub selection is blocked until the entry-fee charge is verified.
- Network-entry revenue is allocated when a hub is selected; storage/collection revenue is allocated after invoice payment reconciliation. Both use immutable 30/30/40 allocation records and idempotent courier/hub wallet credits. Historical invoices are marked for manual reconciliation, not automatically reallocated.
- Separate courier handover and hub receipt evidence-reference submissions. The parcel's hub custody and storage timer are set only after both parties have submitted evidence references.
- Delivery code validity is one hour. Hub code verification is a distinct event from parcel collection; final collection requires a recipient-side evidence confirmation as well.
- Additive PostgreSQL migrations cover consent, label/entry-fee, custody, final-handover, and revenue-allocation fields. The PR remains Draft and unmerged.

These are **evidence-reference workflows, not a completed image-storage system**. Until an approved private object-storage adapter is implemented and configured, the APIs cannot prove that a reference resolves to a fresh camera image, and the PWA does not yet upload/retrieve private images. Public URLs are rejected. Do not treat this boundary as production-ready photo verification. Entry-fee rate configuration is currently environment-based; an admin settings screen and rate-change history are still needed.

The following core work remains incomplete and is still required before the system can be called complete:

- separate network-entry charge based on 30–40% of the actual postal postage amount, including label/barcode/sender fields and a private receipt workflow;
- approved bank/payment verification source and safe manual-review queue;
- immutable 30/30/40 per-charge allocation and balanced courier/hub/platform ledger entries for verified collected service revenue;
- courier payout preferences/requests, and reconciliation of the existing hub payout flow;
- final approved storage tariff schedule and expiry/remediation rules;
- complete operational PWA and Android role panels, parcel registration and label review, hub selection/map, storage invoice/payment, camera-to-private-storage flow, and recipient final handover UI.

The CI result is a statement about the code and tests executed at a specific commit only. It does not establish that an external payment provider, private storage, Android app, or production workflow is operational.
