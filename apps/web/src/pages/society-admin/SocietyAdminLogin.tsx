import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody } from "../../components/ui/Card"
import { OtpInput } from "../../components/OtpInput"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"

type Step = "mobile" | "otp"

type Branding = {
  superAdminName: string
  superAdminColor: string
  societyName: string
}

const COMMITTEE_ROLES = ["chairman", "secretary", "cashier", "committee"]

export default function SocietyAdminLogin() {
  const navigate = useNavigate()
  const { slug, societySlug } = useParams<{
    slug: string
    societySlug: string
  }>()
  const { login, isAuthenticated, user } = useAuth()
  const [branding, setBranding] = useState<Branding | null>(null)
  const [brandingLoading, setBrandingLoading] = useState(true)
  const [brandingError, setBrandingError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>("mobile")
  const [mobile, setMobile] = useState("")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)

  // If already logged in as a committee member of any society, redirect into
  // the dashboard. The layout will do per-society verification and reject if
  // they don't have a committee role specifically in this society.
  useEffect(() => {
    if (!isAuthenticated || user?.userType !== "society_user") return
    if (!slug || !societySlug || !branding) return

    const hasAnyCommittee = (user.societyRoles ?? []).some((r) =>
      COMMITTEE_ROLES.includes(r.role)
    )
    if (hasAnyCommittee) {
      navigate(`/${slug}/societies/${societySlug}/admin/dashboard`, {
        replace: true,
      })
    }
  }, [isAuthenticated, user, slug, societySlug, branding, navigate])

  // Load branding (super admin + society info)
  useEffect(() => {
    if (!slug || !societySlug) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await api<{
          superAdmin: {
            name: string
            brandColor: string
            logoUrl: string | null
          }
          society: { name: string }
        }>(`/public/branding/${slug}/${societySlug}`)
        if (!cancelled) {
          setBranding({
            superAdminName: res.superAdmin.name,
            superAdminColor: res.superAdmin.brandColor || "#1A1F2E",
            societyName: res.society.name,
          })
        }
      } catch {
        if (!cancelled) setBrandingError("Society not found")
      } finally {
        if (!cancelled) setBrandingLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [slug, societySlug])

  // Cooldown timer
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
        body: {
          mobile,
          scope: "society",
          scopeRef: `${slug}/${societySlug}`,
        },
      })
      setStep("otp")
      setResendCooldown(res.nextResendAfterSeconds)
      setOtp("")
      if (res.devMode) setDevOtpHint("Dev mode active — OTP is 000000")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong")
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
          userType: "society_user"
          superAdminId: number | null
          societyRoles?: Array<{
            societyId: number
            role:
              | "chairman"
              | "secretary"
              | "cashier"
              | "committee"
              | "member"
          }>
        }
      }>("/auth/verifyOTP", {
        method: "POST",
        body: { mobile, otp, scope: "society" },
      })

      // Check that the user has a committee role
      const isCommittee = (res.user.societyRoles ?? []).some((r) =>
        COMMITTEE_ROLES.includes(r.role)
      )
      if (!isCommittee) {
        setError(
          "You don't have admin access to this society. Plain members use the member portal instead."
        )
        setLoading(false)
        return
      }

      login(res.token, res.user)
      navigate(`/${slug}/societies/${societySlug}/admin/dashboard`, {
        replace: true,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  if (brandingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (brandingError || !branding) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-cream">
        <Card className="max-w-md w-full">
          <CardBody className="text-center py-12">
            <div className="text-4xl mb-3">🔒</div>
            <h1 className="font-serif text-2xl text-ink mb-2">
              Society not found
            </h1>
            <p className="text-sm text-ink-muted">
              The link is invalid. Check with your administrator.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  const accent = branding.superAdminColor

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-cream relative overflow-hidden">
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-30 blur-3xl"
        style={{
          background: `radial-gradient(circle at center, ${accent}40, transparent 70%)`,
        }}
      />
      <div
        className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-15 blur-3xl"
        style={{
          background: `radial-gradient(circle at center, ${accent}30, transparent 70%)`,
        }}
      />

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 font-serif text-2xl text-white shadow-card"
            style={{ backgroundColor: accent }}
          >
            🏢
          </div>
          <p className="text-xs font-medium text-ink-muted uppercase tracking-widest mb-1">
            Society Admin · {branding.superAdminName}
          </p>
          <h1 className="font-serif text-3xl text-ink">
            {branding.societyName}
          </h1>
          <p className="text-ink-muted text-sm mt-2">
            {step === "mobile"
              ? "Sign in as chairman, secretary, cashier, or committee"
              : `Code sent to +91 ${mobile}`}
          </p>
        </div>

        <Card>
          <CardBody>
            {step === "mobile" ? (
              <form onSubmit={handleSendOtp} className="space-y-5">
                <Input
                  label="Mobile Number"
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
                      Resend in{" "}
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
      </div>
    </div>
  )
}
