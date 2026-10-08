# PWA-10 — Authentication / Authorization Evidence Assessment

- Date: 2026-10-08
- Project: Pudo-N
- Repository: sirvan-hub/N-PuDo-N
- Baseline commit under review: a87860c1ba8b514927549438b5c28067d49e8096
- Scope: independent assessment of the reported valid-token → HTTP 401 discrepancy
- Status: INCONCLUSIVE — runtime reproduction required
- No production code changed.

## 1. Verification contract

Requirement/risk:
- A JWT returned by `POST /auth/verify-otp` must be accepted by protected endpoints when presented as `Authorization: Bearer <token>`, provided the token is valid, unexpired, and the caller has the required role.

Best available evidence:
- Auth controller/service source inspection
- JWT strategy and guard source inspection
- Existing canonical test plan
- PWA-09 working evidence registration

Runtime evidence was not available through the repository-only verification path, so this report does not claim a fresh API reproduction.

## 2. Existing reported discrepancy

PWA-09 records that the newer working test evidence observed:
- authentication/authorization checks were performed;
- a valid token produced an unexpected 401 in one validation path.

That observation is retained as historical working evidence, not treated as independently reproduced by PWA-10.

## 3. Source inspection

### Token issuance

`backend/src/modules/auth/auth.service.ts`:
- OTP verification validates the stored OTP.
- The user is loaded again.
- The JWT payload is created with `sub`, `phone`, `role`, and `is_verified`.
- `JwtService.sign(payload)` creates the access token.

### Token verification

`backend/src/modules/auth/strategies/jwt.strategy.ts`:
- extracts JWT from the Bearer Authorization header;
- rejects expired tokens;
- obtains `JWT_SECRET` from `ConfigService`, with `default-secret` as fallback;
- returns the JWT payload from `validate()`.

### Guard

`backend/src/common/guards/jwt-auth.guard.ts`:
- delegates authentication to Passport's `jwt` strategy.

### Authorization

`backend/src/common/guards/roles.guard.ts`:
- reads required roles from the route metadata;
- reads `request.user`;
- rejects callers whose role is not included.

### Provider registration

`backend/src/modules/auth/auth.module.ts` registers the JWT strategy as a provider and imports Passport/JWT modules.

## 4. Material observation

There are two JWT strategy source files in the current tree:

1. `backend/src/modules/auth/strategies/jwt.strategy.ts`
2. `backend/src/common/guards/jwt.strategy.ts`

The AuthModule explicitly imports the second file:

`import { JwtStrategy } from '../../common/guards/jwt.strategy';`

Therefore the existence of the first file alone does not prove it is the active strategy.

However, having two implementations of the same Passport strategy name (`jwt`) is an architectural ambiguity and a credible investigation target because both extend `PassportStrategy(Strategy)` and both configure the `jwt` strategy.

This is a finding for follow-up, not proof that it caused the reported 401.

## 5. Independent verdict

### Specification verdict: INCONCLUSIVE

The source code shows a plausible token issuance/verification path, but the available evidence does not establish that the exact protected endpoint which returned 401 accepts the generated token at runtime.

### Engineering-quality verdict: PARTIAL

The authentication path is structurally present, but duplicate JWT strategy implementations create avoidable ambiguity. Runtime verification of secret alignment, Passport registration, endpoint guards, and role metadata remains necessary.

## 6. Required runtime verification

Run a clean backend instance and record:

1. Register or use a known test user.
2. `POST /v1/auth/login`.
3. `POST /v1/auth/verify-otp`.
4. Capture the returned JWT.
5. Call one protected endpoint with:
   `Authorization: Bearer <JWT>`
6. Repeat with:
   - no Authorization header;
   - malformed Bearer token;
   - expired token if a deterministic fixture is available;
   - valid token with an unauthorized role.
7. Record HTTP status and response body for each case.
8. Confirm the server's effective `JWT_SECRET` configuration is identical for signing and verification without exposing the secret in logs or evidence.
9. Identify the exact endpoint that produced the original 401.
10. If 401 persists, inspect Passport strategy registration and the active guard chain at runtime.

## 7. Acceptance criteria

- [x] Existing 401 observation identified and preserved.
- [x] Token issuance path inspected.
- [x] Token verification path inspected.
- [x] Guard and role authorization paths inspected.
- [x] Duplicate JWT strategy implementations identified.
- [x] No production code modified.
- [x] No canonical baseline file modified.
- [ ] Runtime reproduction completed.
- [ ] Exact root cause of the 401 established.
- [ ] Remediation implemented and independently retested.

## 8. Decision

Do not mark the authentication discrepancy as resolved.

Do not promote the newer TEST_PLAN to canonical status based on PWA-10 alone.

The next engineering action should be a controlled runtime reproduction of the exact protected endpoint and token pair, followed by the smallest targeted fix only if the failure is reproduced.
