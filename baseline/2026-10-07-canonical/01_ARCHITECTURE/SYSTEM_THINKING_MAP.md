# N-PuDo-N System Thinking Map

> A visual representation of how all system components interrelate, flow, and depend on each other.

---

## 1. System Overview — Component Map

```mermaid
graph TB
    subgraph "📱 Mobile Apps"
        COURIER["📱 Courier App<br/>(Flutter)"]
        HUB["📱 Hub Owner App<br/>(Flutter)"]
        CUSTOMER["📱 Customer<br/>(Web/Mobile)"]
    end

    subgraph "🌐 Admin Panel"
        ADMIN["🖥️ Admin Panel<br/>(Next.js)"]
    end

    subgraph "⚙️ Backend API"
        AUTH["🔐 Auth Module<br/>JWT + RBAC"]
        PARCELS["📦 Parcels Module<br/>State Machine"]
        HUBS["🏢 Hubs Module<br/>Delivery"]
        PRICING["💰 Pricing Module<br/>Tariff Versioning"]
        INVOICES["🧾 Invoices Module"]
        WALLETS["👛 Wallets Module"]
        NOTIFICATIONS["🔔 Notifications Module<br/>Firebase FCM"]
        TRACKING["📍 Tracking Module"]
        REGISTRATION["📝 Registration Module"]
        CUSTODY["🤝 Custody Module"]
        SETTLEMENT["💵 Settlement Module"]
        USERS["👥 Users Module"]
    end

    subgraph "🗄️ Data Layer"
        POSTGRES[(🐘 PostgreSQL<br/>Production)]
        SQLITE[(🗃️ SQLite<br/>Development)]
        REDIS[(🔴 Redis<br/>Cache/Sessions")]
    end

    subgraph "🚀 Infrastructure"
        NGINX["🌐 Nginx<br/>SSL Termination"]
        DOCKER["🐳 Docker Compose"]
        CI_CD["🔄 CI/CD<br/>GitHub Actions"]
    end

    COURIER -->|REST API| AUTH
    HUB -->|REST API| AUTH
    CUSTOMER -->|REST API| AUTH
    ADMIN -->|REST API| AUTH

    AUTH --> PARCELS
    AUTH --> HUBS
    AUTH --> PRICING
    AUTH --> INVOICES
    AUTH --> WALLETS
    AUTH --> NOTIFICATIONS
    AUTH --> TRACKING
    AUTH --> REGISTRATION
    AUTH --> CUSTODY
    AUTH --> SETTLEMENT
    AUTH --> USERS

    PARCELS --> POSTGRES
    HUBS --> POSTGRES
    PRICING --> POSTGRES
    INVOICES --> POSTGRES
    WALLETS --> POSTGRES
    NOTIFICATIONS --> POSTGRES
    TRACKING --> POSTGRES
    REGISTRATION --> POSTGRES
    CUSTODY --> POSTGRES
    SETTLEMENT --> POSTGRES
    USERS --> POSTGRES

    PARCELS --> REDIS
    HUBS --> REDIS
    NOTIFICATIONS --> REDIS

    NGINX --> PARCELS
    NGINX --> HUBS
    NGINX --> PRICING
    NGINX --> INVOICES
    NGINX --> WALLETS
    NGINX --> NOTIFICATIONS
    NGINX --> TRACKING
    NGINX --> REGISTRATION
    NGINX --> CUSTODY
    NGINX --> SETTLEMENT
    NGINX --> USERS

    DOCKER --> NGINX
    DOCKER --> POSTGRES
    DOCKER --> REDIS
    DOCKER --> PARCELS

    CI_CD --> DOCKER
```

---

## 2. Parcel Lifecycle — State Machine Flow

