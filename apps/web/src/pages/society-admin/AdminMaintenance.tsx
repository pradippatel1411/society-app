import { useState, useEffect, useCallback } from "react"
import { useOutletContext } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { AdminContext } from "./SocietyAdminLayout"

// ── Types ────────────────────────────────────────────────────

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

type CycleStats = {
  totalFlats: number
  paid: number
  partial: number
  unpaid: number
  penaltyDue: number
  collectedAmount: number
  totalDueAmount: number
}

type MaintenanceCycle = {
  id: number
  maintenanceMasterId: number
  societyId: number
  frequency: string
  cycleNo: number
  label: string
  periodStartDate: string
  periodEndDate: string
  dueStartDate: string
  dueEndDate: string
  amountOwner: number
  amountTenant: number
  penaltyPerDayOwner: number
  penaltyPerDayTenant: number
  createdAt: string
  stats: CycleStats
}

type CyclesResponse = {
  master: { id: number; fyLabel: string; status: string }
  cycles: MaintenanceCycle[]
  grouped: Record<string, MaintenanceCycle[]>
}

const COMMITTEE_ROLES = ["chairman", "secretary", "cashier", "committee"]

const FREQ_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
}

const FREQ_ORDER = ["monthly", "quarterly", "half_yearly", "yearly"]

