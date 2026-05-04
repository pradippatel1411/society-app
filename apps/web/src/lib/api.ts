const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787"

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"
  body?: unknown
  token?: string | null
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { method = "GET", body, token } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // empty body is OK for some responses
  }

  if (!res.ok) {
    const errMsg =
      (data as { error?: string } | null)?.error ?? `Request failed: ${res.status}`
    throw new ApiError(res.status, errMsg, data)
  }
  return data as T
}

// Helper to get the API URL — useful for fetch calls that need raw URL
// (e.g., file uploads that aren't JSON)
export function apiUrl(path: string): string {
  return `${API_URL}${path}`
}