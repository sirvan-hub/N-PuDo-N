# PostgreSQL Target Data Contract — N-PuDo-N

- Status: **proposed contract for review; not an executed schema**
- Parent audit: `POSTGRES_READINESS_AND_SCHEMA_RECONCILIATION_AUDIT.md`
- Field-level evidence: `POSTGRES_COLUMN_RECONCILIATION_MATRIX.md`
- Authority: master system/business blueprint and canonical state-machine baseline
- Safety: no database inspected or modified; no migration or deployment executed

## 1. Purpose and implementation gates

This document turns source-review findings into a proposed implementable PostgreSQL contract. It intentionally separates:
1. fields and relationships that the application needs;
2. constraints that may be enabled only after data validation;
3. unresolved business choices that must not be guessed in code.

**Gate A — contract approval:** approve or amend the open decisions in section 8.
**Gate B — implementation:** create a separate implementation branch, PostgreSQL configuration, versioned migrations and disposable PostgreSQL tests.
**Gate C — data rehearsal:** inventory and rehearse against a disposable copy only; never point migration tests at production.
**Gate D — deployment:** Render/DNS/production migration require a separate explicit approval.

The existing SQL file is a reference, not an executable source of truth. TypeORM `synchronize: true` must not be used for durable environments.

## 2. Shared conventions

- Primary keys: UUID. Choose one PostgreSQL UUID generation strategy and use it consistently.
- Time: `timestamptz`, UTC instants at API/database boundaries; test legacy SQLite timestamp interpretation before conversion.
- Money: integer minor units of the project’s confirmed currency, stored as `BIGINT`; do not silently convert existing amounts. Confirm the currency unit and rounding policy before migration.
- Percentages: store a normalized decimal fraction (e.g. 0.20) in tariff versions; define invoice display/storage separately and test the conversion explicitly. Never mix 0.20 and 20.00 implicitly.
- Relationships: explicit foreign keys. Prefer `RESTRICT` for financial/audit history; use `SET NULL` only where the domain explicitly permits orphaning a historical reference. Avoid cascading deletion of invoices, ledger entries, settlements and audit history.
- Mutable domain records: `created_at`, `updated_at`; database-generated UTC timestamps. Use one authoritative update mechanism (application/ORM or trigger), not both.
- Idempotency: externally retried commands carry an opaque idempotency key and actor/operation scope; enforce uniqueness in PostgreSQL and store the outcome needed to return the same result.
- State transitions: validated by domain service and persisted atomically. Database CHECK constraints validate membership in the approved enum; they do not replace transition validation.
- Security: never seed a known/default administrator password; never log password hashes, tokens, OTPs, or recipient personal data.

## 3. Proposed table contract

The field lists below describe the intended logical contract. Exact SQL types, nullability and defaults are finalized in migrations after Gate A and pre-migration data scans.

### 3.1 users — identity and authorization

| Field | Required | Rules / purpose |
|---|---|---|
| id | yes | UUID PK |
| username | decision | Preserve current username/password login unless auth is formally redesigned; unique normalized value if retained |
| password_hash | for password auth | Hash only; never return through API; required for password-auth accounts |
| phone | yes | Unique normalized phone; validate before enforcing NOT NULL/unique |
| full_name | no | Max 100 characters |
| national_id | no | Max 10; validate format/duplicates before any stricter rule |
| role | yes | Approved role enum; public registration may create RECIPIENT only |
| is_active | yes | Default true |
| is_verified | yes | Default false |
| verified_by | no | FK users(id), self-reference permitted; deletion policy RESTRICT/SET NULL to be decided |
| verified_at | no | UTC instant |
| failed_login_attempts | yes | Non-negative, default 0 |
| locked_until | no | UTC instant |
| last_login_at | no | UTC instant |
| created_at / updated_at | yes | UTC instants |

Constraints/tests: unique normalized username when present; unique phone; no privileged role from public registration; inactive/locked account behavior; password hash excluded from every response; admin verification references a valid actor. Do not require all legacy accounts to have password hashes until accounts are classified and a recovery/bootstrap path exists.

### 3.2 hubs — pickup locations

