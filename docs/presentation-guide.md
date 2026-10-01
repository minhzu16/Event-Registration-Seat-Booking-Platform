# Hướng Dẫn Thuyết Trình & Kịch Bản Demo Concurrency (SeatLock)

> **Tài liệu hướng dẫn bảo vệ đồ án / thuyết trình kỹ thuật về Hệ thống Đặt Vé & Chống Trùng Ghế Tải Cao.**
> Áp dụng trực tiếp kịch bản 7 bước tại Mục 14 của Đề bài.

---

## 1. Tóm tắt Đề tài & Vấn đề Cốt lõi (2 Phút)

### Bản chất bài toán Concurrency trong Đặt vé
```
Thời gian ─────────────────────────────────────────────────────────────►
User A: Đọc ghế A1 (AVAILABLE) ────────────── Ghi A1 = BOOKED(User A)
User B:     Đọc ghế A1 (AVAILABLE) ────────────── Ghi A1 = BOOKED(User B)
                                                  ▲
                                         [LOST UPDATE / DOUBLE BOOKING]
```
- **Nguyên nhân gốc rễ:** Chu trình **"Đọc - Kiểm tra - Ghi" (Read-Modify-Write)** không được thực thi một cách **nguyên tử (atomic)**. Khi có hàng trăm đến hàng nghìn người cùng tranh mua trong các đợt mở bán vé (Flash sale / Ticket drop), hệ thống thiếu cơ chế đồng bộ hóa sẽ tạo ra thảm họa vé trùng.
- **Mục tiêu hệ thống:** Đạt **0% trùng vé** trong mọi bài kiểm thử tải, đảm bảo trải nghiệm người dùng với độ trễ thấp ($P95 < 300\text{ ms}$), hỗ trợ đồng hồ giữ chỗ 10 phút, sơ đồ ghế SVG cập nhật realtime và mã vé bảo mật bằng chữ ký số HMAC.

---

## 2. Kịch bản Thuyết trình & Demo Thực nghiệm 7 Bước

