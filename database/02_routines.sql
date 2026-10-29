-- =====================================================================
-- routines.sql: dữ liệu tham chiếu + trigger + procedure + view
-- Chạy SAU schema.sql. Có thể chạy lại nhiều lần.
-- =====================================================================
USE library_db;

DROP VIEW IF EXISTS v_book_catalog;
DROP VIEW IF EXISTS v_overdue_books;
DROP VIEW IF EXISTS v_member_fine_balance;
DROP PROCEDURE IF EXISTS sp_issue_book;
DROP PROCEDURE IF EXISTS sp_return_book;
DROP TRIGGER IF EXISTS trg_issue_before_insert;
DROP TRIGGER IF EXISTS trg_issue_before_update;
DROP TRIGGER IF EXISTS trg_issue_after_update;

-- ---------- Dữ liệu tham chiếu (trigger dựa vào giá trị 'active') ----------
INSERT IGNORE INTO member_status (account_type, account_status) VALUES
    ('standard','active'), ('standard','suspended'), ('standard','expired'),
    ('premium','active'),  ('premium','suspended'),  ('premium','expired');

INSERT IGNORE INTO book_request_status (available_status) VALUES
    ('pending'), ('available'), ('fulfilled'), ('cancelled');

-- ---------- Trigger: giữ copies_available luôn đúng ----------
-- Quy tắc: độc giả phải 'active'; tối đa 5 cuốn đang mượn.
DELIMITER $$

-- Phiếu có sẵn return_date (dữ liệu lịch sử) thì bỏ qua kiểm tra và không trừ kho.
CREATE TRIGGER trg_issue_before_insert
BEFORE INSERT ON book_issue
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(50);
    DECLARE v_active_loans INT;

    IF NEW.return_date IS NULL THEN
        SELECT ms.account_status INTO v_status
        FROM members m
        JOIN member_status ms ON ms.active_status_id = m.active_status_id
        WHERE m.member_id = NEW.member_id;

        IF v_status IS NULL OR v_status <> 'active' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Tai khoan doc gia khong o trang thai active';
        END IF;

        SELECT COUNT(*) INTO v_active_loans
        FROM book_issue
        WHERE member_id = NEW.member_id
          AND return_date IS NULL
          AND issue_status <> 'lost';

        IF v_active_loans >= 5 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Doc gia da muon toi da 5 cuon';
        END IF;

        -- Kiểm tra và trừ kho trong cùng một câu UPDATE (an toàn khi mượn đồng thời)
        UPDATE book
        SET copies_available = copies_available - 1
        WHERE book_id = NEW.book_id AND copies_available > 0;

        IF ROW_COUNT() = 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Sach da het ban sao co san';
        END IF;
    END IF;
END$$

-- Tự đổi trạng thái khi vừa được trả
CREATE TRIGGER trg_issue_before_update
BEFORE UPDATE ON book_issue
FOR EACH ROW
BEGIN
    IF OLD.return_date IS NULL AND NEW.return_date IS NOT NULL
       AND NEW.issue_status <> 'returned' THEN
        SET NEW.issue_status = 'returned';
    END IF;
END$$

-- Cộng lại kho đúng một lần, khi return_date chuyển NULL -> có giá trị
CREATE TRIGGER trg_issue_after_update
AFTER UPDATE ON book_issue
FOR EACH ROW
BEGIN
    IF OLD.return_date IS NULL AND NEW.return_date IS NOT NULL THEN
        UPDATE book
        SET copies_available = copies_available + 1
        WHERE book_id = NEW.book_id;
    END IF;
END$$

-- ---------- Stored procedure ----------
-- Mượn sách. p_days = NULL thì mặc định 14 ngày.
CREATE PROCEDURE sp_issue_book(
    IN p_book_id   INT,
    IN p_member_id INT,
    IN p_staff_id  INT,
    IN p_days      INT
)
BEGIN
    INSERT INTO book_issue (book_id, member_id, issued_by_id, issue_date, due_date)
    VALUES (p_book_id, p_member_id, p_staff_id,
            CURDATE(), DATE_ADD(CURDATE(), INTERVAL IFNULL(p_days, 14) DAY));
    SELECT LAST_INSERT_ID() AS issue_id;
