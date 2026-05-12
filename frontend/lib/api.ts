const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request(endpoint: string, options: RequestInit, token?: string): Promise<any> {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || `Request failed (${res.status})` };
    return data;
  } catch {
    return { error: 'Network error. Please check your connection.' };
  }
}

export const api = {
  post: (endpoint: string, body: object, token?: string) =>
    request(endpoint, { method: 'POST', body: JSON.stringify(body) }, token),

  get: (endpoint: string, token?: string) =>
    request(endpoint, { method: 'GET' }, token),

  patch: (endpoint: string, body: object, token?: string) =>
    request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }, token),

  put: (endpoint: string, body: object, token?: string) =>
    request(endpoint, { method: 'PUT', body: JSON.stringify(body) }, token),

  delete: (endpoint: string, token?: string) =>
    request(endpoint, { method: 'DELETE' }, token),
};
