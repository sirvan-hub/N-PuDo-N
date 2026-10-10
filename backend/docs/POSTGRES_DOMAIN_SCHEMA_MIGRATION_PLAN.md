# PostgreSQL Domain Schema Gap Analysis and Migration Plan

**Status:** Additive domain migration implemented on the feature branch; CI verification pending. No production operation or production schema migration has occurred.
**Target branch:** `feat/postgres-migrations-ci`
**Baseline commit reviewed:** `72dbc4a37027ab39a8d9d3da877b74b24c89cf4e`
**Decision rule:** preserve the approved 14-value parcel status contract. Do not invent commercial rules or silently alter domain invariants.

## 1. Executive summary

The current PostgreSQL migration creates five tables mapped by the active NestJS entities: `users`, `hubs`, `parcels`, `invoices`, and `wallets`. The canonical SQL baseline describes twelve tables. In addition, the five current tables do not fully match the canonical baseline or the wider domain requirements.

The next change should be additive and versioned. Do not rewrite the existing initial migration after it may have been applied in another environment. First settle the blocking contract differences below; then implement a follow-up migration, matching entities, services, and PostgreSQL CI tests together.

## 1A. Approved contract and implementation status

The implementation contract is documented in [FINANCIAL_IDEMPOTENCY_CUSTODY_CONTRACT.md](./FINANCIAL_IDEMPOTENCY_CUSTODY_CONTRACT.md). It records the user's choices: ledger-backed wallets; preserve current invoice states and add `OVERDUE` / `CANCELLED`; idempotency uniqueness by actor scope + operation type + key; four-digit single-use custody codes stored as salted hashes.

The additive migration `1791630000001-AddDomainFinancialContracts` creates tariff versions, invoice snapshots/status constraint, idempotency records, wallet ledger, registration history, custody transfer history, settlement records, audit logs, wallet blocked balance, and parcel lifecycle columns. It backfills existing invoice pricing fields into immutable JSON snapshots and establishes opening ledger entries for nonzero available/pending wallet balances.

The wallet service now implements idempotent atomic credit, pending credit, release-pending, hold, release-hold, and debit operations. Two-bucket movements append one ledger entry per affected bucket in the same transaction as the wallet update and idempotency response. Read-only `GET /v1/wallets/me` and `GET /v1/wallets/me/transactions` endpoints are protected by JWT and role guards and are scoped to the authenticated subject. PostgreSQL CI includes concurrent retry, conflict, bucket movement, and overdraft checks; authorization metadata/guard tests run in CI. No public mutation endpoint, payout-provider execution, settlement orchestration, tariff-version selection, payment-provider reconciliation, or custody-code verification is enabled. The initial migration remains unchanged.

## 2. Evidence-based gap inventory

