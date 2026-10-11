# Pudo-N in-app delivery-code notifications

The recipient delivery-code flow uses the existing `custody_transfers` ledger with
`transfer_type = HUB_TO_RECIPIENT`. Until account-login OTP and any external SMS
provider are implemented, the delivery code is placed in the authenticated
recipient's in-app notification inbox. No SMS gateway configuration is required.

The backend generates a six-digit code, stores only its salted SHA-256 hash in the
custody ledger, expires it after one hour, and invalidates it after five failed
verification attempts. The plaintext code is present only in the recipient's
private in-app notification message and is never returned to the hub owner's API
response or written to audit logs.

Expired delivery-code notification bodies are physically scrubbed and replaced
with a generic expired message. The backend runs an idempotent cleanup on startup
and every 60 seconds, and also scrubs expired messages when an inbox is requested.
The API excludes expired messages from the inbox. This reduces retention of expired
secrets even when a recipient does not sign in again. Cleanup is best-effort while
the backend is running; it does not retroactively remove copies already displayed,
captured, or exported by a recipient.

The one-hour lifetime is the approved product policy and is covered by `backend/test/delivery-code-policy.test.cjs`. The code remains single-use and invalid after five failed attempts; the existing resend cooldown remains in place.

## API flow

1. The authenticated recipient calls `POST /parcels/:id/request-delivery-code`.
2. The backend verifies recipient ownership, `READY_FOR_CUSTOMER` state, and a
   `PAID` invoice, then stores a private notification in the recipient's inbox.
3. The recipient opens `GET /notifications` in their signed-in account to view the
   code. `POST /notifications/:id/read` marks the message as read.
4. The hub owner calls `POST /parcels/:id/confirm-customer-release` with
   `deliveryCode`, a private `evidence_ref` for the hub handover, and optional
   `nationalId`. A successful code check records verification and hub evidence but
   does **not** mark the parcel collected.
5. If a national ID is supplied and a reference ID is stored for the recipient, it
   must match. The code remains mandatory regardless of national-ID handling.
6. The recipient then calls `POST /parcels/:id/confirm-recipient-handover` with
   their private `evidence_ref`. Only after this recipient-side evidence is saved
   does the backend mark the transfer `CONFIRMED` and parcel `COLLECTED` in one
   transaction, with an audit event. Repeating the same final evidence request is
   idempotent.

The `evidence_ref` values must refer to private images; public URLs are rejected. The current branch has not yet completed the private image-upload/storage adapter, so these APIs record references but do not themselves prove that a fresh camera photo exists.

The in-app message is an interim delivery channel, not account-login OTP. It assumes
the recipient can sign in to their existing account. Do not treat code generation
alone as successful delivery: the API reports `sent: true` only after the
notification record has been saved. No Production configuration or SMS provider
was changed by this PR.
