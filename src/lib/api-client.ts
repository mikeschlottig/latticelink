import { ApiResponse } from "../../shared/types"
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let errorMsg = `Request failed with status ${res.status}`;
    try {
      const errorJson = await res.json() as ApiResponse<never>;
      if (errorJson.error) {
        errorMsg = errorJson.error;
      }
    } catch (e) {
      // Ignore if response is not JSON
    }
    throw new Error(errorMsg);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success || json.data === undefined) {
    throw new Error(json.error || 'API request failed');
  }
  return json.data;
}