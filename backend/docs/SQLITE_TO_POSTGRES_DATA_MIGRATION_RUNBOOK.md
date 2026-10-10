# SQLite to PostgreSQL Data Migration Runbook

**Status:** Planning and rehearsal only. This document authorizes no production action.
**Branch:** `feat/postgres-migrations-ci`
**Safety gate:** Do not connect this runbook to Production, Render, DNS, production secrets, or an operational database without a separately reviewed and explicitly approved migration plan.

## 1. Purpose and non-goals

This runbook defines the evidence required before existing SQLite records can be migrated to PostgreSQL. The current PostgreSQL CI creates a disposable database, applies versioned migrations, runs tests, and checks that the latest migration can be reverted. It does **not** copy data from `backend/dev.db` or establish production readiness.

The runbook does not authorize:
- changing the `main` branch or merging PR #5;
- running migrations against any operational database;
- deleting, rewriting, or replacing the SQLite source;
- changing Render, DNS, environment secrets, or deployment configuration;
- inferring a commercial allocation for the unassigned 70% of invoice value;
- treating an approved hub payout request as a completed bank transfer.

## 2. Preconditions before any future migration

All items below must be evidenced in a separate review before a production migration is scheduled:

- [ ] The authoritative SQLite source, its owner, environment, and exact file/hash are identified.
- [ ] A consistent backup is created, encrypted where appropriate, access-controlled, and restore-tested.
- [ ] PostgreSQL target version, extensions, collation, timezone, SSL, ownership, privileges, and retention are approved.
- [ ] Entity/schema differences are reconciled against the canonical domain contract; all required migrations are reviewed.
- [ ] The mapping for every table and column is approved, including nullability, enum/status values, UUIDs, timestamps, decimal/integer monetary fields, JSON snapshots, and foreign keys.
- [ ] Duplicate natural keys, orphaned foreign keys, invalid statuses, missing recipient/hub references, and monetary inconsistencies are reported and resolved.
- [ ] Existing invoices receive a documented historical treatment; current hub-share settings must not be applied retroactively to historical invoices.
- [ ] Wallet balances are reconciled against ledger entries. Do not create opening ledger entries twice or silently adjust balances to make totals match.
- [ ] Idempotency keys and provider references are preserved with their uniqueness scope.
- [ ] A rehearsal on a sanitized copy completes with row counts, checksums or stable aggregate comparisons, FK/constraint validation, and business-level reconciliation.
- [ ] A cutover window, write-freeze strategy, rollback threshold, owner, and explicit go/no-go approver are documented.
- [ ] A tested rollback plan preserves the source SQLite file and avoids split-brain writes.

## 3. Required migration sequence

1. **Inventory only:** enumerate tables, row counts, schema, indexes, foreign keys, status distributions, duplicate keys, and null/invalid references. Do not export secrets or unnecessary personal data into CI artifacts.
2. **Freeze a source snapshot:** capture the exact source hash and backup metadata. Keep the original immutable.
3. **Transform in isolation:** map data into a separate staging dataset. Record rejected rows and deterministic reasons; do not silently discard or fabricate identities.
4. **Load parent records first:** users, then hubs, then parcels and invoices, followed by wallets, ledger/settlement, idempotency, and audit records according to the approved FK dependency graph.
5. **Reconcile:** compare source/target counts and approved aggregates; verify all foreign keys, status constraints, monetary sums, invoice snapshots, wallet bucket totals, and idempotency uniqueness.
6. **Run application acceptance tests:** authentication and authorization, parcel lookup, recipient identity, hub custody, invoice creation and payment reconciliation, wallet ledger operations, payout request/review, and audit history.
7. **Go/no-go review:** provide evidence and receive explicit approval before any operational cutover.
8. **Cut over only under the approved plan:** keep the old source read-only and retained until post-cutover reconciliation and the rollback window have passed.
9. **Close out:** archive sanitized evidence, migration logs, counts, reconciliation output, approvals, and any rejected-row decisions.

## 4. Financial invariants

- Invoice amount, tariff inputs, hub-share percentage, share amount, currency unit, and snapshot version must remain reproducible.
- A new rate applies only to invoices created under that rate; do not recompute historical snapshots from the current setting.
- Wallet balance changes must remain atomic with their ledger and idempotency records.
- Pending, available, and blocked balances must be reconciled separately.
- A rejected payout releases the reserved hold exactly once. An approved payout remains blocked until a separately implemented and reviewed provider transfer is confirmed.
- No transfer, fee allocation, refund, or data correction may be invented to force reconciliation.

## 5. Current implementation boundary

Parcel creation now resolves a registered recipient by phone and validates that the proposed hub exists and is accepting parcels. The selected hub is stored as `proposed_hub_id`; `current_hub_id` remains unset because selection is not custody confirmation.

The current pricing service requires `delivered_to_hub_at`. Therefore a fully integrated parcel-to-invoice workflow still requires a separately implemented and tested hub handover/custody-confirmation operation that sets the custody timestamp and current hub atomically, then creates an invoice with the correct recipient and hub identity. Do not create an invoice at parcel registration or infer custody from the proposed hub. Until that flow and its PostgreSQL integration tests exist, parcel-to-invoice is not considered end-to-end complete.

## 6. Evidence expected from a rehearsal

The rehearsal report should contain:
- source and target identifiers (never credentials);
- migration commit and database migration versions;
- row counts by table before/after;
- rejected-row counts with reason categories;
- FK, unique-key, status, and nullability validation results;
- invoice and wallet/ledger reconciliation totals;
- test results and known limitations;
- backup restore evidence and an explicit go/no-go recommendation.

A green CI run is necessary but does not replace this data-migration rehearsal or production approval.
