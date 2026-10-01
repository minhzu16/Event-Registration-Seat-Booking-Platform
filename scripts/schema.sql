-- Event Registration & Seat Booking Platform Schema
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ATTENDEE', 'ORGANISER', 'STAFF', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE seat_status AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('ACTIVE', 'CANCELLED', 'REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE NOT NULL,
  password_hash   text NOT NULL,
  full_name       text NOT NULL,
  role            user_role NOT NULL DEFAULT 'ATTENDEE',
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Organisers table
CREATE TABLE IF NOT EXISTS organisers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  contact_email   text NOT NULL,
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id          uuid NOT NULL REFERENCES organisers(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text,
  category              text NOT NULL DEFAULT 'General',
  banner_url            text,
  venue_name            text NOT NULL DEFAULT 'Main Hall',
  seating_mode          text NOT NULL CHECK (seating_mode IN ('GA','RESERVED')),
  status                text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','CANCELLED','ENDED')),
  cancel_deadline_hours int  NOT NULL DEFAULT 48,
  refund_percent        int  NOT NULL DEFAULT 100,
  max_tickets_per_user  int  NOT NULL DEFAULT 4,
  version               int  NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Sessions (showtimes)
CREATE TABLE IF NOT EXISTS sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  sales_open_at  timestamptz DEFAULT now(),
  sales_close_at timestamptz
);

-- Ticket Types (Capacity for GA, pricing tiers for Reserved)
CREATE TABLE IF NOT EXISTS ticket_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name        text NOT NULL,
  price       numeric(12,2) NOT NULL DEFAULT 0,
  capacity    int  NOT NULL DEFAULT 0,
  reserved    int  NOT NULL DEFAULT 0,
  color       text NOT NULL DEFAULT '#6366f1',
  CHECK (reserved >= 0 AND reserved <= capacity)
);

-- Event Seats (Reserved Seating inventory)
CREATE TABLE IF NOT EXISTS event_seats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ticket_type_id  uuid NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
  section         text NOT NULL,
  row_label       text NOT NULL,
  seat_number     int  NOT NULL,
  x               int  NOT NULL DEFAULT 0,
  y               int  NOT NULL DEFAULT 0,
  status          seat_status NOT NULL DEFAULT 'AVAILABLE',
  hold_id         uuid,
  hold_expires_at timestamptz,
  version         int NOT NULL DEFAULT 0,
  UNIQUE (session_id, section, row_label, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_event_seats_session_status ON event_seats (session_id, status);
CREATE INDEX IF NOT EXISTS idx_event_seats_hold_id ON event_seats (hold_id);

-- Holds
CREATE TABLE IF NOT EXISTS holds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at      timestamptz NOT NULL,
  idempotency_key text,
  UNIQUE (user_id, idempotency_key)
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  hold_id         uuid UNIQUE REFERENCES holds(id) ON DELETE SET NULL,
  status          booking_status NOT NULL DEFAULT 'PENDING',
  total_amount    numeric(12,2) NOT NULL DEFAULT 0,
  reference       text UNIQUE NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  cancelled_at    timestamptz
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  ticket_type_id  uuid NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
  event_seat_id   uuid REFERENCES event_seats(id) ON DELETE SET NULL,
  attendee_name   text NOT NULL,
  code            text UNIQUE NOT NULL,
  status          ticket_status NOT NULL DEFAULT 'ACTIVE',
  checked_in_at   timestamptz
);

-- ULTIMATE INTEGRITY SAFETY NET: at most 1 ACTIVE ticket per seat
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_ticket_per_seat
  ON tickets (event_seat_id)
  WHERE status = 'ACTIVE' AND event_seat_id IS NOT NULL;

-- Waitlist entries
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ticket_type_id   uuid REFERENCES ticket_types(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity         int  NOT NULL DEFAULT 1,
  status           text NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','OFFERED','CONVERTED','EXPIRED','LEFT')),
  offer_hold_id    uuid REFERENCES holds(id) ON DELETE SET NULL,
  offer_expires_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_session_status ON waitlist_entries (session_id, status, created_at);

-- Checkins audit log
CREATE TABLE IF NOT EXISTS checkins (
  id          bigserial PRIMARY KEY,
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  staff_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  result      text NOT NULL CHECK (result IN ('OK', 'ALREADY_CHECKED_IN', 'INVALID', 'WRONG_SESSION')),
  scanned_at  timestamptz NOT NULL DEFAULT now()
);

-- Idempotency Records
CREATE TABLE IF NOT EXISTS idempotency_records (
  key         text PRIMARY KEY,
  user_id     uuid NOT NULL,
  endpoint    text NOT NULL,
  response    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_records (created_at);