```mermaid
stateDiagram-v2
    [*] --> DELIVERY_ATTEMPT
    DELIVERY_ATTEMPT --> CUSTOMER_REQUEST : Customer requests PUDO
    DELIVERY_ATTEMPT --> FAILED_DELIVERY : Delivery failed
    CUSTOMER_REQUEST --> PUDO_ELIGIBILITY : Eligibility check
    CUSTOMER_REQUEST --> FAILED_DELIVERY : Delivery failed
    PUDO_ELIGIBILITY --> HUB_SELECTED : Hub selected
    PUDO_ELIGIBILITY --> FAILED_DELIVERY : Delivery failed
    HUB_SELECTED --> HANDOVER_IN_PROGRESS : Courier arrives
    HUB_SELECTED --> FAILED_DELIVERY : Delivery failed
    HANDOVER_IN_PROGRESS --> TRANSFERRED_TO_HUB : Handover complete
    HANDOVER_IN_PROGRESS --> FAILED_DELIVERY : Delivery failed
    TRANSFERRED_TO_HUB --> STORED_AT_HUB : Stored at hub
    TRANSFERRED_TO_HUB --> FAILED_DELIVERY : Delivery failed
    STORED_AT_HUB --> READY_FOR_CUSTOMER : Ready for pickup
    STORED_AT_HUB --> FAILED_DELIVERY : Delivery failed
    READY_FOR_CUSTOMER --> CUSTOMER_COLLECTION : Customer picks up
    READY_FOR_CUSTOMER --> FAILED_DELIVERY : Delivery failed
    CUSTOMER_COLLECTION --> COLLECTED : Parcel collected
    CUSTOMER_COLLECTION --> FAILED_DELIVERY : Delivery failed
    COLLECTED --> SETTLEMENT : Settlement triggered
    FAILED_DELIVERY --> SETTLEMENT : Failed delivery settlement
    SETTLEMENT --> [*]
```

---

## 3. Data Flow — End-to-End Parcel Journey

```mermaid
sequenceDiagram
    participant C as Courier App
    participant B as Backend API
    participant DB as PostgreSQL
    participant H as Hub Owner App
    participant N as Customer

    Note over C,B: Phase 1: Registration
    C->>B: POST /parcels (create parcel)
    B->>DB: INSERT parcel (status: DELIVERY_ATTEMPT)
    B-->>C: 201 Created
    C->>B: PATCH /parcels/:id/status → CUSTOMER_REQUEST
    B->>DB: UPDATE status
    C->>B: POST /registration (PUDO eligibility)
    B->>DB: INSERT registration_transaction
    B-->>C: Eligibility result

    Note over C,B: Phase 2: Hub Selection & Handover
    C->>B: PATCH /parcels/:id/status → HUB_SELECTED
    B->>DB: UPDATE status
    C->>B: POST /custody/transfer (handover)
    B->>DB: INSERT custody_transfer
    B->>DB: UPDATE status → TRANSFERRED_TO_HUB
    B-->>H: Notification (FCM)
    H->>B: Confirm receipt
    B->>DB: UPDATE status → STORED_AT_HUB

    Note over B,N: Phase 3: Customer Collection
    B->>N: Notification (FCM) — Ready for pickup
    N->>B: GET /parcels/:id (check status)
    B-->>N: Status: READY_FOR_CUSTOMER
    N->>B: PATCH /parcels/:id/status → CUSTOMER_COLLECTION
    B->>DB: UPDATE status
    N->>B: Confirm collection
    B->>DB: UPDATE status → COLLECTED

    Note over B: Phase 4: Settlement
    B->>B: PricingService.calculate() (TariffVersion)
    B->>DB: INSERT settlement_transaction
    B->>DB: UPDATE wallet balance
    B->>DB: UPDATE status → SETTLEMENT
    B-->>N: Settlement confirmation
```

---

## 4. Module Dependency Graph

```mermaid
graph LR
    APP["AppModule"]
    CONFIG["ConfigModule"]
    TYPEORM["TypeOrmModule"]

    subgraph "Core"
        AUTH["AuthModule"]
        USERS["UsersModule"]
    end

    subgraph "Domain"
        PARCELS["ParcelsModule"]
        HUBS["HubsModule"]
        PRICING["PricingModule"]
        REGISTRATION["RegistrationModule"]
        CUSTODY["CustodyModule"]
        SETTLEMENT["SettlementModule"]
    end

    subgraph "Support"
        INVOICES["InvoicesModule"]
        WALLETS["WalletsModule"]
        NOTIFICATIONS["NotificationsModule"]
        TRACKING["TrackingModule"]
    end

    APP --> CONFIG
    APP --> TYPEORM
    APP --> AUTH
    APP --> USERS
    APP --> PARCELS
    APP --> HUBS
    APP --> PRICING
    APP --> REGISTRATION
    APP --> CUSTODY
    APP --> SETTLEMENT
    APP --> INVOICES
    APP --> WALLETS
    APP --> NOTIFICATIONS
    APP --> TRACKING

    HUBS -.->|forwardRef| PARCELS
    PARCELS -.->|uses| PRICING
    PRICING -.->|uses| INVOICES
    SETTLEMENT -.->|uses| WALLETS
    SETTLEMENT -.->|uses| PRICING
    REGISTRATION -.->|uses| PARCELS
    CUSTODY -.->|uses| PARCELS
    CUSTODY -.->|uses| HUBS
    NOTIFICATIONS -.->|uses| PARCELS
    TRACKING -.->|uses| PARCELS
    INVOICES -.->|uses| PRICING
    WALLETS -.->|uses| USERS
```

