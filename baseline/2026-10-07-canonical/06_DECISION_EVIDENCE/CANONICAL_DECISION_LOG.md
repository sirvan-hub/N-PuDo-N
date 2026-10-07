# Pudo-N Canonical Decision Log

Product: Pudo-N
Product forms: Android + PWA
Baseline date: 2026-10-07

## Confirmed canonical decisions

- C-001-02 PENDING_APPROVAL semantics: A
- C-001-03 COLLECTED vs DELIVERED: A
- C-001-04 FAILED_DELIVERY settlement: A

- C-002-01 Official custody/pricing cap: 168h
- C-002-02 Historical invoice/tariff snapshot: A
- C-002-03 Remove 120h expiration: A

- C-003-01 STORED_AT_HUB must be enforced: A
- C-003-02 CUSTOMER_COLLECTION must be enforced: A
- C-003-03 Settlement/refund model: A
- C-003-04 Financial idempotency/uniqueness: A
- C-003-05 Payout eligibility: A
- C-003-06 Refund ↔ Payment linkage: A
- C-003-07 Payment requires valid Invoice/financial source: A
- C-003-08 Payment amount from Invoice: A
- C-003-09 Settlement only after valid Payment: A
- C-003-10 Payout amount from Settlement snapshot: A

## Canonical pricing

<12h = 20%
12–24h = 40%
>24h = 40% + 50% per started 24h
Official maximum custody/pricing cycle = 168h

Package Size does NOT affect Pricing.
VAT is currently NOT DEFINED.

## Canonical lifecycle

TRANSFERRED_TO_HUB
    ↓
STORED_AT_HUB
    ↓
READY_FOR_CUSTOMER
    ↓
CUSTOMER_COLLECTION
    ↓
COLLECTED
    ↓
DELIVERED
    ↓
SETTLEMENT

Financial rules:
PAYMENT → valid Invoice
REFUND → valid prior Payment
SETTLEMENT → valid Payment
HUB_OWNER_PAYOUT → valid Settlement

All financial operations require service-level and database-level duplicate protection.
