# Financial, Idempotency, and Custody Data Contracts

**Status:** Approved implementation contract for the additive PostgreSQL migration on `feat/postgres-migrations-ci`.
**Scope:** additive schema, internal atomic wallet operations, authenticated read-only wallet APIs, and an administrator-only invoice-payment reconciliation endpoint on the feature branch. The reconciliation endpoint records a payment that must already have been verified externally; it does not call a provider, allocate revenue shares, or execute payouts.
**Safety:** the initial migration is immutable; CI uses disposable PostgreSQL only; no production database, Render service, DNS, or `main` changes.

## 1. Wallet and immutable ledger

- `wallets.balance` means currently available funds.
- `wallets.pending_balance` means earned/credited funds not yet available for use or payout.
- `wallets.blocked_balance` means funds temporarily held and unavailable; it is distinct from pending funds.
- `wallets.total_earned` is a cumulative reporting metric for earned credits; it is not the spendable balance and must not be decremented by payout.
- `wallet_transactions` is the immutable record of balance-bucket movements. `amount` is a positive whole-toman magnitude; transaction type plus bucket identifies the movement direction. For a two-bucket movement (hold/release), one ledger row is written for each affected bucket, each recording that bucket's resulting balance.
- The invariant for each wallet and bucket is: the bucket balance equals the sum of its opening-balance entry plus all later ledger entries in that bucket. Available, pending, and blocked balances must never be combined implicitly.
- Posting ledger rows and updating the affected wallet balance buckets must occur in the same database transaction. `WalletsService.credit`, `creditPending`, `releasePending`, `hold`, `releaseHold`, and `debit` use transactions, PostgreSQL row locking, and an idempotency record written in the same transaction. `debit` is an internal wallet posting only; payout-provider execution and revenue allocation remain separate workflows.
- Ledger entries are append-only by application contract. Corrections use compensating entries, not UPDATE/DELETE. The database migration does not install a trigger that prevents a privileged database operator from editing rows.
- Existing nonzero available and pending balances are represented by deterministic opening entries during migration. `blocked_balance` is introduced by this migration and starts at zero. Historical movements before this migration cannot be reconstructed; the opening entries establish a migration-time starting point only.
- Hub share is approved at a default 30% of the invoice total and is configurable by `ADMIN` / `SUPER_ADMIN` from `PUT /v1/admin/hub-share`. Values from 0% to 100%, up to two decimal places, are accepted. Each change records the prior/new rate, actor, optional reason and timestamp in `hub_share_rate_history`. Each newly created invoice stores `hub_share_percent` and a `hub_share_snapshot`; later setting changes do not rewrite prior invoices. The share amount is floored to a whole toman. `platform_fee` remains zero/unallocated; the remaining amount is not assigned to the platform or courier by this contract.

## 2. Invoice and tariff snapshot

- Existing invoice states remain valid: `PENDING`, `PAID`, `FAILED`, `REFUNDED`. `OVERDUE` and `CANCELLED` are added without removing or renaming existing states.
- `FAILED` describes a failed payment outcome; `OVERDUE` describes an unpaid invoice past its due date; `CANCELLED` describes an invoice cancelled through an authorized business action. Cancellation is not a refund. A paid invoice must not be changed to `CANCELLED` as a substitute for refunding it.
- This schema slice does not create a separate payment-attempt table and does not define gateway retry policy. Each payment attempt should be recorded separately in a later payment integration slice if a payment provider is introduced.
- A tariff version is immutable once referenced by an invoice. The invoice stores a JSON snapshot of the inputs and outputs used at calculation time, so historical invoices do not depend on current tariff configuration.
- The current tested pricing boundaries remain unchanged: under 12h = 20%; 12h through 24h = 40%; after 24h, add 50 percentage points per additional started 24h interval; 168h = 340% and expired; calculated fee rounds up to the next whole currency unit.
- Monetary database columns introduced here use `BIGINT` for whole-toman integer amounts. Existing integer columns are not narrowed or destructively rewritten in this slice; entity/service compatibility and any type conversion require their own tested step.

## 3. Idempotency

