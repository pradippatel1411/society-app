import { useState } from "react"
import { useOutletContext } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { MemberContext } from "./MemberLayout"

export default function MemberMyFlat() {
  const { society, myFlat, myUserId, refresh } = useOutletContext<MemberContext>()
  const [addingMember, setAddingMember] = useState(false)

  const isOwner = myFlat.residencyType === "owner"

  return (
    <div className="space-y-6">
      {/* Flat info — read only */}
      <Card>
        <CardHeader
          title={`Flat ${myFlat.label}`}
          subtitle={society.name}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">Block</p>
              <p className="text-ink font-medium">{myFlat.block}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">Flat No.</p>
              <p className="text-ink font-medium">{myFlat.flatNo}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">Residency Type</p>
              <span
                className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                  isOwner ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                }`}
              >
                {isOwner ? "Owner" : "Tenant"}
              </span>
            </div>
            {myFlat.ownerName && (
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">Owner Name</p>
                <p className="text-ink font-medium">{myFlat.ownerName}</p>
              </div>
            )}
          </div>
          <p className="mt-4 text-[11px] text-ink-muted/70 italic">
            Flat type and owner details can only be changed by the society committee.
          </p>
        </CardBody>
      </Card>

      {/* Members list */}
      <Card>
        <CardHeader
          title="Flat Members"
          subtitle={`${myFlat.members.length} member${myFlat.members.length === 1 ? "" : "s"} linked to this flat`}
        />
        <CardBody className="!p-0">
          {myFlat.members.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-ink-muted text-sm">No members linked yet</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {myFlat.members.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  societyId={society.id}
                  flatId={myFlat.id}
                  flatLabel={myFlat.label}
                  isSelf={m.userId === myUserId}
                  onChanged={refresh}
                />
              ))}
            </div>
          )}
          <div className="p-4 border-t border-stone-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddingMember(true)}
            >
              + Add Member
            </Button>
          </div>
        </CardBody>
      </Card>

      {addingMember && (
        <AddMemberDialog
          flat={myFlat}
          societyId={society.id}
          onClose={() => setAddingMember(false)}
          onSuccess={() => {
            setAddingMember(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function MemberRow({
  member,
  societyId,
  flatId,
  flatLabel,
  isSelf,
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
  isSelf: boolean
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!token) return
    if (
      !confirm(
        `Remove ${member.name ?? member.mobile} from ${flatLabel}?\n\nThis only removes them from this flat.`
      )
    )
      return
    setRemoving(true)
    try {
      await api(`/society/${societyId}/flats/${flatId}/members/${member.userId}`, {
        method: "DELETE",
        token,
      })
      await onChanged()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to remove member")
    } finally {
      setRemoving(false)
    }
  }

  const ROLE_BADGE: Record<string, string> = {
    chairman: "bg-rust/10 text-rust",
    secretary: "bg-blue-50 text-blue-700",
    cashier: "bg-emerald-50 text-emerald-700",
    committee: "bg-amber-50 text-amber-700",
    member: "bg-stone-100 text-stone-600",
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-ink/10 flex items-center justify-center text-ink text-sm font-serif flex-shrink-0">
        {(member.name ?? member.mobile.slice(-2)).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-ink">{member.name ?? "—"}</p>
          {isSelf && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rust/10 text-rust font-medium uppercase tracking-wider">
              you
            </span>
          )}
          {member.isPrimary && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink font-medium uppercase tracking-wider">
              primary
            </span>
          )}
          {member.role !== "member" && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider capitalize ${
                ROLE_BADGE[member.role] ?? ROLE_BADGE.member
              }`}
            >
              {member.role}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted tabular mt-0.5">
          +91 {member.mobile} · {member.relation}
        </p>
      </div>
      {/* Can remove anyone except self if primary (that would lock them out) */}
      {!(isSelf && member.isPrimary) && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50 flex-shrink-0"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      )}
    </div>
  )
}

function AddMemberDialog({
  flat,
  societyId,
  onClose,
  onSuccess,
}: {
  flat: { id: number; label: string; residencyType: string }
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
        body: { mobile, name: name.trim() || undefined, relation },
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
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">
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
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
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
            <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" fullWidth onClick={onClose} disabled={loading}>
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
