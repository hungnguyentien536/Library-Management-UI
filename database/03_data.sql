-- =====================================================================
-- data.sql: dữ liệu mẫu cho library_db
-- Thứ tự chạy: schema.sql -> routines.sql -> data.sql
-- Có thể chạy lại nhiều lần (xóa sạch dữ liệu cũ rồi nạp lại từ đầu).
-- Mốc thời gian của dữ liệu: "hôm nay" = 2026-10-23.
-- ISBN, năm xuất bản và nhà xuất bản chỉ là dữ liệu mẫu, không dùng để tra cứu thật.
-- =====================================================================
USE library_db;
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 0. Xóa dữ liệu cũ (TRUNCATE cũng đặt lại AUTO_INCREMENT về 1)
-- ---------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE fine_payment;
TRUNCATE TABLE fine_due;
TRUNCATE TABLE book_request;
TRUNCATE TABLE book_issue;
TRUNCATE TABLE book_author;
TRUNCATE TABLE members;
TRUNCATE TABLE book;
TRUNCATE TABLE book_request_status;
TRUNCATE TABLE member_status;
TRUNCATE TABLE library_staff;
TRUNCATE TABLE author;
TRUNCATE TABLE location;
TRUNCATE TABLE publisher;
TRUNCATE TABLE category;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. Bảng độc lập
-- ---------------------------------------------------------------------
INSERT INTO category (category_name) VALUES
    ('Văn học'),               -- 1
    ('Lịch sử'),               -- 2
    ('Kinh tế - Kỹ năng'),     -- 3
    ('Khoa học tự nhiên'),     -- 4
    ('Công nghệ thông tin'),   -- 5
    ('Thiếu nhi');             -- 6

INSERT INTO publisher (publisher_name) VALUES
    ('NXB Kim Đồng'),          -- 1
    ('NXB Trẻ'),               -- 2
    ('NXB Văn học'),           -- 3
    ('NXB Thế giới'),          -- 4
    ('NXB Tổng hợp TP.HCM'),   -- 5
    ('Pearson'),               -- 6
    ('McGraw-Hill'),           -- 7
    ('MIT Press'),             -- 8
    ('No Starch Press'),       -- 9
    ('Wiley');                 -- 10

INSERT INTO location (shelf_no, shelf_name, floor_no) VALUES
    ('A1', 'Văn học', 1),                 -- 1
    ('A2', 'Thiếu nhi', 1),               -- 2
    ('B1', 'Lịch sử - Kinh tế', 2),       -- 3
    ('B2', 'Khoa học tự nhiên', 2),       -- 4
    ('C1', 'Công nghệ thông tin', 3);     -- 5

-- Tên người Việt: last_name = họ và tên đệm, first_name = tên gọi
INSERT INTO author (first_name, last_name) VALUES
    ('Ánh', 'Nguyễn Nhật'),        -- 1
    ('Hoài', 'Tô'),                -- 2
    ('Du', 'Nguyễn'),              -- 3
    ('Cao', 'Nam'),                -- 4
    ('Phụng', 'Vũ Trọng'),         -- 5
    ('Quán', 'Phùng'),             -- 6
    ('Paulo', 'Coelho'),           -- 7
    ('Antoine de', 'Saint-Exupéry'), -- 8
    ('J.K.', 'Rowling'),           -- 9
    ('Dale', 'Carnegie'),          -- 10
    ('Robert T.', 'Kiyosaki'),     -- 11
    ('Benjamin', 'Graham'),        -- 12
    ('Yuval Noah', 'Harari'),      -- 13
    ('Stephen', 'Hawking'),        -- 14
    ('Robert C.', 'Martin'),       -- 15
    ('Andrew', 'Hunt'),            -- 16
    ('David', 'Thomas'),           -- 17
    ('Abraham', 'Silberschatz'),   -- 18
    ('Henry F.', 'Korth'),         -- 19
    ('S.', 'Sudarshan'),           -- 20
    ('Thomas H.', 'Cormen'),       -- 21
    ('Charles E.', 'Leiserson'),   -- 22
    ('Peter Baer', 'Galvin'),      -- 23
    ('Greg', 'Gagne'),             -- 24
    ('Eric', 'Matthes'),           -- 25
    ('Jared', 'Diamond');          -- 26

