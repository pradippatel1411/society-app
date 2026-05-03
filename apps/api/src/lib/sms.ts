/**
 * SMS sender. In dev mode (DEV_FIXED_OTP is set), it just logs to
 * console instead of calling MSG91 — no real SMS is sent.
 */

export async function sendOtpSms(params: {
  mobile: string
  code: string
  isDev: boolean
}) {
  if (params.isDev) {
    console.log('━'.repeat(60))
    console.log(`📱 [DEV MODE] OTP for ${params.mobile}: ${params.code}`)
    console.log(`   (no real SMS sent — DEV_FIXED_OTP is active)`)
    console.log('━'.repeat(60))
    return { success: true, mode: 'dev' as const }
  }

  // TODO: Real MSG91 integration in Step 12 when we deploy
  console.warn('Real SMS not implemented yet')
  return { success: false, mode: 'production' as const }
}