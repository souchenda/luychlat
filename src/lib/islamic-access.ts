/**
 * Who may turn Islamic Mode on or off (founder, 18/10/2026): an admin or the super admin — for themselves in
 * Settings and for any user in the admin console. A regular user sees the switch locked 🔒 «មុខងារនេះត្រូវបាន
 * គ្រប់គ្រងដោយ Admin»; what they have stays. The database enforces it too (islamic_mode_guard, migration
 * 20270174000000). Pure (islamic-access.test.ts).
 */
export type IslamicAccessPlan = { is_admin?: boolean; staff_role?: string | null }

export const canManageIslamicMode = (plan: IslamicAccessPlan | null | undefined): boolean =>
  Boolean(plan && (plan.is_admin || plan.staff_role === "admin" || plan.staff_role === "super_admin"))
