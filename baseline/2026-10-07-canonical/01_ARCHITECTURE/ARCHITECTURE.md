# N-PuDo-N Master System Architecture v1.0

> **Status**: Architecture Baseline — Final  
> **Version**: 1.0  
> **Date**: 2026-09-20  
> **Scope**: MVP Critical Path  
> **Merge Target**: Architecture + Domain + State Machine + Data Model + API + Security + Offline Sync + Deployment

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [MVP Critical Path](#2-mvp-critical-path)
3. [Architecture Principles](#3-architecture-principles)
4. [Domain Layer](#4-domain-layer)
5. [State Machine](#5-state-machine)
6. [Data Model](#6-data-model)
7. [API Layer](#7-api-layer)
8. [Security & RBAC](#8-security--rbac)
9. [Offline-First Sync](#9-offline-first-sync)
10. [Tariff Versioning & Pricing](#10-tariff-versioning--pricing)
11. [Custody & Handover](#11-custody--handover)
12. [Settlement](#12-settlement)
13. [Notifications](#13-notifications)
14. [Deployment](#14-deployment)
15. [Out of Scope (Deferred)](#15-out-of-scope-deferred)
16. [Project Structure](#16-project-structure)

---

## 1. System Overview

N-PuDo-N is a parcel delivery platform connecting couriers, hub owners, and customers. The system manages the full lifecycle of a parcel from initial delivery attempt through hub custody to customer collection and final settlement.

### Core Actors

| Actor | Role | App |
|-------|------|-----|
| **Courier** | Delivers parcels, performs handover | `courier_app` (Flutter) |
| **Hub Owner** | Receives, stores, releases parcels | `hub_owner_app` (Flutter) |
| **Customer** | Receives notifications, collects parcels | Web / Mobile |
| **Admin** | Manages users, parcels, tariffs, settlements | `admin_panel` (Next.js) |

### Key Design Decisions

- **Monolithic Backend** (NestJS) — not microservices for MVP
- **PostgreSQL** as primary database (SQLite for dev)
- **TypeORM** for ORM and migrations
- **JWT** for authentication with refresh tokens
- **State Machine** as the single source of truth for parcel lifecycle
- **Offline-first** on mobile apps with local SQLite + sync engine

---

## 2. MVP Critical Path

The following 14 items constitute the **MVP Critical Path**. Everything else is deferred.

| # | Component | Status | Description |
|---|-----------|--------|-------------|
| 1 | **Real Android Build** | ✅ In Progress | Courier & Hub Owner apps build to real APK |
| 2 | **Real CameraX + ML Kit** | ⬜ Planned | Parcel barcode/QR scanning on Android |
| 3 | **Real GPS** | ⬜ Planned | Courier location tracking during delivery |
| 4 | **Offline-first Sync** | ⬜ Planned | Local SQLite + conflict resolution on mobile |
| 5 | **Parcel State Machine** | ✅ Implemented | `ParcelStatus` enum + `VALID_TRANSITIONS` + `validateTransition` |
| 6 | **Hub Selection** | ✅ Implemented | `PUDO_ELIGIBILITY` → `HUB_SELECTED` transitions |
| 7 | **Custody/Handover** | ✅ Implemented | `HANDOVER_IN_PROGRESS` → `TRANSFERRED_TO_HUB` → `STORED_AT_HUB` |
| 8 | **Customer Collection** | ✅ Implemented | `READY_FOR_CUSTOMER` → `CUSTOMER_COLLECTION` → `COLLECTED` |
| 9 | **Settlement** | ✅ Implemented | `COLLECTED` → `SETTLEMENT` with `SettlementTransaction` entity |
| 10 | **Pricing** | ✅ Implemented | `TariffVersion` with tiered pricing formula |
| 11 | **Notifications** | ✅ Implemented | Firebase push notifications via `NotificationsModule` |
| 12 | **Security/RBAC** | ✅ Implemented | JWT auth, guards, roles (admin, hub_owner, courier) |
| 13 | **Real-device E2E** | ⬜ Planned | Test on actual Android devices |
| 14 | **Production Deployment** | ✅ Documented | Docker Compose + Nginx + CI/CD pipeline |

### Deferred from Critical Path

The following are **explicitly deferred** for MVP:

| Technology | Reason | Future Plan |
|------------|--------|-------------|
| **Kafka** | Overkill for MVP throughput | Event sourcing at scale |
| **RabbitMQ** | Not needed for synchronous flows | Async task queue |
| **Kubernetes** | Single Docker host sufficient | Horizontal scaling |
| **Redis Cluster** | Single Redis instance sufficient | Caching, sessions, rate limiting |
| **WebSocket realtime tracking** | Polling sufficient for MVP | Real-time parcel tracking |
| **Prometheus/Grafana** | Basic health checks sufficient | Full observability stack |
| **Advanced Analytics** | Not needed for launch | Business intelligence dashboard |
| **Payment Gateway** | Settlement is internal ledger | Stripe/PayPal integration |

---

## 3. Architecture Principles

1. **State Machine First** — Parcel lifecycle is governed by `ParcelStatus` enum and `VALID_TRANSITIONS`. No state change bypasses the state machine.
2. **Offline-First** — Mobile apps work without network. Sync engine resolves conflicts on reconnection.
3. **Idempotency** — All write operations are idempotent. Retry-safe by design.
4. **Domain-Driven** — Business logic lives in the domain layer (state machine, entities). Infrastructure is separate.
5. **Monolith-First** — Single NestJS backend. No premature decomposition into microservices.
6. **SQLite for Dev, PostgreSQL for Prod** — Seamless switch via `USE_POSTGRES` env var.
7. **Tariff Versioning** — Pricing is immutable per version. Historical invoices reference the tariff version active at time of creation.

---

## 4. Domain Layer

### 4.1 Parcel Domain

The parcel domain is the heart of the system. It consists of:

- **`ParcelStatus` enum** — 13 states defining the complete lifecycle
- **`VALID_TRANSITIONS`** — Directed graph of allowed state changes
- **`validateTransition(from, to)`** — Throws `InvalidTransitionError` on violation
- **`canTransition(from, to)`** — Returns boolean
- **`getValidTransitions(status)`** — Returns allowed next states
- **`isTerminalState(status)`** — Checks if status is `SETTLEMENT` or `FAILED_DELIVERY`
- **`isHubPhase(status)`** — Checks if parcel is in hub custody
- **`isDeliveryPhase(status)`** — Checks if parcel is in customer collection phase
- **`isHandoverPhase(status)`** — Checks if parcel is being handed over
- **`isRegistrationPhase(status)`** — Checks if parcel is in initial registration
- **`isSettlementPhase(status)`** — Checks if parcel is in settlement

### 4.2 State Phases

```
DELIVERY_ATTEMPT → CUSTOMER_REQUEST → PUDO_ELIGIBILITY → HUB_SELECTED → HANDOVER_IN_PROGRESS → TRANSFERRED_TO_HUB → STORED_AT_HUB → READY_FOR_CUSTOMER → CUSTOMER_COLLECTION → COLLECTED → SETTLEMENT
                                                                    ↘ FAILED_DELIVERY → SETTLEMENT
```

### 4.3 Domain Services

| Service | Module | Responsibility |
|---------|--------|----------------|
| `ParcelStateMachineService` | `parcels` | State transition validation and execution |
| `TariffVersionService` | `pricing` | Tariff creation, activation, deactivation |
| `PricingService` | `pricing` | Fee calculation using active tariff |
| `RegistrationService` | `registration` | Parcel registration and PUDO eligibility |
| `CustodyService` | `custody` | Hub custody transfers and handover |
| `SettlementService` | `settlement` | Settlement transaction processing |

---

## 5. State Machine

### 5.1 ParcelStatus Enum

```typescript
enum ParcelStatus {
  DELIVERY_ATTEMPT,       // Initial state — courier attempting delivery
  CUSTOMER_REQUEST,       // Customer requested PUDO delivery
  PUDO_ELIGIBILITY,       // Checking PUDO eligibility
  HUB_SELECTED,           // Hub chosen for custody
  HANDOVER_IN_PROGRESS,   // Courier handing over to hub
  TRANSFERRED_TO_HUB,     // Parcel arrived at hub
  STORED_AT_HUB,          // Parcel stored in hub
  READY_FOR_CUSTOMER,     // Parcel ready for customer pickup
  CUSTOMER_COLLECTION,    // Customer collecting parcel
  COLLECTED,              // Parcel collected by customer
  SETTLEMENT,             // Final settlement state
  FAILED_DELIVERY,        // Delivery failed → terminal
}
```

### 5.2 Transition Rules

| From | Allowed To | Failure Path |
|------|-----------|--------------|
| `DELIVERY_ATTEMPT` | `CUSTOMER_REQUEST`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `CUSTOMER_REQUEST` | `PUDO_ELIGIBILITY`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `FAILED_DELIVERY` | `SETTLEMENT` | — |
| `PUDO_ELIGIBILITY` | `HUB_SELECTED`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `HUB_SELECTED` | `HANDOVER_IN_PROGRESS`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `HANDOVER_IN_PROGRESS` | `TRANSFERRED_TO_HUB`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `TRANSFERRED_TO_HUB` | `STORED_AT_HUB`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `STORED_AT_HUB` | `READY_FOR_CUSTOMER`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `READY_FOR_CUSTOMER` | `CUSTOMER_COLLECTION`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `CUSTOMER_COLLECTION` | `COLLECTED`, `FAILED_DELIVERY` | `FAILED_DELIVERY` |
| `COLLECTED` | `SETTLEMENT` | — |
| `SETTLEMENT` | *(terminal)* | — |

### 5.3 State Machine Enforcement

- Every state change **must** call `validateTransition(from, to)`
- `hubs.service.ts` `deliverParcel` must use `ParcelStatus.AT_HUB` (mapped to `TRANSFERRED_TO_HUB`) and call `stateMachine.validateTransition`
- `getMyParcels` must query both `TRANSFERRED_TO_HUB` and `STORED_AT_HUB` statuses
- Terminal states (`SETTLEMENT`, `FAILED_DELIVERY`) have no outgoing transitions

### 5.4 Phase Helpers

- `isHubPhase()` — `TRANSFERRED_TO_HUB`, `STORED_AT_HUB`, `READY_FOR_CUSTOMER`
- `isDeliveryPhase()` — `CUSTOMER_COLLECTION`, `COLLECTED`
- `isHandoverPhase()` — `HANDOVER_IN_PROGRESS`, `TRANSFERRED_TO_HUB`
- `isRegistrationPhase()` — `DELIVERY_ATTEMPT`, `CUSTOMER_REQUEST`, `PUDO_ELIGIBILITY`, `HUB_SELECTED`
- `isSettlementPhase()` — `SETTLEMENT`

---

## 6. Data Model

### 6.1 Entity Overview

| Entity | Table | Key Fields | Relationships |
|--------|-------|------------|---------------|
| `User` | `users` | `email`, `password`, `role`, `phone` | OneToMany → Parcel, Wallet |
| `Parcel` | `parcels` | `trackingNumber`, `status`, `senderInfo`, `receiverInfo` | ManyToOne → User, TariffVersion; OneToMany → RegistrationTransaction, CustodyTransfer, SettlementTransaction |
| `Hub` | `hubs` | `name`, `location`, `ownerId` | OneToMany → Parcel |
| `TariffVersion` | `tariff_versions` | `version`, `isActive`, `fee_percentage_under_12h`, `fee_percentage_under_24h`, `fee_percentage_per_additional_24h` | OneToMany → Parcel |
| `Wallet` | `wallets` | `balance`, `userId` | OneToOne → User |
| `Invoice` | `invoices` | `totalAmount`, `tariffVersionId`, `status` | ManyToOne → TariffVersion |
| `RegistrationTransaction` | `registration_transactions` | `parcelId`, `fromStatus`, `toStatus`, `timestamp` | ManyToOne → Parcel |
| `CustodyTransfer` | `custody_transfers` | `parcelId`, `fromHubId`, `toHubId`, `status` | ManyToOne → Parcel, Hub |
| `SettlementTransaction` | `settlement_transactions` | `parcelId`, `amount`, `method`, `status` | ManyToOne → Parcel |
| `AuditLog` | `audit_logs` | `entityType`, `entityId`, `action`, `metadata` | — |

### 6.2 Key Relationships

```
User (1) ──→ (N) Parcel
User (1) ──→ (1) Wallet
Parcel (N) ──→ (1) TariffVersion
Parcel (N) ──→ (1) Hub
Parcel (1) ──→ (N) RegistrationTransaction
Parcel (1) ──→ (N) CustodyTransfer
Parcel (1) ──→ (N) SettlementTransaction
Invoice (N) ──→ (1) TariffVersion
```

### 6.3 Database Configuration

- **Development**: SQLite (`dev.db`) with `synchronize: true`
- **Production**: PostgreSQL with migrations (`synchronize: false`, `migrationsRun: true`)
- **Switch**: `USE_POSTGRES=true` env var
- **Migrations**: Located in `backend/src/database/migrations/`

### 6.4 Schema Constraints

The `001_initial_schema.sql` defines CHECK constraints on `parcels.status` to enforce valid `ParcelStatus` values at the database level:
- `CHECK (status IN ('DELIVERY_ATTEMPT', 'CUSTOMER_REQUEST', 'PUDO_ELIGIBILITY', 'HUB_SELECTED', 'HANDOVER_IN_PROGRESS', 'TRANSFERRED_TO_HUB', 'STORED_AT_HUB', 'READY_FOR_CUSTOMER', 'CUSTOMER_COLLECTION', 'COLLECTED', 'SETTLEMENT', 'FAILED_DELIVERY'))`

---

## 7. API Layer

### 7.1 Backend (NestJS)

**Base URL**: `/v1`  
**Documentation**: Swagger at `/api/docs`  
**Port**: 3000

### 7.2 Modules and Endpoints

| Module | Controller | Key Endpoints |
|--------|-----------|---------------|
| `AuthModule` | `AuthController` | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| `ParcelsModule` | `ParcelsController` | `GET /parcels`, `POST /parcels`, `PATCH /parcels/:id/status`, `GET /parcels/:id` |
| `HubsModule` | `HubsController` | `GET /hubs`, `POST /hubs/:id/deliver`, `GET /hubs/:id/parcels` |
| `PricingModule` | `PricingController` | `GET /pricing/active`, `POST /pricing/tariffs`, `GET /pricing/calculate` |
| `InvoicesModule` | `InvoicesController` | `GET /invoices`, `POST /invoices`, `GET /invoices/:id` |
| `WalletsModule` | `WalletsController` | `GET /wallets/balance`, `POST /wallets/transfer` |
| `NotificationsModule` | `NotificationsController` | `POST /notifications/send`, `GET /notifications` |
| `TrackingModule` | `TrackingController` | `GET /tracking/:trackingNumber` |
| `RegistrationModule` | `RegistrationController` | `POST /registration`, `GET /registration/:parcelId` |
| `CustodyModule` | `CustodyController` | `POST /custody/transfer`, `GET /custody/:parcelId` |
| `SettlementModule` | `SettlementController` | `POST /settlement`, `GET /settlement/:parcelId` |
| `UsersModule` | `UsersController` | `GET /users`, `PATCH /users/:id`, `DELETE /users/:id` |

### 7.3 Authentication Flow

1. `POST /auth/login` → Returns `accessToken` (JWT, 15min) + `refreshToken` (7d)
2. Subsequent requests include `Authorization: Bearer <accessToken>`
3. `POST /auth/refresh` → Issues new access token using refresh token
4. Guards (`JwtAuthGuard`) validate tokens on protected routes
5. Roles (`AdminGuard`, `HubOwnerGuard`, `CourierGuard`) enforce RBAC

### 7.4 Response Format

Backend returns **flat responses**. The `hub_owner_app` must be updated to handle flat response structures instead of expecting nested `res.data['data']`.

---

## 8. Security & RBAC

### 8.1 Authentication

- **JWT** with HS256 algorithm
- Access token: 15 minutes expiry
- Refresh token: 7 days expiry
- Issuer: `n-pudo-n`
- Audience: `n-pudo-n-users`
- Secret: `JWT_SECRET` (32+ chars, env var)

### 8.2 Authorization (RBAC)

| Role | Permissions |
|------|-------------|
| **admin** | Full access — all modules, all operations |
| **hub_owner** | Read hubs, manage parcels at hub, view custody/settlement |
| **courier** | Create delivery attempts, update parcel status, handover |
| **customer** | Read own parcels, collection |

### 8.3 Guards and Decorators

- `@UseGuards(JwtAuthGuard)` — Require valid JWT
- `@UseGuards(AdminGuard)` — Require admin role
- `@UseGuards(HubOwnerGuard)` — Require hub owner role
- `@UseGuards(CourierGuard)` — Require courier role
- `@CurrentUser()` — Decorator to access authenticated user

### 8.4 Security Checklist

- [x] Strong JWT_SECRET (32+ chars)
- [x] Strong DB_PASSWORD
- [x] SSL certificates (Nginx termination)
- [x] Firewall: Only 80, 443, 22 open
- [x] Rate limiting (`THROTTLE_TTL`, `THROTTLE_LIMIT`)
- [x] Input validation via DTOs and pipes
- [ ] Fail2ban configured for SSH
- [ ] Regular backups scheduled
- [ ] Log rotation configured

---

## 9. Offline-First Sync

### 9.1 Architecture

Mobile apps (`courier_app`, `hub_owner_app`) use **local SQLite** as the primary data store. The sync engine handles:

1. **Local-first reads** — All queries hit local SQLite
2. **Change tracking** — Local changes are queued with timestamps
3. **Background sync** — When network is available, queued changes are pushed to backend
4. **Conflict resolution** — Last-write-wins with version vectors
5. **Retry mechanism** — Failed syncs are retried with exponential backoff

### 9.2 Sync Flow

```
[Local SQLite] → [Change Queue] → [Sync Engine] → [Backend API]
                                                    ↓
[Backend Push] ← [Sync Engine] ← [Change Queue] ← [Local SQLite]
```

### 9.3 Implementation Notes

- Mobile apps should maintain a `sync_status` field on each local record
- `updated_at` timestamps drive conflict resolution
- The `AuditLog` entity tracks all state changes for audit trail
- Offline mode must work for: parcel status updates, custody transfers, collection confirmations

### 9.4 Required for MVP

- [ ] Local SQLite database on mobile apps
- [ ] Change queue with timestamp tracking
- [ ] Background sync service
- [ ] Conflict resolution (last-write-wins)
- [ ] Offline indicator UI

---

## 10. Tariff Versioning & Pricing

### 10.1 TariffVersion Entity

Each tariff version is immutable once created. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `version` | String | Semantic version (e.g., "1.0.0") |
| `isActive` | Boolean | Currently active tariff |
| `fee_percentage_under_12h` | Decimal | Fee for delivery under 12 hours |
| `fee_percentage_under_24h` | Decimal | Fee for delivery under 24 hours |
| `fee_percentage_per_additional_24h` | Decimal | Fee per additional 24h beyond 24h |
| `startedAt` | DateTime | When this tariff became active |
| `endedAt` | DateTime | When this tariff was deactivated |

### 10.2 Pricing Formula

```
if delivery_time <= 12h:
    fee = base_fee * fee_percentage_under_12h
elif delivery_time <= 24h:
    fee = base_fee * fee_percentage_under_24h
else:
    additional_hours = delivery_time - 24
    fee = base_fee * fee_percentage_under_24h + (additional_hours / 24) * base_fee * fee_percentage_per_additional_24h
```

### 10.3 Tariff Lifecycle

1. `TariffVersionService.createTariff()` — Creates new version, deactivates current
2. `TariffVersionService.getActiveTariff()` — Returns the active tariff
3. `TariffVersionService.deactivateCurrent()` — Deactivates current tariff
4. `PricingService.calculate()` — Uses active tariff to compute fees

### 10.4 Invoice Integration

- `Invoice` has `tariff_version_id` foreign key
- Invoices reference the tariff version active at creation time
- Historical invoices remain accurate even after tariff changes

---

## 11. Custody & Handover

### 11.1 CustodyTransfer Entity

Tracks the movement of a parcel between hubs or from courier to hub.

| Field | Type | Description |
|-------|------|-------------|
| `parcelId` | UUID | Reference to parcel |
| `fromHubId` | UUID | Hub giving up custody |
| `toHubId` | UUID | Hub receiving custody |
| `status` | Enum | `PENDING`, `COMPLETED`, `CANCELLED` |
| `transferredAt` | DateTime | When transfer occurred |
| `handoverBy` | UUID | Courier who performed handover |
| `handoverTo` | UUID | Hub owner who received |

### 11.2 Handover Flow

1. Courier selects `HUB_SELECTED` status → `HANDOVER_IN_PROGRESS`
2. Courier arrives at hub → `TRANSFERRED_TO_HUB`
3. Hub owner confirms → `STORED_AT_HUB`
4. `CustodyTransfer` record created at each step
5. `CustodyService` manages the transfer lifecycle

### 11.3 Registration Flow

1. Parcel created with `DELIVERY_ATTEMPT` status
2. Customer requests PUDO → `CUSTOMER_REQUEST`
3. System checks eligibility → `PUDO_ELIGIBILITY`
4. Hub selected → `HUB_SELECTED`
5. `RegistrationTransaction` records each status change

---

## 12. Settlement

### 12.1 SettlementTransaction Entity

| Field | Type | Description |
|-------|------|-------------|
| `parcelId` | UUID | Reference to parcel |
| `amount` | Decimal | Settlement amount |
| `method` | Enum | `INTERNAL_LEDGER`, `BANK_TRANSFER`, `WALLET` |
| `status` | Enum | `PENDING`, `COMPLETED`, `FAILED` |
| `processedAt` | DateTime | When settlement was processed |
| `processedBy` | UUID | Who processed the settlement |

### 12.2 Settlement Flow

1. Parcel reaches `COLLECTED` status
2. `SettlementService` calculates amount using active tariff
3. `SettlementTransaction` created with `PENDING` status
4. Settlement processed → `COMPLETED`
5. Parcel status changes to `SETTLEMENT`
6. Wallet balance updated

### 12.3 Internal Ledger

- MVP uses internal ledger (no external payment gateway)
- Wallet balances tracked in `Wallet` entity
- Settlement is a ledger entry, not a real payment
- Payment Gateway integration deferred to post-MVP

---

## 13. Notifications

### 13.1 Architecture

- **Firebase Cloud Messaging (FCM)** for push notifications
- `NotificationsModule` handles sending and tracking
- SMTP for email notifications (optional)
- SMS/OTP provider for verification (optional)

### 13.2 Notification Types

| Event | Notification |
|-------|-------------|
| Parcel status change | Push to customer |
| Handover completed | Push to hub owner |
| Delivery attempt | Push to courier |
| Settlement completed | Push to customer |
| OTP verification | SMS to user |

### 13.3 Firebase Configuration

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` in `.env`
- Firebase Admin SDK initialized in `NotificationsModule`
- Push tokens stored per user

---

## 14. Deployment

### 14.1 Development

```bash
# Start development stack
docker-compose up -d

# Services
# Backend API: http://localhost:3000/v1
# Swagger Docs: http://localhost:3000/api/docs
# Admin Panel: http://localhost:3001
# PostgreSQL: localhost:5432
# Redis: localhost:6379
```

### 14.2 Production

```bash
# Build and start production stack
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Services behind Nginx SSL termination
# HTTPS: https://yourdomain.com/v1
# Swagger: https://yourdomain.com/api/docs
# Admin Panel: https://yourdomain.com
```

### 14.3 Docker Compose Services

| Service | Image | Resources | Notes |
|---------|-------|-----------|-------|
| `postgres` | `postgres:16-alpine` | 512M limit | Primary database |
| `redis` | `redis:7-alpine` | 256M limit | Caching, sessions, rate limiting |
| `backend` | Custom | 512M limit, 2 replicas | NestJS API |
| `admin-panel` | Custom | 256M limit | Next.js dashboard |
| `nginx` | `nginx:alpine` | — | SSL termination, reverse proxy |

### 14.4 CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci-cd.yml`):

1. **Lint & TypeCheck** — ESLint + TypeScript
2. **Unit Tests** — Jest
3. **Integration Tests** — With PostgreSQL
4. **Build Docker Images** — Multi-stage, cached
5. **Deploy Staging** — On `develop` branch
6. **Deploy Production** — On release tags

### 14.5 Environment Variables

Key env vars from `.env.example`:
- `NODE_ENV`, `PORT`, `USE_POSTGRES`
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `SMTP_*` for email
- `THROTTLE_TTL`, `THROTTLE_LIMIT`
- `SSL_ENABLED`, `SSL_CERT_PATH`, `SSL_KEY_PATH`

---

## 15. Out of Scope (Deferred)

The following are explicitly **not part of MVP** and should not be implemented until after launch:

| Technology | Reason | Future Plan |
|------------|--------|-------------|
| **Apache Kafka** | Overkill for MVP throughput | Event sourcing at scale |
| **RabbitMQ** | Not needed for synchronous flows | Async task queue |
| **Kubernetes** | Single Docker host sufficient | Horizontal scaling |
| **Redis Cluster** | Single Redis instance sufficient | Caching, sessions, rate limiting |
| **WebSocket realtime tracking** | Polling sufficient for MVP | Real-time parcel tracking |
| **Prometheus/Grafana** | Basic health checks sufficient | Full observability stack |
| **Advanced Analytics** | Not needed for launch | Business intelligence dashboard |
| **Payment Gateway** | Settlement is internal ledger | Stripe/PayPal integration |

---

## 16. Project Structure

```
n-pudo-n/
├── ARCHITECTURE.md                  # This document
├── DEPLOYMENT.md                    # Deployment guide
├── docker-compose.yml               # Development stack
├── docker-compose.prod.yml          # Production stack
├── nginx/                           # Nginx configuration
│   ├── nginx.conf
│   └── conf.d/
├── certs/                           # SSL certificates
├── .env.example                     # Environment template
├── .github/workflows/ci-cd.yml      # CI/CD pipeline
├── backend/                         # NestJS API
│   ├── src/
│   │   ├── app.module.ts            # Root module (all 12 modules)
│   │   ├── main.ts                  # Entry point
│   │   ├── common/                  # Guards, decorators, pipes
│   │   ├── database/
│   │   │   ├── entities/            # 10 entity files
│   │   │   │   ├── user.entity.ts
│   │   │   │   ├── parcel.entity.ts
│   │   │   │   ├── hub.entity.ts
│   │   │   │   ├── tariff-version.entity.ts
│   │   │   │   ├── wallet.entity.ts
│   │   │   │   ├── invoice.entity.ts
│   │   │   │   ├── registration-transaction.entity.ts
│   │   │   │   ├── custody-transfer.entity.ts
│   │   │   │   ├── settlement-transaction.entity.ts
│   │   │   │   └── audit-log.entity.ts
│   │   │   └── migrations/          # Database migrations
│   │   └── modules/                 # 12 feature modules
│   │       ├── auth/                # JWT auth, strategies, guards
│   │       ├── parcels/             # State machine, parcel CRUD
│   │       ├── hubs/                # Hub management, delivery
│   │       ├── pricing/             # Tariff versioning, fee calculation
│   │       ├── invoices/            # Invoice generation
│   │       ├── wallets/             # Wallet balance management
│   │       ├── notifications/       # Firebase push notifications
│   │       ├── tracking/            # Parcel tracking
│   │       ├── registration/        # Parcel registration, PUDO eligibility
│   │       ├── custody/             # Custody transfers, handover
│   │       ├── settlement/          # Settlement transactions
│   │       └── users/               # User management, RBAC
│   ├── Dockerfile
│   └── package.json
├── admin_panel/                     # Next.js Admin Dashboard
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── courier_app/                     # Flutter Courier App
│   ├── lib/
│   └── pubspec.yaml
├── hub_owner_app/                   # Flutter Hub Owner App
│   ├── lib/
│   └── pubspec.yaml
└── simple-test/                     # Test utilities
```

### Module Dependency Graph

```
AppModule
├── ConfigModule (global)
├── TypeOrmModule (global)
├── AuthModule
├── UsersModule
├── ParcelsModule
│   ├── ParcelStateMachineService
│   └── ParcelStateMachine (enum + transitions)
├── HubsModule
│   ├── forwardRef → ParcelsModule
│   └── ParcelStateMachineService
├── PricingModule
│   ├── TariffVersionService
│   └── PricingService
├── InvoicesModule
│   └── TariffVersionService
├── WalletsModule
├── NotificationsModule
├── TrackingModule
├── RegistrationModule
├── CustodyModule
└── SettlementModule
```

---

## Appendix A: State Machine Quick Reference

```
DELIVERY_ATTEMPT ──→ CUSTOMER_REQUEST ──→ PUDO_ELIGIBILITY ──→ HUB_SELECTED ──→ HANDOVER_IN_PROGRESS ──→ TRANSFERRED_TO_HUB ──→ STORED_AT_HUB ──→ READY_FOR_CUSTOMER ──→ CUSTOMER_COLLECTION ──→ COLLECTED ──→ SETTLEMENT
       │                    │                      │                    │                      │                        │                    │                    │                        │                    │              │
       └──→ FAILED_DELIVERY ──→ SETTLEMENT ──┘                    └──→ FAILED_DELIVERY ──┘                    └──→ FAILED_DELIVERY ──┘                    └──→ FAILED_DELIVERY ──┘                    └──→ FAILED_DELIVERY ──┘                    └──→ FAILED_DELIVERY ──┘
```

## Appendix B: Entity Relationship Diagram

```
┌─────────┐     ┌──────────────┐     ┌─────────┐
│  User   │─────│   Parcel     │─────│ Hub     │
│         │     │              │     │         │
│ 1       │     │ N            │     │ 1       │
└─────────┘     └──────┬───────┘     └─────────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
          ▼           ▼           ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────────┐
│ Registration │ │ Custody     │ │ Settlement       │
│ Transaction  │ │ Transfer    │ │ Transaction      │
└──────────────┘ └─────────────┘ └──────────────────┘
          │
          ▼
┌──────────────┐
│ TariffVersion│
└──────────────┘
          │
          ▼
┌──────────────┐
│   Invoice    │
└──────────────┘
```

## Appendix C: MVP Checklist

- [x] Backend NestJS with 12 modules
- [x] Parcel State Machine with 13 statuses
- [x] 10 database entities with TypeORM
- [x] JWT authentication with RBAC
- [x] Tariff versioning with tiered pricing
- [x] Custody transfer and handover
- [x] Settlement with internal ledger
- [x] Registration with PUDO eligibility
- [x] Notifications via Firebase
- [x] Docker Compose deployment
- [x] CI/CD pipeline
- [x] Admin panel (Next.js)
- [x] Courier and Hub Owner Flutter apps
- [ ] CameraX + ML Kit scanning
- [ ] Real GPS tracking
- [ ] Offline-first sync engine
- [ ] Real-device E2E testing
- [ ] Production SSL + domain

---

*This document is the single source of truth for N-PuDo-N architecture. All implementation must align with this document. Merge the existing implementation (State Machine, Offline-first, Idempotency, Custody, Settlement, Tariff Versioning) into this baseline.*