-- Các giá trị 'active' ở đây là điều kiện để trigger cho phép mượn sách
INSERT INTO member_status (account_type, account_status) VALUES
    ('standard', 'active'),        -- 1
    ('standard', 'suspended'),     -- 2
    ('standard', 'expired'),       -- 3
    ('premium',  'active'),        -- 4
    ('premium',  'suspended'),     -- 5
    ('premium',  'expired');       -- 6

INSERT INTO book_request_status (available_status) VALUES
    ('pending'),                   -- 1: đang chờ sách
    ('available'),                 -- 2: sách đã sẵn sàng
    ('fulfilled'),                 -- 3: đã nhận sách
    ('cancelled');                 -- 4: đã hủy

INSERT INTO library_staff (staff_name, staff_designation) VALUES
    ('Nguyễn Thị Hương', 'Thủ thư trưởng'),   -- 1
    ('Trần Văn Khoa', 'Thủ thư'),             -- 2
    ('Lê Thị Lan', 'Thủ thư');                -- 3

-- ---------------------------------------------------------------------
-- 2. Sách: 25 đầu sách. copies_available tạm = copies_total,
--    sẽ được tính lại ở cuối file theo số phiếu đang mượn.
-- ---------------------------------------------------------------------
INSERT INTO book
    (isbn_code, book_title, category_id, publisher_id, publication_year, book_edition,
     book_language, publication_type, copies_total, copies_available, location_id)
VALUES
    ('9786040000011', 'Mắt biếc',                              1, 2, 2019, 'Tái bản 2019', 'Tiếng Việt', 'Sách in', 4, 4, 1),  -- 1
    ('9786040000028', 'Cho tôi xin một vé đi tuổi thơ',        1, 2, 2018, 'Tái bản 2018', 'Tiếng Việt', 'Sách in', 3, 3, 1),  -- 2
    ('9786040000035', 'Dế Mèn phiêu lưu ký',                   6, 1, 2020, 'Tái bản 2020', 'Tiếng Việt', 'Sách in', 5, 5, 2),  -- 3
    ('9786040000042', 'Truyện Kiều',                           1, 3, 2017, 'Tái bản 2017', 'Tiếng Việt', 'Sách in', 3, 3, 1),  -- 4
    ('9786040000059', 'Chí Phèo',                              1, 3, 2016, 'Tái bản 2016', 'Tiếng Việt', 'Sách in', 2, 2, 1),  -- 5
    ('9786040000066', 'Số đỏ',                                 1, 3, 2018, 'Tái bản 2018', 'Tiếng Việt', 'Sách in', 2, 2, 1),  -- 6
    ('9786040000073', 'Tuổi thơ dữ dội',                       1, 1, 2019, 'Tái bản 2019', 'Tiếng Việt', 'Sách in', 2, 2, 1),  -- 7
    ('9786040000080', 'Nhà giả kim',                           1, 3, 2020, 'Tái bản 2020', 'Tiếng Việt', 'Sách in', 3, 3, 1),  -- 8
    ('9786040000097', 'Hoàng tử bé',                           6, 1, 2021, 'Tái bản 2021', 'Tiếng Việt', 'Sách in', 4, 4, 2),  -- 9
    ('9786040000103', 'Harry Potter và Hòn đá Phù thủy',       6, 2, 2017, 'Tái bản 2017', 'Tiếng Việt', 'Sách in', 1, 1, 2),  -- 10
    ('9786040000110', 'Đắc nhân tâm',                          3, 5, 2021, 'Tái bản 2021', 'Tiếng Việt', 'Sách in', 4, 4, 3),  -- 11
    ('9786040000127', 'Cha giàu cha nghèo',                    3, 2, 2019, 'Tái bản 2019', 'Tiếng Việt', 'Sách in', 3, 3, 3),  -- 12
    ('9786040000134', 'Nhà đầu tư thông minh',                 3, 4, 2020, 'Tái bản 2020', 'Tiếng Việt', 'Sách in', 2, 2, 3),  -- 13
    ('9786040000141', 'Sapiens: Lược sử loài người',           2, 4, 2020, 'Tái bản 2020', 'Tiếng Việt', 'Sách in', 3, 3, 3),  -- 14
    ('9786040000158', 'Homo Deus: Lược sử tương lai',          2, 4, 2019, 'Tái bản 2019', 'Tiếng Việt', 'Sách in', 2, 2, 3),  -- 15
    ('9786040000165', 'Lược sử thời gian',                     4, 2, 2018, 'Tái bản 2018', 'Tiếng Việt', 'Sách in', 3, 3, 4),  -- 16
    ('9786040000172', 'Vũ trụ trong vỏ hạt dẻ',                4, 2, 2019, 'Tái bản 2019', 'Tiếng Việt', 'Sách in', 2, 2, 4),  -- 17
    ('9786040000189', 'Clean Code',                            5, 6, 2008, '1st edition',  'Tiếng Anh',  'Sách in', 3, 3, 5),  -- 18
    ('9786040000196', 'Clean Architecture',                    5, 6, 2017, '1st edition',  'Tiếng Anh',  'Sách in', 2, 2, 5),  -- 19
    ('9786040000202', 'The Pragmatic Programmer',              5, 6, 2019, '20th anniversary', 'Tiếng Anh', 'Sách in', 2, 2, 5), -- 20
    ('9786040000219', 'Database System Concepts',             5, 7, 2019, '7th edition',  'Tiếng Anh',  'Sách in', 4, 4, 5),  -- 21
    ('9786040000226', 'Introduction to Algorithms',            5, 8, 2022, '4th edition',  'Tiếng Anh',  'Sách in', 1, 1, 5),  -- 22
    ('9786040000233', 'Operating System Concepts',             5, 10, 2018, '10th edition', 'Tiếng Anh', 'Sách in', 2, 2, 5),  -- 23
    ('9786040000240', 'Python Crash Course',                   5, 9, 2023, '3rd edition',  'Tiếng Anh',  'Sách in', 3, 3, 5),  -- 24
    ('9786040000257', 'Súng, vi trùng và thép',                2, 4, 2021, 'Tái bản 2021', 'Tiếng Việt', 'Sách in', 2, 2, 3);  -- 25

