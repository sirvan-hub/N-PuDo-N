# Pudo-N PWA — starter

A standalone React + TypeScript + Vite Progressive Web App for the Pudo-N project. The UI is Persian/RTL and begins with phone + OTP authentication, then shows the workspace corresponding to the role returned by the API.

## Scope of this first slice

- Independent app under `pwa/`; backend files are not changed.
- Login and OTP verification use the canonical Nest API contract:
  - `POST {VITE_API_BASE_URL}/auth/login` with `{ "phone": "09..." }`
  - `POST {VITE_API_BASE_URL}/auth/verify-otp` with `{ "phone": "09...", "otp": "12345" }`
- JWT is held in memory only and is cleared on logout/refresh.
- Role names currently recognized: `COURIER`, `HUB_OWNER`, `RECIPIENT`, `ADMIN`.
- Includes install metadata and a small offline app-shell service worker.
- This is a starter shell, not a claim that parcel, hub, settlement, or admin operations are implemented.

## Run locally

Requires Node.js 20 or later.

```sh
cd pwa
npm install
npm run dev
```

The app deliberately does not guess the API address. Set `VITE_API_BASE_URL` to the **base URL ending in `/v1`** for a deployed backend that implements the Nest auth routes. Example local value:

```text
VITE_API_BASE_URL=http://localhost:3000/v1
```

For Vite, local variables can be placed in `pwa/.env.local`; do not commit secrets. The current Render service was previously identified as the legacy Express backend with `/api/v1` routes, so do not point this app at it until its auth contract is confirmed. The PWA uses the browser-visible API only; never put secrets in `VITE_*` variables.

## Build

```sh
npm run build
npm run preview
```

## Security and integration notes

- The frontend never treats a successful OTP request as an authenticated session; it requires an access token and role from OTP verification.
- The API must enforce all authorization and data-access rules. Hiding a panel in the UI is not access control.
- The current backend has a development OTP implementation documented elsewhere. This frontend does not display, guess, or hard-code an OTP. Do not expose the backend publicly until OTP delivery, rate limiting, and account protections are production-ready.
- No deployment workflow or hosting settings are changed by this starter.