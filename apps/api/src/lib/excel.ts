import * as XLSX from 'xlsx'
import type { CommitteeRole } from '../db/types'

export type ExcelCommitteeRole = CommitteeRole

export type ExcelMemberRow = {
  block: string
  flatNo: string
  ownerName: string | null
  mobile: string | null
  type: 'Owner' | 'Tenant'
  committeeRole: ExcelCommitteeRole | null
  rowIndex: number
}

export type ExcelParseError = {
  rowIndex: number
  field: string
  value: string
  message: string
}

export type ExcelParseResult = {
  rows: ExcelMemberRow[]
  errors: ExcelParseError[]
}

// Required column headers (case-insensitive). Block + Flat No are the
// minimum identifying info; everything else can be filled later.
const REQUIRED_HEADERS = ['block', 'flat no'] as const

/**
 * Parses uploaded Excel buffer into structured member rows + per-row errors.
 *
 * Expected columns (header row, case-insensitive):
 *   Block | Flat No | Owner Name | Mobile | Type | Role
 *
 * Required: Block, Flat No.
 * Optional: Owner Name, Mobile, Type (defaults to Owner), Role.
 *
 * One row = one flat. Each flat has at most one mobile in Excel (the
 * primary contact). Additional members for a flat are added later through
 * the "Add Member to Flat" UI action.
 *
 * Vacant flats can be onboarded with just Block + Flat No filled. The
 * chairman/secretary can later attach a member via the UI.
 */
