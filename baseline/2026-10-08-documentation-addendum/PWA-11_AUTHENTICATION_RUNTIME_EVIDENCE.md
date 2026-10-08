# PWA-11 — Authentication Runtime Verification Evidence

- Date: 2026-10-08
- Project: Pudo-N
- Repository: sirvan-hub/N-PuDo-N
- Runtime worktree: D:\PuDo\Qwen\N-PuDo-N-PWA11-CANONICAL
- Canonical baseline commit exercised: a49dc77b5ca2be95321349669cde345716639265
- Scope: controlled runtime verification of the previously reported valid-JWT → HTTP 401 discrepancy
- Status: **PASS — JWT authentication runtime verified; previously reported 401 with a valid JWT was not reproduced**
- Production source code changed: **No**
- Canonical baseline source changed: **No**

## 1. Verification contract

The authentication path must:

1. start successfully with a valid runtime JWT configuration;
2. register a user;
3. issue an OTP through login;
4. verify the OTP and issue a JWT;
5. reject a protected request with no JWT;
6. accept a valid JWT at the authentication guard;
7. reject an invalid JWT.

The purpose of this run was to determine whether the previously reported valid-token → HTTP 401 discrepancy could be reproduced on the canonical baseline.

## 2. Runtime environment

A temporary isolated Git worktree was created from canonical baseline commit a49dc77b.

The canonical worktree did not contain a .env file. The first startup attempt therefore failed with:

~~~
JwtStrategy requires a secret or key
~~~

For runtime verification only, a local uncommitted .env was created inside the temporary worktree with a fresh test-only JWT_SECRET and PORT=3000.

No production secret or main working-tree .env was copied into the canonical worktree.

The backend then started successfully and registered the expected routes.

## 3. Build and startup evidence

### Build

Command:

~~~
npm run build
~~~

Result:

- **PASS**
- Nest build completed without TypeScript build errors.

### Startup

Command:

~~~
npm start
~~~

Result:

- **PASS**
- Nest application started successfully.
- TypeORM/SQLite initialized.
- AuthModule and JwtModule initialized.
- Auth routes registered:
  - POST /v1/auth/register
  - POST /v1/auth/login
  - POST /v1/auth/verify-otp

## 4. Authentication flow

### 4.1 Registration

A fresh test recipient was registered using the canonical DTO contract:

~~~
{
  "phone": "<test-phone>",
  "role": "RECIPIENT"
}
~~~

Observed result:

- HTTP **201**
- User created successfully.
- is_verified=false.

### 4.2 Login

Request:

~~~
{
  "phone": "<test-phone>"
}
~~~

Observed result:

- HTTP **200**
- Response: {"message":"OTP sent"}

The server log confirmed the test OTP was generated.

### 4.3 OTP verification

The canonical test flow uses the five-digit OTP 12345.

Observed result:

- HTTP **200**
- JWT access token issued.
- Returned user payload showed:
  - role: RECIPIENT
  - is_verified=true

The JWT itself is intentionally not recorded in this document.

## 5. Protected endpoint verification

The canonical UsersController and HubsController were inspected to identify a route protected by the JWT guard.

Selected endpoint:

~~~
GET /v1/hubs/:id
~~~

This route has:

~~~
@UseGuards(JwtAuthGuard)
~~~

and therefore provides a direct authentication test without a role restriction.

### 5.1 No Authorization header

Request used a non-existent Hub UUID.

Observed:

~~~
HTTP 401
~~~

Interpretation:

- JWT authentication is enforced.
- The protected endpoint rejects unauthenticated requests.

### 5.2 Valid JWT

The same endpoint was called with:

~~~
Authorization: Bearer <valid-test-jwt>
~~~

Observed:

~~~
HTTP 500
~~~

Server log:

~~~
Error: Hub not found
    at HubsService.getById (...)
~~~

Interpretation:

- The request passed the JWT authentication layer.
- Execution reached HubsService.getById().
- The 500 was caused by the deliberately non-existent Hub ID used for the authentication probe.
- This is **not evidence of a JWT failure**.
- The previously reported valid-token → 401 condition was **not reproduced**.

### 5.3 Invalid JWT

A deliberately modified version of the valid token was sent as:

~~~
Authorization: Bearer <invalid-jwt>
~~~

Observed:

~~~
HTTP 401
~~~

Interpretation:

- Invalid JWTs are rejected as expected.

## 6. Runtime authentication matrix

| Scenario | Result | Interpretation |
|---|---:|---|
| Backend build | PASS | Canonical source builds |
| Backend startup with test JWT secret | PASS | Runtime configuration accepted |
| Register | 201 | Registration works |
| Login | 200 | OTP flow starts |
| Verify OTP | 200 | JWT issued |
| Protected endpoint, no JWT | 401 | Authentication enforced |
| Protected endpoint, valid JWT | 500 Hub not found | JWT accepted; request reached service layer |
| Protected endpoint, invalid JWT | 401 | Invalid JWT rejected |

## 7. Authentication verdict

### **PASS — runtime authentication verified**

The controlled canonical runtime demonstrated all three critical authentication states:

~~~
No JWT
  → 401

Invalid JWT
  → 401

Valid JWT
  → authentication accepted
  → service layer reached
  → "Hub not found" from deliberately invalid resource ID
~~~

Therefore:

> The previously reported **HTTP 401 with a valid JWT was not reproduced** on canonical baseline a49dc77b under the controlled runtime configuration used in this verification.

## 8. Important scope limitation

This result verifies the canonical backend authentication path under a controlled local runtime configuration.

It does **not** prove that every deployed environment has correct JWT configuration.

In particular:

- the temporary canonical worktree initially lacked JWT_SECRET;
- a test-only local JWT secret was supplied for this runtime run;
- no production secret was copied or exposed;
- deployment-specific environment variables and the exact environment where the historical 401 was observed were not independently reproduced in this run.

Therefore the historical 401 should be classified as:

**NOT REPRODUCED / ENVIRONMENT OR CONTEXT NOT ESTABLISHED**

rather than as a confirmed production defect.

## 9. Related finding deliberately not changed

The protected Hub endpoint returned HTTP 500 for a non-existent Hub ID:

~~~
Hub not found
~~~

This indicates an error-handling/API-status issue in the Hub service path. It was outside the PWA-11 authentication scope and was **not modified**.

## 10. Security / repository handling

- No production source code was modified.
- No canonical baseline file was modified during runtime verification.
- The temporary .env belongs only to the isolated PWA-11 worktree and must not be committed.
- JWT values are not included in this evidence document.
- No real project secrets are included in this document.

## 11. Acceptance criteria

- [x] Canonical baseline identified and exercised.
- [x] Backend build verified.
- [x] Runtime startup verified.
- [x] JWT runtime configuration verified with a test-only secret.
- [x] Registration verified.
- [x] Login/OTP issuance verified.
- [x] OTP verification and JWT issuance verified.
- [x] Protected endpoint without JWT verified as 401.
- [x] Protected endpoint with valid JWT verified to pass authentication.
- [x] Invalid JWT verified as 401.
- [x] Previously reported valid-token → 401 discrepancy not reproduced.
- [x] No production code changed.
- [x] Out-of-scope Hub 500 finding preserved without modification.

## 12. Decision

**PWA-11 authentication runtime verification is complete.**

Do not implement a JWT/Passport remediation based solely on the historical 401 report.

The next investigation, if required, should target the exact deployment/environment and exact endpoint where the historical 401 occurred, including its effective runtime JWT configuration, rather than changing the canonical authentication implementation without a fresh reproduction.
