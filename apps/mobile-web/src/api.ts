const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

const pendingGetRequests = new Map<string, Promise<unknown>>();

export async function apiGet<T>(path: string): Promise<T> {
  const pendingRequest = pendingGetRequests.get(path);
  if (pendingRequest) return pendingRequest as Promise<T>;

  const request = fetch(`${API_BASE}${path}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(await errorText(res));
      return res.json() as Promise<T>;
    })
    .finally(() => {
      if (pendingGetRequests.get(path) === request) pendingGetRequests.delete(path);
    });

  pendingGetRequests.set(path, request);
  return request;
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

async function errorText(res: Response) {
  try {
    const data = await res.json();
    return data.message || '请求失败';
  } catch {
    return '请求失败';
  }
}