| Field | Required | Rules / purpose |
|---|---|---|
| id | yes | UUID PK |
| owner_id | yes | FK users(id); owner role/authorization validated by service |
| name | yes | Max 150, non-empty |
| description | no | Text |
| phone | no | Max 15 |
| address | yes | Non-empty text |
| city | yes | Max 50 |
| district | no | Max 50 |
| operating_hours | decision | Validated JSONB document with versioned shape; decide whether null is allowed |
| max_capacity | yes | Integer > 0 |
| current_capacity | yes | Integer >= 0 and <= max_capacity if capacity means current stored parcels |
| is_active | yes | Default true |
| is_temporarily_closed | yes | Default false |
| qr_code_hash | yes | Unique, non-empty hash; raw QR secret is never stored |
| rating | yes | Numeric(2,1), range 0.0–5.0 |
| created_at / updated_at | yes | UTC instants |

Constraints/tests: owner FK; capacity bounds; rating range; unique QR hash; only authorized owner/admin may mutate hub; capacity changes occur transactionally with custody operations. Do not add geographic columns until coordinate source, precision, radius units and privacy policy are approved. Nearby-hub API must use real coordinates/radius before claiming distance sorting.

### 3.3 parcels — current operational projection

| Field | Required | Rules / purpose |
|---|---|---|
| id | yes | UUID PK |
| tracking_code | yes | Unique, non-empty, bounded string |
| recipient_phone | yes | Normalized phone, max 15 |
| recipient_name | yes | Non-empty, max 100 |
| recipient_address | yes | Non-empty text |
| base_post_cost | yes | Non-negative integer in confirmed currency unit |
| proposed_hub_id | no | FK hubs(id) ON DELETE SET NULL only if selection is not custody; distinguish proposed/current hub if needed |
| courier_id | no | FK users(id) with approved deletion policy |
| status | yes | Approved canonical status set; transition service enforces edges |
| weight_kg | no | Numeric(10,3); positive if supplied |
| description | no | Text |
| approved_at | no | Timestamp of explicit approval event, if approval remains a persisted event |
| handover_scheduled_at | no | Scheduling event, if supported |
| delivered_to_hub_at | no | Authoritative time when physical custody at hub is confirmed; pricing clock start only if blueprint confirms |
| ready_for_pickup_at | no | Time hub marks parcel ready |
| delivered_at | no | Define exact meaning; do not conflate hub receipt, customer collection and financial settlement |
| returned_at / expired_at / cancelled_at | no | Set only through approved exception transitions |
| version | yes if optimistic locking implemented | Integer >= 1; do not add unless concurrency checks use it |
| rejected_reason | no | Reason code/text with actor/event context; distinguish rejection types |
| created_at / updated_at | yes | UTC instants |

**Important:** do not include multiple competing timestamps for the same physical event. Before migration, map legacy values into a single authoritative event or leave new event timestamps NULL; never fabricate historical event times. Consider a separate parcel-event/state-history table if full transition history is required.

Constraints/tests: unique tracking code; FK checks; approved status membership; recipient access remains bound to the authenticated recipient identity; only authorized courier/owner/admin actions can change status; illegal transitions rejected; state and custody event written atomically; repeated request with same idempotency key produces one logical event. Status enum must be frozen against the master state graph before migration.

### 3.4 registration_transactions — PUDO eligibility and hub selection

Logical fields:
- `id` UUID PK
- `parcel_id` FK parcels, RESTRICT
- `hub_id` nullable FK hubs, SET NULL only if historical identity can be preserved elsewhere
- `actor_id` nullable FK users with actor snapshot if deletion is possible
- `source` required enum: CUSTOMER_REQUEST or FAILED_HOME_DELIVERY
- `event_type` required approved event enum (request, eligibility result, accept/reject, hub selection, offline assignment)
- `status` required event/result status
- `idempotency_key` required for retryable commands, unique in actor/operation scope
- `metadata` JSONB with schema/version and no secrets
- `rejection_reason`, `occurred_at`, `created_at`

Registration does not mean handover or settlement. An event history should be append-only; corrections should be compensating events, not silent rewriting.

### 3.5 custody_transfers — physical custody

