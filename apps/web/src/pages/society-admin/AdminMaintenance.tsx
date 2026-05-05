import { useState, useEffect, useCallback } from "react"
import { useOutletContext } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { AdminContext } from "./SocietyAdminLayout"

type MaintenanceMaster = {
  id: number
  societyId: number
  fyLabel: string
  fyStartDate: string
  fyEndDate: string
  ownerMonthly: number | null
  ownerQuarterly: number | null
  ownerHalfYearly: number | null
  ownerYearly: number | null
  tenantMonthly: number | null
  tenantQuarterly: number | null
  tenantHalfYearly: number | null
  tenantYearly: number | null
  penaltyPerDayOwner: number | null
  penaltyPerDayTenant: number | null
  status: string
  createdAt: string
}

const COMMITTEE_ROLES = ["chairman", "secretary", "cashier", "committee"]

export default function AdminMaintenance() {
  const { society, myRole } = useOutletContext<AdminContext>()
  const { token } = useAuth()
  const [masters, setMasters] = useState<MaintenanceMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const canCreate = COMMITTEE_ROLES.includes(myRole)

  const reload = useCallback(async () => {
    if (!token) return
    try {
      const res = await api<{ masters: MaintenanceMaster[] }>(
        `/society/${society.id}/maintenance-master`,
        { token }
      )
      setMasters(res.masters)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }, [token, society.id])

  useEffect(() => {
    if (!token) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await api<{ masters: MaintenanceMaster[] }>(
          `/society/${society.id}/maintenance-master`,
          { token }
        )
        if (cancelled) return
        setMasters(res.masters)
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
  }, [token, society.id])

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-serif text-2xl italic text-ink">
            Maintenance Masters
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            One entry per financial year. Each member's dues are tracked
            against an active master.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ New FY Master"}
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && canCreate && (
        <CreateMasterForm
          societyId={society.id}
          onCancel={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false)
            reload()
          }}
        />
      )}

      {masters.length === 0 ? (
        <Card>
          <CardBody className="text-center py-16">
            <p className="font-serif text-xl text-ink mb-2">
              No maintenance masters yet
            </p>
            <p className="text-sm text-ink-muted mb-6">
              Create a financial year entry to begin collecting dues
            </p>
            {canCreate && (
              <Button onClick={() => setShowForm(true)}>
                Create First FY Master
              </Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {masters.map((m) => (
            <MasterCard key={m.id} master={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function MasterCard({ master }: { master: MaintenanceMaster }) {
  const fmt = (n: number | null) =>
    n == null ? "—" : `₹${n.toLocaleString("en-IN")}`

  const start = new Date(master.fyStartDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const end = new Date(master.fyEndDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-serif text-xl text-ink">{master.fyLabel}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                  master.status === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-stone-100 text-stone-600"
                }`}
              >
                {master.status}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              {start} → {end}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-muted border-b border-stone-100">
                <th className="py-2">Frequency</th>
                <th className="py-2 text-right">Owner</th>
                <th className="py-2 text-right">Tenant</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              <tr className="border-b border-stone-50">
                <td className="py-2">Monthly</td>
                <td className="py-2 text-right tabular">
                  {fmt(master.ownerMonthly)}
                </td>
                <td className="py-2 text-right tabular">
                  {fmt(master.tenantMonthly)}
                </td>
              </tr>
              <tr className="border-b border-stone-50">
                <td className="py-2">Quarterly</td>
                <td className="py-2 text-right tabular">
                  {fmt(master.ownerQuarterly)}
                </td>
                <td className="py-2 text-right tabular">
                  {fmt(master.tenantQuarterly)}
                </td>
              </tr>
              <tr className="border-b border-stone-50">
                <td className="py-2">Half-yearly</td>
                <td className="py-2 text-right tabular">
                  {fmt(master.ownerHalfYearly)}
                </td>
                <td className="py-2 text-right tabular">
                  {fmt(master.tenantHalfYearly)}
                </td>
              </tr>
              <tr>
                <td className="py-2">Yearly</td>
                <td className="py-2 text-right tabular">
                  {fmt(master.ownerYearly)}
                </td>
                <td className="py-2 text-right tabular">
                  {fmt(master.tenantYearly)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {(master.penaltyPerDayOwner || master.penaltyPerDayTenant) && (
          <p className="text-xs text-ink-muted mt-3">
            Penalty per day: Owner {fmt(master.penaltyPerDayOwner)} · Tenant{" "}
            {fmt(master.penaltyPerDayTenant)}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

type FormState = {
  fyLabel: string
  fyStartDate: string
  fyEndDate: string
  ownerMonthly: string
  ownerQuarterly: string
  ownerHalfYearly: string
  ownerYearly: string
  tenantMonthly: string
  tenantQuarterly: string
  tenantHalfYearly: string
  tenantYearly: string
  penaltyPerDayOwner: string
  penaltyPerDayTenant: string
}

function CreateMasterForm({
  societyId,
  onCancel,
  onSuccess,
}: {
  societyId: number
  onCancel: () => void
  onSuccess: () => void
}) {
  const { token } = useAuth()
  const today = new Date()
  const startDefault = `${today.getFullYear()}-04-01`
  const endDefault = `${today.getFullYear() + 1}-03-31`
  const fyLabelDefault = `FY ${today.getFullYear()}-${String(
    today.getFullYear() + 1
  ).slice(2)}`

  const [form, setForm] = useState<FormState>({
    fyLabel: fyLabelDefault,
    fyStartDate: startDefault,
    fyEndDate: endDefault,
    ownerMonthly: "",
    ownerQuarterly: "",
    ownerHalfYearly: "",
    ownerYearly: "",
    tenantMonthly: "",
    tenantQuarterly: "",
    tenantHalfYearly: "",
    tenantYearly: "",
    penaltyPerDayOwner: "",
    penaltyPerDayTenant: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function toIntOrNull(s: string): number | null {
    const trimmed = s.trim()
    if (!trimmed) return null
    const n = parseInt(trimmed, 10)
    if (isNaN(n) || n < 0) return null
    return n
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.fyLabel.trim()) {
      setError("FY Label is required")
      return
    }
    if (!form.fyStartDate || !form.fyEndDate) {
      setError("Start and end dates are required")
      return
    }

    // Build payload — null for empty, number for filled
    const payload: Record<string, unknown> = {
      fyLabel: form.fyLabel.trim(),
      fyStartDate: form.fyStartDate,
      fyEndDate: form.fyEndDate,
      ownerMonthly: toIntOrNull(form.ownerMonthly),
      ownerQuarterly: toIntOrNull(form.ownerQuarterly),
      ownerHalfYearly: toIntOrNull(form.ownerHalfYearly),
      ownerYearly: toIntOrNull(form.ownerYearly),
      tenantMonthly: toIntOrNull(form.tenantMonthly),
      tenantQuarterly: toIntOrNull(form.tenantQuarterly),
      tenantHalfYearly: toIntOrNull(form.tenantHalfYearly),
      tenantYearly: toIntOrNull(form.tenantYearly),
    }
    const penO = toIntOrNull(form.penaltyPerDayOwner)
    const penT = toIntOrNull(form.penaltyPerDayTenant)
    if (penO !== null) payload.penaltyPerDayOwner = penO
    if (penT !== null) payload.penaltyPerDayTenant = penT

    // Quick client-side check: at least one frequency enabled
    const hasMonthly =
      payload.ownerMonthly != null && payload.tenantMonthly != null
    const hasQuarterly =
      payload.ownerQuarterly != null && payload.tenantQuarterly != null
    const hasHalf =
      payload.ownerHalfYearly != null && payload.tenantHalfYearly != null
    const hasYearly =
      payload.ownerYearly != null && payload.tenantYearly != null

    if (!hasMonthly && !hasQuarterly && !hasHalf && !hasYearly) {
      setError(
        "Enable at least one frequency by providing both owner and tenant amounts"
      )
      return
    }

    // Cross-check: for each freq, both owner and tenant must be set or both null
    const pairs: Array<[string, string, string]> = [
      ["ownerMonthly", "tenantMonthly", "Monthly"],
      ["ownerQuarterly", "tenantQuarterly", "Quarterly"],
      ["ownerHalfYearly", "tenantHalfYearly", "Half-yearly"],
      ["ownerYearly", "tenantYearly", "Yearly"],
    ]
    for (const [oKey, tKey, label] of pairs) {
      const o = payload[oKey]
      const t = payload[tKey]
      if ((o == null) !== (t == null)) {
        setError(
          `${label}: provide BOTH owner and tenant amounts, or leave both blank`
        )
        return
      }
    }

    setLoading(true)
    try {
      await api(`/society/${societyId}/maintenance-master`, {
        method: "POST",
        token,
        body: payload,
      })
      onSuccess()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create master"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="New Maintenance Master"
        subtitle="Set up a new financial year. Fill amounts only for the frequencies you want to enable — leave the rest blank."
      />
      <CardBody>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="FY Label"
              value={form.fyLabel}
              onChange={(e) => update("fyLabel", e.target.value)}
              placeholder="e.g. FY 2026-27"
              required
            />
            <Input
              label="Start Date"
              type="date"
              value={form.fyStartDate}
              onChange={(e) => update("fyStartDate", e.target.value)}
              required
            />
            <Input
              label="End Date"
              type="date"
              value={form.fyEndDate}
              onChange={(e) => update("fyEndDate", e.target.value)}
              required
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-ink-muted mb-2 mt-4">
              Frequency Amounts (₹)
            </p>
            <p className="text-xs text-ink-muted mb-4">
              For each frequency, provide BOTH owner and tenant amounts to
              enable it, or leave both blank to skip.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-ink-muted border-b border-stone-100">
                    <th className="py-2 text-left">Frequency</th>
                    <th className="py-2 text-left">Owner ₹</th>
                    <th className="py-2 text-left">Tenant ₹</th>
                  </tr>
                </thead>
                <tbody>
                  <FreqRow
                    label="Monthly"
                    ownerVal={form.ownerMonthly}
                    tenantVal={form.tenantMonthly}
                    onOwner={(v) => update("ownerMonthly", v)}
                    onTenant={(v) => update("tenantMonthly", v)}
                  />
                  <FreqRow
                    label="Quarterly"
                    ownerVal={form.ownerQuarterly}
                    tenantVal={form.tenantQuarterly}
                    onOwner={(v) => update("ownerQuarterly", v)}
                    onTenant={(v) => update("tenantQuarterly", v)}
                  />
                  <FreqRow
                    label="Half-yearly"
                    ownerVal={form.ownerHalfYearly}
                    tenantVal={form.tenantHalfYearly}
                    onOwner={(v) => update("ownerHalfYearly", v)}
                    onTenant={(v) => update("tenantHalfYearly", v)}
                  />
                  <FreqRow
                    label="Yearly"
                    ownerVal={form.ownerYearly}
                    tenantVal={form.tenantYearly}
                    onOwner={(v) => update("ownerYearly", v)}
                    onTenant={(v) => update("tenantYearly", v)}
                  />
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-ink-muted mb-2 mt-4">
              Penalty per day (optional, ₹)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Penalty/day (Owner)"
                type="number"
                min={0}
                value={form.penaltyPerDayOwner}
                onChange={(e) => update("penaltyPerDayOwner", e.target.value)}
                placeholder="0"
              />
              <Input
                label="Penalty/day (Tenant)"
                type="number"
                min={0}
                value={form.penaltyPerDayTenant}
                onChange={(e) => update("penaltyPerDayTenant", e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create Master
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function FreqRow({
  label,
  ownerVal,
  tenantVal,
  onOwner,
  onTenant,
}: {
  label: string
  ownerVal: string
  tenantVal: string
  onOwner: (v: string) => void
  onTenant: (v: string) => void
}) {
  return (
    <tr className="border-b border-stone-50">
      <td className="py-2 pr-4 font-medium text-ink whitespace-nowrap">
        {label}
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={0}
          value={ownerVal}
          onChange={(e) => onOwner(e.target.value)}
          placeholder="—"
          className="w-full px-3 py-1.5 bg-cream-light border border-stone-200 rounded-lg text-sm text-ink tabular focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
        />
      </td>
      <td className="py-2">
        <input
          type="number"
          min={0}
          value={tenantVal}
          onChange={(e) => onTenant(e.target.value)}
          placeholder="—"
          className="w-full px-3 py-1.5 bg-cream-light border border-stone-200 rounded-lg text-sm text-ink tabular focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
        />
      </td>
    </tr>
  )
}
