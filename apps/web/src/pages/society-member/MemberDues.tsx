import { useState, useEffect, useCallback } from "react"
import { useOutletContext } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Card, CardBody } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { MemberContext } from "./MemberLayout"

type FrequencyOption = {
  frequency: string
  amountPerCycle: number
  cyclesPerYear: number
  fyTotalIfChosen: number
}

type DueEntry = {
  masterId: number
  fyLabel: string
  fyStartDate: string
  fyEndDate: string
  flat: {
    id: number
    block: string
    flatNo: string
    label: string
    residencyType: string
    societyName: string
  }
  frequencyLocked: boolean
  frequency: string | null
  amountPerCycle?: number
  totalAmount: number | null
  paidAmount: number
  outstanding: number | null
  status: string
  availableFrequencies?: FrequencyOption[]
}

type Cycle = {
  id: number
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
}

type PenaltyDetail = {
  cycleNo: number
  label: string
  dueEndDate: string
  lateDays: number
  penaltyPerDay: number
  penaltyAmount: number
}

const FREQ_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
}

export default function MemberDues() {
  const { myFlat } = useOutletContext<MemberContext>()
  const { token } = useAuth()
  const [dues, setDues] = useState<DueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payingEntry, setPayingEntry] = useState<DueEntry | null>(null)

  const reload = useCallback(async () => {
    if (!token) return
    try {
      const res = await api<{ dues: DueEntry[] }>("/member/dues", { token })
      setDues(res.dues)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dues")
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<{ dues: DueEntry[] }>("/member/dues", { token })
        if (!cancelled) setDues(res.dues)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Flat summary strip */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-stone-100 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">My Flat</p>
          <p className="font-serif text-2xl text-ink mt-0.5">{myFlat.label}</p>
        </div>
        <div className="bg-white rounded-xl border border-stone-100 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">Type</p>
          <p className="font-serif text-2xl text-ink capitalize mt-0.5">
            {myFlat.residencyType}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {dues.length === 0 ? (
        <Card>
          <CardBody className="text-center py-16">
            <div className="text-5xl mb-3">🎉</div>
            <p className="font-serif text-xl text-ink mb-1">All clear!</p>
            <p className="text-sm text-ink-muted">
              No outstanding maintenance dues right now.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="font-serif text-xl italic text-ink">Outstanding Dues</h2>
          {dues.map((due) => (
            <DueCard
              key={`${due.masterId}-${due.flat.id}`}
              due={due}
              onPay={() => setPayingEntry(due)}
            />
          ))}
        </div>
      )}

      {payingEntry && (
        <PayDialog
          due={payingEntry}
          onClose={() => setPayingEntry(null)}
          onSuccess={() => {
            setPayingEntry(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function DueCard({ due, onPay }: { due: DueEntry; onPay: () => void }) {
  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN")}`

  const isUnlocked = !due.frequencyLocked

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-serif text-lg text-ink">{due.fyLabel}</h3>
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
            <p className="text-xs text-ink-muted">Flat {due.flat.label}</p>
          </div>
          {due.outstanding != null && due.outstanding > 0 && (
            <div className="text-right">
              <p className="text-xs text-ink-muted uppercase tracking-wider">Outstanding</p>
              <p className="font-serif text-2xl text-rust tabular">
                {fmt(due.outstanding)}
              </p>
            </div>
          )}
        </div>

        {isUnlocked && due.availableFrequencies && due.availableFrequencies.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-ink-muted mb-3">
              Choose your payment frequency — it will be locked for this financial year once you pay.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {due.availableFrequencies.map((opt) => (
                <div
                  key={opt.frequency}
                  className="border border-stone-200 rounded-xl p-3 bg-cream-light"
                >
                  <p className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">
                    {FREQ_LABEL[opt.frequency] ?? opt.frequency}
                  </p>
                  <p className="font-serif text-lg text-ink tabular">
                    {fmt(opt.amountPerCycle)}
                  </p>
                  <p className="text-[10px] text-ink-muted mt-0.5">
                    × {opt.cyclesPerYear} = {fmt(opt.fyTotalIfChosen)}/yr
                  </p>
                </div>
              ))}
            </div>
            <Button fullWidth onClick={onPay} className="mt-2">
              Pay Now
            </Button>
          </div>
        ) : due.frequencyLocked ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Frequency</span>
              <span className="font-medium text-ink capitalize">
                {FREQ_LABEL[due.frequency ?? ""] ?? due.frequency}
              </span>
            </div>
            {due.amountPerCycle && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Per cycle</span>
                <span className="tabular text-ink">{fmt(due.amountPerCycle)}</span>
              </div>
            )}
            {due.totalAmount != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">FY total</span>
                <span className="tabular text-ink">{fmt(due.totalAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Paid so far</span>
              <span className="tabular text-emerald-700">{fmt(due.paidAmount)}</span>
            </div>
            <div className="border-t border-stone-100 pt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Outstanding</span>
              <span className="font-serif text-xl text-rust tabular">
                {fmt(due.outstanding ?? 0)}
              </span>
            </div>
            {(due.outstanding ?? 0) > 0 && (
              <Button fullWidth onClick={onPay}>
                Pay Now
              </Button>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}

const PAYMENT_MODES = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "manual", label: "Other" },
] as const

function PayDialog({
  due,
  onClose,
  onSuccess,
}: {
  due: DueEntry
  onClose: () => void
  onSuccess: () => void
}) {
  const { token } = useAuth()
  const [selectedFreq, setSelectedFreq] = useState<string>(
    due.frequency ?? due.availableFrequencies?.[0]?.frequency ?? ""
  )
  const [mode, setMode] = useState<"upi" | "cash" | "cheque" | "manual">("upi")
  const [txnId, setTxnId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [penaltyDetails, setPenaltyDetails] = useState<PenaltyDetail[]>([])

  // Compute amount for selected frequency
  const freqOption = due.availableFrequencies?.find((f) => f.frequency === selectedFreq)
  const amountPerCycle = freqOption?.amountPerCycle ?? due.amountPerCycle ?? 0
  const outstanding = due.outstanding ?? (freqOption ? freqOption.fyTotalIfChosen : 0)

  // Number of cycles to pay (default = 1 cycle)
  const [payCycles, setPayCycles] = useState(1)
  const maxCycles = amountPerCycle > 0 ? Math.floor(outstanding / amountPerCycle) : 1
  const baseAmount = amountPerCycle * payCycles
  const totalPenalty = penaltyDetails.slice(0, payCycles).reduce((sum, p) => sum + p.penaltyAmount, 0)
  const totalAmount = baseAmount + totalPenalty

  // Fetch cycles when frequency changes
  useEffect(() => {
    if (!selectedFreq) return

    const fetchCycles = async () => {
      try {
        const res = await api<{ cycles: Cycle[] }>(
          `/member/cycles/${due.masterId}?frequency=${selectedFreq}&flatId=${due.flat.id}`,
          { token }
        )

        const now = new Date()
        const details: PenaltyDetail[] = res.cycles.map((cycle) => {
          const dueEnd = new Date(cycle.dueEndDate)
          const lateDays = Math.max(0, Math.floor((now.getTime() - dueEnd.getTime()) / (24 * 60 * 60 * 1000)))
          const penaltyPerDay = due.flat.residencyType === 'tenant' ? cycle.penaltyPerDayTenant : cycle.penaltyPerDayOwner
          const penaltyAmount = lateDays * penaltyPerDay
          return {
            cycleNo: cycle.cycleNo,
            label: cycle.label,
            dueEndDate: cycle.dueEndDate,
            lateDays,
            penaltyPerDay,
            penaltyAmount,
          }
        })
        setPenaltyDetails(details)
      } catch {
        setPenaltyDetails([])
      }
    }

    fetchCycles()
  }, [selectedFreq, due.masterId, due.flat.id, due.flat.residencyType, token])

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !selectedFreq) return
    setError(null)
    setLoading(true)
    try {
      await api(`/member/pay`, {
        method: "POST",
        token,
        body: {
          masterId: due.masterId,
          flatId: due.flat.id,
          frequency: selectedFreq,
          amount: baseAmount,
          penaltyAmount: totalPenalty,
          mode,
          gatewayTxnId: txnId.trim() || null,
        },
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment failed")
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
            <h3 className="font-serif text-lg text-ink">Pay Maintenance</h3>
            <p className="text-xs text-ink-muted">
              {due.fyLabel} · Flat {due.flat.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handlePay} className="p-6 space-y-5">
          {/* Frequency selector (only if not locked) */}
          {!due.frequencyLocked && due.availableFrequencies && (
            <div>
              <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2">
                Payment Frequency
              </label>
              <div className="grid grid-cols-2 gap-2">
                {due.availableFrequencies.map((opt) => (
                  <button
                    key={opt.frequency}
                    type="button"
                    onClick={() => { setSelectedFreq(opt.frequency); setPayCycles(1) }}
                    className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                      selectedFreq === opt.frequency
                        ? "bg-ink text-cream"
                        : "bg-cream-dark text-ink-light hover:bg-stone-200"
                    }`}
                  >
                    {FREQ_LABEL[opt.frequency] ?? opt.frequency}
                    <span className="block text-xs opacity-70">
                      ₹{opt.amountPerCycle.toLocaleString("en-IN")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cycles */}
          {amountPerCycle > 0 && maxCycles > 1 && (
            <div>
              <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2">
                Number of Cycles
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPayCycles((c) => Math.max(1, c - 1))}
                  className="w-9 h-9 rounded-full bg-cream-dark text-ink font-medium hover:bg-stone-200 flex items-center justify-center"
                >
                  −
                </button>
                <span className="font-serif text-2xl text-ink tabular w-8 text-center">
                  {payCycles}
                </span>
                <button
                  type="button"
                  onClick={() => setPayCycles((c) => Math.min(maxCycles, c + 1))}
                  className="w-9 h-9 rounded-full bg-cream-dark text-ink font-medium hover:bg-stone-200 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Penalty Details */}
          {penaltyDetails.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2">
                Penalty Details
              </label>
              <div className="space-y-2">
                {penaltyDetails.slice(0, payCycles).map((penalty) => (
                  <div key={penalty.cycleNo} className="bg-cream-light rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">{penalty.label}</span>
                      <span className="text-ink-muted">₹{penalty.penaltyAmount.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      Due: {new Date(penalty.dueEndDate).toLocaleDateString()} | 
                      Late: {penalty.lateDays} days | 
                      ₹{penalty.penaltyPerDay}/day
                    </div>
                  </div>
                ))}
                {payCycles > penaltyDetails.length && (
                  <div className="bg-cream-light rounded-lg p-3 text-sm text-ink-muted">
                    Additional cycles: No penalty (not overdue)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Amount summary */}
          {amountPerCycle > 0 && (
            <div className="bg-cream-light rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">Base Amount ({payCycles} cycle{payCycles > 1 ? 's' : ''})</span>
                <span className="font-serif text-lg text-ink tabular">
                  ₹{baseAmount.toLocaleString("en-IN")}
                </span>
              </div>
              {totalPenalty > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-muted">Penalty</span>
                  <span className="font-serif text-lg text-ink tabular">
                    ₹{totalPenalty.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
              <div className="border-t border-stone-200 pt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Total Amount</span>
                <span className="font-serif text-2xl text-ink tabular">
                  ₹{totalAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}

          {/* Payment mode */}
          <div>
            <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-2">
              Payment Mode
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium transition-all ${
                    mode === m.value
                      ? "bg-ink text-cream"
                      : "bg-cream-dark text-ink-light hover:bg-stone-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference / txn ID */}
          {(mode === "upi" || mode === "cheque") && (
            <div>
              <label className="block text-xs font-medium text-ink-light uppercase tracking-wider mb-1">
                {mode === "upi" ? "UPI Reference ID (optional)" : "Cheque Number (optional)"}
              </label>
              <input
                type="text"
                value={txnId}
                onChange={(e) => setTxnId(e.target.value)}
                placeholder={mode === "upi" ? "e.g. 3218XXXXXX" : "e.g. 001234"}
                className="w-full px-4 py-2 bg-cream-light border border-stone-200 rounded-xl text-sm text-ink focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" fullWidth onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={loading} disabled={!selectedFreq || baseAmount <= 0}>
              Pay ₹{totalAmount.toLocaleString("en-IN")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
