import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    ticket_drop: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 1000,
      maxDuration: '60s',
    },
  },
  thresholds: {
    // 409 Conflict is expected behavior for contested seats; true HTTP failure is 5xx
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:hold}': ['p(95)<350'],
  },
};

// Set expected status callback so 409 is treated as valid business conflict
http.setResponseCallback(http.expectedStatuses(201, 409));

const API_BASE = __ENV.API_BASE || 'http://localhost:4000';
const SESSION_ID = __ENV.SESSION_ID || '';
const HOT_SEATS = JSON.parse(open('./hot-seats.json'));

export function setup() {
  // Login simulated attendee to acquire Bearer token
  const loginRes = http.post(
    `${API_BASE}/auth/login`,
    JSON.stringify({
      email: 'alice@example.com',
      password: 'password123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  return {
    token: loginRes.json('token'),
  };
}

export default function (data) {
  const randomSeat = HOT_SEATS[Math.floor(Math.random() * HOT_SEATS.length)];
  const idempotencyKey = `k6-${__VU}-${__ITER}-${Date.now()}`;

  const res = http.post(
    `${API_BASE}/sessions/${SESSION_ID}/holds`,
    JSON.stringify({
      seatIds: [randomSeat],
      strategy: 'pessimistic',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.token}`,
        'Idempotency-Key': idempotencyKey,
      },
      tags: { name: 'hold' },
    }
  );

  check(res, {
    'Status is 201 Success or 409 Conflict': (r) => r.status === 201 || r.status === 409,
    'Zero 500 server errors': (r) => r.status !== 500,
  });
}