---

## 5. Security & Auth Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as AuthController
    participant S as AuthService
    participant J as JWT Strategy
    participant G as Guard

    U->>A: POST /auth/login (email, password)
    A->>S: validateUser(email, password)
    S->>DB: Query user
    DB-->>S: User entity
    S->>S: Compare password (bcrypt)
    S->>S: Generate JWT (access + refresh)
    S-->>A: Tokens
    A-->>U: {accessToken, refreshToken}

    loop Protected Routes
        U->>G: Request with Authorization: Bearer <token>
        G->>J: Validate JWT
        J-->>G: Decoded payload + user
        G->>G: Check role (AdminGuard/HubOwnerGuard/CourierGuard)
        G-->>U: Proceed or 403 Forbidden
    end

    U->>A: POST /auth/refresh (refreshToken)
    A->>S: Validate refresh token
    S-->>A: New accessToken
    A-->>U: {accessToken}
```

---

## 6. Tariff Versioning & Pricing Flow

```mermaid
graph TB
    subgraph "Tariff Lifecycle"
        T1["TariffVersion v1.0.0<br/>ACTIVE"] -->|deactivate| T1_end["TariffVersion v1.0.0<br/>ENDED"]
        T2["TariffVersion v1.1.0<br/>ACTIVE"] -->|deactivate| T2_end["TariffVersion v1.1.0<br/>ENDED"]
        T3["TariffVersion v2.0.0<br/>CREATED"] -->|activate| T3_active["TariffVersion v2.0.0<br/>ACTIVE"]
    end

    subgraph "Pricing Calculation"
        P["PricingService.calculate()"] --> T["getActiveTariff()"]
        T -->|tariff| PF["Apply Formula"]
        PF -->|delivery_time <= 12h| F1["fee = base * fee_percentage_under_12h"]
        PF -->|delivery_time <= 24h| F2["fee = base * fee_percentage_under_24h"]
        PF -->|delivery_time > 24h| F3["fee = base * fee_percentage_under_24h + (extra/24) * base * fee_percentage_per_additional_24h"]
        F1 --> RESULT["Return Fee"]
        F2 --> RESULT
        F3 --> RESULT
    end

    subgraph "Invoice Reference"
        INV["Invoice"] -->|tariff_version_id| T2
        INV -->|totalAmount| RESULT
    end
```

---

## 7. Offline-First Sync Architecture

```mermaid
graph TB
    subgraph "Mobile App (Offline)"
        LOCAL["📱 Local SQLite<br/>Primary Store"]
        QUEUE["📋 Change Queue<br/>Pending Sync"]
        CONFLICT["⚠️ Conflict Resolver<br/>Last-Write-Wins"]
        UI["📊 Offline Indicator"]
    end

    subgraph "Sync Engine"
        SYNC["🔄 Sync Engine"]
        RETRY["🔁 Retry Manager<br/>Exponential Backoff"]
        TIMESTAMP["⏰ Timestamp Tracker"]
    end

    subgraph "Backend"
        API["🌐 REST API"]
        VALIDATE["✅ Validation"]
        AUDIT["📝 AuditLog"]
    end

    LOCAL -->|Read| UI
    LOCAL -->|Write| QUEUE
    QUEUE -->|Pending Changes| SYNC
    SYNC -->|Network Available| API
    API -->|Validate| VALIDATE
    VALIDATE -->|Persist| AUDIT
    AUDIT -->|Response| SYNC
    SYNC -->|Update Local| LOCAL
    RETRY -->|Failed Sync| QUEUE
    TIMESTAMP -->|Conflict Detection| CONFLICT
    CONFLICT -->|Resolved| LOCAL