| Area | Current active PostgreSQL migration / entity | Canonical SQL or domain requirement | Required treatment |
|---|---|---|---|
| Users | Has username and password_hash; role is varchar without a CHECK constraint | Canonical role CHECK includes RECIPIENT, COURIER, HUB_OWNER, ADMIN, SUPER_ADMIN, AMBASSADOR | Define the approved role vocabulary and add a constraint only after checking every active role in code. Never add a seeded default administrator or hard-coded credentials. |
| Hubs | operating_hours is NOT NULL; core hub fields and owner relation exist | Canonical SQL permits nullable operating_hours and adds city/QR/active indexes | Confirm whether operating hours are mandatory; add missing indexes based on query paths. Keep FK ownership explicit. |
| Parcels | Has recipient_id and current_hub_id; status CHECK matches the approved 14 states | Canonical SQL has lifecycle timestamps, version and rejected_reason, but lacks recipient_id/current_hub_id | Preserve the 14-state enum. Add missing lifecycle fields in an additive migration. Do not remove active entity columns to mimic an older SQL file. Add optimistic-concurrency semantics for version only with service-level checks. |
| Invoices | Current status values are PENDING, PAID, FAILED, REFUNDED; integer amounts; no tariff-version reference or paid_at | Canonical SQL has PENDING, PAID, OVERDUE, CANCELLED, REFUNDED, BIGINT amounts, tariff_version_id and paid_at | Reconcile payment lifecycle states before a CHECK constraint. Add tariff snapshot/version linkage. Clarify whether total_amount means only the PUDO fee or a broader payable total. |
| Wallets | balance, pending_balance, total_earned as integer | Canonical SQL uses balance and blocked_amount as BIGINT; domain requires pending/held amounts and an immutable ledger | Define balance semantics and perform a documented compatibility mapping; do not rename or drop columns until migration/backfill and rollback are tested. Prefer BIGINT for currency amounts. |
| Tariffs | Pricing service and tests exist, but no tariff_versions table or invoice FK snapshot | Canonical SQL has tariff_versions; domain requires tariff snapshots | Add immutable tariff version records and copy the exact tariff inputs/outputs onto each invoice so historical amounts never depend on the current tariff. |
| Wallet ledger | No wallet_transactions table | Canonical SQL has wallet_transactions but lacks a robust idempotency contract | Add append-only ledger entries with a unique idempotency key, transaction type, signed amount, currency unit, resulting balance and reference metadata. Balance mutation and ledger insert must be atomic. |
| Registration | No registration_transactions table | Canonical SQL records PUDO request/accept/reject/hub selection/offline assignment | Add a registration history table; enforce that registration is distinct from custody handover and settlement. Capture the initiating reason (CUSTOMER_REQUEST or FAILED_HOME_DELIVERY) and actor. |
| Custody | No custody_transfers table | Canonical SQL records transfer types/statuses and a custody code; domain requires a four-digit custody code and auditability | Add custody transfer history with actor/receiver, from/to hub, lifecycle timestamps, reason and a hashed, single-use four-digit code. Do not store the raw code. Confirm expiry/attempt-limit rules before enforcement. |
| Settlement | No settlement_transactions table | Canonical SQL records payment/refund/fee/payout/hold/release | Add settlement records linked to parcel, invoice, wallet and actor where applicable. Settlement must be idempotent and must not be conflated with parcel registration or handover. |
| Audit | No audit_logs table | Canonical SQL audit log lacks the complete actor role, old/new status and transaction correlation fields required by the domain | Add append-only audit records with actor ID/role, entity type/ID, action, old/new state, transaction/correlation ID and timestamp. Do not rely only on mutable entity updated_at columns. |
| Device tokens | No device_tokens table | Canonical SQL includes push notification tokens | Optional phase: add only when push notifications are in scope, with unique token handling, platform validation and revocation. |
| Parcel status | Migration CHECK, TypeScript enum and state-machine tests share 14 values including DELIVERED | User selected Option A | Keep this contract unchanged; extend database and transition tests whenever a future status change is explicitly approved. |

## 3. Contract mismatches that block a safe full migration

These are decisions or contract clarifications, not implementation details to guess:

1. **Wallet semantics:** define available balance, pending balance, held/blocked amount, total earned, and whether a ledger entry amount is signed or direction-coded. Establish a reconciliation invariant between wallet balances and ledger entries.
2. **Payment lifecycle:** choose the authoritative invoice/payment states. The active entity's FAILED state differs from the canonical SQL's OVERDUE and CANCELLED states. Define whether failed payment attempts belong in a separate payment-attempt table.
3. **Revenue split and payout:** the active service assumes a 70/30 split, but the business blueprint says this split is not approved. Do not treat the assumption as policy or bake it into a database constraint.
4. **Tariff representation:** standardize whether percentages are stored as fractions (0.20) or percentage points (20.00); define rounding and the exact 168-hour expiry boundary. Preserve the already-tested rule: under 12 hours = 20%, 12 through 24 hours = 40%, each additional started 24-hour interval adds 50 percentage points, 168 hours = 340% and expired, with fee rounded up to a whole currency unit.
5. **Custody code:** the older SQL permits six characters, while the domain contract calls for a four-digit code. Proposed safe storage is a hash, with one-time use and bounded attempts; expiry and lockout duration need a domain decision.
6. **Idempotency scope:** define key uniqueness per operation (registration, custody transition, payment, refund, wallet posting, settlement) and behavior when the same key is reused with a different request payload.
7. **Identity resolution:** parcel creation currently stores recipient contact details and proposed hub, while invoice creation requires recipient_id and current_hub_id. Specify the flow that resolves recipient identity and confirms actual hub custody before invoice/settlement.
8. **Legacy baseline hazards:** the canonical SQL contains a seeded administrator with a known default credential and has schema differences from active entities. Do not execute that whole file as a production migration or copy its admin seed. Review it as a historical reference only.

