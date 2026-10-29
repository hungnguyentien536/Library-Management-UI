// Các đoạn SQL dùng lại ở nhiều route.

// Một phiếu mượn kèm tên sách, độc giả, nhân viên và trạng thái "tính ra".
// Cột issue_status trong bảng chỉ đổi khi trả sách (trigger) hoặc báo mất,
// nên trạng thái quá hạn được tính lại theo ngày hôm nay ở cột `state`:
//   lost      : báo mất
//   returned  : đã có return_date
//   overdue   : chưa trả và due_date < hôm nay
//   issued    : đang mượn, chưa đến hạn
// days_late: số ngày trễ tính đến hôm nay (nếu chưa trả) hoặc đến ngày trả.
const LOAN_SELECT = `
SELECT bi.issue_id, bi.book_id, b.book_title, b.isbn_code,
       bi.member_id, CONCAT(m.last_name, ' ', m.first_name) AS member_name, m.mobile_no,
       bi.issued_by_id, s.staff_name,
       bi.issue_date, bi.due_date, bi.return_date, bi.issue_status,
       CASE
         WHEN bi.issue_status = 'lost'   THEN 'lost'
         WHEN bi.return_date IS NOT NULL THEN 'returned'
         WHEN bi.due_date < CURDATE()    THEN 'overdue'
         ELSE 'issued'
       END AS state,
       CASE
         WHEN bi.issue_status = 'lost'   THEN NULL
         WHEN bi.return_date IS NOT NULL THEN GREATEST(DATEDIFF(bi.return_date, bi.due_date), 0)
         ELSE GREATEST(DATEDIFF(CURDATE(), bi.due_date), 0)
       END AS days_late,
       fd.fine_id, fd.fine_total, fd.fine_date
FROM book_issue bi
JOIN book b           ON b.book_id   = bi.book_id
JOIN members m        ON m.member_id = bi.member_id
JOIN library_staff s  ON s.staff_id  = bi.issued_by_id
LEFT JOIN fine_due fd ON fd.issue_id = bi.issue_id`;

// Danh sách độc giả kèm trạng thái tài khoản, số sách đang mượn và công nợ
// (công nợ lấy từ view v_member_fine_balance).
const MEMBER_SELECT = `
SELECT m.member_id, m.first_name, m.last_name,
       CONCAT(m.last_name, ' ', m.first_name) AS full_name,
       m.city, m.mobile_no, m.email_id, m.date_of_birth,
       m.membership_start_date, m.membership_end_date,
       m.active_status_id, ms.account_type, ms.account_status,
       (m.membership_end_date IS NOT NULL AND m.membership_end_date < CURDATE()) AS card_expired,
       (SELECT COUNT(*) FROM book_issue bi
         WHERE bi.member_id = m.member_id AND bi.return_date IS NULL AND bi.issue_status <> 'lost') AS active_loans,
       (SELECT COUNT(*) FROM book_issue bi
         WHERE bi.member_id = m.member_id AND bi.return_date IS NULL AND bi.issue_status <> 'lost'
           AND bi.due_date < CURDATE()) AS overdue_loans,
       fb.total_fine, fb.total_paid, fb.balance
FROM members m
JOIN member_status ms         ON ms.active_status_id = m.active_status_id
JOIN v_member_fine_balance fb ON fb.member_id = m.member_id`;

// Yêu cầu đặt sách; queue_ahead = số yêu cầu 'pending' cùng đầu sách được tạo trước
const REQUEST_SELECT = `
SELECT br.request_id, br.book_id, b.book_title, b.copies_available,
       br.member_id, CONCAT(m.last_name, ' ', m.first_name) AS member_name, m.mobile_no,
       br.request_date, rs.available_status AS status, br.nearest_available_date,
       (SELECT COUNT(*) FROM book_request x
          JOIN book_request_status xs ON xs.available_status_id = x.available_status_id
         WHERE x.book_id = br.book_id AND xs.available_status = 'pending'
           AND (x.request_date < br.request_date
                OR (x.request_date = br.request_date AND x.request_id < br.request_id))) AS queue_ahead
FROM book_request br
JOIN book b                 ON b.book_id = br.book_id
JOIN members m              ON m.member_id = br.member_id
JOIN book_request_status rs ON rs.available_status_id = br.available_status_id`;

module.exports = { LOAN_SELECT, MEMBER_SELECT, REQUEST_SELECT };
