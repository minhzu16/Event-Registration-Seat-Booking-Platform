import { defineConfig } from 'vitest/config';

// Test-only secrets: the API itself refuses to start without real ones (see .env.example).
export default defineConfig({
  test: {
    env: {
      JWT_SECRET: 'test-only-jwt-secret-0123456789abcdef',
      QR_HMAC_SECRET: 'test-only-qr-hmac-secret-0123456789abcdef',
    },
  },
});
