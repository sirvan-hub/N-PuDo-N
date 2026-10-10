# Pudo-N PWA — starter

A standalone Persian/RTL React + TypeScript + Vite Progressive Web App for Pudo-N. Temporary authentication uses username and password; the API can be switched to OTP later when SMS delivery is available.

## Authentication contract

- `POST {VITE_API_BASE_URL}/auth/register` with `{ "username": "...", "password": "...", "phone": "09...", "full_name": "..." }` creates a **recipient-only** account.
- `POST {VITE_API_BASE_URL}/auth/login` with `{ "username": "...", "password": "..." }` returns an access token and user role.
- `POST {VITE_API_BASE_URL}/auth/verify-otp` is temporarily disabled and returns HTTP 410 Gone.
- Usernames must be 3–32 ASCII letters, digits, dots, underscores, or hyphens. Passwords must be 10–72 characters.
- Passwords are hashed with bcrypt on the server. Failed login attempts are counted; five consecutive failures trigger a 15-minute lock.
- JWT is held in memory only and is cleared on logout/refresh.

## Existing accounts

Accounts created before password login was added have no password hash and cannot sign in yet. They need credentials provisioned through a controlled admin/database process. Public registration only creates recipient accounts; courier, hub owner, and administrator accounts must not be self-assigned.

## Run locally

Requires Node.js 20 or later.

```sh
cd pwa
npm install
npm run dev
```

Set `VITE_API_BASE_URL` to the backend base URL ending in `/v1`. Example local value:

```text
VITE_API_BASE_URL=http://localhost:3000/v1
```

For Vite, local variables can be placed in `pwa/.env.local`; do not commit secrets. Never put server secrets in `VITE_*` variables. The current legacy Render service does not implement this Nest authentication contract; do not point the PWA at it until the backend is deliberately deployed and verified.

## Build

```sh
npm run build
npm run preview
```

This remains a starter shell: parcel, hub, settlement, and admin operations are not yet implemented. The API must enforce all authorization and data-access rules; hiding a panel in the UI is not access control.
