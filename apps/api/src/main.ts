import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import closeWithGrace from 'close-with-grace';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool, query, withTransaction } from './database.js';
import authRoutes from './routes/auth.routes.js';
import eventsRoutes from './routes/events.routes.js';
import holdsRoutes from './routes/holds.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import waitlistRoutes from './routes/waitlist.routes.js';
import checkinRoutes from './routes/checkin.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { securityHeadersMiddleware, createRateLimiter } from './middleware/security.js';
import { startBackgroundWorker, stopBackgroundWorker } from './services/worker.js';

export const app = express();

app.use(securityHeadersMiddleware);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));

// Request structured logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: duration,
        },
        `HTTP ${req.method} ${req.originalUrl}`
      );
    }
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await query('SELECT 1 as healthy');
    res.json({
      status: 'UP',
      uptime: process.uptime(),
      db: dbCheck.rowCount === 1 ? 'CONNECTED' : 'DISCONNECTED',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err }, '[Health] Check failed');
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

// Production Observability: Prometheus Metrics Endpoint (OpenTelemetry / Prometheus Scraper compatible)
app.get('/metrics', async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const activeHoldsRes = await query(`SELECT count(*) as count FROM holds WHERE expires_at > now()`);
    const activeHolds = Number(activeHoldsRes.rows[0]?.count || 0);

    const metrics = [
      '# HELP seatlock_uptime_seconds Process uptime in seconds.',
      '# TYPE seatlock_uptime_seconds gauge',
      `seatlock_uptime_seconds ${process.uptime().toFixed(2)}`,
      '',
      '# HELP seatlock_memory_rss_bytes Resident set size in bytes.',
      '# TYPE seatlock_memory_rss_bytes gauge',
      `seatlock_memory_rss_bytes ${mem.rss}`,
      '',
      '# HELP seatlock_memory_heap_used_bytes Heap memory used in bytes.',
      '# TYPE seatlock_memory_heap_used_bytes gauge',
      `seatlock_memory_heap_used_bytes ${mem.heapUsed}`,
      '',
      '# HELP seatlock_db_pool_total_connections Total pool connection limit.',
      '# TYPE seatlock_db_pool_total_connections gauge',
      `seatlock_db_pool_total_connections ${pool.totalCount}`,
      '',
      '# HELP seatlock_db_pool_idle_connections Idle connections in pool.',
      '# TYPE seatlock_db_pool_idle_connections gauge',
      `seatlock_db_pool_idle_connections ${pool.idleCount}`,
      '',
      '# HELP seatlock_db_pool_waiting_requests Client queries waiting for a connection.',
      '# TYPE seatlock_db_pool_waiting_requests gauge',
      `seatlock_db_pool_waiting_requests ${pool.waitingCount}`,
      '',
      '# HELP seatlock_active_holds_total Number of currently active non-expired seat holds.',
      '# TYPE seatlock_active_holds_total gauge',
      `seatlock_active_holds_total ${activeHolds}`,
      '',
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (err: any) {
    res.status(500).send(`# Error generating metrics: ${err.message}`);
  }
});

// Mount modular routes with security rate limiting
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 120,
  message: 'Too many authentication attempts. Please try again later.',
});
app.use('/auth', authLimiter, authRoutes);
app.use('/', eventsRoutes);
app.use('/', holdsRoutes);
app.use('/', bookingsRoutes);
app.use('/', waitlistRoutes);
app.use('/', checkinRoutes);
app.use('/', reportsRoutes);
app.use('/', adminRoutes);

// Centralized error handler
app.use(errorHandler);

