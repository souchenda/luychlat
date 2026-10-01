import type { TransactionType, WorkspaceType } from "@/lib/data/types"

export type CategoryKind = Exclude<TransactionType, "TRANSFER">

export type CategoryPreset = {
  key: string
  type: CategoryKind
  icon: string
  color: string
  name: { km: string; en: string }
}

/**
 * Default categories seeded into every workspace.
 * Keep in sync with public.seed_default_categories() in
 * supabase/migrations/20261001020000_ledger.sql.
 */
export const CATEGORY_PRESETS: Record<WorkspaceType, CategoryPreset[]> = {
  PERSONAL: [
    { key: "food", type: "EXPENSE", icon: "utensils", color: "#f97316", name: { km: "ម្ហូបអាហារ", en: "Food & drinks" } },
    { key: "transport", type: "EXPENSE", icon: "bus", color: "#0ea5e9", name: { km: "ការធ្វើដំណើរ", en: "Transport" } },
    { key: "housing", type: "EXPENSE", icon: "house", color: "#8b5cf6", name: { km: "ផ្ទះ/ទឹកភ្លើង", en: "Housing & utilities" } },
    { key: "shopping", type: "EXPENSE", icon: "shopping-bag", color: "#ec4899", name: { km: "ទិញឥវ៉ាន់", en: "Shopping" } },
    { key: "phone", type: "EXPENSE", icon: "smartphone", color: "#6366f1", name: { km: "ទូរស័ព្ទ/អ៊ីនធឺណិត", en: "Phone & internet" } },
    { key: "health", type: "EXPENSE", icon: "heart-pulse", color: "#ef4444", name: { km: "សុខភាព", en: "Health" } },
    { key: "education", type: "EXPENSE", icon: "graduation-cap", color: "#14b8a6", name: { km: "ការសិក្សា", en: "Education" } },
    { key: "family", type: "EXPENSE", icon: "gift", color: "#d946ef", name: { km: "គ្រួសារ/អំណោយ", en: "Family & gifts" } },
    { key: "entertainment", type: "EXPENSE", icon: "film", color: "#f59e0b", name: { km: "កម្សាន្ត", en: "Entertainment" } },
    { key: "other_expense", type: "EXPENSE", icon: "ellipsis", color: "#64748b", name: { km: "ចំណាយផ្សេងៗ", en: "Other expense" } },
    { key: "salary", type: "INCOME", icon: "banknote", color: "#16a34a", name: { km: "ប្រាក់ខែ", en: "Salary" } },
    { key: "bonus", type: "INCOME", icon: "award", color: "#22c55e", name: { km: "ប្រាក់រង្វាន់", en: "Bonus" } },
    { key: "side_income", type: "INCOME", icon: "trending-up", color: "#10b981", name: { km: "ចំណូលបន្ថែម", en: "Side income" } },
    { key: "gift_received", type: "INCOME", icon: "hand-heart", color: "#84cc16", name: { km: "ទទួលអំណោយ", en: "Gifts received" } },
    { key: "other_income", type: "INCOME", icon: "coins", color: "#64748b", name: { km: "ចំណូលផ្សេងៗ", en: "Other income" } },
  ],
  BUSINESS: [
    { key: "inventory", type: "EXPENSE", icon: "package", color: "#f97316", name: { km: "ថ្លៃទំនិញ/ស្តុក", en: "Inventory & stock" } },
    { key: "rent", type: "EXPENSE", icon: "store", color: "#8b5cf6", name: { km: "ជួលទីតាំង", en: "Rent" } },
    { key: "payroll", type: "EXPENSE", icon: "users", color: "#0ea5e9", name: { km: "ប្រាក់បៀវត្សបុគ្គលិក", en: "Staff payroll" } },
    { key: "utilities", type: "EXPENSE", icon: "zap", color: "#eab308", name: { km: "ទឹកភ្លើង", en: "Utilities" } },
    { key: "marketing", type: "EXPENSE", icon: "megaphone", color: "#ec4899", name: { km: "ផ្សព្វផ្សាយ", en: "Marketing" } },
    { key: "delivery", type: "EXPENSE", icon: "truck", color: "#14b8a6", name: { km: "ដឹកជញ្ជូន", en: "Delivery" } },
    { key: "equipment", type: "EXPENSE", icon: "wrench", color: "#6366f1", name: { km: "សម្ភារៈ/ជួសជុល", en: "Equipment & repairs" } },
    { key: "tax", type: "EXPENSE", icon: "landmark", color: "#ef4444", name: { km: "ពន្ធ/សេវា", en: "Taxes & fees" } },
    { key: "other_expense", type: "EXPENSE", icon: "ellipsis", color: "#64748b", name: { km: "ចំណាយផ្សេងៗ", en: "Other expense" } },
    { key: "sales", type: "INCOME", icon: "shopping-cart", color: "#16a34a", name: { km: "ចំណូលពីការលក់", en: "Sales" } },
    { key: "services", type: "INCOME", icon: "briefcase", color: "#10b981", name: { km: "ចំណូលពីសេវាកម្ម", en: "Services" } },
    { key: "investment", type: "INCOME", icon: "piggy-bank", color: "#84cc16", name: { km: "ដើមទុនវិនិយោគ", en: "Capital injection" } },
    { key: "other_income", type: "INCOME", icon: "coins", color: "#64748b", name: { km: "ចំណូលផ្សេងៗ", en: "Other income" } },
  ],
}

