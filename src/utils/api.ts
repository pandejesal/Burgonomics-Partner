export const API_BASE = import.meta.env.VITE_API_BASE || 'https://burgonomics.netlify.app';

export async function callApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`API call failed: ${res.statusText}`);
  }
  return res.json();
}
