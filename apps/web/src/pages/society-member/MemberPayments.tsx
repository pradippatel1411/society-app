import { useState, useEffect } from "react"
import { useOutletContext } from "react-router-dom"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { MemberContext } from "./MemberLayout"

type Payment = {
  paymentId: number
  amount: number
  penaltyAmount: number
  frequency: string
  mode: string
  gateway: string | null
  gatewayTxnId: string | null
  status: string
  receiptUrl: string | null
  paidAt: string
  flatId: number
  block: string
  flatNo: string
  masterId: number
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

export default function MemberPayments() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ctx = useOutletContext<MemberContext>()
  const { token } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<{ payments: Payment[] }>("/member/payments", { token })
        if (!cancelled) setPayments(res.payments)
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
      <h2 className="font-serif text-xl italic text-ink">Payment History</h2>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {payments.length === 0 ? (
        <Card>
          <CardBody className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="font-serif text-xl text-ink mb-1">No payments yet</p>
            <p className="text-sm text-ink-muted">
              Your payment history will appear here once you make your first payment.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="All Payments"
            subtitle={`${payments.length} transaction${payments.length === 1 ? "" : "s"}`}
          />
          <CardBody className="!p-0">
            <div className="divide-y divide-stone-100">
              {payments.map((p) => (
                <PaymentRow key={p.paymentId} payment={p} />
              ))}
            </div>
          </CardBody>
        </Card>
      )}
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
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
        ✓
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-ink">{p.fyLabel}</p>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
            {FREQ_LABEL[p.frequency] ?? p.frequency}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
            {MODE_LABEL[p.mode] ?? p.mode}
          </span>
        </div>
        <p className="text-xs text-ink-muted mt-0.5">
          Flat {p.block}-{p.flatNo} · {date}
        </p>
        {p.gatewayTxnId && (
          <p className="text-[10px] text-ink-muted/60 tabular mt-0.5">
            Ref: {p.gatewayTxnId}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-serif text-lg text-emerald-700 tabular">
          ₹{p.amount.toLocaleString("en-IN")}
        </p>
        {p.penaltyAmount > 0 && (
          <p className="font-serif text-sm text-orange-600 tabular">
            Penalty: ₹{p.penaltyAmount.toLocaleString("en-IN")}
          </p>
        )}
        <span
          className={`text-[10px] capitalize block mt-1 ${
            p.status === "success" ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {p.status}
        </span>
      </div>
    </div>
  )
}
