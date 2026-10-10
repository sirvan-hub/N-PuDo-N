# Pudo-N PWA — starter

A standalone React + TypeScript + Vite Progressive Web App for the Pudo-N project. The UI is Persian/RTL and begins with phone + OTP authentication, then shows the workspace corresponding to the role returned by the API.

## Scope of this first slice

- Independent app under `pwa/`; backend files are not changed.
- Login and OTP verification use the canonical Nest API contract:
  - `POST {VITE_API_BASE_URL}/auth/login` with `{ "phone": "09..." }`
  - `POST {VITE_API_BASE_URL}/auth/verify-otp` with the phone and the five-digit code actually issued by the backend.
- JWT is held in memory only and is cleared on logout/refresh.
- Role names handled: `COURIER`, `HUB_OWNER`, `RECIPIENT`, `ADMIN`, and `SUPER_ADMIN` (shown in the admin workspace).
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

For Vite, local variables can be placed in `pwa/.env.local`; do not commit secrets. The current Render service was previously identified as the legacy Express backend with `/api/v1` routes and no auth controller, so do not point this app at it. The PWA uses the browser-visible API only; never put secrets in `VITE_*` variables.

## Build

```sh
npm run build
npm run preview
```

## Security and integration notes

- The frontend never treats a successful OTP request as an authenticated session; it requires an access token and role from OTP verification.
- The API must enforce all authorization and data-access rules. Hiding a panel in the UI is not access control.
- The current Nest backend has a development OTP implementation that uses a fixed code and logs it with the phone number. This is not production-safe. Do not expose the backend publicly until OTP delivery, rate limiting, and account protections are production-ready.
- No deployment workflow or hosting settings are changed by this starter.