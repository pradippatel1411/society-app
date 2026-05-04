import { useEffect, useState } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"

type SuperAdminProfile = {
  id: number
  slug: string
  name: string
  contactMobile: string
  contactEmail: string | null
  brandColor: string | null
  logoUrl: string | null
  planAmount: number
  planEndDate: string | null
  status: string
}

type Society = {
  id: number
  slug: string
  name: string
  address: string | null
  totalFlats: number
  status: string
  createdAt: string
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const { token, user, logout, isAuthenticated, isLoading } = useAuth()
  const [profile, setProfile] = useState<SuperAdminProfile | null>(null)
  const [societies, setSocieties] = useState<Society[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || user?.userType !== "super_admin") {
      navigate(`/${slug}`, { replace: true })
    }
  }, [isAuthenticated, user, isLoading, slug, navigate])

 useEffect(() => {
  if (!token) return
  let cancelled = false

  ;(async () => {
    try {
      const [meRes, socRes] = await Promise.all([
        api<{ superAdmin: SuperAdminProfile }>(`/super-admin/me`, { token }),
        api<{ societies: Society[] }>(`/super-admin/societies`, { token }),
      ])
      if (cancelled) return
      setProfile(meRes.superAdmin)
      setSocieties(socRes.societies)
    } catch (err) {
      if (cancelled) return
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate(`/${slug}`, { replace: true })
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      if (!cancelled) setLoading(false)
    }
  })()

  return () => {
    cancelled = true
  }
}, [token, slug, logout, navigate])