Logical fields:
- `id` UUID PK; `parcel_id` FK parcels RESTRICT
- `from_party_type`, `from_party_id`, `to_party_type`, `to_party_id` (party types constrained; avoid polymorphic FK ambiguity by adding explicit nullable FK columns if stronger referential integrity is required)
- `hub_id` FK hubs where applicable; `courier_id` FK users where applicable
- `event_type` and `status` from approved custody transition contract
- `actor_id` FK users where applicable; `actor_role` snapshot
- `verification_method`, `verification_result`; never persist plaintext OTP/custody code
- `idempotency_key` unique by operation scope
- `occurred_at`, `created_at`, `metadata` JSONB

Custody transfer must be distinct from hub selection and settlement. Store only a hash or short-lived verification result for codes; rate-limit attempts and audit failures without logging the secret. The parcel projection and custody event must commit in one database transaction.

### 3.6 tariff_versions — effective-dated tariff policy

Logical fields:
- `id` UUID PK; `version` unique
- `status` constrained to approved lifecycle
- `fee_under_12h` decimal fraction default 0.20
- `fee_12_to_24h` decimal fraction default 0.40
- `fee_per_additional_started_24h` decimal fraction default 0.50
- `threshold_12h_hours` = 12; `threshold_24h_hours` = 24; `expiry_hours` = 168
- `effective_from`, `effective_until`, `created_at`, `updated_at`
- approved actor/reason metadata for tariff changes

The approved blueprint states under 12 hours = 20%, 12–24 hours = 40%, then +50% per started additional 24-hour interval, with exit from normal flow at 168 hours. Exact boundaries, clock start, timezone and rounding are Gate A items. Do not migrate old calculations as if they followed the new tariff.

### 3.7 invoices — immutable calculation snapshot

Logical fields:
- `id` UUID PK; `invoice_number` unique and generated collision-safely
- `parcel_id` FK parcels RESTRICT
- `recipient_id` FK users RESTRICT; `hub_id` FK hubs RESTRICT
- `base_post_cost`, `calculated_fee`, `total_amount`, `hub_owner_share`, `platform_fee` as BIGINT in confirmed currency unit
- `elapsed_seconds` or a precisely defined decimal hour value; avoid ambiguity caused by rounded elapsed hours
- `fee_fraction` numeric with an explicit convention
- `tariff_version_id` FK tariff_versions SET NULL only if the complete immutable snapshot is also stored
- snapshot columns for the applied tariff inputs, thresholds, rounding rule and calculation version
- `status` from approved financial lifecycle; `paid_at`; `created_at`, `updated_at`

Invariants: historical invoice amount never changes when tariff configuration changes; one invoice creation per intended business event; unique invoice number under concurrency; amount fields non-negative; totals and split reconcile; no invoice/payment creation solely because a hub was selected. Invoice state and exact relationship to Payment/Settlement must be defined before real payments are enabled.

### 3.8 wallets — account summary only

Logical fields:
- `id` UUID PK; `user_id` unique FK users RESTRICT
- `balance` BIGINT NOT NULL DEFAULT 0
- `pending_balance` only if its meaning is explicitly defined; do not equate it with blocked funds
- `blocked_amount` only if a distinct hold concept is approved
- optional cached `total_earned` only if it is derived/reconciled from the ledger
- `created_at`, `updated_at`

Wallet balance is a projection, not the accounting source of truth. All postings must be backed by ledger entries and updated atomically.

### 3.9 wallet_transactions — immutable ledger

Logical fields:
- `id` UUID PK; `wallet_id` FK wallets RESTRICT
- `amount` BIGINT non-zero; `type` approved CREDIT/DEBIT/HOLD/RELEASE/REFUND set
- `reference_type`, `reference_id` to the source business transaction
- `idempotency_key` unique within operation scope
- `balance_after` BIGINT; optional actor FK/snapshot; description/reason
- `created_at` UTC instant

Ledger entries are append-only. Corrections use compensating entries. Posting checks sufficient funds/holds as applicable, writes ledger and updates wallet within one transaction; concurrent retries cannot double-credit/debit. Add source-reference uniqueness for successful payout/refund only after the exact business cardinality is approved.

### 3.10 settlement_transactions — settlement/payout lifecycle