// ── Main page ─────────────────────────────────────────────────

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
    return () => { cancelled = true }
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
            One entry per financial year. Click any master to view its
            installment cycles.
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
          existingFyLabels={masters.map((m) => m.fyLabel)}
          onCancel={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); reload() }}
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
        <div className="space-y-4">
          {masters.map((m) => (
            <MasterCard
              key={m.id}
              master={m}
              societyId={society.id}
              canEdit={canCreate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── MasterCard with expandable cycle detail ───────────────────

function MasterCard({
  master,
  societyId,
  canEdit,
}: {
  master: MaintenanceMaster
  societyId: number
  canEdit: boolean
}) {
  const { token } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [cyclesData, setCyclesData] = useState<CyclesResponse | null>(null)
  const [cyclesLoading, setCyclesLoading] = useState(false)
  const [cyclesError, setCyclesError] = useState<string | null>(null)

  const fmt = (n: number | null) =>
    n == null ? "—" : `₹${n.toLocaleString("en-IN")}`

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })

  async function handleExpand() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (cyclesData) return // already loaded
    setCyclesLoading(true)
    setCyclesError(null)
    try {
      const res = await api<CyclesResponse>(
        `/society/${societyId}/maintenance-master/${master.id}/cycles`,
        { token }
      )
      setCyclesData(res)
    } catch (err) {
      setCyclesError(err instanceof Error ? err.message : "Failed to load cycles")
    } finally {
      setCyclesLoading(false)
    }
  }

  // Which frequencies are configured in this master
  const enabledFreqs = FREQ_ORDER.filter((f) => {
    if (f === "monthly") return master.ownerMonthly != null
    if (f === "quarterly") return master.ownerQuarterly != null
    if (f === "half_yearly") return master.ownerHalfYearly != null
    if (f === "yearly") return master.ownerYearly != null
    return false
  })

  return (
    <Card>
      {/* ── Header row ── */}
      <CardBody>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
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
              {fmtDate(master.fyStartDate)} → {fmtDate(master.fyEndDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExpand}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
          >
            {expanded ? "▲ Hide Cycles" : "▼ View Cycles"}
          </button>
        </div>

        {/* ── Amounts table ── */}
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
              {[
                ["Monthly", master.ownerMonthly, master.tenantMonthly],
                ["Quarterly", master.ownerQuarterly, master.tenantQuarterly],
                ["Half-yearly", master.ownerHalfYearly, master.tenantHalfYearly],
                ["Yearly", master.ownerYearly, master.tenantYearly],
              ].map(([label, owner, tenant]) => (
                <tr key={label as string} className="border-b border-stone-50">
                  <td className="py-2 text-ink-muted">{label}</td>
                  <td className="py-2 text-right tabular">{fmt(owner as number | null)}</td>
                  <td className="py-2 text-right tabular">{fmt(tenant as number | null)}</td>
                </tr>
              ))}
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

      {/* ── Cycles detail panel ── */}
      {expanded && (
        <div className="border-t border-stone-100">
          {cyclesLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {cyclesError && (
            <div className="p-4">
              <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">
                {cyclesError}
              </div>
            </div>
          )}

          {cyclesData && (
            <div className="p-5 space-y-6">
              <p className="text-xs uppercase tracking-wider text-ink-muted font-medium">
                Installment Cycles
              </p>

              {/* Group by frequency — only show frequencies that have cycles */}
              {FREQ_ORDER.filter(
                (freq) => (cyclesData.grouped[freq]?.length ?? 0) > 0
              ).map((freq) => (
                <FrequencyGroup
                  key={freq}
                  freq={freq}
                  cycles={cyclesData.grouped[freq]}
                  canEdit={canEdit}
                />
              ))}

              {cyclesData.cycles.length === 0 && (
                <p className="text-sm text-ink-muted text-center py-4">
                  No cycles generated for this master yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Frequency group (Monthly / Quarterly / etc.) ──────────────

function FrequencyGroup({
  freq,
  cycles,
  canEdit,
}: {
  freq: string
  cycles: MaintenanceCycle[]
  canEdit: boolean
}) {
  // Aggregate stats across all cycles in this frequency
  const totalPaid = cycles.reduce((s, c) => s + c.stats.paid, 0)
  const totalFlats = cycles[0]?.stats.totalFlats ?? 0
  const totalCollected = cycles.reduce((s, c) => s + c.stats.collectedAmount, 0)
  const totalDue = cycles.reduce((s, c) => s + c.stats.totalDueAmount, 0)

  return (
    <div>
      {/* Frequency header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm font-medium text-ink">
          {FREQ_LABEL[freq] ?? freq}
        </span>
        <span className="text-xs text-ink-muted">
          {cycles.length} cycle{cycles.length === 1 ? "" : "s"}
        </span>
        {totalFlats > 0 && (
          <span className="ml-auto text-xs text-ink-muted tabular">
            ₹{totalCollected.toLocaleString("en-IN")} /{" "}
            ₹{totalDue.toLocaleString("en-IN")} collected
          </span>
        )}
      </div>

      {/* Cycle rows */}
      <div className="border border-stone-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream-light text-xs uppercase tracking-wider text-ink-muted">
              <th className="px-3 py-2 text-left font-medium">Cycle</th>
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-left font-medium">Due Window</th>
              <th className="px-3 py-2 text-right font-medium">Owner</th>
              <th className="px-3 py-2 text-right font-medium">Tenant</th>
              {canEdit && (
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {cycles.map((cycle, i) => {
              const isOverdue =
                new Date(cycle.dueEndDate) < new Date() &&
                cycle.stats.unpaid + cycle.stats.partial > 0
              return (
                <CycleRow
                  key={cycle.id}
                  cycle={cycle}
                  societyId={cycle.societyId}
                  isLast={i === cycles.length - 1}
                  isOverdue={isOverdue}
                  canEdit={canEdit}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Single cycle row ──────────────────────────────────────────

function CycleRow({
  cycle,
  societyId,
  isLast,
  isOverdue,
  canEdit,
}: {
  cycle: MaintenanceCycle
  societyId: number
  isLast: boolean
  isOverdue: boolean
  canEdit: boolean
}) {
  const { token } = useAuth()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dueStartDate, setDueStartDate] = useState(cycle.dueStartDate)
  const [dueEndDate, setDueEndDate] = useState(cycle.dueEndDate)

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`
  const fmtShort = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

  async function handleSave() {
    if (!token) return
    if (dueStartDate > dueEndDate) {
      setError('Start date must be on or before end date')
      return
    }

    setError(null)
    setSaving(true)

    try {
      await api(
        `/society/${societyId}/maintenance-master/${cycle.maintenanceMasterId}/cycles/${cycle.id}`,
        {
          method: 'PATCH',
          token,
          body: {
            dueStartDate,
            dueEndDate,
          },
        }
      )
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save due date')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDueStartDate(cycle.dueStartDate)
    setDueEndDate(cycle.dueEndDate)
    setError(null)
    setEditing(false)
  }

  return (
    <tr
      className={`${isLast ? "" : "border-b border-stone-50"} ${
        isOverdue ? "bg-red-50/40" : ""
      }`}
    >
      {/* Cycle label */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs w-5 h-5 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center font-medium flex-shrink-0">
            {cycle.cycleNo}
          </span>
          <span className="text-ink text-xs font-medium leading-tight">
            {cycle.label}
          </span>
          {isOverdue && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
              overdue
            </span>
          )}
        </div>
      </td>

      {/* Period */}
      <td className="px-3 py-2.5 text-xs text-ink-muted whitespace-nowrap">
        {fmtShort(cycle.periodStartDate)} – {fmtShort(cycle.periodEndDate)}
      </td>

      {/* Due window */}
      <td className="px-3 py-2.5 text-xs text-ink-muted whitespace-nowrap">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={dueStartDate}
              onChange={(e) => setDueStartDate(e.target.value)}
              className="w-auto min-w-[140px]"
            />
            <span className="text-ink-muted">to</span>
            <Input
              type="date"
              value={dueEndDate}
              onChange={(e) => setDueEndDate(e.target.value)}
              className="w-auto min-w-[140px]"
            />
          </div>
        ) : (
          `${fmtShort(cycle.dueStartDate)} – ${fmtShort(cycle.dueEndDate)}`
        )}
      </td>

      {/* Amounts */}
      <td className="px-3 py-2.5 text-right text-xs tabular text-ink">
        {fmt(cycle.amountOwner)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular text-ink">
        {fmt(cycle.amountTenant)}
      </td>

      {canEdit && (
        <td className="px-3 py-2.5 text-right align-top">
          {editing ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                loading={saving}
                onClick={handleSave}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )}
          {error && (
            <p className="text-[10px] text-red-600 mt-1">{error}</p>
          )}
        </td>
      )}
    </tr>
  )
}

// ── CreateMasterForm (unchanged from original) ────────────────

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
  monthlyDueStartDay: string
  monthlyDueEndDay: string
  quarterlyDueStartDay: string
  quarterlyDueEndDay: string
  halfYearlyDueStartDay: string
  halfYearlyDueEndDay: string
  yearlyDueStartDay: string
  yearlyDueEndDay: string
  penaltyPerDayOwner: string
  penaltyPerDayTenant: string
}

function currentFyStartYear(date: Date): number {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
}

function fyOption(startYear: number) {
  return {
    label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
    startDate: `${startYear}-04-01`,
    endDate: `${startYear + 1}-03-31`,
  }
}

function CreateMasterForm({
  societyId,
  existingFyLabels,
  onCancel,
  onSuccess,
}: {
  societyId: number
  existingFyLabels: string[]
  onCancel: () => void
  onSuccess: () => void
}) {
  const { token } = useAuth()
  const today = new Date()
  const fyStartYear = currentFyStartYear(today)
  const usedFyLabels = new Set(existingFyLabels)
  const fyOptions = Array.from({ length: 8 }, (_, i) => fyOption(fyStartYear - 1 + i))
  const defaultFy =
    fyOptions.find((fy) => !usedFyLabels.has(fy.label)) ?? fyOption(fyStartYear)

  const [form, setForm] = useState<FormState>({
    fyLabel: defaultFy.label,
    fyStartDate: defaultFy.startDate,
    fyEndDate: defaultFy.endDate,
    ownerMonthly: "",
    ownerQuarterly: "",
    ownerHalfYearly: "",
    ownerYearly: "",
    tenantMonthly: "",
    tenantQuarterly: "",
    tenantHalfYearly: "",
    tenantYearly: "",
    monthlyDueStartDay: "1",
    monthlyDueEndDay: "10",
    quarterlyDueStartDay: "1",
    quarterlyDueEndDay: "10",
    halfYearlyDueStartDay: "1",
    halfYearlyDueEndDay: "20",
    yearlyDueStartDay: "1",
    yearlyDueEndDay: "30",
    penaltyPerDayOwner: "",
    penaltyPerDayTenant: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function updateFinancialYear(label: string) {
    const selected = fyOptions.find((fy) => fy.label === label)
    if (!selected) return
    setForm((prev) => ({
      ...prev,
      fyLabel: selected.label,
      fyStartDate: selected.startDate,
      fyEndDate: selected.endDate,
    }))
  }

  function toIntOrNull(s: string): number | null {
    const trimmed = s.trim()
    if (!trimmed) return null
    const n = parseInt(trimmed, 10)
    return isNaN(n) || n < 0 ? null : n
  }

  function dueWindow(start: string, end: string) {
    const s = parseInt(start, 10)
    const e = parseInt(end, 10)
    if (isNaN(s) || isNaN(e) || s < 1 || s > 31 || e < 1 || e > 31 || e < s)
      return null
    return { dueStartDay: s, dueEndDay: e }
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    if (!form.fyLabel.trim()) { setError("Financial year is required"); return }
    if (usedFyLabels.has(form.fyLabel)) {
      setError(`${form.fyLabel} already exists for this society`)
      return
    }

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

    const hasMonthly = payload.ownerMonthly != null && payload.tenantMonthly != null
    const hasQuarterly = payload.ownerQuarterly != null && payload.tenantQuarterly != null
    const hasHalf = payload.ownerHalfYearly != null && payload.tenantHalfYearly != null
    const hasYearly = payload.ownerYearly != null && payload.tenantYearly != null

    if (!hasMonthly && !hasQuarterly && !hasHalf && !hasYearly) {
      setError("Enable at least one frequency by providing both owner and tenant amounts")
      return
    }

    const pairs: Array<[string, string, string]> = [
      ["ownerMonthly", "tenantMonthly", "Monthly"],
      ["ownerQuarterly", "tenantQuarterly", "Quarterly"],
      ["ownerHalfYearly", "tenantHalfYearly", "Half-yearly"],
      ["ownerYearly", "tenantYearly", "Yearly"],
    ]
    for (const [oKey, tKey, label] of pairs) {
      if ((payload[oKey] == null) !== (payload[tKey] == null)) {
        setError(`${label}: provide BOTH owner and tenant amounts, or leave both blank`)
        return
      }
    }

    const mw = dueWindow(form.monthlyDueStartDay, form.monthlyDueEndDay)
    const qw = dueWindow(form.quarterlyDueStartDay, form.quarterlyDueEndDay)
    const hw = dueWindow(form.halfYearlyDueStartDay, form.halfYearlyDueEndDay)
    const yw = dueWindow(form.yearlyDueStartDay, form.yearlyDueEndDay)

    if (
      (hasMonthly && !mw) ||
      (hasQuarterly && !qw) ||
      (hasHalf && !hw) ||
      (hasYearly && !yw)
    ) {
      setError("Due days must be 1–31 and end day ≥ start day")
      return
    }

    payload.dueWindows = {
      ...(hasMonthly && mw ? { monthly: mw } : {}),
      ...(hasQuarterly && qw ? { quarterly: qw } : {}),
      ...(hasHalf && hw ? { halfYearly: hw } : {}),
      ...(hasYearly && yw ? { yearly: yw } : {}),
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
            <div className="w-full">
              <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2">
                Financial Year
              </label>
              <select
                value={form.fyLabel}
                onChange={(e) => updateFinancialYear(e.target.value)}
                className="w-full pl-4 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-ink transition-all focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
                required
              >
                {fyOptions.map((fy) => (
                  <option key={fy.label} value={fy.label} disabled={usedFyLabels.has(fy.label)}>
                    {fy.label}{usedFyLabels.has(fy.label) ? " — already created" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Start Date" type="date" value={form.fyStartDate} readOnly className="bg-cream-light" required />
            <Input label="End Date" type="date" value={form.fyEndDate} readOnly className="bg-cream-light" required />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 mt-4">
              Frequency Amounts (₹)
            </p>
            <p className="text-xs text-ink-muted mb-4">
              For each frequency, provide BOTH owner and tenant amounts to enable it, or leave both blank to skip.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-ink-muted border-b border-stone-100">
                    <th className="py-2 text-left">Frequency</th>
                    <th className="py-2 text-left">Owner</th>
                    <th className="py-2 text-left">Tenant</th>
                    <th className="py-2 text-left">Due Start Day</th>
                    <th className="py-2 text-left">Due End Day</th>
                  </tr>
                </thead>
                <tbody>
                  <FreqRow label="Monthly" ownerVal={form.ownerMonthly} tenantVal={form.tenantMonthly} dueStartVal={form.monthlyDueStartDay} dueEndVal={form.monthlyDueEndDay} onOwner={(v) => update("ownerMonthly", v)} onTenant={(v) => update("tenantMonthly", v)} onDueStart={(v) => update("monthlyDueStartDay", v)} onDueEnd={(v) => update("monthlyDueEndDay", v)} />
                  <FreqRow label="Quarterly" ownerVal={form.ownerQuarterly} tenantVal={form.tenantQuarterly} dueStartVal={form.quarterlyDueStartDay} dueEndVal={form.quarterlyDueEndDay} onOwner={(v) => update("ownerQuarterly", v)} onTenant={(v) => update("tenantQuarterly", v)} onDueStart={(v) => update("quarterlyDueStartDay", v)} onDueEnd={(v) => update("quarterlyDueEndDay", v)} />
                  <FreqRow label="Half-yearly" ownerVal={form.ownerHalfYearly} tenantVal={form.tenantHalfYearly} dueStartVal={form.halfYearlyDueStartDay} dueEndVal={form.halfYearlyDueEndDay} onOwner={(v) => update("ownerHalfYearly", v)} onTenant={(v) => update("tenantHalfYearly", v)} onDueStart={(v) => update("halfYearlyDueStartDay", v)} onDueEnd={(v) => update("halfYearlyDueEndDay", v)} />
                  <FreqRow label="Yearly" ownerVal={form.ownerYearly} tenantVal={form.tenantYearly} dueStartVal={form.yearlyDueStartDay} dueEndVal={form.yearlyDueEndDay} onOwner={(v) => update("ownerYearly", v)} onTenant={(v) => update("tenantYearly", v)} onDueStart={(v) => update("yearlyDueStartDay", v)} onDueEnd={(v) => update("yearlyDueEndDay", v)} />
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-ink-muted mb-2 mt-4">
              Penalty per day (optional, ₹)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Penalty/day (Owner)" type="number" min={0} value={form.penaltyPerDayOwner} onChange={(e) => update("penaltyPerDayOwner", e.target.value)} placeholder="0" />
              <Input label="Penalty/day (Tenant)" type="number" min={0} value={form.penaltyPerDayTenant} onChange={(e) => update("penaltyPerDayTenant", e.target.value)} placeholder="0" />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading}>Create Master</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function FreqRow({
  label, ownerVal, tenantVal, dueStartVal, dueEndVal,
  onOwner, onTenant, onDueStart, onDueEnd,
}: {
  label: string
  ownerVal: string
  tenantVal: string
  dueStartVal: string
  dueEndVal: string
  onOwner: (v: string) => void
  onTenant: (v: string) => void
  onDueStart: (v: string) => void
  onDueEnd: (v: string) => void
}) {
  const inputCls =
    "w-full px-3 py-1.5 bg-cream-light border border-stone-200 rounded-lg text-sm text-ink tabular focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
  return (
    <tr className="border-b border-stone-50">
      <td className="py-2 pr-4 font-medium text-ink whitespace-nowrap">{label}</td>
      <td className="py-2 pr-2">
        <input type="number" min={0} value={ownerVal} onChange={(e) => onOwner(e.target.value)} placeholder="—" className={inputCls} />
      </td>
      <td className="py-2 pr-2">
        <input type="number" min={0} value={tenantVal} onChange={(e) => onTenant(e.target.value)} placeholder="—" className={inputCls} />
      </td>
      <td className="py-2 pr-2">
        <input type="number" min={1} max={31} value={dueStartVal} onChange={(e) => onDueStart(e.target.value)} className="w-20 px-3 py-1.5 bg-cream-light border border-stone-200 rounded-lg text-sm text-ink tabular focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10" />
      </td>
      <td className="py-2">
        <input type="number" min={1} max={31} value={dueEndVal} onChange={(e) => onDueEnd(e.target.value)} className="w-20 px-3 py-1.5 bg-cream-light border border-stone-200 rounded-lg text-sm text-ink tabular focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10" />
      </td>
    </tr>
  )
}
