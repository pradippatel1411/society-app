import { useState, useMemo } from "react"
import { useOutletContext } from "react-router-dom"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, ApiError } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { AdminContext } from "./SocietyAdminLayout"

type RoleFilter = "all" | "committee" | "member"

type FlatMemberRow = {
  userId: number
  name: string | null
  mobile: string
  role: string
  relation: string
  isPrimary: boolean
  flatId: number
  flatLabel: string
  block: string
  flatNo: string
  residencyType: string
}

const COMMITTEE_ROLES = ["chairman", "secretary", "cashier", "committee"]

const ROLE_BADGE: Record<string, string> = {
  chairman: "bg-rust/10 text-rust",
  secretary: "bg-blue-50 text-blue-700",
  cashier: "bg-emerald-50 text-emerald-700",
  committee: "bg-amber-50 text-amber-700",
  member: "bg-stone-100 text-stone-600",
}

const ROLE_RANK: Record<string, number> = {
  chairman: 0,
  secretary: 1,
  cashier: 2,
  committee: 3,
  member: 4,
}

const ROLE_OPTIONS: Array<{
  value: "chairman" | "secretary" | "cashier" | "committee" | "member"
  label: string
}> = [
  { value: "chairman", label: "Chairman" },
  { value: "secretary", label: "Secretary" },
  { value: "cashier", label: "Cashier" },
  { value: "committee", label: "Committee" },
  { value: "member", label: "Member" },
]

