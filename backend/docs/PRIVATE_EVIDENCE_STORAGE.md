# Private parcel evidence storage adapter

This feature branch now includes a server-side adapter for a **private Supabase Storage bucket**. It is code-only until the bucket and server-side environment variables are configured. No Supabase project or live environment was changed by this commit.

## Required server environment

- `SUPABASE_URL`: HTTPS project URL.
- `SUPABASE_STORAGE_BUCKET`: bucket name, recommended `pudo-evidence`.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only credential. Never put it in PWA/Android environment variables, browser bundles, logs, or source control.

Create the bucket in Supabase Storage with **Public bucket disabled**. Do not create broad anonymous read/write policies. Requests go through the authenticated Pudo-N backend, which applies parcel-level role and ownership checks before creating short-lived signed URLs.

## API

Both endpoints require a Pudo-N bearer token:

- `POST /v1/evidence/parcels/:parcelId` — multipart form with `file` and `category`. Supported categories:
  - `ENTRY_FEE_RECEIPT` (registered recipient)
  - `COURIER_HANDOVER` (assigned courier)
  - `HUB_RECEIPT` / `HUB_RELEASE` (assigned hub owner)
  - `RECIPIENT_HANDOVER` (registered recipient)
- `GET /v1/evidence/parcels/:parcelId/signed-url?ref=<encoded-evidence-ref>` — returns a signed URL valid for 60 seconds only when the reference is already attached to the parcel/charge/transfer and the caller can access that parcel.

The upload response contains an opaque `pudo-evidence://...` reference, not a public URL. Submit that reference to the relevant existing custody/receipt endpoint so it becomes attached to the domain record; only attached references can be retrieved. Uploads accept JPEG, PNG, and WebP with a 10 MB limit and check the file signature against its declared MIME type.

## Current boundary / remaining work

- The label-photo upload-before-registration flow is not yet integrated; this first slice covers evidence for an existing parcel. Do not claim the full photo workflow is complete.
- The PWA camera/file picker and upload/retrieval UI are not yet wired to these endpoints.
- The provider bucket must be created and configured separately; this branch does not call a live Supabase project.
- Retention/deletion policy, malware/image decoding scan, image metadata/EXIF handling, and operational monitoring remain to be specified before production use.
- Signed URLs are intentionally short-lived. Never persist signed URLs in parcel records; persist only the opaque reference.
