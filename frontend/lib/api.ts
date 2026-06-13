// Central API config — update this when Railway URL changes
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://attendai-production-f6cf.up.railway.app";

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("access_token")
    : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(`${API_URL}${path}`, { ...options, headers });
}
