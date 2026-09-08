export class ApiError extends Error {
  constructor(status, body) { super(body?.error || `HTTP ${status}`); this.status = status; this.body = body; }
}
async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const api = {
  get: (u) => req('GET', u),
  post: (u, b = {}) => req('POST', u, b),
  put: (u, b = {}) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
};
