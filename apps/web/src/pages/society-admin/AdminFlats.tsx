import { useState, useMemo } from "react"
import { useOutletContext } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { AdminContext, FlatWithMembers } from "./SocietyAdminLayout"

export default function AdminFlats() {
  const { society, flats, myRole, refresh } =
    useOutletContext<AdminContext>()
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

  // canManageMembers: chairman/secretary/cashier
  const canManageMembers = ["chairman", "secretary", "cashier"].includes(
    myRole
  )

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
          title={
            blockFilter === "all" ? "All Flats" : `Block ${blockFilter}`
          }
          subtitle={`Showing ${filteredFlats.length} of ${flats.length} flats`}
        />
        <CardBody className="!p-0">
          {filteredFlats.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-serif text-lg text-ink mb-1">
                No flats found
              </p>
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
                    <th className="px-2 py-3">Members</th>
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
                        setExpandedFlatId(
                          expandedFlatId === flat.id ? null : flat.id
                        )
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
  const memberCount = flat.members.length
  const isVacant = memberCount === 0

  return (
    <>
      <tr
        className={`border-b border-stone-100 hover:bg-cream-light transition-colors ${
          isVacant ? "bg-amber-50/30" : ""
        }`}
      >
        <td className="px-6 py-4 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center justify-center">
            {!isVacant && (
              <span
                className={`text-ink-muted text-xs transition-transform ${
                  expanded ? "rotate-90" : ""
                }`}
              >
                ▶
              </span>
            )}
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
        <td className="px-2 py-4">
          <p className="text-sm text-ink-light tabular">
            {memberCount === 0 ? (
              <span className="text-amber-600 italic">vacant</span>
            ) : (
              `${memberCount} member${memberCount === 1 ? "" : "s"}`
            )}
          </p>
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
      {expanded && memberCount > 0 && (
        <tr className="border-b border-stone-100">
          <td></td>
          <td colSpan={6} className="px-2 py-3 bg-cream-light/40">
            <div className="space-y-2 max-w-3xl">
              {flat.members.map((m) => (
                <MemberCard
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
          </td>
        </tr>
      )}
    </>
  )
}

function MemberCard({
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
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl border border-stone-100">
      <div className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center text-ink text-xs font-serif">
        {(member.name ?? member.mobile.slice(-2)).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-ink">{member.name ?? "—"}</p>
          {member.isPrimary && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rust/10 text-rust font-medium uppercase tracking-wider">
              primary
            </span>
          )}
          {member.role !== "member" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink font-medium uppercase tracking-wider">
              {member.role}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted tabular mt-0.5">
          +91 {member.mobile} · {member.relation}
        </p>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50"
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