/**
 * Categories used by debt repayments, created on first use (see
 * public.record_debt_repayment / ensure_preset_category).
 */
export const DEBT_CATEGORY_PRESETS: Record<"PAYABLE" | "RECEIVABLE", CategoryPreset> = {
  PAYABLE: {
    key: "debt_repayment",
    type: "EXPENSE",
    icon: "hand-coins",
    color: "#64748b",
    name: { km: "សងបំណុល", en: "Debt repayment" },
  },
  RECEIVABLE: {
    key: "debt_collection",
    type: "INCOME",
    icon: "hand-coins",
    color: "#0ea5e9",
    name: { km: "ទទួលប្រាក់សងបំណុល", en: "Debt collection" },
  },
}

/**
 * Categories for the optional money movement when a debt is created: borrowed
 * funds deposited (payable) or lent funds disbursed (receivable). Created on
 * first use (see public.disburse_debt).
 */
export const DISBURSEMENT_CATEGORY_PRESETS: Record<"PAYABLE" | "RECEIVABLE", CategoryPreset> = {
  PAYABLE: {
    key: "loan_received",
    type: "INCOME",
    icon: "landmark",
    color: "#6366f1",
    name: { km: "ប្រាក់ខ្ចីបានទទួល", en: "Borrowed money" },
  },
  RECEIVABLE: {
    key: "loan_given",
    type: "EXPENSE",
    icon: "hand-coins",
    color: "#f59e0b",
    name: { km: "ឱ្យគេខ្ចី", en: "Money lent" },
  },
}

/**
 * Wallet reconciliation entries (see public.reconcile_wallet). They correct a
 * balance to reality and are not real income or spending, so reports and the
 * advisor leave them out.
 */
export const ADJUSTMENT_CATEGORY_PRESETS: Record<"IN" | "OUT", CategoryPreset> = {
  IN: {
    key: "adjustment_in",
    type: "INCOME",
    icon: "scale",
    color: "#64748b",
    name: { km: "កែតម្រូវសមតុល្យ (+)", en: "Balance adjustment (+)" },
  },
  OUT: {
    key: "adjustment_out",
    type: "EXPENSE",
    icon: "scale",
    color: "#64748b",
    name: { km: "កែតម្រូវសមតុល្យ (−)", en: "Balance adjustment (−)" },
  },
}

const ADJUSTMENT_KEYS = new Set(Object.values(ADJUSTMENT_CATEGORY_PRESETS).map((p) => p.key))

/** Ids of this workspace's balance-adjustment categories (left out of cash flow and charts). */
export function adjustmentCategoryIds(categories: { id: string; preset_key: string | null }[]): Set<string> {
  return new Set(categories.filter((c) => c.preset_key && ADJUSTMENT_KEYS.has(c.preset_key)).map((c) => c.id))
}

/** Category keys that move money without being income or spending (debt principal, adjustments). */
export const NON_OPERATING_KEYS = new Set([
  ...Object.values(DEBT_CATEGORY_PRESETS).map((p) => p.key),
  ...Object.values(DISBURSEMENT_CATEGORY_PRESETS).map((p) => p.key),
  ...Object.values(ADJUSTMENT_CATEGORY_PRESETS).map((p) => p.key),
])

const PRESET_NAMES = new Map(
  [
    ...Object.values(CATEGORY_PRESETS).flat(),
    ...Object.values(DEBT_CATEGORY_PRESETS),
    ...Object.values(DISBURSEMENT_CATEGORY_PRESETS),
    ...Object.values(ADJUSTMENT_CATEGORY_PRESETS),
  ].map((p) => [p.key, p.name]),
)

/** Preset categories show in the UI language; custom ones keep the user's name. */
export function categoryLabel(category: { name: string; preset_key: string | null }, locale: "km" | "en"): string {
  const preset = category.preset_key ? PRESET_NAMES.get(category.preset_key) : undefined
  return preset ? preset[locale] : category.name
}

export const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#16a34a", "#10b981", "#14b8a6",
  "#0ea5e9", "#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#64748b",
]
