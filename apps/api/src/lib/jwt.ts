import { SignJWT, jwtVerify } from 'jose'

export type JwtPayload = {
  userId: number
  mobile: string
  userType: 'product_owner' | 'super_admin' | 'society_user'
  superAdminId?: number | null
  // Roles will be added later for society users
}

const JWT_VALIDITY_SECONDS = 24 * 60 * 60 // 24 hours

export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret)
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${JWT_VALIDITY_SECONDS}s`)
    .sign(secretKey)
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  try {
    const secretKey = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, secretKey)
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}