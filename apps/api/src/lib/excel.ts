import * as XLSX from 'xlsx'
import type { CommitteeRole } from '../db/types'

export type ExcelCommitteeRole = CommitteeRole

export type ExcelMemberRow = {
  block: string
  flatNo: string
  ownerName: string
  mobile1: string
  mobile2: string | null
  type: 'Owner' | 'Tenant' | 'Hybrid'
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

// Required column header names (case-insensitive)
const REQUIRED_HEADERS = [
  'block',
  'flat no',
  'owner name',
  'mobile 1',
  'type',
] as const

/**
 * Parses uploaded Excel buffer into structured member rows + per-row errors.
 *
 * Expected columns (header row, case-insensitive):
 *   Block | Flat No | Owner Name | Mobile 1 | Mobile 2 | Type | Role
 *
 * Mobile 2 and Role are optional.
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

  // Normalize header keys for the first row to validate
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

  // Helper to fetch a cell value by header (case-insensitive)
  const getCell = (row: Record<string, unknown>, header: string): string => {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().trim() === header) {
        return String(row[key] ?? '').trim()
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
    const mobile1 = getCell(row, 'mobile 1').replace(/\s|-/g, '')
    const mobile2Raw = getCell(row, 'mobile 2').replace(/\s|-/g, '')
    const typeRaw = getCell(row, 'type').toLowerCase()
    const roleRaw = getCell(row, 'role').toLowerCase()

    // Skip completely empty rows
    if (!block && !flatNo && !ownerName && !mobile1) return

    let hasError = false

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

    if (!ownerName) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Owner Name',
        value: ownerName,
        message: 'Owner Name is required',
      })
      hasError = true
    }

    if (!mobile1) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Mobile 1',
        value: mobile1,
        message: 'Mobile 1 is required',
      })
      hasError = true
    } else if (!/^\d{10}$/.test(mobile1)) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Mobile 1',
        value: mobile1,
        message: 'Mobile 1 must be exactly 10 digits',
      })
      hasError = true
    }

    if (mobile2Raw && !/^\d{10}$/.test(mobile2Raw)) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Mobile 2',
        value: mobile2Raw,
        message: 'Mobile 2 must be exactly 10 digits if provided',
      })
      hasError = true
    }

    if (mobile2Raw && mobile1 === mobile2Raw) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Mobile 2',
        value: mobile2Raw,
        message: 'Mobile 1 and Mobile 2 cannot be the same',
      })
      hasError = true
    }

    // Type column
    let type: 'Owner' | 'Tenant' | 'Hybrid' | null = null
    if (!typeRaw) {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Type',
        value: typeRaw,
        message: 'Type is required (Owner / Tenant / Hybrid)',
      })
      hasError = true
    } else if (typeRaw === 'owner') type = 'Owner'
    else if (typeRaw === 'tenant') type = 'Tenant'
    else if (typeRaw === 'hybrid') type = 'Hybrid'
    else {
      result.errors.push({
        rowIndex: rowNumber,
        field: 'Type',
        value: typeRaw,
        message: 'Type must be Owner, Tenant, or Hybrid',
      })
      hasError = true
    }

    // Role column (optional)
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

    if (!hasError && type) {
      result.rows.push({
        block,
        flatNo,
        ownerName,
        mobile1,
        mobile2: mobile2Raw || null,
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