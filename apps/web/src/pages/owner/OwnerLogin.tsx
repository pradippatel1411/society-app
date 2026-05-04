import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody } from "../../components/ui/Card"
import { OtpInput } from "../../components/OtpInput"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"

type Step = "mobile" | "otp"

export default function OwnerLogin() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [step, setStep] = useState<Step>("mobile")
  const [mobile, setMobile] = useState("")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) navigate("/owner/dashboard", { replace: true })
  }, [isAuthenticated, navigate])

  // Cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  async function handleSendOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!/^\d{10}$/.test(mobile)) {
      setError("Enter a valid 10-digit mobile number")
      return
    }
    setLoading(true)
    try {
      const res = await api<{
        success: boolean
        nextResendAfterSeconds: number
        devMode: boolean
      }>("/auth/sendOTP", {
        method: "POST",
        body: { mobile, scope: "owner" },
      })
      setStep("otp")
      setResendCooldown(res.nextResendAfterSeconds)
      setOtp("")
      if (res.devMode) {
        setDevOtpHint("Dev mode active — OTP is 000000")
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (otp.length !== 6) {
      setError("Enter the 6-digit code")
      return
    }
    setLoading(true)
    try {
      const res = await api<{
        success: boolean
        token: string
        user: {
          id: number
          mobile: string
          name: string | null
          userType: "product_owner"
          superAdminId?: number | null
        }
      }>("/auth/verifyOTP", {
        method: "POST",
        body: { mobile, otp, scope: "owner" },
      })
      login(res.token, res.user)
      navigate("/owner/dashboard", { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError("Verification failed. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-cream relative overflow-hidden">
      {/* decorative background blob */}
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(200, 105, 62, 0.4), transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(26, 31, 46, 0.3), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-ink rounded-lg flex items-center justify-center">
              <svg
                className="w-4 h-4 text-cream"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-ink-light tracking-wide">
              SOCIETY MAINTENANCE
            </span>
          </div>
          <h1 className="font-serif text-4xl text-ink italic">
            {step === "mobile" ? "Welcome back" : "Verify it's you"}
          </h1>
          <p className="text-ink-muted text-sm mt-2">
            {step === "mobile"
              ? "Sign in to your platform owner account"
              : `We sent a code to +91 ${mobile}`}
          </p>
        </div>

        <Card>
          <CardBody>
            {step === "mobile" ? (
              <form onSubmit={handleSendOtp} className="space-y-5">
                <Input
                  label="Mobile Number"
                  name="mobile"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) =>
                    setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  prefix="+91"
                  placeholder="98765 43210"
                  error={error}
                  autoFocus
                />
                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  disabled={mobile.length !== 10}
                >
                  Send OTP
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-3 text-center">
                    Enter 6-Digit Code
                  </label>
                  <OtpInput value={otp} onChange={setOtp} disabled={loading} />
                  {error && (
                    <p className="mt-3 text-xs text-red-600 text-center">
                      {error}
                    </p>
                  )}
                  {devOtpHint && (
                    <p className="mt-3 text-xs text-rust text-center font-medium">
                      {devOtpHint}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  disabled={otp.length !== 6}
                >
                  Verify &amp; Continue
                </Button>
                <div className="text-center pt-2">
                  {resendCooldown > 0 ? (
                    <p className="text-xs text-ink-muted">
                      Didn't receive? Resend in{" "}
                      <span className="tabular text-ink-light font-medium">
                        {resendCooldown}s
                      </span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      className="text-xs text-rust hover:text-rust-dark font-medium"
                      disabled={loading}
                    >
                      Resend OTP
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStep("mobile")
                      setError(null)
                      setOtp("")
                    }}
                    className="block w-full mt-3 text-xs text-ink-muted hover:text-ink"
                  >
                    Use a different mobile number
                  </button>
                </div>
              </form>
            )}
          </CardBody>
        </Card>

        <p className="text-center text-xs text-ink-muted mt-6">
          Owner-only portal. Unauthorized access is logged.
        </p>
      </div>
    </div>
  )
}