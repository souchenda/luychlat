/**
 * Safety check for a statement file before anything parses it, on the device.
 *
 * The bytes decide what a file is, never its name: a ".pdf" must start with
 * %PDF, a ".xlsx" must be a zip, and so on. Refused as unsafe:
 *   - programs (Windows / Linux / macOS / Android executables, scripts)
 *   - macro files (.xlsm …, or a workbook that carries a VBA project, macro
 *     sheets, ActiveX controls or embedded objects)
 *   - zip bombs (an .xlsx that would unpack to far more than it weighs)
 *   - PDFs with JavaScript, launch actions, attached files or rich media
 *   - a file whose contents don't match its extension (e.g. a zip named .csv)
 * Bank statements have none of these. Nothing here runs or unpacks the file.
 */

export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024

export type UnsafeReason = "executable" | "macro" | "embedded" | "zip_bomb" | "pdf_active" | "mismatch" | "extension"
export type SafeKind = "pdf" | "zip" | "ole" | "text"
export type Inspection = { ok: true; kind: SafeKind } | { ok: false; unsafe: UnsafeReason } | { ok: false; unsafe?: undefined; error: "too_large" | "unsupported" | "empty" }

const ALLOWED_EXT = new Set(["pdf", "xlsx", "xls", "csv", "txt"])
// Macro-capable Office formats; programs and scripts; containers that can hide either.
const MACRO_EXT = /^(xlsm|xltm|xlsb|xlam|xla|xll|docm|dotm|pptm|potm|ppam)$/
const PROGRAM_EXT = /^(exe|com|scr|pif|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|hta|msi|msp|dll|jar|apk|xapk|aab|dex|app|dmg|pkg|sh|elf|bin|lnk)$/
const CONTAINER_EXT = /^(zip|rar|7z|iso|img|html?|xhtml|svg)$/

const extOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? ""

function startsWith(bytes: Uint8Array, sig: number[], at = 0) {
  return sig.every((b, i) => bytes[at + i] === b)
}

function isExecutable(b: Uint8Array): boolean {
  return (
    startsWith(b, [0x4d, 0x5a]) || // MZ: Windows .exe / .dll
    startsWith(b, [0x7f, 0x45, 0x4c, 0x46]) || // ELF: Linux
    startsWith(b, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(b, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O: macOS
    startsWith(b, [0xca, 0xfe, 0xba, 0xbe]) || // fat Mach-O / Java class
    startsWith(b, [0x64, 0x65, 0x78, 0x0a]) || // dex: Android
    startsWith(b, [0x23, 0x21]) // #! script
  )
}

const latin1 = (b: Uint8Array) => {
  let s = ""
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return s
}

/** Zip central directory → entry names and sizes, without unpacking anything. */
function zipEntries(b: Uint8Array): { name: string; packed: number; size: number; encrypted: boolean }[] | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  // End-of-central-directory record: within the last 64 KB + 22 bytes.
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (at + 46 > b.length || view.getUint32(at, true) !== 0x02014b50) return null
    const flags = view.getUint16(at + 8, true)
    const packed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const skip = nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
    const name = new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen))
    entries.push({ name, packed, size, encrypted: (flags & 1) === 1 })
    at += 46 + skip
  }
  return entries
}

const MAX_UNPACKED = 200 * 1024 * 1024
const MAX_RATIO = 200
const MAX_ENTRIES = 5_000

