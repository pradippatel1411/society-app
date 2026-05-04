import { useEffect, useState, useRef } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import { Card, CardBody, CardHeader } from "../../components/ui/Card"
import { api, apiUrl } from "../../lib/api"
import { useAuth } from "../../lib/useAuth"

type Society = {
  id: number
  slug: string
  name: string
  address: string | null
  totalFlats: number
  status: string
}

type FlatWithMembers = {
  id: number
  block: string
  flatNo: string
  label: string
  ownerName: string | null
  residencyType: string
  members: Array<{
    userId: number
    name: string | null
    mobile: string
    relation: string
    isPrimary: boolean
  }>
}

export default function SocietyDetail() {
  const { slug, societySlug } = useParams<{
    slug: string
    societySlug: string
  }>()
  const navigate = useNavigate()
  const { token, isAuthenticated, isLoading } = useAuth()
  const [society, setSociety] = useState<Society | null>(null)
  const [flats, setFlats] = useState<FlatWithMembers[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error" | "info"
    message: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate(`/${slug}`)
  }, [isLoading, isAuthenticated, slug, navigate])

  useEffect(() => {
  if (!token) return
  let cancelled = false

  ;(async () => {
    try {
      const socRes = await api<{ societies: Society[] }>(
        `/super-admin/societies`,
        { token }
      )
      if (cancelled) return
      const target = socRes.societies.find((s) => s.slug === societySlug)
      if (!target) {
        setError("Society not found")
        setLoading(false)
        return
      }
      setSociety(target)

      const memRes = await api<{ flats: FlatWithMembers[] }>(
        `/super-admin/societies/${target.id}/members`,
        { token }
      )
      if (cancelled) return
      setFlats(memRes.flats)
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
}, [token, societySlug])

// Manual refresh — called after Excel upload, NOT inside an effect
async function refreshMembers() {
  if (!token || !society) return
  try {
    const memRes = await api<{ flats: FlatWithMembers[] }>(
      `/super-admin/societies/${society.id}/members`,
      { token }
    )
    setFlats(memRes.flats)
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to refresh members")
  }
}

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
          message: `Found ${errors.length} validation error${
            errors.length === 1 ? "" : "s"
          } — first: row ${errors[0].rowIndex} ${errors[0].field}: ${
            errors[0].message
          }`,
        })
      } else {
        setUploadStatus({
          type: "success",
          message: `✓ Imported ${data.flatsInserted ?? 0} new + ${
            data.flatsUpdated ?? 0
          } updated flat${
            (data.flatsInserted + data.flatsUpdated) === 1 ? "" : "s"
          }`,
        })
      }
      refreshMembers()
    } catch (err) {
      setUploadStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      })
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !society) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardBody className="text-center py-12">
            <p className="font-serif text-xl text-ink mb-2">
              {error || "Society not found"}
            </p>
            <Link
              to={`/${slug}/dashboard`}
              className="text-sm text-rust hover:text-rust-dark"
            >
              ← Back to dashboard
            </Link>
          </CardBody>
        </Card>
      </div>
    )
  }

  const totalMembers = flats.reduce((sum, f) => sum + f.members.length, 0)
  const tenantCount = flats.filter((f) => f.residencyType === "tenant").length
  const ownerCount = flats.filter((f) => f.residencyType === "owner").length
  const blockMap = new Map<string, number>()
  for (const f of flats) blockMap.set(f.block, (blockMap.get(f.block) ?? 0) + 1)
  const blocks = Array.from(blockMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to={`/${slug}/dashboard`}
            className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
          >
            ← Back to dashboard
          </Link>
          <p className="text-xs text-ink-muted tabular">/{slug}/{societySlug}</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 animate-fade-in">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-ink-muted mb-2">
            Society
          </p>
          <h1 className="font-serif text-4xl italic text-ink">
            {society.name}
          </h1>
          {society.address && (
            <p className="text-sm text-ink-muted mt-2">📍 {society.address}</p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <StatCard label="Total Flats" value={flats.length} />
          <StatCard label="Members" value={totalMembers} />
          <StatCard label="Owners" value={ownerCount} />
          <StatCard label="Tenants" value={tenantCount} />
        </div>

        {/* Excel upload */}
        <Card className="mb-10">
          <CardHeader
            title="Bulk Member Upload"
            subtitle="Upload an Excel file to add or update flats and members"
          />
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-ink mb-1">
                  Required columns: Block, Flat No, Owner Name, Mobile 1,
                  Mobile 2, Type
                </p>
                <p className="text-xs text-ink-muted">
                  Optional: Role (Chairman, Secretary, Cashier, Committee)
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
                  e.target.value = "" // allow re-uploading same filename
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

        {/* Block breakdown */}
        {blocks.length > 0 && (
          <Card className="mb-10">
            <CardHeader title="Block-wise Breakdown" />
            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {blocks.map(([block, count]) => (
                  <div
                    key={block}
                    className="p-3 rounded-xl bg-cream-light border border-stone-100 text-center"
                  >
                    <p className="font-serif text-xl text-ink">Block {block}</p>
                    <p className="text-xs text-ink-muted tabular">
                      {count} flats
                    </p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Members list */}
        <Card>
          <CardHeader
            title="All Members"
            subtitle={`${totalMembers} members across ${flats.length} flats`}
          />
          <CardBody className="!p-0">
            {flats.length === 0 ? (
              <div className="p-12 text-center">
                <p className="font-serif text-lg text-ink mb-1">
                  No flats yet
                </p>
                <p className="text-sm text-ink-muted">
                  Upload an Excel file above to get started
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {flats
                  .sort((a, b) => {
                    if (a.block !== b.block)
                      return a.block.localeCompare(b.block)
                    return a.flatNo.localeCompare(b.flatNo, undefined, {
                      numeric: true,
                    })
                  })
                  .map((flat) => (
                    <div
                      key={flat.id}
                      className="px-6 py-4 hover:bg-cream-light"
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-serif text-lg text-ink">
                              {flat.label}
                            </p>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 capitalize">
                              {flat.residencyType}
                            </span>
                          </div>
                          {flat.ownerName && (
                            <p className="text-sm text-ink-muted mt-0.5">
                              Owner: {flat.ownerName}
                            </p>
                          )}
                          <div className="mt-2 space-y-1">
                            {flat.members.map((m) => (
                              <p
                                key={m.userId}
                                className="text-xs text-ink-light"
                              >
                                <span className="tabular">+91 {m.mobile}</span>
                                {m.name && ` · ${m.name}`}
                                {m.isPrimary && (
                                  <span className="ml-1 text-rust">
                                    (primary)
                                  </span>
                                )}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
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
        <p className="font-serif text-3xl text-ink mt-2 tabular">
          {value.toLocaleString("en-IN")}
        </p>
      </CardBody>
    </Card>
  )
}