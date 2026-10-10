# Payout preference and settlement workflow

**Status:** Incremental implementation on the Draft PR branch. Not production-ready; no bank/provider API or transfer is invoked.

## Supported endpoints

All routes require a valid bearer token.

- `GET /v1/settlements/me/payout-preference` — courier/hub owner reads their own frequency and masked destination state.
- `PATCH /v1/settlements/me/payout-preference` — set `frequency` to `WEEKLY` or `MONTHLY`, and optionally set `destinationToken` plus four-digit `destinationLast4`.
- `POST /v1/settlements/payout-profiles/:userId/verify-destination` — administrator records an out-of-band verification reference after independently checking the destination.
- `POST /v1/settlements/couriers/me/payout-requests` — courier submits a request with a whole-toman `amount` and `Idempotency-Key`.
- `GET /v1/settlements/couriers/me/payout-requests` — courier reads only their own payout history.
- `POST /v1/settlements/hubs/:hubId/payout-requests` — existing hub request route; now also requires a configured and manually verified destination.
- `GET /v1/settlements/hubs/:hubId/payout-requests` — existing owner/admin history route.
- `PATCH /v1/settlements/payout-requests/:requestId/review` — administrator approves/rejects either courier or hub payout requests.

## Financial invariants

- Only the authenticated courier/hub owner can request a payout from their own wallet/hub scope.
- A payout destination must have an opaque reference, masked last four digits, and a recorded manual verification before a request is accepted.
- Changing the destination reference invalidates its previous verification.
- The full bank account number and IBAN must not be submitted or stored. `destinationToken` is intended to be an opaque token/reference from a future approved provider or external workflow; the API rejects common full-card/IBAN forms.
- A request atomically moves the requested amount from available balance to blocked balance and records both ledger movements.
- Repeating the same idempotency key and same request returns the original result; reusing it for a different request is rejected.
- A rejection releases the reserved funds back to available balance.
- Approval keeps funds blocked. It does not initiate or prove a bank transfer. The system must not mark a payout `COMPLETED` without a separately integrated, independently verified transfer result and provider reference.
- Only one open `REQUESTED` or `APPROVED` request per courier/hub is allowed at a time.

## Verification boundary / remaining work

- The administrator verification endpoint records a manual attestation and audit event; it does not contact a bank or prove ownership automatically.
- The product owner has not selected an authorized bank/payment provider or finalized identity and destination validation requirements. No real bank details should be collected until those requirements and the approved provider path are defined.
- Weekly/monthly is stored as a preference; no automated payout scheduler is enabled by this change.
- Refund, chargeback, transfer-failure retry, and final bank-transfer reconciliation policies remain separate work.
- Keep PR #5 Draft and unmerged. Do not run migrations against Production or execute live transfers.
