# SeatLock — Event Registration & Zero-Collision Seat Booking Platform

> **Hệ thống đặt vé sự kiện & giữ ghế số lượng lớn với cơ chế bảo vệ concurrency đa tầng, triệt tiêu hoàn toàn double-booking (0% xung đột ghế), kiểm thử tải tức thời và xác thực vé QR bằng mã ký HMAC-SHA256.**

---

## 1. Tổng quan Kiến trúc Hệ thống

Dự án được xây dựng theo mô hình **Modular Monolith** hoàn chỉnh theo đúng đề bài thiết kế, sử dụng **Full-stack TypeScript**:

```
pj1/
├── .pgdata/                  # Cụm PostgreSQL 18 độc lập chạy cổng 5433
├── scripts/
│   ├── schema.sql            # DDL PostgreSQL với index, constraints & types
│   ├── start-db.ps1          # Script khởi động DB PostgreSQL 18
│   └── stop-db.ps1           # Script dừng DB PostgreSQL 18
├── apps/
│   ├── api/                  # Backend Express/Node TypeScript (cổng 4000)
│   │   ├── src/
│   │   │   ├── database.ts   # Connection pool pg, raw SQL transactions
│   │   │   ├── services/
│   │   │   │   ├── qr.ts         # HMAC-SHA256 signer & verifier
│   │   │   │   ├── realtime.ts   # Server-Sent Events (SSE) broadcast hub
│   │   │   │   └── worker.ts     # Dọn dẹp hold hết hạn & kích hoạt waitlist
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts       # Đăng ký, đăng nhập JWT, RBAC
│   │   │   │   ├── events.routes.ts     # CRUD sự kiện, phiên, optimistic lock
│   │   │   │   ├── holds.routes.ts      # Giữ ghế (Pessimistic / CAS / Naive)
│   │   │   │   ├── bookings.routes.ts   # Thanh toán mock, xuất vé QR, huỷ vé
│   │   │   │   ├── waitlist.routes.ts   # Hàng đợi chờ tự động
│   │   │   │   ├── checkin.routes.ts    # Quét QR cửa, chống quét 2 lần
│   │   │   │   ├── reports.routes.ts    # Báo cáo điểm danh & xuất CSV
│   │   │   │   └── admin.routes.ts      # Kiểm tra integrity SQL & mô phỏng
│   │   │   └── main.ts       # Khởi chạy server & seeder dữ liệu mẫu
│   │   └── test/
│   │       └── concurrency.test.ts  # Vitest kiểm thử 100 request đồng thời
│   └── web/                  # Frontend Next.js 16 (App Router) + Tailwind CSS
│       ├── src/app/
│       │   ├── page.tsx                 # Khám phá sự kiện, tìm kiếm, lọc
│       │   ├── events/[id]/page.tsx     # Chi tiết sự kiện & đặt vé GA
│       │   ├── events/[id]/seats/       # Sơ đồ ghế SVG tương tác + đếm ngược 10p
│       │   ├── bookings/page.tsx        # Vé của tôi, QR code HMAC, huỷ vé
│       │   ├── checkin/page.tsx         # Màn hình nhân viên quét QR soát vé
│       │   ├── organiser/page.tsx       # Studio BTC: tạo sơ đồ lưới, analytics
│       │   └── simulate/page.tsx        # Phòng lab mô phỏng ticket drop & concurrency
```

---

## 2. Các chiến lược Concurrency cốt lõi

### 2.1. Pessimistic Row-Level Lock (`ORDER BY id ASC FOR UPDATE`)
- Khi người dùng chọn nhiều ghế cùng lúc, truy vấn SQL sắp xếp danh sách ghế theo `ORDER BY id ASC` trước khi thực thi `FOR UPDATE`.
- **Lợi ích:** Tránh hoàn toàn lỗi **Deadlock** khi hai người dùng chọn chéo các ghế (User A: ghế 1 & 2; User B: ghế 2 & 1).
- Nếu bất kỳ ghế nào đã bị giữ hoặc bán, transaction ngay lập tức `ROLLBACK` và trả về `409 SEAT_UNAVAILABLE` (all-or-nothing).

### 2.2. Conditional Compare-and-Set (CAS)
- Thực hiện một câu lệnh `UPDATE` điều kiện duy nhất:
  ```sql
  UPDATE event_seats
  SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
  WHERE id = $3 AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < now()))
  RETURNING id;
  ```
- Nếu số hàng bị ảnh hưởng trả về bằng 0 $\rightarrow$ xung đột ghế $\rightarrow$ trả về `409`.

### 2.3. Lưới an toàn cuối cùng: PostgreSQL Partial Unique Index
- Bất kể tầng logic ứng dụng gặp sự cố gì, database PostgreSQL vẫn chặn đứng trùng vé:
  ```sql
  CREATE UNIQUE INDEX uniq_active_ticket_per_seat
    ON tickets (event_seat_id)
    WHERE status = 'ACTIVE' AND event_seat_id IS NOT NULL;
  ```
