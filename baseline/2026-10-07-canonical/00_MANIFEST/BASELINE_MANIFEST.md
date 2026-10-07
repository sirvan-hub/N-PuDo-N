# Pudo-N Canonical Baseline Manifest

Status: FROZEN
Product: Pudo-N
Platforms: Android + PWA

## Baseline root

D:\PuDo\N-PuDo-N-BASELINE

## File count

27

## SHA-256 manifest

FILE_HASHES.sha256

## Canonical evidence

P2_DECISION_EVIDENCE.txt
P2_DOMAIN_EVIDENCE_EXTRACT.txt
CANONICAL_DECISION_LOG.md

## Important

This baseline is a reference point.
No implementation correction is included in this freeze.
Known technical debts remain explicitly recorded in the audit.

## Known technical debt

1. STORED_AT_HUB enforcement
2. CUSTOMER_COLLECTION enforcement
3. Settlement financial invariants
4. Payment/Refund/Payout idempotency
5. Payment ↔ Invoice linkage
6. Payout ownership/eligibility
7. Tariff snapshot
8. Remove 120h expiration
9. Apply 168h cap
10. Dedicated registration/custody/settlement tests
11. Full state-machine regression coverage
