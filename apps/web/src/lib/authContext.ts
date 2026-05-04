import { createContext } from "react"

export type AuthUser = {
  id: number
  mobile: string
  name: string | null
  userType: "product_owner" | "super_admin" | "society_user"
  superAdminId?: number | null
}

export type AuthContextType = {
  token: string | null
  user: AuthUser | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextType | null>(null)