export function parseExcel(buffer: ArrayBuffer): ExcelParseResult {
  const result: ExcelParseResult = { rows: [], errors: [] }

  // Read workbook
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    result.errors.push({
      rowIndex: 0,
      field: 'file',
      value: '',
      message: 'No sheets found in the Excel file',
    })
    return result
  }

  const sheet = workbook.Sheets[sheetName]
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    raw: false,
    defval: '',
  })

  if (rawRows.length === 0) {
    result.errors.push({
      rowIndex: 0,
      field: 'file',
      value: '',
      message: 'Sheet is empty',
    })
    return result
  }

  // Validate required headers
  const firstRow = rawRows[0]
  const normalizedHeaders = Object.keys(firstRow).map((h) =>
    h.toLowerCase().trim()
  )

  for (const required of REQUIRED_HEADERS) {
    if (!normalizedHeaders.includes(required)) {
      result.errors.push({
        rowIndex: 0,
        field: 'header',
        value: required,
        message: `Missing required column: "${required}"`,
      })
    }
  }
  if (result.errors.length > 0) return result

  // Helper to fetch a cell value by header (case-insensitive).
  // Accepts both "Mobile" and "Mobile 1" for the mobile column to ease
  // backward compatibility with older Excel templates.
  const getCell = (
    row: Record<string, unknown>,
    ...headers: string[]
  ): string => {
    for (const target of headers) {
      for (const key of Object.keys(row)) {
        if (key.toLowerCase().trim() === target) {
          const value = String(row[key] ?? '').trim()
          if (value) return value
        }
      }
    }
    return ''
  }

  // Validate and normalize each row
  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2 // +2 because Excel row 1 is header, data starts at row 2
    const block = getCell(row, 'block').toUpperCase()
    const flatNo = getCell(row, 'flat no')
    const ownerName = getCell(row, 'owner name')
    // Accept "Mobile" or "Mobile 1" as the column name
    const mobile = getCell(row, 'mobile', 'mobile 1').replace(/\s|-/g, '')
    const typeRaw = getCell(row, 'type').toLowerCase()
    const roleRaw = getCell(row, 'role').toLowerCase()

    // Skip completely empty rows
    if (!block && !flatNo && !ownerName && !mobile && !typeRaw) return

    let hasError = false

    // Block — required
    if (!block) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Block',
        value: block,
        message: 'Block is required',
      })
      hasError = true
    } else if (block.length > 20) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Block',
        value: block,
        message: 'Block must be 20 characters or fewer',
      })
      hasError = true
    }

    // Flat No — required
    if (!flatNo) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Flat No',
        value: flatNo,
        message: 'Flat No is required',
      })
      hasError = true
    } else if (flatNo.length > 20) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Flat No',
        value: flatNo,
        message: 'Flat No must be 20 characters or fewer',
      })
      hasError = true
    }

    // Owner Name — optional. No validation needed.

    // Mobile — optional, but if provided must be 10 digits
    if (mobile && !/^\d{10}$/.test(mobile)) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Mobile',
        value: mobile,
        message: 'Mobile must be exactly 10 digits',
      })
      hasError = true
    }

    // Type — optional, defaults to Owner. Must be Owner or Tenant if given.
    let type: 'Owner' | 'Tenant' = 'Owner'
    if (typeRaw) {
      if (typeRaw === 'owner') type = 'Owner'
      else if (typeRaw === 'tenant') type = 'Tenant'
      else {
        result.errors.push({
          rowIndex: rowNumber,
          field: 'Type',
          value: typeRaw,
          message: 'Type must be Owner or Tenant (or leave blank for Owner)',
        })
        hasError = true
      }
    }

    // Role — optional. Must be a valid committee role if given.
    let committeeRole: ExcelCommitteeRole | null = null
    if (roleRaw) {
      if (roleRaw === 'chairman') committeeRole = 'chairman'
      else if (roleRaw === 'secretary') committeeRole = 'secretary'
      else if (roleRaw === 'cashier') committeeRole = 'cashier'
      else if (roleRaw === 'committee') committeeRole = 'committee'
      else if (roleRaw === 'member') committeeRole = null
      else {
        result.errors.push({
          rowIndex: rowNumber,
          field: 'Role',
          value: roleRaw,
          message:
            'Role must be Chairman, Secretary, Cashier, Committee, or empty',
        })
        hasError = true
      }
    }

    // Cross-validation: role requires a mobile (no person, no role)
    if (committeeRole && !mobile) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Role',
        value: roleRaw,
        message: 'Role requires Mobile — cannot assign role to a vacant flat',
      })
      hasError = true
    }

    if (!hasError) {
      result.rows.push({
        block,
        flatNo,
        ownerName: ownerName || null,
        mobile: mobile || null,
        type,
        committeeRole,
        rowIndex: rowNumber,
      })
    }
  })

  // Check for duplicate flats within the file
  const flatKeys = new Map<string, number[]>()
  result.rows.forEach((r) => {
    const key = `${r.block}|${r.flatNo}`
    const existing = flatKeys.get(key) ?? []
    existing.push(r.rowIndex)
    flatKeys.set(key, existing)
  })
  flatKeys.forEach((rows, key) => {
    if (rows.length > 1) {
      const [block, flatNo] = key.split('|')
      result.errors.push({
        rowIndex: rows[0],
        field: 'Flat',
        value: `${block}-${flatNo}`,
        message: `Duplicate flat ${block}-${flatNo} appears in rows: ${rows.join(', ')}`,
      })
    }
  })

  // Check for duplicate singleton committee roles (one chairman, one secretary, etc.)
  const roleCounts = new Map<ExcelCommitteeRole, number[]>()
  result.rows.forEach((r) => {
    if (r.committeeRole) {
      const existing = roleCounts.get(r.committeeRole) ?? []
      existing.push(r.rowIndex)
      roleCounts.set(r.committeeRole, existing)
    }
  })
  const singletonRoles: ExcelCommitteeRole[] = [
    'chairman',
    'secretary',
    'cashier',
  ]
  for (const role of singletonRoles) {
    const rows = roleCounts.get(role)
    if (rows && rows.length > 1) {
      result.errors.push({
        rowIndex: rows[0],
        field: 'Role',
        value: role,
        message: `Multiple "${role}" entries found in rows: ${rows.join(', ')}. There can only be one ${role}.`,
      })
    }
  }

  return result
}
