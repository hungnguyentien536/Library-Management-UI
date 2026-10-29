// Lỗi có mã HTTP rõ ràng, ném ra từ route để trả thông báo cho giao diện.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Trigger/procedure trong 02_routines.sql báo lỗi bằng SIGNAL SQLSTATE '45000'
// với thông báo không dấu. Ở đây đổi sang câu tiếng Việt cho người dùng.
const SIGNAL_MESSAGES = {
  'Tai khoan doc gia khong o trang thai active':
    'Tài khoản độc giả đang bị khóa hoặc đã hết hạn, không thể mượn sách.',
  'Doc gia da muon toi da 5 cuon':
    'Độc giả đã mượn đủ 5 cuốn chưa trả. Cần trả bớt trước khi mượn thêm.',
  'Sach da het ban sao co san':
    'Đầu sách này đã hết bản để cho mượn. Có thể tạo yêu cầu đặt sách.',
  'Phieu muon khong ton tai hoac da duoc tra':
    'Phiếu mượn không tồn tại hoặc đã được trả trước đó.',
};

// Một số lỗi MySQL thường gặp -> thông báo dễ hiểu
function translateMysqlError(err) {
  if (err.sqlState === '45000') {
    return { status: 409, message: SIGNAL_MESSAGES[err.sqlMessage] || err.sqlMessage };
  }
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      if (/isbn/i.test(err.sqlMessage)) return { status: 409, message: 'Mã ISBN này đã thuộc về một đầu sách khác.' };
      if (/email/i.test(err.sqlMessage)) return { status: 409, message: 'Email này đã được độc giả khác sử dụng.' };
      return { status: 409, message: 'Dữ liệu bị trùng với một bản ghi đã có.' };
    case 'ER_ROW_IS_REFERENCED_2':
      return { status: 409, message: 'Không xóa được vì bản ghi này đang được phiếu mượn hoặc yêu cầu đặt sách sử dụng.' };
    case 'ER_NO_REFERENCED_ROW_2':
      return { status: 400, message: 'Mã tham chiếu không tồn tại (thể loại, nhà xuất bản, vị trí, độc giả...).' };
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return { status: 400, message: 'Dữ liệu vi phạm ràng buộc CHECK của database (ví dụ ngày kết thúc trước ngày bắt đầu, số bản âm).' };
    case 'ECONNREFUSED':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
      return { status: 503, message: 'Không kết nối được MySQL. Kiểm tra file .env và chạy "npm run db:check".' };
    default:
      return null;
  }
}

function notFoundApi(req, res) {
  res.status(404).json({ error: 'Không tìm thấy API này.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  const mapped = translateMysqlError(err);
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ. Xem log ở terminal để biết chi tiết.' });
}

module.exports = { HttpError, errorHandler, notFoundApi };
