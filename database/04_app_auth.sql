-- =====================================================================
-- 04_app_auth.sql: bảng tài khoản đăng nhập cho giao diện web
-- Chạy SAU 01 -> 02 -> 03. Có thể chạy lại nhiều lần.
--
-- Bảng này KHÔNG thuộc 14 bảng của báo cáo: nó là phần mở rộng ở tầng
-- ứng dụng, dùng để nhân viên (library_staff) đăng nhập vào giao diện.
-- Mật khẩu được lưu dưới dạng băm bcrypt, không bao giờ lưu bản rõ.
--
-- Tài khoản mặc định (đổi ngay khi dùng thật):
--   huong / admin123   -> Nguyễn Thị Hương, Thủ thư trưởng (admin)
--   khoa  / thuthu123  -> Trần Văn Khoa, Thủ thư (librarian)
--   lan   / thuthu123  -> Lê Thị Lan, Thủ thư (librarian)
-- =====================================================================
USE library_db;
SET NAMES utf8mb4;

DROP TABLE IF EXISTS staff_account;

CREATE TABLE staff_account (
    staff_id      INT PRIMARY KEY,                       -- 1-1 với library_staff
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,                 -- bcrypt
    role          ENUM('admin','librarian') NOT NULL DEFAULT 'librarian',
    last_login    DATETIME NULL,
    FOREIGN KEY (staff_id) REFERENCES library_staff(staff_id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO staff_account (staff_id, username, password_hash, role) VALUES
    (1, 'huong', '$2b$10$7jgTmsK7h.7ZzYDabuu0iu/hkS4F38oDSxweeptNku7c8HKsOvN1G', 'admin'),
    (2, 'khoa',  '$2b$10$Zw6Us5HOaLhqmgeqDqdOw.6UgnA6650Qkl/mqtLqFiH.gx4qzlG4a', 'librarian'),
    (3, 'lan',   '$2b$10$Zw6Us5HOaLhqmgeqDqdOw.6UgnA6650Qkl/mqtLqFiH.gx4qzlG4a', 'librarian');
