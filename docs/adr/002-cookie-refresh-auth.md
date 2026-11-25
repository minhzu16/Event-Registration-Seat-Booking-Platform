# ADR 002: Cookie-Based Refresh Auth & Startup Secret Validation

- **Status**: Accepted
- **Context**: Storing long-lived JWTs in `localStorage` increases XSS exposure, while hardcoded fallback secrets in development risk accidental production deployment with weak keys.
- **Decision**:
  1. `apps/api/src/routes/auth.routes.ts` issues a 15-minute `accessToken` in the JSON response and a 7-day `refreshToken` (`typ: 'refresh'`) in an `httpOnly`, `sameSite: 'lax'`, `secure` (in production) cookie.
  2. `apps/api/src/config.ts` validates `JWT_SECRET` and `QR_HMAC_SECRET` with Zod (`min(32)`), refusing to boot if missing or too short (verified by `apps/api/test/secrets-and-cors.test.ts`).
  3. `apps/api/src/cors.ts` restricts browser origins to `CORS_ORIGINS` (`CORS_ORIGIN_LIST`) with `credentials: true` so refresh cookies are only sent to trusted origins.
- **Consequences**: Reduced token theft blast radius and fail-fast secret hygiene; requires `CORS_ORIGINS` to be explicitly configured for each frontend origin.