```

---

## 8. Deployment Architecture

```mermaid
graph TB
    subgraph "Internet"
        INTERNET["🌐 Internet"]
    end

    subgraph "Nginx (SSL Termination)"
        NGINX["🌐 Nginx<br/>Port 80/443"]
    end

    subgraph "Backend Services"
        B1["Backend<br/>Replica 1"]
        B2["Backend<br/>Replica 2"]
    end

    subgraph "Data Services"
        PG[(PostgreSQL<br/>Primary)]
        RD[(Redis<br/>Cache/Sessions")]
    end

    subgraph "Admin Panel"
        ADMIN["Admin Panel<br/>Next.js"]
    end

    INTERNET --> NGINX
    NGINX -->|Load Balance| B1
    NGINX -->|Load Balance| B2
    NGINX --> ADMIN
    B1 --> PG
    B2 --> PG
    B1 --> RD
    B2 --> RD
    ADMIN --> PG

    subgraph "CI/CD"
        GH["GitHub Actions"]
        GH -->|Lint & Test| GH_TEST
        GH -->|Build Docker| GH_BUILD
        GH -->|Deploy Staging| GH_STAGING
        GH -->|Deploy Production| GH_PROD
    end

    GH_PROD -->|docker-compose up| NGINX
```

---

## 9. Notification System Flow

```mermaid
flowchart LR
    subgraph "Event Triggers"
        E1["Parcel Status Change"]
        E2["Handover Complete"]
        E3["Delivery Attempt"]
        E4["Settlement Complete"]
        E5["OTP Verification"]
    end

    subgraph "Notification Service"
        N["NotificationsModule"]
        FCM["Firebase FCM<br/>Push Notifications"]
        SMTP["SMTP<br/>Email"]
        SMS["SMS Provider<br/>OTP"]
    end

    subgraph "Recipients"
        R1["Courier"]
        R2["Hub Owner"]
        R3["Customer"]
        R4["Admin"]
    end

    E1 --> N
    E2 --> N
    E3 --> N
    E4 --> N
    E5 --> N

    N -->|Push| FCM
    N -->|Email| SMTP
    N -->|SMS| SMS

    FCM --> R1
    FCM --> R2
    FCM --> R3
    SMTP --> R4
    SMS --> R3
```

---

## 10. System Thinking — Causal Loop Diagram

```mermaid
graph TB
    subgraph "Reinforcing Loops (🔄)"
        R1["📦 More Parcels → More Data → Better Pricing → More Customers → More Parcels"]
        R2["🏢 More Hubs → Faster Delivery → Better UX → More Users → More Hubs"]
        R3["💵 More Settlements → More Revenue → More Investment → Better Service → More Settlements"]
    end

    subgraph "Balancing Loops (⚖️)"
        B1["⚠️ Failed Deliveries → Customer Complaints → Service Improvement → Fewer Failures"]
        B2["⚠️ High Load → Rate Limiting → Slower Response → Reduced Load"]
        B3["⚠️ Tariff Increase → Fewer Parcels → Revenue Drop → Tariff Decrease"]
    end

    subgraph "Feedback Loops"
        F1["📊 AuditLog → Analytics → Process Optimization → Better State Machine"]
        F2["🔄 Offline Sync → Data Consistency → Trust → More Offline Usage"]
        F3["🔒 Security Events → RBAC Updates → Fewer Breaches → Stronger Security"]
    end

    R1 -->|"Positive"| R2
    R2 -->|"Positive"| R3
    B1 -->|"Negative"| B2
    B2 -->|"Negative"| B3
    F1 -->|"Feedback"| F2
    F2 -->|"Feedback"| F3
    F3 -->|"Feedback"| R1
```

---

## 11. Entity Relationship Map

```mermaid
erDiagram
    USER ||--o{ PARCEL : "owns"
    USER ||--o{ WALLET : "has"
    USER ||--o{ DEVICE_TOKEN : "registers"
    HUB ||--o{ PARCEL : "stores"
    HUB ||--o{ CUSTODY_TRANSFER : "receives"
    TARIFF_VERSION ||--o{ PARCEL : "prices"
    TARIFF_VERSION ||--o{ INVOICE : "generates"
    PARCEL ||--o{ REGISTRATION_TRANSACTION : "tracks"
    PARCEL ||--o{ CUSTODY_TRANSFER : "transfers"
    PARCEL ||--o{ SETTLEMENT_TRANSACTION : "settles"
    PARCEL ||--o{ AUDIT_LOG : "logs"
    INVOICE }o--|| TARIFF_VERSION : "references"
    WALLET }o--|| USER : "belongs to"
    CUSTODY_TRANSFER }o--|| HUB : "from hub"
    CUSTODY_TRANSFER }o--|| HUB : "to hub"
    CUSTODY_TRANSFER }o--|| PARCEL : "for parcel"
    SETTLEMENT_TRANSACTION }o--|| PARCEL : "for parcel"
    REGISTRATION_TRANSACTION }o--|| PARCEL : "for parcel"
    AUDIT_LOG }o--|| PARCEL : "for entity"

    USER {
        uuid id PK
        string email
        string password
        string role
        string phone
        datetime createdAt
    }
    PARCEL {
        uuid id PK
        string trackingNumber
        string status
        json senderInfo
        json receiverInfo
        uuid tariffVersionId FK
        uuid hubId FK
        datetime createdAt
    }
    HUB {
        uuid id PK
        string name
        string location
        uuid ownerId FK
    }
    TARIFF_VERSION {
        string version PK
        boolean isActive
        decimal fee_percentage_under_12h
        decimal fee_percentage_under_24h
        decimal fee_percentage_per_additional_24h
        datetime startedAt
        datetime endedAt
    }
    WALLET {
        uuid id PK
        decimal balance
        uuid userId FK
    }
    INVOICE {
        uuid id PK
        decimal totalAmount
        string status
        uuid tariffVersionId FK
    }
    REGISTRATION_TRANSACTION {
        uuid id PK
        uuid parcelId FK
        string fromStatus
        string toStatus
        datetime timestamp
    }
    CUSTODY_TRANSFER {
        uuid id PK
        uuid parcelId FK
        uuid fromHubId FK
        uuid toHubId FK
        string status
        datetime transferredAt
    }
    SETTLEMENT_TRANSACTION {
        uuid id PK
        uuid parcelId FK
        decimal amount
        string method
        string status
        datetime processedAt
    }
    AUDIT_LOG {
        uuid id PK
        string entityType
        uuid entityId
        string action
        json metadata
        datetime timestamp
    }
```

---

## 12. MVP Critical Path Map

```mermaid
graph TD
    subgraph "MVP Critical Path"
        A["1. Real Android Build<br/>📱"] --> B["2. CameraX + ML Kit<br/>📷"]
        B --> C["3. Real GPS<br/>📍"]
        C --> D["4. Offline-first Sync<br/>🔄"]
        D --> E["5. Parcel State Machine<br/>⚙️"]
        E --> F["6. Hub Selection<br/>🏢"]
        F --> G["7. Custody/Handover<br/>🤝"]
        G --> H["8. Customer Collection<br/>👤"]
        H --> I["9. Settlement<br/>💵"]
        I --> J["10. Pricing<br/>💰"]
        J --> K["11. Notifications<br/>🔔"]
        K --> L["12. Security/RBAC<br/>🔐"]
        L --> M["13. Real-device E2E<br/>🧪"]
        M --> N["14. Production Deployment<br/>🚀"]
    end

    subgraph "Deferred"
        O["Kafka"]
        P["RabbitMQ"]
        Q["Kubernetes"]
        R["Redis Cluster"]
        S["WebSocket"]
        T["Prometheus/Grafana"]
        U["Advanced Analytics"]
        V["Payment Gateway"]
    end

    N -.->|Future| O
    N -.->|Future| P
    N -.->|Future| Q
    N -.->|Future| R
    N -.->|Future| S
    N -.->|Future| T
    N -.->|Future| U
    N -.->|Future| V
```

---

*Generated from `ARCHITECTURE.md` — N-PuDo-N Master System Architecture v1.0*