// Manual refresh (called after add society) — NOT inside an effect
async function refreshAll() {
  if (!token) return
  try {
    const [meRes, socRes] = await Promise.all([
      api<{ superAdmin: SuperAdminProfile }>(`/super-admin/me`, { token }),
      api<{ societies: Society[] }>(`/super-admin/societies`, { token }),
    ])
    setProfile(meRes.superAdmin)
    setSocieties(socRes.societies)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      logout()
      navigate(`/${slug}`, { replace: true })
      return
    }
    setError(err instanceof Error ? err.message : "Failed to load")
  }
}

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600 text-sm">
        {error || "No profile data"}
      </div>
    )
  }

  const accent = profile.brandColor || "#1A1F2E"
  const totalFlats = societies.reduce((s, soc) => s + (soc.totalFlats || 0), 0)
  const activeCount = societies.filter((s) => s.status === "active").length

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-serif text-lg shadow-card"
              style={{ backgroundColor: accent }}
            >
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-serif text-lg text-ink leading-tight">
                {profile.name}
              </p>
              <p className="text-xs text-ink-muted">
                Admin Portal · +91 {user?.mobile}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout()
              navigate(`/${slug}`)
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 animate-fade-in">
        {/* Profile / branding banner */}
        <div
          className="rounded-2xl p-8 mb-10 text-white relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}DD 100%)`,
          }}
        >
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-widest opacity-70 mb-2">
              Welcome back
            </p>
            <h1 className="font-serif text-3xl italic mb-1">{profile.name}</h1>
            <p className="text-sm opacity-80">
              Managing {societies.length}{" "}
              {societies.length === 1 ? "society" : "societies"} ·{" "}
              {totalFlats} {totalFlats === 1 ? "flat" : "flats"} total
            </p>
          </div>
          <div
            className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full opacity-20"
            style={{ background: "white" }}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatCard label="Societies" value={societies.length} />
          <StatCard label="Active" value={activeCount} />
          <StatCard label="Total Flats" value={totalFlats} />
        </div>

        {/* Societies section */}
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="font-serif text-2xl italic text-ink">
              Your Societies
            </h2>
            <p className="text-sm text-ink-muted mt-1">
              Onboard a new society or manage existing ones
            </p>
          </div>
          <Button onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? "Cancel" : "+ Add Society"}
          </Button>
        </div>

        {showAddForm && (
          <div className="mb-6 animate-slide-up">
            <AddSocietyForm
              token={token!}
              onSuccess={() => {
                setShowAddForm(false)
                refreshAll()
              }}
            />
          </div>
        )}

        {societies.length === 0 ? (
          <Card>
            <CardBody className="text-center py-16">
              <p className="font-serif text-xl text-ink mb-2">
                No societies yet
              </p>
              <p className="text-sm text-ink-muted mb-6">
                Add your first society to get started
              </p>
              <Button onClick={() => setShowAddForm(true)}>
                Add Society
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {societies.map((soc) => (
              <SocietyCard key={soc.id} society={soc} adminSlug={slug!} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wider text-ink-muted">
          {label}
        </p>
        <p className="font-serif text-3xl text-ink mt-2 tabular">
          {value.toLocaleString("en-IN")}
        </p>
      </CardBody>
    </Card>
  )
}

function SocietyCard({
  society,
  adminSlug,
}: {
  society: Society
  adminSlug: string
}) {
  const statusStyles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    suspended: "bg-amber-50 text-amber-700",
    expired: "bg-stone-100 text-stone-600",
    pending: "bg-blue-50 text-blue-700",
  }
  return (
    <Link
      to={`/${adminSlug}/societies/${society.slug}`}
      className="block group"
    >
      <Card className="transition-all group-hover:shadow-card-hover group-hover:border-stone-200">
        <CardBody>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-xl text-ink truncate">
                {society.name}
              </h3>
              <p className="text-xs text-ink-muted mt-0.5 tabular">
                /{society.slug}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                statusStyles[society.status] || statusStyles.pending
              }`}
            >
              {society.status}
            </span>
          </div>
          {society.address && (
            <p className="text-sm text-ink-muted line-clamp-1 mb-4">
              📍 {society.address}
            </p>
          )}
          <div className="flex items-center justify-between pt-3 border-t border-stone-100">
            <p className="text-sm text-ink-muted">
              <span className="font-serif text-lg text-ink tabular">
                {society.totalFlats}
              </span>{" "}
              {society.totalFlats === 1 ? "flat" : "flats"}
            </p>
            <span className="text-xs text-rust group-hover:translate-x-1 transition-transform">
              Manage →
            </span>
          </div>
        </CardBody>
      </Card>
    </Link>
  )
}

function AddSocietyForm({
  token,
  onSuccess,
}: {
  token: string
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    address: "",
    planAmount: 5000,
    planEndDate: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Default plan dates: today → 1 year from today
      const today = new Date()
      const oneYear = new Date()
      oneYear.setFullYear(today.getFullYear() + 1)

      await api(`/super-admin/societies`, {
        method: "POST",
        token,
        body: {
          name: form.name,
          slug: form.slug || undefined,
          address: form.address || undefined,
          planAmount: form.planAmount,
          planStartDate: today.toISOString().slice(0, 10),
          planEndDate:
            form.planEndDate || oneYear.toISOString().slice(0, 10),
        },
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader title="New Society" subtitle="Onboard a society to your portal" />
      <CardBody>
        <form
          onSubmit={submit}
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
        >
          <Input
            label="Society Name"
            placeholder="e.g. Green Park Co-op"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
          <Input
            label="URL Slug (optional)"
            placeholder="e.g. greenpark"
            value={form.slug}
            onChange={(e) =>
              update(
                "slug",
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
              )
            }
            hint="Auto-generated from name if blank"
          />
          <div className="md:col-span-2">
            <Input
              label="Address"
              placeholder="Full address"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
            />
          </div>
          <Input
            label="Annual Plan (₹)"
            type="number"
            min={0}
            value={form.planAmount}
            onChange={(e) =>
              update("planAmount", parseInt(e.target.value) || 0)
            }
          />
          <Input
            label="Plan End Date"
            type="date"
            value={form.planEndDate}
            onChange={(e) => update("planEndDate", e.target.value)}
            hint="Defaults to 1 year from today if blank"
          />

          {error && (
            <div className="md:col-span-2 p-3 rounded-xl bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="md:col-span-2 flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Create Society
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}