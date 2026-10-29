// Gọi API của máy chủ. Mọi lỗi được ném ra dưới dạng Error có thông báo tiếng Việt.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* phản hồi rỗng */ }
  if (res.status === 401 && !url.startsWith('/api/auth/login')) onUnauthorized();
  if (!res.ok) throw new Error(data?.error || `Lỗi ${res.status}`);
  return data;
}

export const api = {
  get: (url, query) => {
    const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)) : null;
    return request('GET', qs && [...qs].length ? `${url}?${qs}` : url);
  },
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