Logical fields:
- `id` UUID PK; references to invoice/payment and wallet where applicable
- `hub_id` and `hub_owner_id` FKs; `amount` BIGINT non-negative
- `type` / `status` from approved settlement lifecycle
- `idempotency_key`; external provider reference where applicable
- `created_at`, `updated_at`, `completed_at`, failure/reversal reference and reason

Settlement is allowed only after a valid successful payment; payout only after the related settlement and with wallet ownership verified. Successful payout cardinality must be enforced at the database layer. Refunds reference a specific payment and are represented as reversals. Do not enable money movement until concurrent and idempotency tests pass.

### 3.11 audit_logs — append-only audit

Logical fields:
- `id` UUID PK; `actor_id` nullable FK users with actor snapshot where needed
- `actor_role`; `action`; `entity_type`; `entity_id`
- `old_value`, `new_value` JSONB with field allowlist/redaction
- `transaction_id` / correlation ID; `occurred_at`, `created_at`
- optional outcome/reason/IP metadata only where policy permits

Never include password hashes, access tokens, OTPs, custody codes, full payment credentials or unnecessary recipient PII. Application authorization and audit writes must be transactionally linked for critical state/financial operations where feasible.

### 3.12 device_tokens — optional notification integration

Create only when push notifications are in scope. Fields: UUID PK, user FK, token, platform enum, active flag, last-used/created/updated timestamps. Token should be unique or deduplicated, securely handled and revocable. This table is not a prerequisite for the first PostgreSQL migration if push is not being implemented.

## 4. Relationship and delete policy summary

- users → hubs: owner FK; do not delete a user who owns historical hubs without an explicit reassignment/retention process.
- users → parcels: courier FK optional; historical actor attribution should survive account deactivation.
- hubs/users → invoices: RESTRICT; financial history must not disappear through cascades.
- parcels → invoices/custody/registration history: RESTRICT; use lifecycle/soft deletion only if approved, never cascade-delete financial/audit records.
- wallets → ledger/settlements: RESTRICT; retain ledger history.
- tariff_versions → invoices: historical snapshot must remain valid even if a tariff version is archived.
- audit logs: append-only, access-controlled and retained according to an approved retention policy.

## 5. Data preservation and backfill policy

No source data is to be changed during contract design. Before any migration rehearsal:
1. Work only on a secure copy of `dev.db` or a disposable fixture; never commit the DB or publish its contents.
2. Establish whether the source contains real/personal data without printing row values.
3. Report table names, row counts, null counts, duplicate keys, invalid enum/status values, orphan references, malformed JSON, monetary min/max and timestamp ranges using aggregate output only.
4. Map every legacy column to a target column or explicitly classify it as deprecated/unmapped with a reason.
5. Do not invent historical events: absent timestamps remain NULL; do not infer custody from hub selection.
6. Preserve original IDs where valid; record any ID mapping table if conversion is unavoidable.
7. Compare source/target row counts and deterministic non-PII checksums or aggregates per table.
8. Reconcile money totals per wallet/invoice/ledger and explain every difference before declaring success.
9. Keep encrypted backups with restricted access and test a restore, not only a reverse migration.
10. Never run migration against production as part of CI or local test commands.

## 6. Acceptance test matrix

| ID | Test | Pass condition |
|---|---|---|
| DB-001 | Empty PostgreSQL migration | All versioned migrations apply cleanly to a disposable empty DB; schema matches contract |
| DB-002 | Repeat startup | App startup does not mutate schema automatically; migration history is stable |
| DB-003 | Required config | Missing/invalid DB config fails clearly; no secret in logs |
| DB-004 | FK integrity | Invalid owner, courier, recipient, hub and wallet references are rejected |
| DB-005 | Unique fields | Duplicate phone/username/tracking/invoice/idempotency key rejected as specified |
| DB-006 | Status contract | Every approved status persists; unapproved status rejected; illegal transitions rejected at service level |
| DB-007 | Custody separation | Selecting a hub does not create a custody transfer or start tariff clock |
| DB-008 | Idempotent registration | Repeated command with same key creates one logical registration outcome |
| DB-009 | Idempotent custody | Retry creates one custody event and one status update |
| DB-010 | Tariff boundaries | Test just below/at/above 12h, 24h and 168h plus every started additional 24h interval |
| DB-011 | Invoice snapshot | Changing active tariff does not change existing invoice values |
| DB-012 | Monetary safety | Large values, rounding, non-negative amounts and split reconciliation work with BIGINT |
| DB-013 | Wallet atomicity | Concurrent posting/retry cannot double-post; ledger and balance reconcile |
| DB-014 | Settlement safety | No settlement without successful payment; no duplicate successful payout per approved rule |
| DB-015 | Authorization | Recipient/courier/hub owner/admin isolation enforced at API level |
| DB-016 | Audit redaction | Sensitive fields/secrets are absent from logs and audit JSON |
| DB-017 | Data rehearsal | Counts, key uniqueness, FK integrity and financial aggregates reconcile with source copy |
| DB-018 | Restore | Backup restore procedure recovers the disposable rehearsal to a known-good state |

