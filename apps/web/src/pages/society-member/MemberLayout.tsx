import { useEffect, useState, useCallback } from "react"
import { useNavigate, useParams, Outlet, NavLink } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Card, CardBody } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"

export type MyFlat = {
  flatId: number
  block: string
  flatNo: string
  label: string
  relation: string
  isPrimary: boolean
  residencyType: string
}

export type MyFlatDetail = {
  id: number
  block: string
  flatNo: string
  label: string
  ownerName: string | null
  residencyType: string
  societyId: number
  members: Array<{
    userId: number
    name: string | null
    mobile: string
    relation: string
    isPrimary: boolean
    role: string
  }>
}

export type SocietyInfo = {
  id: number
  slug: string
  name: string
  address: string | null
  totalFlats: number
}

export type MemberContext = {
  society: SocietyInfo
  myFlat: MyFlatDetail
  myRole: string
  myUserId: number
  refresh: () => Promise<void>
}

const COMMITTEE_ROLES = ["chairman", "secretary", "cashier", "committee"]

export default function MemberLayout() {
  const { slug, societySlug } = useParams<{ slug: string; societySlug: string }>()
  const navigate = useNavigate()
  const { token, user, logout, isAuthenticated, isLoading } = useAuth()

  const [society, setSociety] = useState<SocietyInfo | null>(null)
  const [myFlat, setMyFlat] = useState<MyFlatDetail | null>(null)
  const [myRole, setMyRole] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || user?.userType !== "society_user") {
      navigate(`/${slug}/societies/${societySlug}/login`, { replace: true })
      return
    }
    // Committee members belong in the admin dashboard
    const isCommittee = (user.societyRoles ?? []).some((r) =>
      COMMITTEE_ROLES.includes(r.role)
    )
    if (isCommittee) {
      navigate(`/${slug}/societies/${societySlug}/admin/dashboard`, { replace: true })
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
          address: string | null
          totalFlats: number
          role: string
          isCommittee: boolean
          flats: MyFlat[]
        }>
      }>(`/society/me`, { token })

      const target = meRes.societies.find((s) => s.slug === societySlug)
      if (!target) {
        setError("You don't have access to this society")
        setLoading(false)
        return
      }

      setSociety({
        id: target.id,
        slug: target.slug,
        name: target.name,
        address: target.address ?? null,
        totalFlats: target.totalFlats,
      })
      setMyRole(target.role)

      // Load the first flat's details (members list)
      const primaryFlat = target.flats.find((f) => f.isPrimary) ?? target.flats[0]
      if (!primaryFlat) {
        setError("No flat linked to your account in this society")
        setLoading(false)
        return
      }

      const flatRes = await api<{ flat: MyFlatDetail }>(
        `/member/flat/${primaryFlat.flatId}`,
        { token }
      )
      setMyFlat(flatRes.flat)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate(`/${slug}`, { replace: true, state: { loggedOut: true, loginUrl: `${window.location.origin}/${slug}/societies/${societySlug}/login` } })
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }, [token, slug, societySlug, logout, navigate])

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
            address: string | null
            totalFlats: number
            role: string
            isCommittee: boolean
            flats: MyFlat[]
          }>
        }>(`/society/me`, { token })
        if (cancelled) return

        const target = meRes.societies.find((s) => s.slug === societySlug)
        if (!target) {
          setError("You don't have access to this society")
          setLoading(false)
          return
        }

        setSociety({
          id: target.id,
          slug: target.slug,
          name: target.name,
          address: target.address ?? null,
          totalFlats: target.totalFlats,
        })
        setMyRole(target.role)

        const primaryFlat = target.flats.find((f) => f.isPrimary) ?? target.flats[0]
        if (!primaryFlat) {
          setError("No flat linked to your account in this society")
          setLoading(false)
          return
        }

        const flatRes = await api<{ flat: MyFlatDetail }>(
          `/member/flat/${primaryFlat.flatId}`,
          { token }
        )
        if (cancelled) return

        setMyFlat(flatRes.flat)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          logout()
          navigate(`/${slug}`, { replace: true, state: { loggedOut: true, loginUrl: `${window.location.origin}/${slug}/societies/${societySlug}/login` } })
          return
        }
        setError(err instanceof Error ? err.message : "Failed to load")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [token, slug, societySlug, logout, navigate])

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !society || !myFlat) {
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
                navigate(`/${slug}`, { state: { loggedOut: true, loginUrl: `${window.location.origin}/${slug}/societies/${societySlug}/login` } })
              }}
            >
              Sign out
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  const ctx: MemberContext = {
    society,
    myFlat,
    myRole,
    myUserId: user?.id ?? 0,
    refresh: fetchAll,
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-ink text-cream flex items-center justify-center text-sm font-serif flex-shrink-0">
              {society.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-serif text-base text-ink truncate leading-tight">
                {society.name}
              </p>
              <p className="text-xs text-ink-muted">
                {user?.name ?? user?.mobile} ·{" "}
                <span className="capitalize text-ink-light">Flat {myFlat.label}</span>
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout()
              navigate(`/${slug}`, { state: { loggedOut: true, loginUrl: `${window.location.origin}/${slug}/societies/${societySlug}/login` } })
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        {/* Tabs */}
        <div className="border-b border-stone-200 mb-6 flex gap-1 overflow-x-auto">
          <TabLink to="" end>
            My Dues
          </TabLink>
          <TabLink to="my-flat">My Flat</TabLink>
          <TabLink to="payments">Payment History</TabLink>
        </div>

        <Outlet context={ctx} />
      </main>
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
