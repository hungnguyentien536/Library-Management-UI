// Trạng thái dùng chung trong phiên làm việc
import { api } from './api.js';

export const store = {
  user: null,       // nhân viên đang đăng nhập
  lookups: null,    // danh mục: thể loại, NXB, vị trí, tác giả, quy tắc, ngày hôm nay
};

export async function loadLookups() {
  store.lookups = await api.get('/api/lookups');
  return store.lookups;
}

export const isAdmin = () => store.user?.role === 'admin';
export const today = () => store.lookups?.today;
export const rules = () => store.lookups?.rules || { loanDays: 14, maxLoans: 5, finePerDay: 2000 };

// Các màn hình đăng ký hàm làm mới; gọi refreshAll() sau mỗi thao tác thay đổi dữ liệu
const listeners = new Set();
export function onDataChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function refreshAll() { listeners.forEach((fn) => fn()); }
