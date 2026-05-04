import { useState } from "react"
import type { ReactNode } from "react"
import { AuthContext } from "./authContext"
import type { AuthUser } from "./authContext"

const STORAGE_TOKEN = "society_auth_token"
const STORAGE_USER = "society_auth_user"

function readStoredAuth(): { token: string | null; user: AuthUser | null } {
  try {
    const t = localStorage.getItem(STORAGE_TOKEN)
    const u = localStorage.getItem(STORAGE_USER)
    if (t && u) {
      return { token: t, user: JSON.parse(u) as AuthUser }
    }
  } catch {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
  }
  return { token: null, user: null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Lazy initializers — run once during first render, no effect needed
  const [token, setToken] = useState<string | null>(() => readStoredAuth().token)
  const [user, setUser] = useState<AuthUser | null>(() => readStoredAuth().user)

  const login = (t: string, u: AuthUser) => {
    localStorage.setItem(STORAGE_TOKEN, t)
    localStorage.setItem(STORAGE_USER, JSON.stringify(u))
    setToken(t)
    setUser(u)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        logout,
        isAuthenticated: !!token,
        isLoading: false,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}