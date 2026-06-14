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

  // Don't set Content-Type for FormData — browser sets it with the correct boundary
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Use manual redirect handling so Authorization header is preserved on 307/308 redirects
  const resp = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });

  // Follow 307/308 redirects manually (browser drops auth headers on automatic redirects)
  if (resp.status === 307 || resp.status === 308) {
    const location = resp.headers.get("location");
    if (location) {
      return fetch(location, { ...options, headers });
    }
  }

  return resp;
}