## 4. Proposed additive migration sequence

Keep the already-tested core migration immutable. The following names are proposals; assign exact TypeORM migration timestamps when implementation begins.

### Migration 2 — domain history and immutable tariff versions

- Create `tariff_versions` with effective dates, active/archived state and validated tariff parameters.
- Add `tariff_version_id` to invoices as nullable initially, plus immutable snapshot columns for tariff version/parameters used, elapsed hours, fee percentage representation, calculated fee and rounding result.
- Create `registration_transactions` with parcel, actor, selected hub, request reason, outcome, rejection reason, metadata and timestamps.
- Create `custody_transfers` with parcel, from/to hub, courier/receiver, transition type/status, hashed custody-code metadata, failure reason and timestamps.
- Add the missing parcel lifecycle timestamps, `version`, and `rejected_reason` with safe nullable/default values first.
- Add only constraints that can be proven against existing data; backfill before enforcing NOT NULL.

### Migration 3 — financial ledger and settlement

- Create append-only `wallet_transactions` with idempotency key and an appropriate unique constraint, references, signed amount/direction, balance-after snapshot and timestamp.
- Create `settlement_transactions` with parcel/invoice/wallet/actor references, type/status, amount, idempotency key and completion/failure details.
- Reconcile wallet columns and types after the wallet semantics decision. Use BIGINT for monetary amounts and document currency units.
- Add invoice paid/settled timestamps and payment-state constraints only after the payment lifecycle is approved.
- Enforce atomic ledger posting, balance update and settlement state transition in service transactions; schema-only checks are not enough.

### Migration 4 — audit and optional device registration

- Create append-only `audit_logs` with actor identity/role, entity identity, action, old/new state, transaction/correlation ID, metadata and timestamp.
- Add `device_tokens` only if push delivery is in the agreed release scope.
- Add query-driven indexes after reviewing expected lookups; avoid blindly copying every index from the historical SQL file.

## 5. Migration safety and compatibility rules

- Use new TypeORM migration files; do not amend the initial migration to retrofit a database that may already have recorded it.
- Run only against ephemeral PostgreSQL in CI until explicitly approved otherwise.
- Never enable `synchronize` or automatic migration execution at application startup.
- Prefer expand → backfill → validate → enforce constraints. Avoid destructive renames/drops in the same release that introduces new columns.
- Use a transaction for related schema changes where PostgreSQL and TypeORM support it. Document any operation that cannot be transactional.
- Ensure `down()` is deterministic for a disposable test database. Rollback is not a substitute for a backup or a production data migration plan.
- Do not migrate real SQLite data as part of the schema-only CI rehearsal.
- Test constraints, duplicate idempotency keys, FK behavior, rollback, status CHECK values, and ledger/balance invariants against a disposable PostgreSQL service.
- Every status mutation must validate the transition in service logic and write its audit event in the same database transaction.

## 6. Acceptance criteria for implementing the follow-up migrations

1. A reviewed mapping exists from every active entity and canonical domain concept to a target table/column/constraint.
2. All blocking decisions in section 3 are resolved or explicitly deferred without encoding assumptions.
3. The new migrations build a clean PostgreSQL database from the current core migration.
4. CI tests valid/invalid registration and custody records, foreign keys, idempotency, invoice tariff snapshots, and ledger/settlement invariants.
5. `down()` reverses the added schema on a disposable database; tests confirm the initial core schema remains intact.
6. Existing backend CI and all PostgreSQL CI checks pass on the resulting branch commit.
7. PR #5 remains unmerged and no production database, Render service, DNS, or `main` branch is touched.

## 7. Current outcome

The additive domain migration and wallet contract implementation are present on the feature branch. The internal wallet service supports idempotent credit, pending credit, release-pending, hold, release-hold, and debit operations; authenticated wallet read APIs expose only the caller's own summary and ledger. This does not authorize a 70/30 revenue split, expose financial mutation endpoints, execute payouts, or alter production data. Remaining domain areas include payment-provider integration, settlement orchestration, tariff-version selection, custody-code verification, and broader full-domain schema alignment. The approved 14-state parcel vocabulary is preserved.