-- Quan hệ nhiều-nhiều: sách 20, 21, 22, 23 có nhiều tác giả
INSERT INTO book_author (book_id, author_id) VALUES
    (1, 1), (2, 1), (3, 2), (4, 3), (5, 4), (6, 5), (7, 6), (8, 7), (9, 8), (10, 9),
    (11, 10), (12, 11), (13, 12), (14, 13), (15, 13), (16, 14), (17, 14), (18, 15), (19, 15),
    (20, 16), (20, 17),
    (21, 18), (21, 19), (21, 20),
    (22, 21), (22, 22),
    (23, 18), (23, 23), (23, 24),
    (24, 25), (25, 26);

-- ---------------------------------------------------------------------
-- 3. Độc giả: 12 người. 8 = chưa từng mượn, 9 = bị khóa vì nợ phạt,
--    10 = thẻ hết hạn.
-- ---------------------------------------------------------------------
INSERT INTO members
    (first_name, last_name, city, mobile_no, email_id, date_of_birth,
     active_status_id, membership_start_date, membership_end_date)
VALUES
    ('An',    'Nguyễn Văn',  'Hà Nội',          '0912345601', 'an.nguyen@example.com',    '2003-05-14', 1, '2025-09-01', '2027-08-31'),  -- 1
    ('Bích',  'Trần Thị',    'TP. Hồ Chí Minh', '0912345602', 'bich.tran@example.com',    '2002-11-02', 1, '2025-09-05', '2027-09-04'),  -- 2
    ('Cường', 'Lê Hoàng',    'Đà Nẵng',         '0912345603', 'cuong.le@example.com',     '2001-03-21', 4, '2025-01-10', '2027-01-09'),  -- 3
    ('Dũng',  'Phạm Minh',   'Hà Nội',          '0912345604', 'dung.pham@example.com',    '2004-07-30', 1, '2026-01-15', '2027-01-14'),  -- 4
    ('Hà',    'Hoàng Thu',   'Huế',             '0912345605', 'ha.hoang@example.com',     '2000-12-08', 1, '2025-10-20', '2027-10-19'),  -- 5
    ('Huy',   'Vũ Quốc',     'Cần Thơ',         '0912345606', 'huy.vu@example.com',       '2002-02-17', 1, '2025-11-03', '2027-11-02'),  -- 6
    ('Lan',   'Đặng Ngọc',   'TP. Hồ Chí Minh', '0912345607', 'lan.dang@example.com',     '1999-09-25', 4, '2025-06-12', '2027-06-11'),  -- 7
    ('Mai',   'Bùi Thanh',   'Hà Nội',          '0912345608', 'mai.bui@example.com',      '2005-01-09', 1, '2026-09-20', '2027-09-19'),  -- 8
    ('Nam',   'Đỗ Khánh',    'Đà Nẵng',         '0912345609', 'nam.do@example.com',       '2001-08-19', 2, '2025-03-01', '2027-02-28'),  -- 9
    ('Oanh',  'Ngô Phương',  'Hải Phòng',       '0912345610', 'oanh.ngo@example.com',     '2000-04-04', 3, '2024-09-01', '2025-08-31'),  -- 10
    ('Phúc',  'Lý Gia',      'Cần Thơ',         '0912345611', 'phuc.ly@example.com',      '2003-10-12', 1, '2026-02-01', '2027-01-31'),  -- 11
    ('Quân',  'Phan Tuấn',   'Hà Nội',          '0912345612', 'quan.phan@example.com',    '1998-06-28', 4, '2025-08-15', '2027-08-14');  -- 12

