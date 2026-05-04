import { useState, useRef, useMemo } from "react"
import { useOutletContext } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { apiUrl } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"
import type { SocietyContext, FlatWithMembers } from "./SocietyDetailLayout"

export default function SocietyFlats() {
  const { society, flats, refresh } = useOutletContext<SocietyContext>()
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error" | "info"
    message: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState("")
  const [blockFilter, setBlockFilter] = useState<string>("all")
  const [expandedFlatId, setExpandedFlatId] = useState<number | null>(null)

  // Block list (sorted)
  const blocks = useMemo(() => {
    const set = new Set(flats.map((f) => f.block))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [flats])

  // Block-wise count for filter buttons
  const countByBlock = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of flats) m.set(f.block, (m.get(f.block) ?? 0) + 1)
    return m
  }, [flats])

  // Filtered + sorted flats
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
    // Sort: block, then flat number naturally
    return [...result].sort((a, b) => {
      if (a.block !== b.block) return a.block.localeCompare(b.block)
      return a.flatNo.localeCompare(b.flatNo, undefined, { numeric: true })
    })
  }, [flats, blockFilter, search])

  async function handleUpload(file: File) {
    if (!society || !token) return
    setUploading(true)
    setUploadStatus({ type: "info", message: "Uploading and parsing…" })
    try {
      const buffer = await file.arrayBuffer()
      const res = await fetch(
        apiUrl(`/super-admin/societies/${society.id}/upload-members`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
          },
          body: buffer,
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setUploadStatus({
          type: "error",
          message: data.error || "Upload failed",
        })
        setUploading(false)
        return
      }
      const errors = data.parseErrors as Array<{
        rowIndex: number
        field: string
        message: string
      }>
      if (errors && errors.length > 0) {
        setUploadStatus({
          type: "error",
          message: `Found ${errors.length} validation error${errors.length === 1 ? "" : "s"} — first: row ${errors[0].rowIndex} ${errors[0].field}: ${errors[0].message}`,
        })
      } else {
        setUploadStatus({
          type: "success",
          message: `✓ Imported ${data.flatsInserted ?? 0} new + ${data.flatsUpdated ?? 0} updated. ${data.membersAdded ?? 0} members added.`,
        })
      }
      await refresh()
    } catch (err) {
      setUploadStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Excel upload */}
      <Card>
        <CardHeader
          title="Bulk Member Upload"
          subtitle="Upload an Excel file to add or update flats. Existing flats are updated, new ones inserted. Vacant flats (no mobile) are valid."
        />
        <CardBody>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-ink mb-1">
                Required columns:{" "}
                <span className="font-medium">Block, Flat No</span>
              </p>
              <p className="text-xs text-ink-muted">
                Optional: Owner Name, Mobile, Type (Owner/Tenant), Role
                (Chairman, Secretary, Cashier, Committee)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ""
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
            >
              Choose Excel File
            </Button>
          </div>
          {uploadStatus && (
            <div
              className={`mt-4 p-3 rounded-xl text-sm ${
                uploadStatus.type === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : uploadStatus.type === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-blue-50 text-blue-700"
              }`}
            >
              {uploadStatus.message}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Filter row */}
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

      {/* Flats table */}
      <Card>
        <CardHeader
          title={
            blockFilter === "all"
              ? "All Flats"
              : `Block ${blockFilter}`
          }
          subtitle={`Showing ${filteredFlats.length} of ${flats.length} flats`}
        />
        <CardBody className="!p-0">
          {filteredFlats.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-serif text-lg text-ink mb-1">No flats found</p>
              <p className="text-sm text-ink-muted">
                {flats.length === 0
                  ? "Upload an Excel file above to get started"
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
                    <th className="px-6 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFlats.map((flat) => (
                    <FlatRow
                      key={flat.id}
                      flat={flat}
                      expanded={expandedFlatId === flat.id}
                      onToggle={() =>
                        setExpandedFlatId(
                          expandedFlatId === flat.id ? null : flat.id
                        )
                      }
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
  flat,
  expanded,
  onToggle,
}: {
  flat: FlatWithMembers
  expanded: boolean
  onToggle: () => void
}) {
  const isOwner = flat.residencyType === "owner"
  const memberCount = flat.members.length
  const isVacant = memberCount === 0

  return (
    <>
      <tr
        className={`border-b border-stone-100 hover:bg-cream-light cursor-pointer transition-colors ${
          isVacant ? "bg-amber-50/30" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-6 py-4">
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
        <td className="px-2 py-4">
          <p className="font-serif text-base text-ink">{flat.label}</p>
        </td>
        <td className="px-2 py-4">
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
          {memberCount > 0 && (
            <span className="text-xs text-ink-muted">
              {expanded ? "Hide" : "View"}
            </span>
          )}
        </td>
      </tr>
      {expanded && memberCount > 0 && (
        <tr className="border-b border-stone-100">
          <td></td>
          <td colSpan={6} className="px-2 py-3 bg-cream-light/40">
            <div className="space-y-2 max-w-3xl">
              {flat.members.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl border border-stone-100"
                >
                  <div className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center text-ink text-xs font-serif">
                    {(m.name ?? m.mobile.slice(-2)).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-ink">
                        {m.name ?? "—"}
                      </p>
                      {m.isPrimary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rust/10 text-rust font-medium uppercase tracking-wider">
                          primary
                        </span>
                      )}
                      {m.role !== "member" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink font-medium uppercase tracking-wider">
                          {m.role}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted tabular mt-0.5">
                      +91 {m.mobile} · {m.relation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
