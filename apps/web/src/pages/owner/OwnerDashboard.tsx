import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"

type SuperAdmin = {
  id: number
  slug: string
  name: string
  contactMobile: string
  contactEmail: string | null
  brandColor: string | null
  planAmount: number | null
  planEndDate: string | null
  status: "active" | "suspended" | "expired" | "pending"
  createdAt: string
}

export default function OwnerDashboard() {
  const navigate = useNavigate()
  const { token, user, logout, isAuthenticated, isLoading } = useAuth()
  const [admins, setAdmins] = useState<SuperAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/owner", { replace: true })
  }, [isAuthenticated, isLoading, navigate])

  useEffect(() => {
  if (!token) return
  let cancelled = false

  ;(async () => {
    try {
      const res = await api<{ superAdmins: SuperAdmin[] }>(
        "/owner/super-admins",
        { token }
      )
      if (!cancelled) setAdmins(res.superAdmins)
    } catch (err) {
      if (cancelled) return
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate("/owner", { replace: true })
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
}, [token, logout, navigate])

// Manual refresh function for after suspend/add — this is NOT called from an effect
async function refreshAdmins() {
  if (!token) return
  try {
    const res = await api<{ superAdmins: SuperAdmin[] }>(
      "/owner/super-admins",
      { token }
    )
    setAdmins(res.superAdmins)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      logout()
      navigate("/owner", { replace: true })
      return
    }
    setError(err instanceof Error ? err.message : "Failed to load")
  }
}

  async function handleSuspend(id: number, currentStatus: string) {
  const newStatus = currentStatus === "active" ? "suspended" : "active"
  try {
    await api(`/owner/super-admins/${id}`, {
      method: "PATCH",
      body: { status: newStatus },
      token,
    })
    refreshAdmins()
  } catch (err) {
    alert(err instanceof Error ? err.message : "Action failed")
  }
}

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                  d="M3 21h18M5 21V7l7-4 7 4v14"
                />
              </svg>
            </div>
            <div>
              <p className="font-serif text-lg text-ink leading-tight">
                Platform Owner
              </p>
              <p className="text-xs text-ink-muted">
                Signed in as +91 {user?.mobile}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/owner') }}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 animate-fade-in">
        {/* Page title */}
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-serif text-3xl italic text-ink">
              Super Admins
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Manage white-label tenants of the platform
            </p>
          </div>
          <Button onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? "Cancel" : "+ Add Super Admin"}
          </Button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="mb-8 animate-slide-up">
            <AddSuperAdminForm
              token={token!}
              onSuccess={() => {
                setShowAddForm(false)
                refreshAdmins()
              }}
            />
          </div>
        )}

        {/* Stats summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Super Admins"
            value={admins.length}
          />
          <StatCard
            label="Active"
            value={admins.filter((a) => a.status === "active").length}
          />
          <StatCard
            label="Suspended"
            value={admins.filter((a) => a.status === "suspended").length}
          />
        </div>

        {/* List */}
        <Card>
          <CardHeader
            title="All Super Admins"
            subtitle={`${admins.length} ${
              admins.length === 1 ? "tenant" : "tenants"
            } under your platform`}
          />
          <CardBody className="!p-0">
            {loading ? (
              <div className="p-12 text-center text-sm text-ink-muted">
                Loading…
              </div>
            ) : error ? (
              <div className="p-12 text-center text-sm text-red-600">
                {error}
              </div>
            ) : admins.length === 0 ? (
              <div className="p-12 text-center">
                <p className="font-serif text-lg text-ink mb-2">
                  No super admins yet
                </p>
                <p className="text-sm text-ink-muted">
                  Add your first one to get started
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {admins.map((admin) => (
                  <SuperAdminRow
                    key={admin.id}
                    admin={admin}
                    onSuspendToggle={() =>
                      handleSuspend(admin.id, admin.status)
                    }
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
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
        <p className="font-serif text-3xl text-ink mt-2 tabular">{value}</p>
      </CardBody>
    </Card>
  )
}

function SuperAdminRow({
  admin,
  onSuspendToggle,
}: {
  admin: SuperAdmin
  onSuspendToggle: () => void
}) {
  const statusStyles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    suspended: "bg-amber-50 text-amber-700",
    expired: "bg-stone-100 text-stone-600",
    pending: "bg-blue-50 text-blue-700",
  }
  return (
    <div className="px-6 py-4 hover:bg-cream-light transition-colors">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-serif text-lg"
            style={{ backgroundColor: admin.brandColor || "#1A1F2E" }}
          >
            {admin.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-lg text-ink truncate">
                {admin.name}
              </h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  statusStyles[admin.status]
                }`}
              >
                {admin.status}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              <span className="tabular">/{admin.slug}</span> · +91{" "}
              {admin.contactMobile}
              {admin.contactEmail && ` · ${admin.contactEmail}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-ink-muted">Plan</p>
            <p className="text-sm text-ink font-medium tabular">
              ₹{(admin.planAmount ?? 0).toLocaleString("en-IN")}/yr
            </p>
          </div>
          <Button
            variant={admin.status === "active" ? "secondary" : "primary"}
            size="sm"
            onClick={onSuspendToggle}
          >
            {admin.status === "active" ? "Suspend" : "Activate"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AddSuperAdminForm({
  token,
  onSuccess,
}: {
  token: string
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    contactMobile: "",
    contactEmail: "",
    brandColor: "#1A1F2E",
    planAmount: 10000,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api("/owner/super-admins", {
        method: "POST",
        token,
        body: {
          name: form.name,
          slug: form.slug || undefined,
          contactMobile: form.contactMobile,
          contactEmail: form.contactEmail || undefined,
          brandColor: form.brandColor,
          planAmount: form.planAmount,
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
      <CardHeader title="New Super Admin" subtitle="Onboard a white-label tenant" />
      <CardBody>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
        >
          <Input
            label="Business Name"
            placeholder="e.g. Acme Society Services"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
          <Input
            label="URL Slug (optional)"
            placeholder="e.g. acme"
            value={form.slug}
            onChange={(e) =>
              update(
                "slug",
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
              )
            }
            hint="Auto-generated from name if blank"
          />
          <Input
            label="Contact Mobile"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            prefix="+91"
            placeholder="98xxx xxxxx"
            value={form.contactMobile}
            onChange={(e) =>
              update(
                "contactMobile",
                e.target.value.replace(/\D/g, "").slice(0, 10)
              )
            }
            required
          />
          <Input
            label="Contact Email"
            type="email"
            placeholder="contact@example.com"
            value={form.contactEmail}
            onChange={(e) => update("contactEmail", e.target.value)}
          />
          <div>
            <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2">
              Brand Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.brandColor}
                onChange={(e) => update("brandColor", e.target.value)}
                className="w-12 h-12 rounded-xl border border-stone-200 cursor-pointer"
              />
              <span className="text-sm text-ink-muted tabular">
                {form.brandColor}
              </span>
            </div>
          </div>
          <Input
            label="Annual Plan (₹)"
            type="number"
            min={0}
            value={form.planAmount}
            onChange={(e) => update("planAmount", parseInt(e.target.value) || 0)}
          />

          {error && (
            <div className="md:col-span-2 p-3 rounded-xl bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="md:col-span-2 flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Create Super Admin
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}