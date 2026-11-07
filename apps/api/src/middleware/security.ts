import { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware conforming to OWASP secure header recommendations.
 * Follows Ponytail / Agent Skills security-and-hardening guidelines (zero-overhead, no bloated dependencies).
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Remove leak of server framework identity
  res.removeHeader('X-Powered-By');

  // 2. Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 3. Clickjacking defense
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 4. Modern XSS defense
  res.setHeader('X-XSS-Protection', '0');

  // 5. Referrer privacy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 6. Restrict unnecessary browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // 7. Strict-Transport-Security for production environments
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface ClientBucket {
  count: number;
  resetAt: number;
}

/**
 * Production-ready In-Memory Sliding-Window Rate Limiter.
 * Protects critical endpoints (auth, ticket drops, hold requests) against brute force and DoS.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests. Please slow down and try again later.',
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown-client',
  } = options;

  const storage = new Map<string, ClientBucket>();

  // Background cleanup every 60 seconds to prevent memory leaks
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of storage.entries()) {
      if (bucket.resetAt <= now) {
        storage.delete(key);
      }
    }
  }, 60000);
  cleanupTimer.unref(); // Don't prevent process exit

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    let bucket = storage.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      storage.set(key, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', maxRequests.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetSeconds.toString());

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds.toString());
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message,
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    next();
  };
}

