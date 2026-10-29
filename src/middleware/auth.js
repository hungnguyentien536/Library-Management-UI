// Kiểm tra phiên đăng nhập trước khi vào các API nghiệp vụ.
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.' });
  }
  next();
}

// Chỉ Thủ thư trưởng (role = admin) được sửa danh mục sách.
function requireAdmin(req, res, next) {
  if (req.session.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ Thủ thư trưởng mới được thực hiện thao tác này.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