export default function AdminMembers() {
  const { society, flats, myRole, refresh } =
    useOutletContext<AdminContext>()
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [search, setSearch] = useState("")

  const allMembers = useMemo<FlatMemberRow[]>(() => {
    const list: FlatMemberRow[] = []
    for (const flat of flats) {
      for (const m of flat.members) {
        list.push({
          userId: m.userId,
          name: m.name,
          mobile: m.mobile,
          role: m.role,
          relation: m.relation,
          isPrimary: m.isPrimary,
          flatId: flat.id,
          flatLabel: flat.label,
          block: flat.block,
          flatNo: flat.flatNo,
          residencyType: flat.residencyType,
        })
      }
    }
    return list
  }, [flats])

  const committeeCount = useMemo(
    () => allMembers.filter((m) => COMMITTEE_ROLES.includes(m.role)).length,
    [allMembers]
  )
  const regularCount = useMemo(
    () => allMembers.filter((m) => m.role === "member").length,
    [allMembers]
  )

  const filtered = useMemo(() => {
    let result = allMembers
    if (roleFilter === "committee") {
      result = result.filter((m) => COMMITTEE_ROLES.includes(m.role))
    } else if (roleFilter === "member") {
      result = result.filter((m) => m.role === "member")
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (m) =>
          (m.name ?? "").toLowerCase().includes(q) ||
          m.mobile.includes(q) ||
          m.flatLabel.toLowerCase().includes(q)
      )
    }
    return [...result].sort((a, b) => {
      const rankDiff =
        (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99)
      if (rankDiff !== 0) return rankDiff
      if (a.block !== b.block) return a.block.localeCompare(b.block)
      return a.flatNo.localeCompare(b.flatNo, undefined, { numeric: true })
    })
  }, [allMembers, roleFilter, search])

  // Only chairman can update roles
  const canUpdateRoles = myRole === "chairman"

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="!p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              <FilterPill
                label={`All (${allMembers.length})`}
                active={roleFilter === "all"}
                onClick={() => setRoleFilter("all")}
              />
              <FilterPill
                label={`Committee (${committeeCount})`}
                active={roleFilter === "committee"}
                onClick={() => setRoleFilter("committee")}
              />
              <FilterPill
                label={`Members (${regularCount})`}
                active={roleFilter === "member"}
                onClick={() => setRoleFilter("member")}
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <input
                type="text"
                placeholder="Search by name, mobile, flat…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 bg-cream-light border border-stone-200 rounded-xl text-sm text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {!canUpdateRoles && (
        <div className="px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs">
          ℹ Only the chairman can update committee roles.
        </div>
      )}

      <Card>
        <CardHeader
          title={
            roleFilter === "all"
              ? "All Members"
              : roleFilter === "committee"
                ? "Committee Members"
                : "Regular Members"
          }
          subtitle={`Showing ${filtered.length} of ${allMembers.length} members`}
        />
        <CardBody className="!p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-serif text-lg text-ink mb-1">
                No members found
              </p>
              <p className="text-sm text-ink-muted">
                {allMembers.length === 0
                  ? "No members linked to this society yet"
                  : "Try a different filter or search term"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-cream-light text-left text-xs uppercase tracking-wider text-ink-muted">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-2 py-3">Mobile</th>
                    <th className="px-2 py-3">Flat</th>
                    <th className="px-2 py-3">Type</th>
                    <th className="px-2 py-3">Role</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <MemberRow
                      key={`${m.flatId}-${m.userId}`}
                      member={m}
                      societyId={society.id}
                      canUpdateRoles={canUpdateRoles}
                      committeeCount={committeeCount}
                      onChanged={refresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function MemberRow({
  member,
  societyId,
  canUpdateRoles,
  committeeCount,
  onChanged,
}: {
  member: FlatMemberRow
  societyId: number
  canUpdateRoles: boolean
  committeeCount: number
  onChanged: () => Promise<void>
}) {
  const { token, user } = useAuth()
  const [updating, setUpdating] = useState(false)
  const [editing, setEditing] = useState(false)

  const isSelf = user?.id === member.userId
  const isOnlyChairman = member.role === "chairman" && committeeCount === 1

  async function updateRole(
    newRole: "chairman" | "secretary" | "cashier" | "committee" | "member"
  ) {
    if (!token) return
    if (newRole === member.role) {
      setEditing(false)
      return
    }
    // Prevent self-lockout: if I'm the only chairman and trying to demote myself
    if (isSelf && member.role === "chairman" && newRole !== "chairman") {
      const otherChairmenExist = !isOnlyChairman
      if (!otherChairmenExist) {
        alert(
          "You can't demote yourself — you're the only chairman. Promote someone else to chairman first, then demote yourself."
        )
        return
      }
    }

    setUpdating(true)
    try {
      await api(`/society/${societyId}/members/${member.userId}/role`, {
        method: "PATCH",
        token,
        body: { role: newRole },
      })
      await onChanged()
      setEditing(false)
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to update role"
      alert(msg)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <tr className="border-b border-stone-100 hover:bg-cream-light">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center text-ink text-xs font-serif flex-shrink-0">
            {(member.name ?? member.mobile.slice(-2))
              .charAt(0)
              .toUpperCase()}
          </div>
          <div>
            {member.name ? (
              <p className="text-ink">
                {member.name}
                {isSelf && (
                  <span className="ml-2 text-[10px] text-rust font-medium uppercase tracking-wider">
                    you
                  </span>
                )}
              </p>
            ) : (
              <p className="text-ink-muted/60 italic text-xs">— no name —</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <p className="text-ink-light tabular">+91 {member.mobile}</p>
      </td>
      <td className="px-2 py-3">
        <p className="font-serif text-ink">{member.flatLabel}</p>
      </td>
      <td className="px-2 py-3">
        <span
          className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
            member.residencyType === "owner"
              ? "bg-blue-50 text-blue-700"
              : "bg-purple-50 text-purple-700"
          }`}
        >
          {member.residencyType === "owner" ? "Owner" : "Tenant"}
        </span>
      </td>
      <td className="px-2 py-3">
        {editing ? (
          <select
            value={member.role}
            onChange={(e) =>
              updateRole(
                e.target.value as
                  | "chairman"
                  | "secretary"
                  | "cashier"
                  | "committee"
                  | "member"
              )
            }
            disabled={updating}
            autoFocus
            onBlur={() => setEditing(false)}
            className="px-2 py-1 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:border-ink"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
              ROLE_BADGE[member.role] ?? ROLE_BADGE.member
            }`}
          >
            {member.role}
          </span>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        {canUpdateRoles && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-rust hover:text-rust-dark font-medium"
          >
            Change role
          </button>
        )}
        {editing && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink-muted hover:text-ink ml-2"
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
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