-- ---------------------------------------------------------------------
-- 4. Phiếu mượn (hạn mượn 14 ngày). 24 phiếu.
--    Phiếu đã có return_date là dữ liệu lịch sử: trigger bỏ qua, không trừ kho.
--    Phiếu chưa trả: trigger kiểm tra tài khoản, giới hạn 5 cuốn và trừ kho.
-- ---------------------------------------------------------------------
INSERT INTO book_issue
    (book_id, member_id, issued_by_id, issue_date, due_date, return_date, issue_status)
VALUES
    -- Đã trả đúng hạn
    (1,  1,  1, '2026-08-03', '2026-08-17', '2026-08-15', 'returned'),  -- 1
    (3,  2,  2, '2026-08-05', '2026-08-19', '2026-08-18', 'returned'),  -- 2
    (11, 3,  1, '2026-08-10', '2026-08-24', '2026-08-20', 'returned'),  -- 3
    (14, 4,  2, '2026-08-12', '2026-08-26', '2026-08-25', 'returned'),  -- 4
    (18, 6,  3, '2026-08-14', '2026-08-28', '2026-08-27', 'returned'),  -- 5
    (1,  7,  1, '2026-08-20', '2026-09-03', '2026-09-01', 'returned'),  -- 6
    (14, 12, 2, '2026-09-01', '2026-09-15', '2026-09-10', 'returned'),  -- 7
    (21, 11, 3, '2026-09-02', '2026-09-16', '2026-09-14', 'returned'),  -- 8
    -- Đã trả muộn (có khoản phạt ở mục 5)
    (8,  9,  1, '2026-07-01', '2026-07-15', '2026-07-25', 'returned'),  -- 9   trễ 10 ngày
    (12, 9,  2, '2026-07-10', '2026-07-24', '2026-08-03', 'returned'),  -- 10  trễ 10 ngày
    (5,  2,  1, '2026-08-25', '2026-09-08', '2026-09-15', 'returned'),  -- 11  trễ 7 ngày
    (16, 5,  3, '2026-09-05', '2026-09-19', '2026-09-26', 'returned'),  -- 12  trễ 7 ngày
    (20, 6,  2, '2026-09-10', '2026-09-24', '2026-09-29', 'returned'),  -- 13  trễ 5 ngày
    (7,  3,  1, '2026-08-28', '2026-09-11', '2026-09-13', 'returned'),  -- 14  trễ 2 ngày
    -- Thẻ cũ đã hết hạn của độc giả 10
    (4,  10, 1, '2025-06-01', '2025-06-15', '2025-06-14', 'returned'),  -- 15
    -- Đang mượn, chưa đến hạn
    (2,  1,  1, '2026-10-12', '2026-10-26', NULL, 'issued'),            -- 16
    (14, 3,  2, '2026-10-15', '2026-10-29', NULL, 'issued'),            -- 17
    (22, 4,  3, '2026-10-18', '2026-11-01', NULL, 'issued'),            -- 18  cuốn duy nhất, đang có người chờ
    (18, 12, 1, '2026-10-20', '2026-11-03', NULL, 'issued'),            -- 19
    -- Quá hạn chưa trả
    (10, 2,  2, '2026-10-01', '2026-10-15', NULL, 'overdue'),           -- 20  cuốn duy nhất
    (21, 5,  1, '2026-09-28', '2026-10-12', NULL, 'overdue'),           -- 21
    (3,  6,  3, '2026-10-03', '2026-10-17', NULL, 'overdue'),           -- 22
    (16, 11, 2, '2026-09-25', '2026-10-09', NULL, 'overdue'),           -- 23
    -- Báo mất sách
    (13, 7,  1, '2026-08-30', '2026-09-13', NULL, 'lost');              -- 24