function inspectZip(b: Uint8Array): Inspection {
  const entries = zipEntries(b)
  if (!entries) return { ok: false, error: "unsupported" }
  if (entries.length > MAX_ENTRIES) return { ok: false, unsafe: "zip_bomb" }
  let total = 0
  for (const e of entries) {
    const name = e.name.toLowerCase()
    // 0xFFFFFFFF = ZIP64 sizes: never needed under 10 MB.
    if (e.size === 0xffffffff || e.packed === 0xffffffff) return { ok: false, unsafe: "zip_bomb" }
    if (/vbaproject\.bin$|\/macrosheets\/|\/dialogsheets\/|vbadata\.xml$/.test(name)) return { ok: false, unsafe: "macro" }
    if (/^xl\/(activex|embeddings)\//.test(name) || /\.(exe|dll|js|vbs|bat|cmd|ps1|scr|jar|apk|bin)$/.test(name)) return { ok: false, unsafe: "embedded" }
    if (e.size > 1024 * 1024 && e.size / Math.max(1, e.packed) > MAX_RATIO) return { ok: false, unsafe: "zip_bomb" }
    total += e.size
  }
  if (total > MAX_UNPACKED) return { ok: false, unsafe: "zip_bomb" }
  // An Excel workbook, not some other zip (an .apk, .jar or .docx renamed).
  if (!entries.some((e) => e.name === "[Content_Types].xml") || !entries.some((e) => e.name.startsWith("xl/"))) return { ok: false, unsafe: "mismatch" }
  if (entries.some((e) => e.encrypted)) return { ok: false, error: "unsupported" }
  return { ok: true, kind: "zip" }
}

/** Legacy .xls (OLE2): macros live in a "_VBA_PROJECT_CUR" storage (names in UTF-16). */
function inspectOle(b: Uint8Array): Inspection {
  const text = latin1(b)
  const utf16 = (s: string) => s.split("").join("\0")
  if (text.includes(utf16("_VBA_PROJECT"))) return { ok: false, unsafe: "macro" }
  if (text.includes(utf16("Ole10Native")) || text.includes(utf16("ObjectPool"))) return { ok: false, unsafe: "embedded" }
  return { ok: true, kind: "ole" }
}

/** Active PDF content. Name escapes (/J#61vaScript) are undone first. */
const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|SubmitForm|ImportData|GoToE)(?![A-Za-z0-9])/

function inspectPdf(b: Uint8Array): Inspection {
  const text = latin1(b).replace(/\/[^\s/<>[\]()]*#[0-9a-fA-F]{2}[^\s/<>[\]()]*/g, (name) => name.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))))
  if (PDF_ACTIVE.test(text)) return { ok: false, unsafe: "pdf_active" }
  return { ok: true, kind: "pdf" }
}

/** What a statement file really is, or why it is refused. */
export function inspectStatementBytes(bytes: Uint8Array, fileName: string): Inspection {
  if (bytes.length === 0) return { ok: false, error: "empty" }
  if (bytes.length > MAX_STATEMENT_BYTES) return { ok: false, error: "too_large" }
  const ext = extOf(fileName)
  // "statement.pdf.exe" ends in .exe: the last extension is the one that counts.
  if (MACRO_EXT.test(ext)) return { ok: false, unsafe: "macro" }
  if (PROGRAM_EXT.test(ext)) return { ok: false, unsafe: "executable" }
  if (CONTAINER_EXT.test(ext)) return { ok: false, unsafe: "extension" }
  if (isExecutable(bytes)) return { ok: false, unsafe: "executable" }

  const isPdf = startsWith(bytes, [0x25, 0x50, 0x44, 0x46]) // %PDF
  const isZip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
  const isOle = startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  const utf16Text = startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff]) // "Unicode text" exports
  const isBinary = !isPdf && !isZip && !isOle && !utf16Text && bytes.subarray(0, 8192).includes(0)

  if (ext && !ALLOWED_EXT.has(ext)) return { ok: false, error: "unsupported" }
  if (ext === "pdf" && !isPdf) return { ok: false, unsafe: "mismatch" }
  if (ext === "xlsx" && !isZip) return { ok: false, unsafe: "mismatch" }
  if ((ext === "csv" || ext === "txt") && (isPdf || isZip || isOle)) return { ok: false, unsafe: "mismatch" }
  // Banks also export ".xls" that is really HTML or CSV text; that is read as text.
  if (ext === "xls" && isPdf) return { ok: false, unsafe: "mismatch" }

  if (isPdf) return inspectPdf(bytes)
  if (isZip) return inspectZip(bytes)
  if (isOle) return inspectOle(bytes)
  if (isBinary) return { ok: false, unsafe: "mismatch" }
  return { ok: true, kind: "text" }
}

const UNSAFE_MIME = /x-msdownload|x-msdos-program|x-executable|x-mach-binary|x-elf|x-sh\b|x-shellscript|java-archive|android\.package-archive|macroenabled|x-ms-installer|x-bat|javascript|vbscript|hta\b/i

/**
 * From a name and declared type alone (the bot never downloads files):
 * "unsafe" for programs, scripts and macro files, else "ok".
 */
export function unsafeByName(fileName: string, mimeType = ""): UnsafeReason | null {
  const ext = extOf(fileName)
  if (MACRO_EXT.test(ext)) return "macro"
  if (PROGRAM_EXT.test(ext)) return "executable"
  if (UNSAFE_MIME.test(mimeType)) return /macroenabled/i.test(mimeType) ? "macro" : "executable"
  // A statement name with a program type behind it ("statement.pdf" sent as an .exe type) is covered above.
  return null
}
