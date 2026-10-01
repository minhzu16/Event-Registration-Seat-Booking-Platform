import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { pool, query, withTransaction } from './database.js';
import authRoutes from './routes/auth.routes.js';
import eventsRoutes from './routes/events.routes.js';
import holdsRoutes from './routes/holds.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import waitlistRoutes from './routes/waitlist.routes.js';
import checkinRoutes from './routes/checkin.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { startBackgroundWorker, stopBackgroundWorker } from './services/worker.js';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
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
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

// Mount modular routes
app.use('/auth', authRoutes);
app.use('/', eventsRoutes);
app.use('/', holdsRoutes);
app.use('/', bookingsRoutes);
app.use('/', waitlistRoutes);
app.use('/', checkinRoutes);
app.use('/', reportsRoutes);
app.use('/', adminRoutes);

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

      console.log('[Seed] Seeding completed successfully!');
    });
  } catch (error) {
    console.error('[Seed Error]', error);
  }
}

// Start Server
const server = app.listen(config.PORT, async () => {
  console.log(`🚀 [API] Event Platform API running on http://localhost:${config.PORT}`);
  console.log(`📊 [API] Database connected to ${config.DATABASE_URL}`);
  console.log(`🔒 [API] Default booking concurrency strategy: ${config.BOOKING_STRATEGY}`);

  await seedDefaultData();
  startBackgroundWorker(10000);
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('[API] Gracefully shutting down...');
  stopBackgroundWorker();
  server.close(async () => {
    await pool.end();
    console.log('[API] Closed HTTP server and PostgreSQL pool.');
    process.exit(0);
  });
}
