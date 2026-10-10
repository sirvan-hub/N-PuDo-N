# PostgreSQL implementation status and gate notes

This branch is still a migration rehearsal, not production readiness.

## Included in this branch
- Environment-selected SQLite/PostgreSQL TypeORM options.
- PostgreSQL requires explicit connection settings.
- PostgreSQL rejects schema synchronization and does not auto-run migrations.
- SQLite remains the default for non-production local development; production mode rejects SQLite.
- Entity column types are selected per driver (SQLite: datetime/simple-json/varchar; PostgreSQL: timestamptz/jsonb/uuid).
- Versioned migration for the currently mapped core tables: users, hubs, parcels, invoices, and wallets.
- PostgreSQL 16 CI applies the migration, performs a transaction-only relational data rehearsal, and reverts the migration.
- Pricing boundary tests for 12h, 24h, started 24h increments, 168h expiry, amount rounding, and invalid input.
- Active backend parcel status vocabulary and transition-rule tests.

## Canonical tariff behavior implemented
- elapsed time is measured from `delivered_to_hub_at`;
- less than 12h: 20%;
- 12h through exactly 24h: 40%;
- after 24h: add 50 percentage points for each additional started 24h interval;
- 168h is 340% and is marked expired;
- the fee rounds up to the next whole currency unit;
- elapsed time before hub delivery and invalid timestamps/base amounts are rejected.

## Deliberate migration limits
This migration only creates tables currently mapped by the active NestJS entities. It does **not** claim to implement the full canonical target contract. Registration transactions, custody transfers, tariff-version snapshots, payment/refund records, settlement transactions, wallet transaction ledger/idempotency, audit logs, and device tokens require their own entities/services and follow-up migrations.

The invoice service now refuses to create an invoice unless both recipient identity and current hub are resolved. Parcel creation currently accepts recipient contact details and a proposed hub, so the complete identity/custody flow must be implemented before invoice creation is considered end-to-end.

## Blocking domain/schema discrepancy
The source files do not agree on the parcel status vocabulary:
- the active canonical state-machine source has 14 values, including both `PENDING_APPROVAL` and `DELIVERED`;
- the SQL baseline's CHECK constraint has 13 values and omits `DELIVERED`;
- the master blueprint also uses a conceptual lifecycle vocabulary that is not identical to either list.

The active entity and initial status now use the state-machine enum and `DELIVERY_ATTEMPT` default. The migration intentionally does not add a database CHECK constraint for statuses until the single canonical vocabulary is confirmed. Transition rules are unit-tested but are not yet wired into a complete parcel-status update endpoint.

## Financial decisions not inferred
The master blueprint says the revenue split requires validation. The current invoice service still contains a 70/30 split assumption; it must not be treated as an approved commercial policy. VAT, settlement/payout ledger semantics, and idempotency keys remain blocking items for the full financial schema.

## Verification boundaries
- The PostgreSQL smoke test alone proves only connectivity to a disposable PostgreSQL instance.
- The migration rehearsal inserts related test rows in a transaction and rolls them back; it does not migrate existing SQLite records.
- Migration execution remains an explicit operator action and is not run at application startup.
- Never put production secrets in this repository. Use environment/secret-manager configuration.
- No production database, Render service, DNS record, or `main` branch is modified by this branch.