// Database Seeder
async function seedDefaultData() {
  try {
    const userCheck = await query('SELECT count(*) as count FROM users');
    if (Number(userCheck.rows[0].count) > 0) {
      console.log('[Seed] Database already seeded.');
      return;
    }

    console.log('[Seed] Seeding initial test data...');
    const salt = await bcrypt.genSalt(10);
    const hashedPw = await bcrypt.hash('password123', salt);

    await withTransaction(async (client) => {
      // 1. Users
      const adminRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ('admin@eventplatform.com', $1, 'System Administrator', 'ADMIN')
         RETURNING id;`,
        [hashedPw]
      );
      const organiserRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ('organiser@techsummit.io', $1, 'Sarah Chen (Lead Organiser)', 'ORGANISER')
         RETURNING id;`,
        [hashedPw]
      );
      const staffRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ('staff@eventplatform.com', $1, 'Entrance Gate Staff #1', 'STAFF')
         RETURNING id;`,
        [hashedPw]
      );
      const attendee1Res = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ('alice@example.com', $1, 'Alice Nguyen', 'ATTENDEE')
         RETURNING id;`,
        [hashedPw]
      );
      const attendee2Res = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ('bob@example.com', $1, 'Bob Tran', 'ATTENDEE')
         RETURNING id;`,
        [hashedPw]
      );

      const orgId = organiserRes.rows[0].id;

      // 2. Organiser profile
      const orgProfileRes = await client.query(
        `INSERT INTO organisers (name, description, contact_email, owner_id)
         VALUES ('Global Tech Summits', 'Pioneering global technology conferences & live showcases', 'contact@techsummit.io', $1)
         RETURNING id;`,
        [orgId]
      );
      const orgRecordId = orgProfileRes.rows[0].id;

      // 3. Event 1: Reserved Seating (Tech Summit 2026 Keynote)
      const ev1Res = await client.query(
        `INSERT INTO events (
          organiser_id, title, description, category, banner_url, venue_name,
          seating_mode, cancel_deadline_hours, refund_percent, max_tickets_per_user
        ) VALUES (
          $1,
          'Tech Summit 2026: AI & Concurrency Showcase',
          'Explore revolutionary breakthroughs in high-throughput distributed systems, zero-collision transactions, and real-time computing.',
          'Technology',
          'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&auto=format&fit=crop&q=80',
          'Grand Opera & Convention Center, Hall Alpha',
          'RESERVED',
          24,
          100,
          4
        ) RETURNING id;`,
        [orgRecordId]
      );
      const ev1Id = ev1Res.rows[0].id;

      // Session for Event 1
      const sess1Res = await client.query(
        `INSERT INTO sessions (event_id, starts_at, ends_at)
         VALUES ($1, now() + interval '3 days', now() + interval '3 days 4 hours')
         RETURNING id;`,
        [ev1Id]
      );
      const sess1Id = sess1Res.rows[0].id;

      // Ticket Types for Event 1
      const ttVipRes = await client.query(
        `INSERT INTO ticket_types (session_id, name, price, capacity, color)
         VALUES ($1, 'VIP Front Row', 1500000, 24, '#f59e0b')
         RETURNING id;`,
        [sess1Id]
      );
      const ttStdRes = await client.query(
        `INSERT INTO ticket_types (session_id, name, price, capacity, color)
         VALUES ($1, 'Standard Orchestra', 750000, 48, '#6366f1')
         RETURNING id;`,
        [sess1Id]
      );
      const ttBalcRes = await client.query(
        `INSERT INTO ticket_types (session_id, name, price, capacity, color)
         VALUES ($1, 'Balcony Tier', 450000, 36, '#10b981')
         RETURNING id;`,
        [sess1Id]
      );

      const vipId = ttVipRes.rows[0].id;
      const stdId = ttStdRes.rows[0].id;
      const balcId = ttBalcRes.rows[0].id;

      // Generate Seats: VIP (2 rows x 12 seats)
      const seatSpacing = 42;
      let startY = 60;
      for (let r = 0; r < 2; r++) {
        const rowLabel = String.fromCharCode(65 + r); // A, B
        let startX = 60;
        for (let s = 1; s <= 12; s++) {
          await client.query(
            `INSERT INTO event_seats (session_id, ticket_type_id, section, row_label, seat_number, x, y, status)
             VALUES ($1, $2, 'VIP Front', $3, $4, $5, $6, 'AVAILABLE');`,
            [sess1Id, vipId, rowLabel, s, startX, startY]
          );
          startX += seatSpacing;
        }
        startY += seatSpacing;
      }

      // Standard Orchestra (4 rows x 12 seats)
      startY += 20; // Gap
      for (let r = 0; r < 4; r++) {
        const rowLabel = String.fromCharCode(67 + r); // C, D, E, F
        let startX = 60;
        for (let s = 1; s <= 12; s++) {
          await client.query(
            `INSERT INTO event_seats (session_id, ticket_type_id, section, row_label, seat_number, x, y, status)
             VALUES ($1, $2, 'Orchestra', $3, $4, $5, $6, 'AVAILABLE');`,
            [sess1Id, stdId, rowLabel, s, startX, startY]
          );
          startX += seatSpacing;
        }
        startY += seatSpacing;
      }

      // Balcony (3 rows x 12 seats)
      startY += 25; // Gap
      for (let r = 0; r < 3; r++) {
        const rowLabel = String.fromCharCode(71 + r); // G, H, I
        let startX = 60;
        for (let s = 1; s <= 12; s++) {
          await client.query(
            `INSERT INTO event_seats (session_id, ticket_type_id, section, row_label, seat_number, x, y, status)
             VALUES ($1, $2, 'Balcony', $3, $4, $5, $6, 'AVAILABLE');`,
            [sess1Id, balcId, rowLabel, s, startX, startY]
          );
          startX += seatSpacing;
        }
        startY += seatSpacing;
      }

      // 4. Event 2: General Admission (Electronic Music Festival)
      const ev2Res = await client.query(
        `INSERT INTO events (
          organiser_id, title, description, category, banner_url, venue_name,
          seating_mode, cancel_deadline_hours, refund_percent, max_tickets_per_user
        ) VALUES (
          $1,
          'Neon Pulse Music Festival 2026',
          'An electric night of non-stop dance music, visual synesthesia, and world-class DJs.',
          'Music',
          'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80',
          'Riverside Open-Air Arena',
          'GA',
          48,
          80,
          6
        ) RETURNING id;`,
        [orgRecordId]
      );
      const ev2Id = ev2Res.rows[0].id;

      const sess2Res = await client.query(
        `INSERT INTO sessions (event_id, starts_at, ends_at)
         VALUES ($1, now() + interval '7 days', now() + interval '7 days 8 hours')
         RETURNING id;`,
        [ev2Id]
      );
      const sess2Id = sess2Res.rows[0].id;

      await client.query(
        `INSERT INTO ticket_types (session_id, name, price, capacity, reserved, color)
         VALUES ($1, 'General Standing', 500000, 500, 0, '#ec4899'),
                ($1, 'VIP Lounge Pass', 1200000, 50, 0, '#8b5cf6');`,
        [sess2Id]
      );

      logger.info('[Seed] Seeding completed successfully!');
    });
  } catch (error) {
    logger.error({ err: error }, '[Seed Error]');
  }
}

// Start Server
const server = app.listen(config.PORT, async () => {
  logger.info(
    { port: config.PORT, db: config.DATABASE_URL, strategy: config.BOOKING_STRATEGY },
    '🚀 Event Platform API started'
  );

  await seedDefaultData();
  startBackgroundWorker(10000);
});

// Production-ready graceful shutdown via close-with-grace
closeWithGrace({ delay: 10000 }, async ({ signal, err }) => {
  if (err) {
    logger.fatal({ err }, '[API] Unhandled error triggered shutdown');
  }
  logger.info({ signal }, '[API] Gracefully shutting down...');
  stopBackgroundWorker();

  if (typeof (server as any).closeIdleConnections === 'function') {
    (server as any).closeIdleConnections();
  }

  await new Promise<void>((resolve, reject) => {
    server.close((serverErr) => (serverErr ? reject(serverErr) : resolve()));
  });

  await pool.end();
  logger.info('[API] Closed HTTP server and drained PostgreSQL pool cleanly.');
});
