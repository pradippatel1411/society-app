import { useState, useMemo, useEffect } from "react"
import { useOutletContext } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { AdminContext, FlatWithMembers } from "./SocietyAdminLayout"

// ─── Maintenance types (mirrors MemberDues / MemberPayments) ───────────────

type DueEntry = {
  masterId: number
  fyLabel: string
  fyStartDate: string
  fyEndDate: string
  frequencyLocked: boolean
  frequency: string | null
  amountPerCycle?: number
  totalAmount: number | null
  paidAmount: number
  outstanding: number | null
  status: string
  availableFrequencies?: {
    frequency: string
    amountPerCycle: number
    cyclesPerYear: number
    fyTotalIfChosen: number
  }[]
}

type Payment = {
  paymentId: number
  amount: number
  frequency: string
  mode: string
  gateway: string | null
  gatewayTxnId: string | null
  status: string
  receiptUrl: string | null
  paidAt: string
  fyLabel: string
}

const FREQ_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
}

const MODE_LABEL: Record<string, string> = {
  upi: "UPI",
  cash: "Cash",
  cheque: "Cheque",
  manual: "Manual",
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function AdminFlats() {
  const { society, flats, myRole, refresh } = useOutletContext<AdminContext>()
  const [search, setSearch] = useState("")
  const [blockFilter, setBlockFilter] = useState<string>("all")
  const [expandedFlatId, setExpandedFlatId] = useState<number | null>(null)
  const [addingTo, setAddingTo] = useState<FlatWithMembers | null>(null)

  const blocks = useMemo(() => {
    const set = new Set(flats.map((f) => f.block))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [flats])

  const countByBlock = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of flats) m.set(f.block, (m.get(f.block) ?? 0) + 1)
    return m
  }, [flats])

  const filteredFlats = useMemo(() => {
    let result = flats
    if (blockFilter !== "all") {
      result = result.filter((f) => f.block === blockFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          (f.ownerName ?? "").toLowerCase().includes(q) ||
          f.members.some(
            (m) =>
              (m.name ?? "").toLowerCase().includes(q) ||
              m.mobile.includes(q)
          )
      )
    }
    return [...result].sort((a, b) => {
      if (a.block !== b.block) return a.block.localeCompare(b.block)
      return a.flatNo.localeCompare(b.flatNo, undefined, { numeric: true })
    })
  }, [flats, blockFilter, search])

  const canManageMembers = ["chairman", "secretary", "cashier"].includes(myRole)

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="!p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              <FilterPill
                label={`All (${flats.length})`}
                active={blockFilter === "all"}
                onClick={() => setBlockFilter("all")}
              />
              {blocks.map((b) => (
                <FilterPill
                  key={b}
                  label={`Block ${b} (${countByBlock.get(b) ?? 0})`}
                  active={blockFilter === b}
                  onClick={() => setBlockFilter(b)}
                />
              ))}
            </div>
            <div className="flex-1 min-w-[180px]">
              <input
                type="text"
                placeholder="Search by flat, name, mobile…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 bg-cream-light border border-stone-200 rounded-xl text-sm text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={blockFilter === "all" ? "All Flats" : `Block ${blockFilter}`}
          subtitle={`Showing ${filteredFlats.length} of ${flats.length} flats`}
        />
        <CardBody className="!p-0">
          {filteredFlats.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-serif text-lg text-ink mb-1">No flats found</p>
              <p className="text-sm text-ink-muted">
                {flats.length === 0
                  ? "No flats in this society yet"
                  : "Try a different filter or search term"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-cream-light text-left text-xs uppercase tracking-wider text-ink-muted">
                    <th className="px-6 py-3 w-10"></th>
                    <th className="px-2 py-3">Flat</th>
                    <th className="px-2 py-3">Owner Name</th>
                    <th className="px-2 py-3">Type</th>
                    <th className="px-2 py-3">Maintenance</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFlats.map((flat) => (
                    <FlatRow
                      key={flat.id}
                      societyId={society.id}
                      flat={flat}
                      expanded={expandedFlatId === flat.id}
                      onToggle={() =>
                        setExpandedFlatId(expandedFlatId === flat.id ? null : flat.id)
                      }
                      canManage={canManageMembers}
                      onAddMember={() => setAddingTo(flat)}
                      onChanged={refresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {addingTo && (
        <AddMemberDialog
          flat={addingTo}
          societyId={society.id}
          onClose={() => setAddingTo(null)}
          onSuccess={() => {
            setAddingTo(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Filter pill ────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active
          ? "bg-ink text-cream"
          : "bg-cream-dark text-ink-light hover:bg-stone-200"
      }`}
    >
      {label}
    </button>
  )
}

// ─── Flat row ───────────────────────────────────────────────────────────────

function FlatRow({
  societyId,
  flat,
  expanded,
  onToggle,
  canManage,
  onAddMember,
  onChanged,
}: {
  societyId: number
  flat: FlatWithMembers
  expanded: boolean
  onToggle: () => void
  canManage: boolean
  onAddMember: () => void
  onChanged: () => Promise<void>
}) {
  const isOwner = flat.residencyType === "owner"
  const isVacant = flat.members.length === 0

  return (
    <>
      <tr
        className={`border-b border-stone-100 hover:bg-cream-light transition-colors ${
          isVacant ? "bg-amber-50/30" : ""
        }`}
      >
        {/* Expand chevron — always visible, maintenance accessible for all flats */}
        <td className="px-6 py-4 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center justify-center">
            <span
              className={`text-ink-muted text-xs transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
            >
              ▶
            </span>
          </div>
        </td>

        <td className="px-2 py-4 cursor-pointer" onClick={onToggle}>
          <p className="font-serif text-base text-ink">{flat.label}</p>
        </td>

        <td className="px-2 py-4 cursor-pointer" onClick={onToggle}>
          {flat.ownerName ? (
            <p className="text-ink">{flat.ownerName}</p>
          ) : (
            <p className="text-ink-muted/50 text-xs italic">— not provided —</p>
          )}
        </td>

        <td className="px-2 py-4">
          <span
            className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
              isOwner
                ? "bg-blue-50 text-blue-700"
                : "bg-purple-50 text-purple-700"
            }`}
          >
            {isOwner ? "Owner" : "Tenant"}
          </span>
        </td>

        {/* Maintenance column */}
        <td className="px-2 py-4">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-ink-muted hover:text-ink underline underline-offset-2 transition-colors"
          >
            {expanded ? "Hide ↑" : "Dues & history ↓"}
          </button>
        </td>

        <td className="px-2 py-4">
          {isVacant ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              vacant
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              occupied
            </span>
          )}
        </td>

        <td className="px-6 py-4 text-right">
          {canManage && (
            <button
              type="button"
              onClick={onAddMember}
              className="text-xs text-rust hover:text-rust-dark font-medium"
            >
              + Add Member
            </button>
          )}
        </td>
      </tr>

      {/* Expanded subgrid */}
      {expanded && (
        <tr className="border-b border-stone-100">
          <td></td>
          <td colSpan={6} className="px-2 py-4 bg-cream-light/40">
            <FlatSubgrid
              societyId={societyId}
              flat={flat}
              canManage={canManage}
              onChanged={onChanged}
            />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Subgrid with Dues + Payment History tabs ───────────────────────────────

type SubgridTab = "dues" | "payments"

function FlatSubgrid({
  societyId,
  flat,
  canManage,
  onChanged,
}: {
  societyId: number
  flat: FlatWithMembers
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<SubgridTab>("dues")

  return (
    <div className="max-w-3xl space-y-3">
      {/* Members compact chips */}
      {flat.members.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flat.members.map((m) => (
            <MemberChip
              key={m.userId}
              member={m}
              societyId={societyId}
              flatId={flat.id}
              flatLabel={flat.label}
              canManage={canManage}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-stone-200">
        {(["dues", "payments"] as SubgridTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-ink text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab === "dues" ? "Dues" : "Payment History"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "dues" ? (
        <FlatDuesList societyId={societyId} flatId={flat.id} />
      ) : (
        <FlatPaymentsList societyId={societyId} flatId={flat.id} />
      )}
    </div>
  )
}

// ─── Dues tab content ───────────────────────────────────────────────────────

function FlatDuesList({
  societyId,
  flatId,
}: {
  societyId: number
  flatId: number
}) {
  const { token } = useAuth()
  const [dues, setDues] = useState<DueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<{ dues: DueEntry[] }>(
          `/society/${societyId}/flats/${flatId}/dues`,
          { token }
        )
        if (!cancelled) setDues(res.dues)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load dues")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, societyId, flatId])

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-600 py-2">{error}</p>
  }

  if (dues.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-4xl mb-2">🎉</p>
        <p className="font-serif text-base text-ink">No maintenance masters yet</p>
        <p className="text-xs text-ink-muted mt-0.5">
          Create a maintenance master to start tracking dues.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {dues.map((due) => (
        <DueCard key={due.masterId} due={due} />
      ))}
    </div>
  )
}

function DueCard({ due }: { due: DueEntry }) {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`

  return (
    <div className="bg-white rounded-xl border border-stone-100 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-serif text-base text-ink">{due.fyLabel}</h4>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                due.status === "paid"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {due.status === "paid" ? "paid" : "unpaid"}
            </span>
          </div>
          {due.frequency && (
            <p className="text-xs text-ink-muted capitalize">
              {FREQ_LABEL[due.frequency] ?? due.frequency}
            </p>
          )}
        </div>

        {due.outstanding != null && due.outstanding > 0 && (
          <div className="text-right">
            <p className="text-[10px] text-ink-muted uppercase tracking-wider">
              Outstanding
            </p>
            <p className="font-serif text-xl text-rust tabular">
              {fmt(due.outstanding)}
            </p>
          </div>
        )}
        {due.outstanding != null && due.outstanding <= 0 && due.totalAmount != null && (
          <div className="text-right">
            <p className="font-serif text-base text-emerald-700">All paid</p>
            <p className="text-xs text-ink-muted tabular">{fmt(due.totalAmount)}</p>
          </div>
        )}
      </div>

      {due.frequencyLocked && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs border-t border-stone-100 pt-3">
          {due.amountPerCycle != null && (
            <>
              <span className="text-ink-muted">Per cycle</span>
              <span className="col-span-2 tabular text-ink text-right">
                {fmt(due.amountPerCycle)}
              </span>
            </>
          )}
          {due.totalAmount != null && (
            <>
              <span className="text-ink-muted">FY total</span>
              <span className="col-span-2 tabular text-ink text-right">
                {fmt(due.totalAmount)}
              </span>
            </>
          )}
          <span className="text-ink-muted">Paid</span>
          <span className="col-span-2 tabular text-emerald-700 text-right">
            {fmt(due.paidAmount)}
          </span>
        </div>
      )}

      {!due.frequencyLocked &&
        due.availableFrequencies &&
        due.availableFrequencies.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {due.availableFrequencies.map((opt) => (
              <div
                key={opt.frequency}
                className="border border-stone-200 rounded-lg p-2 bg-cream-light"
              >
                <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wider">
                  {FREQ_LABEL[opt.frequency] ?? opt.frequency}
                </p>
                <p className="font-serif text-sm text-ink tabular">
                  {fmt(opt.amountPerCycle)}
                </p>
                <p className="text-[10px] text-ink-muted">
                  × {opt.cyclesPerYear} = {fmt(opt.fyTotalIfChosen)}/yr
                </p>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ─── Payment history tab content ────────────────────────────────────────────

function FlatPaymentsList({
  societyId,
  flatId,
}: {
  societyId: number
  flatId: number
}) {
  const { token } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<{ payments: Payment[] }>(
          `/society/${societyId}/flats/${flatId}/payments`,
          { token }
        )
        if (!cancelled) setPayments(res.payments)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load payments")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, societyId, flatId])

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-600 py-2">{error}</p>
  }

  if (payments.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-3xl mb-2">📭</p>
        <p className="font-serif text-base text-ink">No payments yet</p>
        <p className="text-xs text-ink-muted mt-0.5">
          Payment history will appear here once a payment is recorded.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-100 divide-y divide-stone-100">
      {payments.map((p) => (
        <PaymentRow key={p.paymentId} payment={p} />
      ))}
    </div>
  )
}

function PaymentRow({ payment: p }: { payment: Payment }) {
  const date = new Date(p.paidAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0 text-xs">
        ✓
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-ink">{p.fyLabel}</p>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
            {FREQ_LABEL[p.frequency] ?? p.frequency}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
            {MODE_LABEL[p.mode] ?? p.mode}
          </span>
        </div>
        <p className="text-xs text-ink-muted mt-0.5">{date}</p>
        {p.gatewayTxnId && (
          <p className="text-[10px] text-ink-muted/60 tabular mt-0.5">
            Ref: {p.gatewayTxnId}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-serif text-base text-emerald-700 tabular">
          ₹{p.amount.toLocaleString("en-IN")}
        </p>
        <span
          className={`text-[10px] capitalize ${
            p.status === "success" ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {p.status}
        </span>
      </div>
    </div>
  )
}

// ─── Compact member chip (replaces verbose MemberCard in subgrid) ───────────

function MemberChip({
  member,
  societyId,
  flatId,
  flatLabel,
  canManage,
  onChanged,
}: {
  member: {
    userId: number
    name: string | null
    mobile: string
    relation: string
    isPrimary: boolean
    role: string
  }
  societyId: number
  flatId: number
  flatLabel: string
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!token) return
    if (
      !confirm(
        `Remove ${member.name ?? member.mobile} from ${flatLabel}?\n\nThis only removes them from this flat — the user record and their other society memberships are preserved.`
      )
    )
      return
    setRemoving(true)
    try {
      await api(
        `/society/${societyId}/flats/${flatId}/members/${member.userId}`,
        { method: "DELETE", token }
      )
      await onChanged()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to remove member"
      alert(msg)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-stone-200 text-xs">
      <span className="font-medium text-ink">{member.name ?? member.mobile}</span>
      {member.isPrimary && (
        <span className="px-1 rounded bg-rust/10 text-rust text-[10px] uppercase tracking-wider">
          primary
        </span>
      )}
      {member.role !== "member" && (
        <span className="px-1 rounded bg-ink/10 text-ink text-[10px] uppercase tracking-wider">
          {member.role}
        </span>
      )}
      {canManage && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="text-red-400 hover:text-red-600 disabled:opacity-50 ml-0.5 leading-none"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ─── Add Member dialog (unchanged logic) ───────────────────────────────────

function AddMemberDialog({
  flat,
  societyId,
  onClose,
  onSuccess,
}: {
  flat: FlatWithMembers
  societyId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const { token } = useAuth()
  const [mobile, setMobile] = useState("")
  const [name, setName] = useState("")
  const [relation, setRelation] = useState<"owner" | "tenant" | "family">(
    flat.residencyType === "tenant" ? "tenant" : "family"
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{10}$/.test(mobile)) {
      setError("Enter a valid 10-digit mobile number")
      return
    }
    setLoading(true)
    try {
      await api(`/society/${societyId}/flats/${flat.id}/members`, {
        method: "POST",
        token,
        body: {
          mobile,
          name: name.trim() || undefined,
          relation,
        },
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-cream rounded-2xl shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg text-ink">Add Member</h3>
            <p className="text-xs text-ink-muted">to flat {flat.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-xl leading-none"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
            required
            autoFocus
          />
          <Input
            label="Name (optional)"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sunita Sharma"
          />
          <div>
            <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2">
              Relation
            </label>
            <div className="flex gap-2">
              {(["owner", "tenant", "family"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRelation(r)}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium capitalize transition-all ${
                    relation === r
                      ? "bg-ink text-cream"
                      : "bg-cream-dark text-ink-light hover:bg-stone-200"
                  }`}
                >
                  {r}
                </button>
              ))}
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
              fullWidth
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={loading}>
              Add Member
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