-- ---------------------------------------------------------------------
-- 5. Phạt (2.000 VND mỗi ngày trễ) và thanh toán
-- ---------------------------------------------------------------------
INSERT INTO fine_due (issue_id, fine_date, fine_total) VALUES
    (9,  '2026-07-25', 20000),
    (10, '2026-08-03', 20000),
    (11, '2026-09-15', 14000),
    (12, '2026-09-26', 14000),
    (13, '2026-09-29', 10000),
    (14, '2026-09-13',  4000),
    (24, '2026-09-20', 80000);   -- bồi thường sách bị mất

INSERT INTO fine_payment (member_id, payment_date, payment_amount) VALUES
    (9,  '2026-08-10', 20000),   -- còn nợ 20.000
    (2,  '2026-09-20', 14000),   -- hết nợ
    (5,  '2026-09-30', 14000),   -- hết nợ
    (6,  '2026-10-01', 10000),   -- hết nợ
    (7,  '2026-10-05', 30000);   -- còn nợ 50.000
    -- độc giả 3 còn nợ 4.000

-- ---------------------------------------------------------------------
-- 6. Yêu cầu đặt sách
-- ---------------------------------------------------------------------
INSERT INTO book_request
    (book_id, member_id, request_date, available_status_id, nearest_available_date)
VALUES
    (22, 8,  '2026-10-19', 1, '2026-11-01'),   -- chờ cuốn đang mượn, dự kiến có lại 01/11
    (22, 12, '2026-10-21', 1, '2026-11-01'),
    (10, 7,  '2026-10-10', 1, NULL),           -- sách đang quá hạn, chưa biết ngày có lại
    (8,  4,  '2026-09-20', 3, NULL),
    (14, 1,  '2026-08-28', 2, NULL),
    (21, 10, '2026-05-01', 4, NULL);

-- ---------------------------------------------------------------------
-- 7. Đồng bộ copies_available = tổng số bản - số phiếu chưa trả
--    (cho kết quả đúng dù trigger đã được cài hay chưa)
-- ---------------------------------------------------------------------
UPDATE book b
SET b.copies_available = b.copies_total - (
    SELECT COUNT(*) FROM book_issue bi
    WHERE bi.book_id = b.book_id AND bi.return_date IS NULL);

-- ---------------------------------------------------------------------
-- 8. Kiểm tra nhanh số dòng
-- ---------------------------------------------------------------------
SELECT 'category' AS bang, COUNT(*) AS so_dong FROM category
UNION ALL SELECT 'publisher', COUNT(*) FROM publisher
UNION ALL SELECT 'location', COUNT(*) FROM location
UNION ALL SELECT 'author', COUNT(*) FROM author
UNION ALL SELECT 'book', COUNT(*) FROM book
UNION ALL SELECT 'book_author', COUNT(*) FROM book_author
UNION ALL SELECT 'members', COUNT(*) FROM members
UNION ALL SELECT 'library_staff', COUNT(*) FROM library_staff
UNION ALL SELECT 'book_issue', COUNT(*) FROM book_issue
UNION ALL SELECT 'book_request', COUNT(*) FROM book_request
UNION ALL SELECT 'fine_due', COUNT(*) FROM fine_due
UNION ALL SELECT 'fine_payment', COUNT(*) FROM fine_payment;