- Uniqueness scope is `actor_scope + operation_type + idempotency_key`. For a user, `actor_scope` should identify that user; system operations use a stable service identity. This avoids nullable-actor uniqueness gaps.
- Each record stores a SHA-256 request hash. Reusing a key with the same operation and same hash returns the original recorded result; reusing it with a different hash is a conflict and must be rejected. The database can enforce uniqueness, but application code must compare hashes and return the correct response.
- Idempotency record creation and the operation's database effects must be in one transaction. The wallet-credit service implements this for `wallet.credit`, including same-key/same-request replay and same-key/different-request conflict handling. External payment calls require a separate outbox/provider reconciliation strategy; this service cannot make an external provider call atomic.
- Keys are scoped by operation, so a key for `invoice.create` does not collide with `wallet.credit`.
- Request keys are not credentials. Do not store access tokens, raw custody codes, or other secrets in the idempotency record.

## 4. Custody code and history

- Custody codes are exactly four decimal digits at issuance, stored only as a cryptographic hash; raw codes must never be persisted.
- A code is single-use. Successful use records `consumed_at`; expiry is explicit per transfer via `expires_at`. Attempt count is recorded.
- A fixed expiry duration, maximum failed attempts, and lockout duration are not yet approved. The schema records expiry/attempts but intentionally does not hard-code those policy values.
- Registration, custody handover, and settlement remain distinct events and tables.

## 5. Settlement reconciliation slice

- `POST /v1/settlements/invoices/:invoiceId/confirm-payment` is restricted by JWT and role guards to `ADMIN` and `SUPER_ADMIN`.
- The endpoint accepts an Idempotency-Key header and a provider reference. It is for recording a payment that has already been verified with the payment provider or by an authorized reconciliation process; it must not be used as evidence that a payment occurred without independent verification.
- Only an invoice in `PENDING` can be confirmed. The invoice transition to `PAID`, `paid_at`, completed `PAYMENT` settlement record, audit record, and idempotency response commit or roll back together.
- Same-key/same-request retries return the saved response; same key with a different request conflicts. Completed payment provider references are protected by a unique partial index.
- Hub owners can submit idempotent payout requests for their own hub. The request atomically reserves the requested available wallet balance in the blocked bucket and writes two ledger rows. Administrators can approve or reject; rejection releases the reservation atomically, while approval keeps the amount blocked. Approval is not a bank transfer: external payout execution and verified provider outcomes are not implemented. The owner can read only their own hub payout history; admins can review requests. Same-key/same-payload requests replay their result; same key with a different payload conflicts.

## 6. Explicitly unresolved / not authorized by this contract

1. The 30% hub share is approved as a default and is administrator-configurable. Platform/courier allocation of the remaining amount is still undefined; `platform_fee` stays zero.
2. The exact currency code/representation for gateways and reports (whole toman is the current project convention; external ISO currency mapping remains open).
3. Payment-provider integration, payment-attempt history, retry/timeout rules, and external reconciliation.
4. Custody-code expiry duration, maximum attempts, and lockout duration.
5. Recipient identity resolution and the exact moment invoice creation becomes eligible; current code requires resolved `recipient_id` and `current_hub_id`.
6. Business policy for cancellation/refund eligibility and due-date calculation.
7. Production data migration. This change only rehearses schema on ephemeral PostgreSQL; no SQLite records are imported into production.

## 7. Acceptance checks

- The initial migration file remains byte-for-byte unchanged.
- The new migration is additive and reversible on a disposable PostgreSQL database.
- All 14 approved parcel statuses remain unchanged.
- Invoice status constraint accepts all six agreed values and rejects unknown values.
- Ledger amount is a positive magnitude with bucket/type direction semantics; idempotency scope is unique, and same-key/different-hash conflict is covered by integration tests.
- Custody code hash format, expiry, single-use metadata, and bounded numeric attempt counter are structurally validated; the schema does not invent an attempt-limit policy.
- Existing wallet available/pending balances are represented by opening ledger entries.
- PostgreSQL CI applies the additive migrations, runs tests, then reverts them on the disposable service.
- Invoice payment reconciliation is administrator-only, atomic across invoice/settlement/audit/idempotency records, rejects repeated payment references, and is verified by PostgreSQL integration tests.
- Hub share defaults to 30%, changes are administrator-only and historized, new invoices persist a rate snapshot, and historical invoices are not backfilled with a new commercial rate.
- Hub payout requests reserve available funds atomically; administrator rejection releases them, approval leaves them blocked, and no external transfer is claimed or executed.
