import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r.data,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.includes('/login')) {
      localStorage.removeItem('token');
      location.href = '/login';
    }
    return Promise.reject(new Error(err.response?.data?.error || err.message));
  }
);

// SSE 流式请求（fetch + ReadableStream）
export async function sseStream({ url, body, onDelta, onDone, onError }) {
  const token = localStorage.getItem('token');
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        try {
          const payload = JSON.parse(t.slice(5));
          if (payload.delta) onDelta?.(payload.delta);
          if (payload.done) onDone?.(payload);
          if (payload.error) onError?.(payload.error);
        } catch { /* 忽略不完整行 */ }
      }
    }
  } catch (e) {
    onError?.(e.message);
  }
}