- Không bao giờ có 2 vé `ACTIVE` cùng trỏ về một ghế trong bất kỳ tình huống nào!

### 2.4. Cơ chế Lazy Expiry & Worker Background
- **Lazy Expiry:** Bất kỳ câu lệnh đọc hoặc giữ ghế nào đều kiểm tra `(status = 'HELD' AND hold_expires_at < now())` như một ghế trống.
- **Worker dọn dẹp:** Chạy định kỳ mỗi 10 giây để phát hiện các ghế hết hạn, giải phóng trạng thái về `AVAILABLE`, phát thông báo realtime qua SSE và tự động cấp offer cho người đứng đầu danh sách chờ (Waitlist) bằng `FOR UPDATE SKIP LOCKED`.

### 2.5. Idempotency-Key
- Header `Idempotency-Key` được lưu trữ trong bảng `idempotency_records`. Khi client retry do timeout mạng, server trả về kết quả đã xử lý mà không tạo booking thứ hai.

---

## 3. Tài khoản Demo kiểm thử nhanh (1-Click Switcher)

Hệ thống có sẵn thanh đổi vai trò ngay trên góc phải Navbar:

| Vai trò | Email | Mật khẩu | Chức năng kiểm thử |
|---|---|---|---|
| **Attendee** | `alice@example.com` | `password123` | Chọn ghế trên sơ đồ SVG, giữ chỗ 10 phút, thanh toán, xem vé QR |
| **Organiser** | `organiser@techsummit.io` | `password123` | Quản trị sự kiện, tạo sơ đồ ghế lưới, xem biểu đồ điểm danh, xuất CSV |
| **Gate Staff** | `staff@eventplatform.com` | `password123` | Quét mã QR tại cửa, chặn quét 2 lần, xem lịch sử quét |
| **Admin** | `admin@eventplatform.com` | `password123` | Chạy truy vấn SQL Integrity, kiểm thử ticket drop tải cao |

---

## 4. Hướng dẫn khởi chạy dự án

### Bước 1: Khởi động Cơ sở dữ liệu PostgreSQL 18
Mở PowerShell tại thư mục `pj1`:
```powershell
rtk powershell -ExecutionPolicy Bypass -File scripts\start-db.ps1
```
*(Cụm PostgreSQL độc lập sẽ lắng nghe trên cổng 5433, database `event_platform`, user `postgres`)*

### Bước 2: Khởi động Backend API
```powershell
rtk pnpm --filter event-platform-api dev
```
*(Backend chạy trên `http://localhost:4000`, tự động khởi chạy worker và seeder dữ liệu)*

### Bước 3: Khởi động Frontend Web
```powershell
rtk pnpm --filter web dev
```
*(Frontend chạy trên `http://localhost:3000`)*

---

## 5. Kịch bản Trình diễn & Kiểm thử Concurrency

### Kịch bản A: Trực quan trên giao diện Web (`/simulate`)
1. Truy cập `http://localhost:3000/simulate`.
2. Chọn phiên sự kiện, chọn **100 Parallel Requests** tranh chấp **5 ghế**.
3. Chọn chiến lược:
   - **Pessimistic Lock:** Đúng 5 người thắng (201 Success), 95 người nhận 409 Conflict, 0 lỗi 500. Huy hiệu SQL Integrity màu xanh: **PASSED (0 Violations)**.
   - **Naive (No Lock):** Tất cả 100 người nhận thông báo thành công ảo (Lost updates/Double bookings).
4. Bấm nút **"Run SQL Integrity Query"** để chạy trực tiếp 3 truy vấn SQL kiểm tra toàn vẹn hệ thống:
   - Kiểm tra ghế có > 1 vé ACTIVE.
   - Kiểm tra trạng thái ghế `BOOKED` nhưng không có vé tương ứng.
   - Kiểm tra General Admission vượt sức chứa `reserved > capacity`.

### Kịch bản B: Chạy kiểm thử tự động Vitest
```powershell
rtk pnpm --filter event-platform-api test
```
Tất cả 3 test cases về concurrency (Pessimistic, CAS, SQL Integrity) vượt qua 100% trong ~600ms!

---

## 6. Chính sách Huỷ vé & Chống quét 2 lần

- **Huỷ vé tự động:** Người dùng có thể huỷ vé trước hạn chót (`cancel_deadline_hours`). Hệ thống tính toán % hoàn tiền chính xác, trả ghế về kho `AVAILABLE`, và kích hoạt tự động offer giữ chỗ 24h cho người trong hàng đợi Waitlist.
- **Bảo mật vé QR:** Mã vé được tạo bởi:
  `code = base64url(ticketId) + "." + base64url(HMAC_SHA256(secret, ticketId))`
  Nhân viên cửa quét qua giao diện `/checkin`: lần quét đầu tiên thành công; lần quét thứ hai ngay lập tức bị từ chối với thông báo `ALREADY_CHECKED_IN` kèm thời điểm quét trước đó.
