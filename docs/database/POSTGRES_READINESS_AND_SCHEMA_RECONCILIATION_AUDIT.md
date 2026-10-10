# PostgreSQL Readiness and Schema Reconciliation Audit

**Status:** Read-only discovery complete; no database or runtime changes made.  
**Repository baseline:** `sirvan-hub/N-PuDo-N`, branch `main` inspected during this audit.  
**Purpose:** Establish a safe, evidence-backed path from the current SQLite configuration to durable PostgreSQL before creating an isolated Render test service.

## Executive decision

**Do not run the existing canonical SQL migration against a database yet.** The migration and current TypeORM entities are materially different. The target schema must be reconciled against current application behavior and the intended PUDO domain model first.

No Render service, environment variable, production database, or deployment was changed during this audit.

## Current persistence configuration

File: `backend/src/app.module.ts`

- TypeORM currently uses `type: 'sqlite'` and `database: 'dev.db'`.
- `synchronize: true` allows TypeORM to alter the schema automatically at startup. This is not appropriate for production migration control.
- `pg` and `sqlite3` are both listed in `backend/package.json`.
- `backend/.gitignore` currently ignores `node_modules/`, `dist/`, and `.env`, but does not ignore database files.
- A file at `backend/dev.db` is present in the repository. Its contents were intentionally not read or printed in this audit. Before moving or deleting it, determine whether it contains useful test data or personal data; do not publish database contents in logs or pull requests.

## Entity and canonical schema findings

Canonical reference: `baseline/2026-10-07-canonical/03_DATABASE/migrations/001_initial_schema.sql`

The SQL migration defines 12 tables and includes 44 indexes, check constraints, update triggers, and a default administrator seed. Current TypeORM entity files inspected define five entities: users, hubs, parcels, invoices, and wallets. The following are confirmed mismatches or gaps:

### Users

Current `UserEntity`:
- Has `username` (nullable, unique) and `password_hash` (nullable, excluded from default selects).
- Uses `phone` as a unique indexed field.
- Uses TypeORM `simple-enum` and `datetime` types.

Canonical SQL:
- Has `password` as NOT NULL, and does not define `username`.
- Includes the same general identity/security fields, but role constraints and timestamp types are defined differently.
- Seeds a preconfigured administrator account with a known/default credential comment. Do not carry this seed into a deployed environment without a deliberate secure bootstrap process.

**Decision needed in implementation:** retain the username-based login contract and map it safely into PostgreSQL, or explicitly redesign login. Do not rename columns based on the SQL alone.

### Hubs

Current `HubEntity` includes owner relation, contact/location fields, capacity, active/closed flags, QR hash, rating, and timestamps. `operating_hours` uses TypeORM `simple-json`.

Canonical SQL uses `JSONB` for `operating_hours`, declares an explicit owner foreign key with `ON DELETE CASCADE`, and has explicit indexes/constraints. PostgreSQL migration must preserve relation behavior and validate existing JSON shape.

### Parcels

Current `ParcelEntity` contains tracking code, recipient details, base cost, optional proposed hub/courier IDs, status, weight, description, and timestamps. It does not currently declare several fields in the canonical schema, including delivery/handover timestamps, version, rejection reason, and explicit relations/foreign keys to hubs/users.

Canonical SQL also constrains allowed parcel status values. The application’s intended state machine must be reconciled before adding constraints; otherwise valid application states may be rejected or data migration may fail.

### Invoices

Current `InvoiceEntity` uses integer monetary columns, a `PaymentStatus` enum containing `PENDING`, `PAID`, `FAILED`, and `REFUNDED`, and a relation to parcels. The canonical schema also has `OVERDUE` and `CANCELLED` statuses, uses BIGINT for calculated/total/share amounts, and has a nullable `tariff_version_id` relation and `paid_at` field.

The intended monetary unit and integer width should be confirmed before changing these columns. A change to numeric storage must not silently change tariff calculation or rounding behavior.

### Wallets and transaction records

Current `WalletEntity` has `balance`, `pending_balance`, and `total_earned`.

Canonical `wallets` has `balance` and `blocked_amount`, and additionally defines `wallet_transactions` and `settlement_transactions`. These are not equivalent accounting concepts. Map them only after confirming ledger invariants and existing service usage; do not infer that pending balance equals blocked amount.

### Missing canonical tables / audit trail

The canonical SQL defines additional tables not represented by the five inspected entities:
- `tariff_versions`
- `wallet_transactions`
- `device_tokens`
- `registration_transactions`
- `custody_transfers`
- `settlement_transactions`
- `audit_logs`

Their existence in the SQL does not prove that the corresponding workflows are fully implemented in the current backend. Each table should be classified as required now, required later, or stale/unapproved before migrations are authored.

### Tariff behavior mismatch

The current `PricingService` calculates 30% through 12 hours, 70% through 36 hours, then adds 60% per additional 48 hours. The project’s documented pricing baseline uses a different schedule. This is a business-rule mismatch, not merely a database-type issue. It must be resolved against the approved project baseline before storing tariff versions or migrating fee-related data.

## Migration safety requirements

1. **Freeze schema authority:** choose the canonical business/data contract after comparing entities, DTOs, services, tests, and the master project blueprint. Do not blindly treat the existing SQL file or current entities as authoritative for every field.
2. **Protect current data:** inventory whether `backend/dev.db` contains meaningful data without displaying personal information. Back it up securely before any local migration experiment.
3. **Use explicit migrations:** turn off TypeORM `synchronize` for production and manage schema changes with versioned TypeORM migrations (or another single, documented migration mechanism).
4. **Use environment-driven PostgreSQL configuration:** define a clear connection contract (for example, `DATABASE_URL` with SSL options where required), never commit credentials, and fail startup clearly when production configuration is missing.
5. **Do not seed default credentials:** create the initial administrator via a one-time, secure bootstrap flow or manual administrative procedure, with a unique secret and forced rotation.
6. **Preserve domain invariants:** registration is not handover or settlement; custody/parcel state changes need auditability and transactional guarantees; wallet balances need a traceable ledger.
7. **Verify rollback:** prepare a migration rollback or restore procedure and test on a disposable database before using any durable environment.
8. **Only then create an isolated Render test service:** keep auto-deploy disabled initially, use a separate test database, and leave the existing Render service untouched until explicit approval.

## Proposed next work items

- [ ] Inspect all DTOs, services, controllers, and tests that read/write the five existing entities.
- [ ] Produce a column-by-column matrix: current entity, actual application usage, canonical SQL, recommended target, migration/backfill rule, and test.
- [ ] Reconcile role/status enums and the tariff schedule with approved business rules.
- [ ] Determine whether the tracked SQLite file contains data worth preserving; do not expose its contents.
- [ ] Design versioned PostgreSQL migrations and environment configuration on a separate branch.
- [ ] Validate build, focused tests, migration up/down, and a smoke test against a disposable PostgreSQL database.
- [ ] Review the results before creating any Render service or changing production settings.

## Verification boundary

This document records source inspection only. No PostgreSQL database was provisioned, no SQL migration was executed, no application files were changed, and no Render configuration or deployment was modified.
