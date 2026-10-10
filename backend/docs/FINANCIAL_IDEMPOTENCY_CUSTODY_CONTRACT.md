# Financial, Idempotency, and Custody Data Contracts

**Status:** Approved implementation contract for the additive PostgreSQL migration on `feat/postgres-migrations-ci`.
**Scope:** additive schema, internal atomic wallet operations, authenticated read-only wallet APIs, and PostgreSQL integration/authorization tests on the feature branch. No public financial mutation endpoint or production financial posting is enabled.
**Safety:** the initial migration is immutable; CI uses disposable PostgreSQL only; no production database, Render service, DNS, or `main` changes.

## 1. Wallet and immutable ledger

- `wallets.balance` means currently available funds.
- `wallets.pending_balance` means earned/credited funds not yet available for use or payout.
- `wallets.blocked_balance` means funds temporarily held and unavailable; it is distinct from pending funds.
- `wallets.total_earned` is a cumulative reporting metric for earned credits; it is not the spendable balance and must not be decremented by payout.
- `wallet_transactions` is the immutable record of balance-bucket movements. `amount` is a positive whole-toman magnitude; transaction type plus bucket identifies the movement direction. For a two-bucket movement (hold/release), one ledger row is written for each affected bucket, each recording that bucket's resulting balance.
- The invariant for each wallet and bucket is: the bucket balance equals the sum of its opening-balance entry plus all later ledger entries in that bucket. Available, pending, and blocked balances must never be combined implicitly.
- Posting ledger rows and updating the affected wallet balance buckets must occur in the same database transaction. `WalletsService.credit`, `creditPending`, `releasePending`, `hold`, `releaseHold`, and `debit` use transactions, PostgreSQL row locking, and an idempotency record written in the same transaction. `debit` is an internal wallet posting only; payout-provider execution and settlement orchestration remain separate workflows.
- Ledger entries are append-only by application contract. Corrections use compensating entries, not UPDATE/DELETE. The database migration does not install a trigger that prevents a privileged database operator from editing rows.
- Existing nonzero available and pending balances are represented by deterministic opening entries during migration. `blocked_balance` is introduced by this migration and starts at zero. Historical movements before this migration cannot be reconstructed; the opening entries establish a migration-time starting point only.
- No revenue split is approved by this contract. Existing `hub_owner_share` and `platform_fee` fields remain for compatibility but must not be treated as approval of the currently coded 70/30 calculation.

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

## 5. Explicitly unresolved / not authorized by this contract

1. The 70/30 revenue split is not approved. No migration constraint or new service should enforce it as policy.
2. The exact currency code/representation for gateways and reports (whole toman is the current project convention; external ISO currency mapping remains open).
3. Payment-provider integration, payment-attempt history, retry/timeout rules, and external reconciliation.
4. Custody-code expiry duration, maximum attempts, and lockout duration.
5. Recipient identity resolution and the exact moment invoice creation becomes eligible; current code requires resolved `recipient_id` and `current_hub_id`.
6. Business policy for cancellation/refund eligibility and due-date calculation.
7. Production data migration. This change only rehearses schema on ephemeral PostgreSQL; no SQLite records are imported into production.

## 6. Acceptance checks

- The initial migration file remains byte-for-byte unchanged.
- The new migration is additive and reversible on a disposable PostgreSQL database.
- All 14 approved parcel statuses remain unchanged.
- Invoice status constraint accepts all six agreed values and rejects unknown values.
- Ledger amount is a positive magnitude with bucket/type direction semantics; idempotency scope is unique, and same-key/different-hash conflict is covered by integration tests.
- Custody code hash format, expiry, single-use metadata, and bounded numeric attempt counter are structurally validated; the schema does not invent an attempt-limit policy.
- Existing wallet available/pending balances are represented by opening ledger entries.
- PostgreSQL CI applies both migrations, runs tests, then reverts both migrations on the disposable service.