## 7. Migration sequence (proposed)

1. **M0001:** PostgreSQL connection/migration infrastructure, extension-free UUID generation if supported, migration history, no business data seed.
2. **M0002:** users and hubs with validated identity/owner constraints.
3. **M0003:** parcels, approved status contract, FK relations and minimal authoritative event fields.
4. **M0004:** registration and custody event tables plus idempotency constraints.
5. **M0005:** tariff versions and immutable invoice snapshots.
6. **M0006:** wallets and immutable ledger.
7. **M0007:** settlement/payment references and audit constraints.
8. **M0008:** optional device tokens/geospatial support only if approved and implemented.

This is an ordering proposal, not migration SQL. Avoid introducing a table with a misleading status/constraint before the state contract is frozen. Prefer additive migrations first; destructive drops/renames require explicit data mapping and backup evidence.

## 8. Blocking decisions — do not silently guess

1. **Authentication:** retain username + password_hash, or redesign login? Recommended: retain for compatibility, and securely handle existing accounts without hashes.
2. **Roles:** canonical roles are RECIPIENT, COURIER, HUB_OWNER, ADMIN, SUPER_ADMIN in current entity; legacy SQL adds AMBASSADOR. Recommended: do not add AMBASSADOR until approved.
3. **Parcel status:** freeze exact allowed statuses and transitions from the canonical baseline, including how EXPIRED, RETURNED_TO_CARRIER and CANCELLED fit with the currently listed 13-state graph.
4. **Tariff clock:** confirm it starts at confirmed physical handover to hub, not hub selection; confirm boundaries (12h exactly = 40%, 24h exactly = 40%, each additional started 24h = +50%) and expiry at 168h.
5. **Currency/rounding:** confirm stored integer unit and rounding rule; blueprint lists base costs in Toman-like values in older context but this must be verified against current API/UI contract before conversion.
6. **Invoice/financial lifecycle:** confirm when invoice is created and the exact relation between collection, payment, refund, settlement and payout; current code and legacy SQL enums differ.
7. **Wallet semantics:** define pending_balance versus blocked_amount and whether total_earned is a derived aggregate or cached value.
8. **Hub location:** are latitude/longitude required now, and what is the authoritative source/precision? Do not create geospatial constraints before this is answered.
9. **Operating hours:** nullable or required; define schema/timezone and overnight hours behavior.
10. **Historical data:** should legacy accounts lacking username/password hash be disabled for reset, or handled by a specific migration/login recovery path? No plaintext/default password may be assigned.
11. **Deletion/retention:** confirm soft-deletion/retention policy for users, hubs, parcels and financial/audit records.
12. **Device tokens:** include now only if push is part of this deployment slice; otherwise defer.

## 9. Scope of next code branch

After contract decisions are confirmed, a separate branch may:
- add environment-driven PostgreSQL configuration without breaking local SQLite development;
- set schema synchronization off for PostgreSQL/durable environments;
- add versioned TypeORM migrations for only the approved first slice;
- add disposable PostgreSQL CI integration tests and test fixtures;
- add migration and data-validation tooling that emits aggregate-only reports;
- keep Render, DNS, production credentials, production database and existing service unchanged.

No production migration, Render service, DNS update, database provisioning, or PR merge is authorized by this document.
