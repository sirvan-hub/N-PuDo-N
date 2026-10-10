# PostgreSQL implementation status and gate notes

This branch is infrastructure preparation, not production readiness.

## Included
- Environment-selected SQLite/PostgreSQL TypeORM options.
- PostgreSQL requires explicit connection settings.
- PostgreSQL rejects schema synchronization and does not auto-run migrations.
- SQLite remains the default for non-production local development.
- Production mode rejects SQLite.
- Explicit TypeORM migration CLI scripts.
- PostgreSQL 16 CI service with a connection smoke test.
- Unit tests for database-driver configuration.

## Not yet safe to migrate
No business-schema migration is included yet. The code review found material contract drift:
- Current PricingService uses 12h/36h thresholds, 48h intervals, a 60% increment and 120h expiry, while the approved blueprint describes 12h/24h thresholds, 24h additional intervals and 168h expiry.
- Parcel status fields and transitions are not yet reconciled end-to-end with the canonical state graph.
- Current entity decorators include SQLite-specific types/representations and need PostgreSQL compatibility review.
- Invoice/wallet lifecycle and the ledger/idempotency constraints require domain-service alignment before constraints are made authoritative.

Adding schema migrations before resolving these issues risks making the database structurally valid while the application continues to calculate or persist incorrect business states.

## Verification
- CI's PostgreSQL smoke test verifies connection to a disposable PostgreSQL 16 instance only.
- It does not claim that the NestJS application can yet run end-to-end on PostgreSQL.
- The migration-run command is an explicit operator action and is not invoked by startup or CI.
- Never set production secrets in this repository; use environment/secret-manager configuration.
- No production database, Render service, DNS record, or main branch is modified by this branch.