END$$

-- Trả sách và tự tính phạt: 2.000 VND / ngày trễ.
CREATE PROCEDURE sp_return_book(IN p_issue_id INT)
BEGIN
    DECLARE v_due  DATE DEFAULT NULL;
    DECLARE v_late INT  DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT due_date INTO v_due
    FROM book_issue
    WHERE issue_id = p_issue_id AND return_date IS NULL
    FOR UPDATE;

    IF v_due IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Phieu muon khong ton tai hoac da duoc tra';
    END IF;

    UPDATE book_issue SET return_date = CURDATE() WHERE issue_id = p_issue_id;

    SET v_late = DATEDIFF(CURDATE(), v_due);
    IF v_late > 0 THEN
        INSERT INTO fine_due (issue_id, fine_date, fine_total)
        VALUES (p_issue_id, CURDATE(), v_late * 2000);
    END IF;

    COMMIT;
    SELECT v_late AS days_late, GREATEST(v_late, 0) * 2000 AS fine_amount;
END$$

DELIMITER ;

-- ---------- View ----------
-- Danh mục sách kèm thể loại, NXB, tác giả
CREATE VIEW v_book_catalog AS
SELECT b.book_id, b.isbn_code, b.book_title,
       c.category_name, p.publisher_name,
       GROUP_CONCAT(CONCAT(a.last_name, ' ', a.first_name)
                    ORDER BY a.last_name SEPARATOR ', ') AS authors,
       b.publication_year, b.book_language, b.publication_type,
       b.copies_total, b.copies_available,
       CONCAT('Tang ', l.floor_no, ' - Ke ', l.shelf_no) AS location_text
FROM book b
JOIN category c          ON c.category_id = b.category_id
JOIN publisher p         ON p.publisher_id = b.publisher_id
LEFT JOIN location l     ON l.location_id = b.location_id
LEFT JOIN book_author ba ON ba.book_id = b.book_id
LEFT JOIN author a       ON a.author_id = ba.author_id
GROUP BY b.book_id, b.isbn_code, b.book_title, c.category_name, p.publisher_name,
         b.publication_year, b.book_language, b.publication_type,
         b.copies_total, b.copies_available, l.floor_no, l.shelf_no;

-- Sách đang quá hạn chưa trả
CREATE VIEW v_overdue_books AS
SELECT bi.issue_id, m.member_id,
       CONCAT(m.last_name, ' ', m.first_name) AS member_name,
       m.mobile_no, b.book_title, bi.issue_date, bi.due_date,
       DATEDIFF(CURDATE(), bi.due_date) AS days_overdue
FROM book_issue bi
JOIN members m ON m.member_id = bi.member_id
JOIN book b    ON b.book_id = bi.book_id
WHERE bi.return_date IS NULL
  AND bi.issue_status <> 'lost'
  AND bi.due_date < CURDATE();

-- Công nợ phạt của từng độc giả (tổng phạt và tổng đã trả tính riêng rồi mới ghép,
-- tránh JOIN hai bảng 1-N cùng lúc làm nhân đôi dòng)
CREATE VIEW v_member_fine_balance AS
SELECT m.member_id,
       CONCAT(m.last_name, ' ', m.first_name) AS member_name,
       COALESCE(f.total_fine, 0) AS total_fine,
       COALESCE(p.total_paid, 0) AS total_paid,
       COALESCE(f.total_fine, 0) - COALESCE(p.total_paid, 0) AS balance
FROM members m
LEFT JOIN (SELECT bi.member_id, SUM(fd.fine_total) AS total_fine
           FROM fine_due fd
           JOIN book_issue bi ON bi.issue_id = fd.issue_id
           GROUP BY bi.member_id) f ON f.member_id = m.member_id
LEFT JOIN (SELECT member_id, SUM(payment_amount) AS total_paid
           FROM fine_payment
           GROUP BY member_id) p ON p.member_id = m.member_id;
