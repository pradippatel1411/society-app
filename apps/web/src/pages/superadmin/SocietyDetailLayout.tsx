import { useEffect, useState, useCallback } from "react"
import { useNavigate, useParams, Link, Outlet, NavLink } from "react-router-dom"
import { Card, CardBody } from "../../components/ui/Card"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"

export type FlatMember = {
  userId: number
  name: string | null
  mobile: string
  relation: string
  isPrimary: boolean
  role: string
}

export type FlatWithMembers = {
  id: number
  block: string
  flatNo: string
  label: string
  ownerName: string | null
  residencyType: string
  members: FlatMember[]
}

export type SocietyInfo = {
  id: number
  slug: string
  name: string
  address: string | null
  totalFlats: number
  status: string
}

export type SocietyContext = {
  society: SocietyInfo
  flats: FlatWithMembers[]
  loading: boolean
  refresh: () => Promise<void>
}

export default function SocietyDetailLayout() {
  const { slug, societySlug } = useParams<{
    slug: string
    societySlug: string
  }>()
  const navigate = useNavigate()
  const { token, isAuthenticated, isLoading } = useAuth()
  const [society, setSociety] = useState<SocietyInfo | null>(null)
  const [flats, setFlats] = useState<FlatWithMembers[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate(`/${slug}`)
  }, [isLoading, isAuthenticated, slug, navigate])

  // Find society id from slug, then fetch members
  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const socRes = await api<{
        societies: Array<SocietyInfo>
      }>(`/super-admin/societies`, { token })
      const target = socRes.societies.find((s) => s.slug === societySlug)
      if (!target) {
        setError("Society not found")
        return
      }

      const memRes = await api<{
        society: SocietyInfo
        flats: FlatWithMembers[]
      }>(`/super-admin/societies/${target.id}/members`, { token })

      setSociety(memRes.society)
      setFlats(memRes.flats)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [token, societySlug])

  useEffect(() => {
    if (!token) return
    let cancelled = false

    ;(async () => {
      try {
        const socRes = await api<{
          societies: Array<SocietyInfo>
        }>(`/super-admin/societies`, { token })
        if (cancelled) return
        const target = socRes.societies.find((s) => s.slug === societySlug)
        if (!target) {
          setError("Society not found")
          setLoading(false)
          return
        }

        const memRes = await api<{
          society: SocietyInfo
          flats: FlatWithMembers[]
        }>(`/super-admin/societies/${target.id}/members`, { token })
        if (cancelled) return

        setSociety(memRes.society)
        setFlats(memRes.flats)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, societySlug])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !society) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardBody className="text-center py-12">
            <p className="font-serif text-xl text-ink mb-2">
              {error || "Society not found"}
            </p>
            <Link
              to={`/${slug}/dashboard`}
              className="text-sm text-rust hover:text-rust-dark"
            >
              ← Back to dashboard
            </Link>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Aggregate stats
  const totalFlats = flats.length
  const occupied = flats.filter((f) => f.members.length > 0).length
  const vacant = totalFlats - occupied
  const totalMembers = flats.reduce((sum, f) => sum + f.members.length, 0)
  const ownerCount = flats.filter((f) => f.residencyType === "owner").length
  const tenantCount = flats.filter((f) => f.residencyType === "tenant").length

  const ctx: SocietyContext = { society, flats, loading, refresh }

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to={`/${slug}/dashboard`}
            className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
          >
            ← Back to dashboard
          </Link>
          <p className="text-xs text-ink-muted tabular hidden sm:block">
            /{slug}/{societySlug}
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">
        {/* Society title block */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-ink-muted mb-2">
            Society
          </p>
          <h1 className="font-serif text-4xl italic text-ink">
            {society.name}
          </h1>
          {society.address && (
            <p className="text-sm text-ink-muted mt-2">📍 {society.address}</p>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <Stat label="Total Flats" value={totalFlats} />
          <Stat label="Occupied" value={occupied} accent="emerald" />
          <Stat label="Vacant" value={vacant} accent="amber" />
          <Stat label="Members" value={totalMembers} />
          <Stat label="Owner Flats" value={ownerCount} />
          <Stat label="Tenant Flats" value={tenantCount} />
        </div>

        {/* Tabs */}
        <div className="border-b border-stone-200 mb-6 flex gap-1">
          <TabLink to="" end>
            Flats ({totalFlats})
          </TabLink>
          <TabLink to="members">Members ({totalMembers})</TabLink>
        </div>

        {/* Sub-route content */}
        <Outlet context={ctx} />
      </main>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: "emerald" | "amber"
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "amber"
        ? "text-amber-600"
        : "text-ink"
  return (
    <div className="bg-white rounded-xl border border-stone-100 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <p
        className={`font-serif text-2xl tabular mt-0.5 ${accentClass}`}
      >
        {value.toLocaleString("en-IN")}
      </p>
    </div>
  )
}

function TabLink({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
          isActive
            ? "border-ink text-ink"
            : "border-transparent text-ink-muted hover:text-ink"
        }`
      }
    >
      {children}
    </NavLink>
  )
}
