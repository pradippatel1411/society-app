import { useEffect, useState, useCallback } from "react"
import {
  useNavigate,
  useParams,
  Outlet,
  NavLink,
} from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Card, CardBody } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
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

export type AdminContext = {
  society: SocietyInfo
  flats: FlatWithMembers[]
  myRole: string
  myUserId: number
  refresh: () => Promise<void>
}

export default function SocietyAdminLayout() {
  const { slug, societySlug } = useParams<{
    slug: string
    societySlug: string
  }>()
  const navigate = useNavigate()
  const { token, user, logout, isAuthenticated, isLoading } = useAuth()
  const [society, setSociety] = useState<SocietyInfo | null>(null)
  const [flats, setFlats] = useState<FlatWithMembers[]>([])
  const [myRole, setMyRole] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Redirect if not logged in or wrong user type
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || user?.userType !== "society_user") {
      navigate(`/${slug}/societies/${societySlug}/admin`, { replace: true })
    }
  }, [isAuthenticated, user, isLoading, slug, societySlug, navigate])

  const fetchAll = useCallback(async () => {
    if (!token) return
    try {
      const meRes = await api<{
        societies: Array<{
          id: number
          slug: string
          name: string
          role: string
          isCommittee: boolean
        }>
      }>(`/society/me`, { token })

      const target = meRes.societies.find((s) => s.slug === societySlug)

      if (!target) {
        setError("You don't have access to this society")
        setLoading(false)
        return
      }

      if (!target.isCommittee) {
        setError(
          "You don't have admin access to this society. Plain members use the member portal."
        )
        setLoading(false)
        return
      }

      setMyRole(target.role)

      const detailRes = await api<{
        society: SocietyInfo
        flats: FlatWithMembers[]
      }>(`/society/${target.id}/members`, { token })
      
      setSociety(detailRes.society)
      setFlats(detailRes.flats)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate(`/${slug}/societies/${societySlug}/admin`, { replace: true })
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }, [token, slug, societySlug, logout, navigate])

  // Initial load
  useEffect(() => {
    if (!token) return
    let cancelled = false

    ;(async () => {
      try {
        const meRes = await api<{
          societies: Array<{
            id: number
            slug: string
            name: string
            role: string
            isCommittee: boolean
          }>
        }>(`/society/me`, { token })
        if (cancelled) return

        const target = meRes.societies.find((s) => s.slug === societySlug)

        if (!target) {
          setError("You don't have access to this society")
          setLoading(false)
          return
        }

        if (!target.isCommittee) {
          setError(
            "You don't have admin access to this society. Plain members use the member portal."
          )
          setLoading(false)
          return
        }

        setMyRole(target.role)

        const detailRes = await api<{
          society: SocietyInfo
          flats: FlatWithMembers[]
        }>(`/society/${target.id}/members`, { token })
        if (cancelled) return

        setSociety(detailRes.society)
        setFlats(detailRes.flats)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          logout()
          navigate(`/${slug}/societies/${societySlug}/admin`, {
            replace: true,
          })
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
  }, [token, slug, societySlug, logout, navigate])

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !society) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardBody className="text-center py-12">
            <div className="text-4xl mb-3">🚫</div>
            <p className="font-serif text-xl text-ink mb-2">
              {error || "Society not found"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout()
                navigate(`/${slug}/societies/${societySlug}/admin`)
              }}
            >
              Sign out
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  const totalFlats = flats.length
  const occupied = flats.filter((f) => f.members.length > 0).length
  const vacant = totalFlats - occupied
  const totalMembers = flats.reduce((sum, f) => sum + f.members.length, 0)

  const ctx: AdminContext = {
    society,
    flats,
    myRole,
    myUserId: user?.id ?? 0,
    refresh: fetchAll,
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-ink text-cream flex items-center justify-center text-sm font-serif flex-shrink-0">
              {society.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-serif text-base text-ink truncate leading-tight">
                {society.name}
              </p>
              <p className="text-xs text-ink-muted">
                Admin · {user?.name ?? user?.mobile}{" "}
                <span className="capitalize text-rust">({myRole})</span>
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout()
              navigate(`/${slug}/societies/${societySlug}/admin`)
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">
        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="Total Flats" value={totalFlats} />
          <Stat label="Occupied" value={occupied} accent="emerald" />
          <Stat label="Vacant" value={vacant} accent="amber" />
          <Stat label="Members" value={totalMembers} />
        </div>

        {/* Tabs */}
        <div className="border-b border-stone-200 mb-6 flex gap-1 overflow-x-auto">
          <TabLink to="" end>
            Flats ({totalFlats})
          </TabLink>
          <TabLink to="members">Members ({totalMembers})</TabLink>
          <TabLink to="maintenance">Maintenance</TabLink>
        </div>

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
      <p className={`font-serif text-2xl tabular mt-0.5 ${accentClass}`}>
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
        `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
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