### Bước 1: Trình diễn lỗi Race Condition với chế độ Naive (3 Phút)
- **Mục đích:** Chứng minh rằng nếu không có khóa đồng thời, lỗi bán trùng ghế chắc chắn xảy ra.
- **Thao tác:**
  1. Mở giao diện **Concurrency Lab** tại [http://localhost:3000/simulate](http://localhost:3000/simulate).
  2. Chọn phiên sự kiện, chọn **100 Parallel Requests** tranh chấp **5 ghế**.
  3. Chọn chiến lược: **Naive / No Lock (Demo Bug)**.
  4. Bấm **"Launch Ticket Drop Simulation"**.
  5. **Quan sát kết quả:** Cả 100 requests đều báo thành công ảo (`Won: 100`, `Rejected: 0`). Truy vấn SQL kiểm tra toàn vẹn phát hiện xung đột dữ liệu nghiêm trọng!

---

### Bước 2: Khắc phục triệt để bằng Khóa dòng Pessimistic & Conditional CAS (5 Phút)
- **Mục đích:** Chứng minh tính đúng đắn tuyệt đối của 2 kỹ thuật khóa chính.
- **Thao tác:**
  1. Vẫn tại trang [http://localhost:3000/simulate](http://localhost:3000/simulate), chuyển sang:
     - **Pessimistic Lock (`SELECT ... FOR UPDATE ORDER BY id`)**: Sắp xếp khóa theo ID tăng dần để chống Deadlock.
     - Hoặc **Conditional Compare-and-Set (CAS)**: Câu lệnh `UPDATE` điều kiện nguyên tử đơn lẻ.
  2. Bấm **"Launch Ticket Drop Simulation"**.
  3. **Kết quả thu được:**
     - **Số ghế thành công (201):** Đúng **5** người (ứng với đúng 5 ghế).
     - **Số request bị từ chối an toàn (409):** Đúng **95** người.
     - **Lỗi 500 (Deadlock/Server Error):** **0**.
     - **Thông số hiệu năng:** Throughput đạt **2,800 ~ 7,000+ RPS**, độ trễ $P95 < 30\text{ ms}$.
  4. Huy hiệu SQL Integrity hiện màu xanh: **PASSED (0 Violations)**.

---

### Bước 3: Kiểm chứng trực quan 2 Trình duyệt song song (Realtime SSE) (2 Phút)
- **Mục đích:** Trình diễn trải nghiệm thực tế của người dùng khi có người khác giữ chỗ.
- **Thao tác:**
  1. Mở 2 cửa sổ trình duyệt cạnh nhau (Cửa sổ 1: Chrome bình thường; Cửa sổ 2: Ẩn danh Incognito) cùng vào trang [Sơ đồ ghế](http://localhost:3000/events).
  2. Tại Cửa sổ 1: Bấm chọn ghế **A1** và bấm **"Hold Seats (10 Mins)"**.
  3. Ngay lập tức tại Cửa sổ 2: Ghế **A1 chuyển sang màu đỏ (Held by others)** theo thời gian thực qua Server-Sent Events (SSE) mà không cần bấm F5 tải lại trang.
  4. Nếu Cửa sổ 2 cố tình gọi API giữ ghế A1 $\rightarrow$ Backend lập tức trả về mã `409 SEAT_UNAVAILABLE`.

---

### Bước 4: Hàng đợi Waitlist tự động & Quét QR soát vé tại cửa (3 Phút)
- **Mục đích:** Trình diễn tính năng chuyển nhượng chỗ trống tự động và quy trình soát vé chống gian lận.
- **Thao tác:**
  1. Người dùng A huỷ vé tại trang [My Bookings](http://localhost:3000/bookings). Hệ thống tính % tiền hoàn tự động theo chính sách.
  2. Ghế được nhả về kho `AVAILABLE`. Worker ngầm quét hàng đợi bằng `FOR UPDATE SKIP LOCKED` và tự động cấp offer giữ chỗ độc quyền 24h cho người đầu danh sách Waitlist.
  3. Vào trang [Check-in Staff](http://localhost:3000/checkin), quét mã vé QR của Người dùng A:
     - **Lần quét 1:** Duyệt xanh thành công $\rightarrow$ hiển thị đầy đủ tên người tham dự, hàng ghế, số ghế.
     - **Lần quét 2 (quét lại mã đó):** Ngay lập tức từ chối màu đỏ: `ALREADY_CHECKED_IN` kèm mốc thời gian chính xác đã quét trước đó.

---

### Bước 5: Lưới an toàn cuối cùng tại Cơ sở dữ liệu (Defense-in-Depth) (1 Phút)
- **Phân tích:** Giải thích cho hội đồng hiểu tại sao hệ thống không bao giờ có thể bị lỗi trùng vé kể cả khi sập tầng application:
  ```sql
  CREATE UNIQUE INDEX uniq_active_ticket_per_seat
    ON tickets (event_seat_id)
    WHERE status = 'ACTIVE' AND event_seat_id IS NOT NULL;
  ```
  Nếu có bất kỳ bug logic nào ở tầng Node.js lọt qua, câu lệnh `INSERT INTO tickets` sẽ bị database chặn đứng ngay lập tức với lỗi `unique_violation (23505)`.

---

### Bước 6: Kiến trúc Đa Instance (Distributed Concurrency) (2 Phút)
- **Giải thích:** Hệ thống được thiết kế theo `docker-compose.prod.yml` chạy **2 bản sao API song song (`replicas: 2`)** phía sau reverse proxy Caddy.
- Nhờ việc sử dụng **PostgreSQL làm nguồn sự thật duy nhất (Single Source of Truth)** kết hợp cơ chế khóa dòng nguyên tử, hệ thống đảm bảo tính toàn vẹn dữ liệu kể cả khi 2 requests được định tuyến vào 2 instance API hoàn toàn khác nhau.

---

## 3. Bảng Tổng Hợp So Sánh 3 Chiến Lược Concurrency

| Tiêu chí so sánh | Naive (Không khóa) | Conditional CAS | Pessimistic Lock (`ORDER BY id FOR UPDATE`) |
|---|---|---|---|
| **Bản chất kỹ thuật** | Đọc rồi ghi riêng rẽ | `UPDATE ... WHERE status='AVAILABLE'` | Khóa dòng độc quyền trong Transaction |
| **Khả năng chống Double-Booking** | ❌ **Thất bại** (Xung đột cao) | ✅ **100% Tuyệt đối** | ✅ **100% Tuyệt đối** |
| **Phù hợp chọn nhiều ghế** | Không an toàn | Cần kiểm tra số dòng bị ảnh hưởng | ⭐ **Hoàn hảo nhất** (All-or-Nothing, chống Deadlock) |
| **Throughput (100 reqs tranh 5 ghế)** | ~2,500 RPS (Kèm dữ liệu sai) | ~5,500 RPS | ~7,100 RPS |
| **Độ trễ P95** | 40 ms | 18 ms | 13 ms |
| **Khuyến nghị sử dụng** | Chỉ dùng để demo lỗi | Giữ 1 ghế lẻ / sự kiện GA | **Mặc định toàn hệ thống SeatLock** |

---

## 4. Danh sách Lệnh Thao Tác Nhanh (CLI Commands)

Chạy kiểm thử tải & đo lường bằng Terminal:
```powershell
# 1. Chạy đo benchmark so sánh 3 chiến lược (Xuất bảng ASCII):
rtk pnpm benchmark

# 2. Chạy toàn bộ test suites kiểm thử concurrency (Vitest):
rtk pnpm test

# 3. Chạy kiểm thử tải 200 lượt tranh vé và kiểm tra SQL Integrity tự động:
rtk powershell -ExecutionPolicy Bypass -File load-test\run-k6.ps1 -Iterations 200

# 4. Sao lưu cơ sở dữ liệu trước buổi demo:
rtk powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
```
