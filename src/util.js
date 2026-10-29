const { HttpError } = require('./middleware/errors');

// Thoát ký tự đặc biệt của LIKE để người dùng gõ '%' hay '_' không thành ký tự đại diện
function like(text) {
  return `%${String(text).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

// Đọc số nguyên dương từ tham số, sai thì báo lỗi 400
function toId(value, label = 'Mã') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} không hợp lệ.`);
  return n;
}

function optionalText(value, max = 255) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function requiredText(value, label, max = 255) {
  const s = optionalText(value, max);
  if (!s) throw new HttpError(400, `Vui lòng nhập ${label}.`);
  return s;
}

function optionalDate(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${label} phải có dạng YYYY-MM-DD.`);
  return value;
}

module.exports = { like, toId, optionalText, requiredText, optionalDate };
