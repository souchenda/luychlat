import { isTelegramReceipt } from "@/lib/pool"
import { uuid } from "@/lib/uuid"
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"

import type { DataRepo } from "./repo"
import {
  DebtLinkedError,
  InsufficientBalanceError,
  PersonalWalletError,
  PlanLimitError,
  RepaymentTooLargeError,
  WalletInUseError,
  type AppNotification,
  type Budget,
  type Category,
  type InviteLookup,
  type Profile,
  type WorkspaceInvite,
  type WorkspaceMember,
  type Debt,
  type DebtRepayment,
  type DebtTranche,
  type TelegramSettings,
  type Tontine,
  type TontinePayment,
  type Transaction,
  type Wallet,
  type Workspace,
} from "./types"

const FOREIGN_KEY_VIOLATION = "23503"
const RECEIPT_BUCKET = "receipts"
const SIGNED_URL_SECONDS = 600
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) {
    if (error.message.includes("insufficient_balance")) throw new InsufficientBalanceError()
    if (error.message.includes("exceeds the remaining balance")) throw new RepaymentTooLargeError()
    if (error.message.includes("edited from the debt")) throw new DebtLinkedError()
    if (error.message.includes("personal_wallet")) throw new PersonalWalletError()
    if (error.message.includes("plan_limit:wallets")) throw new PlanLimitError("wallets")
    if (error.message.includes("plan_limit:family")) throw new PlanLimitError("family")
    throw error
  }
  return data as T
}

// PostgREST may return numeric columns as strings; normalise to numbers.
const toWallet = (row: Wallet): Wallet => ({
  ...row,
  balance: Number(row.balance),
  goal_target: row.goal_target == null ? null : Number(row.goal_target),
  credit_limit: row.credit_limit == null ? null : Number(row.credit_limit),
})
const toTransaction = (row: Transaction): Transaction => ({
  ...row,
  amount: Number(row.amount),
  to_amount: row.to_amount === null ? null : Number(row.to_amount),
  exchange_rate: row.exchange_rate === null ? null : Number(row.exchange_rate),
})

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const toTontine = (row: Tontine): Tontine => ({
  ...row,
  share_amount: Number(row.share_amount),
  won_amount: num(row.won_amount),
  won_bid: num(row.won_bid),
})
const toTontinePayment = (row: TontinePayment): TontinePayment => ({ ...row, amount: Number(row.amount), discount: Number(row.discount) })

const toDebt = (row: Debt): Debt => ({
  ...row,
  total_amount: Number(row.total_amount),
  paid_amount: Number(row.paid_amount),
  interest_rate: Number(row.interest_rate),
  insurance_premium: row.insurance_premium == null ? null : Number(row.insurance_premium),
  schedule_payment: row.schedule_payment == null ? null : Number(row.schedule_payment),
  schedule_principal: row.schedule_principal == null ? null : Number(row.schedule_principal),
  schedule_fee: row.schedule_fee == null ? null : Number(row.schedule_fee),
})
const toRepayment = (row: DebtRepayment): DebtRepayment => ({ ...row, amount_paid: Number(row.amount_paid) })
const toBudget = (row: Budget): Budget => ({ ...row, amount: Number(row.amount) })

const WORKSPACE_ORDER = { PERSONAL: 0, BUSINESS: 1, FAMILY: 2 } as const
type WorkspaceRow = Omit<Workspace, "role" | "member_count">
type MemberRow = Omit<WorkspaceMember, "display_name"> & { profile: { display_name: string } | null }
const INVITE_COLUMNS = "id, workspace_id, code, role, created_at, expires_at, used_at"

/** Cloud data for signed-in users. Every query is scoped by RLS to the workspaces `userId` belongs to. */
export function createSupabaseRepo(supabase: SupabaseClient, userId: string): DataRepo {
  const walletCurrency = async (id: string) =>
    (unwrap(await supabase.from("wallets_accounts").select("currency").eq("id", id).single()) as Pick<Wallet, "currency">)
      .currency

  const repo: DataRepo = {
    async listWorkspaces() {
      const [workspaces, members, access] = await Promise.all([
        supabase.from("workspaces").select("*"),
        supabase.from("workspace_members").select("workspace_id, user_id, role"),
        supabase.rpc("my_workspace_access"),
      ])
      // Plan access (read-only after the business trial / over the business limit). Older databases lack the RPC: no lock.
      const accessRows = (access.error ? [] : (access.data ?? [])) as { workspace_id: string; writable: boolean; reason: Workspace["locked"]; trial_ends_at: string | null }[]
      const accessById = new Map(accessRows.map((a) => [a.workspace_id, a]))
      const memberRows = unwrap(members) as Pick<WorkspaceMember, "workspace_id" | "user_id" | "role">[]
      return (unwrap(workspaces) as WorkspaceRow[])
        .map((w) => {
          const of = memberRows.filter((m) => m.workspace_id === w.id)
          return {
            ...w,
            khr_per_usd: w.khr_per_usd == null ? null : Number(w.khr_per_usd),
            role: of.find((m) => m.user_id === userId)?.role ?? "VIEWER",
            member_count: Math.max(1, of.length),
            locked: accessById.get(w.id)?.writable === false ? (accessById.get(w.id)?.reason ?? "PLAN_LIMIT") : null,
            trial_ends_at: accessById.get(w.id)?.trial_ends_at ?? null,
          }
        })
        .sort(
          (a, b) =>
            WORKSPACE_ORDER[a.type] - WORKSPACE_ORDER[b.type] ||
            Number(b.user_id === userId) - Number(a.user_id === userId) ||
            a.created_at.localeCompare(b.created_at),
        )
    },

    // --- family sharing ------------------------------------------------------

    async getProfile() {
      const row = unwrap(
        await supabase.from("profiles").select("id, display_name, avatar_path, phone, bio").eq("id", userId).maybeSingle(),
      ) as Profile | null
      return row ?? { id: userId, display_name: "" }
    },

    async updateProfile(displayName) {
      return unwrap(
        await supabase
          .from("profiles")
          .upsert({ id: userId, display_name: displayName.trim().slice(0, 40), updated_at: new Date().toISOString() })
          .select("id, display_name")
          .single(),
      ) as Profile
    },

    async createFamilyWorkspace(name) {
      const row = unwrap(await supabase.rpc("create_family_workspace", { p_name: name })) as WorkspaceRow
      return { ...row, role: "OWNER", member_count: 1 }
    },

    async deleteFamilyWorkspace(workspaceId) {
      unwrap(await supabase.rpc("delete_family_workspace", { p_workspace_id: workspaceId }))
    },

    async listMembers(workspaceId) {
      const rows = unwrap(
        await supabase
          .from("workspace_members")
          .select("id, workspace_id, user_id, role, joined_at, profile:profiles(display_name)")
          .eq("workspace_id", workspaceId)
          .order("joined_at"),
      ) as unknown as MemberRow[]
      return rows
        .map(({ profile, ...m }) => ({ ...m, display_name: profile?.display_name ?? "—" }))
        .sort((a, b) => Number(b.role === "OWNER") - Number(a.role === "OWNER"))
    },

    async setMemberRole(memberId, role) {
      unwrap(await supabase.from("workspace_members").update({ role }).eq("id", memberId))
    },

    async removeMember(memberId) {
      unwrap(await supabase.from("workspace_members").delete().eq("id", memberId))
    },

    async createInvite(workspaceId, role) {
      const row = unwrap(
        await supabase.rpc("create_workspace_invite", { p_workspace_id: workspaceId, p_role: role }),
      ) as WorkspaceInvite & Record<string, unknown>
      const { id, workspace_id, code, created_at, expires_at, used_at } = row
      return { id, workspace_id, code, role: row.role, created_at, expires_at, used_at }
    },

    async listInvites(workspaceId) {
      return unwrap(
        await supabase
          .from("workspace_invites")
          .select(INVITE_COLUMNS)
          .eq("workspace_id", workspaceId)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }),
      ) as WorkspaceInvite[]
    },

    async revokeInvite(id) {
      unwrap(await supabase.from("workspace_invites").delete().eq("id", id))
    },

    async lookupInvite(code, accept) {
      return unwrap(await supabase.rpc("lookup_workspace_invite", { p_code: code, p_accept: accept })) as InviteLookup
    },

    // --- budgets -------------------------------------------------------------

    async listBudgets(workspaceId) {
      const rows = unwrap(
        await supabase.from("budgets").select("*").eq("workspace_id", workspaceId).order("created_at"),
      ) as Budget[]
      return rows.map(toBudget)
    },

    async saveBudget(workspaceId, input) {
      const row = unwrap(
        await supabase
          .from("budgets")
          .upsert({ workspace_id: workspaceId, ...input }, { onConflict: "workspace_id,category_id" })
          .select()
          .single(),
      ) as Budget
      return toBudget(row)
    },

    async deleteBudget(id) {
      unwrap(await supabase.from("budgets").delete().eq("id", id))
    },

    // --- wallets -----------------------------------------------------------

    async listWallets(workspaceId) {
      const rows = unwrap(
        await supabase
          .from("wallets_accounts")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("sort_order")
          .order("created_at"),
      ) as Wallet[]
      return rows.map(toWallet)
    },

    async createWallet(workspaceId, input) {
      const last = unwrap(
        await supabase
          .from("wallets_accounts")
          .select("sort_order")
          .eq("workspace_id", workspaceId)
          .order("sort_order", { ascending: false })
          .limit(1),
      ) as { sort_order: number }[]
      const row = unwrap(
        await supabase
          .from("wallets_accounts")
          .insert({ workspace_id: workspaceId, ...input, sort_order: (last[0]?.sort_order ?? -1) + 1 })
          .select()
          .single(),
      ) as Wallet
      return toWallet(row)
    },

    async updateWallet(id, input) {
      const row = unwrap(await supabase.from("wallets_accounts").update(input).eq("id", id).select().single()) as Wallet
      return toWallet(row)
    },

    async reorderWallets(workspaceId, orderedIds) {
      const results = await Promise.all(
        orderedIds.map((id, sort_order) =>
          supabase.from("wallets_accounts").update({ sort_order }).eq("id", id).eq("workspace_id", workspaceId),
        ),
      )
      results.forEach((r) => unwrap(r))
    },

    async setWalletArchived(id, archived) {
      // Un-archiving counts against the Free wallet limit (plan_limit:wallets).
      unwrap(
        await supabase
          .from("wallets_accounts")
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq("id", id),
      )
    },

    async deleteWallet(id) {
      const { error } = await supabase.from("wallets_accounts").delete().eq("id", id)
      if (error?.code === FOREIGN_KEY_VIOLATION) throw new WalletInUseError()
      if (error) throw error
    },

    async reconcileWallet(walletId, actualBalance, note) {
      const row = unwrap(
        await supabase.rpc("reconcile_wallet", { p_wallet_id: walletId, p_actual: actualBalance, p_note: note }),
      ) as Transaction | null
      return row ? toTransaction(row) : null
    },

    // --- categories (seeded by the signup trigger) --------------------------

    async listCategories(workspaceId) {
      return unwrap(
        await supabase.from("categories").select("*").eq("workspace_id", workspaceId).order("created_at"),
      ) as Category[]
    },

    async createCategory(workspaceId, input) {
      return unwrap(
        await supabase
          .from("categories")
          .insert({ workspace_id: workspaceId, ...input })
          .select()
          .single(),
      ) as Category
    },

    async updateCategory(id, input) {
      const current = unwrap(await supabase.from("categories").select("name").eq("id", id).single()) as Pick<Category, "name">
      // A renamed preset stops being translated.
      const patch = current.name === input.name ? input : { ...input, preset_key: null }
      return unwrap(await supabase.from("categories").update(patch).eq("id", id).select().single()) as Category
    },

    async deleteCategory(id) {
      unwrap(await supabase.from("categories").delete().eq("id", id))
    },

    // --- transactions (balances maintained by the transactions_balance trigger)

    async listTransactions(workspaceId, filter = {}) {
      let query = supabase.from("transactions").select("*").eq("workspace_id", workspaceId)
      if (filter.type) query = query.eq("type", filter.type)
      if (filter.categoryId) query = query.eq("category_id", filter.categoryId)
      if (filter.walletId) {
        if (!UUID.test(filter.walletId)) throw new Error("Invalid wallet id")
        query = query.or(`wallet_id.eq.${filter.walletId},to_wallet_id.eq.${filter.walletId}`)
      }
      if (filter.from) query = query.gte("transaction_date", filter.from)
      if (filter.to) query = query.lt("transaction_date", filter.to)
      query = query.order("transaction_date", { ascending: false }).order("created_at", { ascending: false })
      if (filter.limit) query = query.limit(filter.limit)
      return (unwrap(await query) as Transaction[]).map(toTransaction)
    },

    async createEntry(workspaceId, input) {
      const row = unwrap(
        await supabase
          .from("transactions")
          .insert({ workspace_id: workspaceId, ...input })
          .select()
          .single(),
      ) as Transaction
      return toTransaction(row)
    },

    async createTransfer(input) {
      const currency = await walletCurrency(input.wallet_id)
      const row = unwrap(
        await supabase
          .from("transactions")
          .insert({ ...input, type: "TRANSFER", currency })
          .select()
          .single(),
      ) as Transaction
      return toTransaction(row)
    },

    async updateTransaction(id, input) {
      const before = unwrap(
        await supabase.from("transactions").select("type, receipt_url").eq("id", id).single(),
      ) as Pick<Transaction, "type" | "receipt_url">
      if ((before.type === "TRANSFER") !== (input.type === "TRANSFER")) throw new Error("Can't change transaction kind")
      const patch = input.type === "TRANSFER" ? { ...input, currency: await walletCurrency(input.wallet_id) } : input
      const row = unwrap(await supabase.from("transactions").update(patch).eq("id", id).select().single()) as Transaction
      if (before.receipt_url && before.receipt_url !== row.receipt_url) await repo.deleteReceipt(before.receipt_url)
      return toTransaction(row)
    },

    async deleteTransaction(id) {
      const rows = unwrap(
        await supabase.from("transactions").delete().eq("id", id).select("receipt_url"),
      ) as Pick<Transaction, "receipt_url">[]
      const receipt = rows[0]?.receipt_url
      if (receipt) await repo.deleteReceipt(receipt)
    },

    async deleteTransactionsInRange(workspaceId, from, to) {
      // One statement = one database transaction; triggers reverse balances and repayments.
      const rows = unwrap(
        await supabase
          .from("transactions")
          .delete()
          .eq("workspace_id", workspaceId)
          .gte("transaction_date", from)
          .lt("transaction_date", to)
          .select("receipt_url"),
      ) as Pick<Transaction, "receipt_url">[]
      const receipts = rows.flatMap((r) => (r.receipt_url?.startsWith(`${userId}/`) ? [r.receipt_url] : []))
      if (receipts.length) await supabase.storage.from(RECEIPT_BUCKET).remove(receipts)
      return rows.length
    },

    // --- debts (paid_amount / status derived by the debts_derive trigger) ------

    // --- tontine -------------------------------------------------------------
    async listTontines(workspaceId) {
      const rows = unwrap(
        await supabase.from("tontines").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      ) as Tontine[]
      return rows.map(toTontine)
    },

    async listTontinePayments(workspaceId) {
      const rows = unwrap(
        await supabase.from("tontine_payments").select("*").eq("workspace_id", workspaceId).order("round_no"),
      ) as TontinePayment[]
      return rows.map(toTontinePayment)
    },

    async createTontine(workspaceId, input) {
      const row = unwrap(await supabase.from("tontines").insert({ workspace_id: workspaceId, ...input }).select().single()) as Tontine
      return toTontine(row)
    },

    async updateTontine(id, input) {
      const row = unwrap(await supabase.from("tontines").update(input).eq("id", id).select().single()) as Tontine
      return toTontine(row)
    },

    async setTontineClosed(id, closed) {
      unwrap(await supabase.from("tontines").update({ closed_at: closed ? new Date().toISOString() : null }).eq("id", id))
    },

    async deleteTontine(id) {
      unwrap(await supabase.from("tontines").delete().eq("id", id))
    },

    async payTontineRound(input) {
      const row = unwrap(
        await supabase.rpc("pay_tontine_round", {
          p_tontine_id: input.tontine_id,
          p_round_no: input.round_no,
          p_amount: input.amount,
          p_discount: input.discount,
          p_paid_on: input.paid_on,
          p_wallet_id: input.wallet_id,
          p_exchange_rate: input.exchange_rate,
          p_note: input.note,
        }),
      ) as TontinePayment
      return toTontinePayment(row)
    },

    async collectTontine(input) {
      const row = unwrap(
        await supabase.rpc("collect_tontine", {
          p_tontine_id: input.tontine_id,
          p_round_no: input.round_no,
          p_amount: input.amount,
          p_bid: input.bid,
          p_received_on: input.received_on,
          p_wallet_id: input.wallet_id,
          p_exchange_rate: input.exchange_rate,
          p_note: input.note,
        }),
      ) as Tontine
      return toTontine(row)
    },

    async deleteTontinePayment(id) {
      const row = unwrap(await supabase.from("tontine_payments").select("transaction_id").eq("id", id).single()) as {
        transaction_id: string | null
      }
      // The ledger row cascades to the payment and refunds the wallet.
      if (row.transaction_id) unwrap(await supabase.from("transactions").delete().eq("id", row.transaction_id))
      else unwrap(await supabase.from("tontine_payments").delete().eq("id", id))
    },

    async undoTontineWin(tontineId) {
      unwrap(await supabase.rpc("undo_tontine_win", { p_tontine_id: tontineId }))
    },

    async listDebts(workspaceId) {
      const rows = unwrap(
        await supabase.from("debts").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      ) as Debt[]
      return rows.map(toDebt)
    },

    async createDebt(workspaceId, input, disbursement) {
      const row = unwrap(
        await supabase
          .from("debts")
          .insert({ workspace_id: workspaceId, ...input })
          .select()
          .single(),
      ) as Debt
      if (!disbursement) return toDebt(row)
      const moved = await supabase.rpc("disburse_debt", {
        p_debt_id: row.id,
        p_wallet_id: disbursement.wallet_id,
        p_exchange_rate: disbursement.exchange_rate,
        p_date: disbursement.date,
        p_amount: disbursement.amount ?? null,
      })
      if (moved.error) {
        // Don't leave a debt behind whose money movement failed.
        await supabase.from("debts").delete().eq("id", row.id)
        unwrap(moved)
      }
      const fresh = unwrap(await supabase.from("debts").select("*").eq("id", row.id).single()) as Debt
      return toDebt(fresh)
    },

    async updateDebt(id, input) {
      const row = unwrap(await supabase.from("debts").update(input).eq("id", id).select().single()) as Debt
      return toDebt(row)
    },

    async deleteDebt(id) {
      unwrap(await supabase.from("debts").delete().eq("id", id))
    },

    async listRepayments(debtId) {
      const rows = unwrap(
        await supabase
          .from("debt_repayments")
          .select("*")
          .eq("debt_id", debtId)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ) as DebtRepayment[]
      return rows.map(toRepayment)
    },

    async recordRepayment(input) {
      const row = unwrap(
        await supabase.rpc("record_debt_repayment", {
          p_debt_id: input.debt_id,
          p_wallet_id: input.wallet_id,
          p_amount: input.amount,
          p_exchange_rate: input.exchange_rate,
          p_payment_date: input.payment_date,
          p_note: input.note,
          p_attachment: input.attachment_path ?? null,
        }),
      ) as DebtRepayment
      return toRepayment(row)
    },

    async deleteRepayment(id) {
      const row = unwrap(
        await supabase.from("debt_repayments").select("transaction_id, attachment_path").eq("id", id).single(),
      ) as Pick<DebtRepayment, "transaction_id" | "attachment_path">
      if (row.transaction_id) {
        // Cascades to the repayment; triggers restore the wallet and the debt.
        await repo.deleteTransaction(row.transaction_id)
        return
      }
      // Record-only: just the row (the debt is re-derived by a trigger), and its slip.
      unwrap(await supabase.from("debt_repayments").delete().eq("id", id))
      if (row.attachment_path) await repo.deleteReceipt(row.attachment_path)
    },

    async listTranches(debtId) {
      const rows = unwrap(
        await supabase
          .from("debt_tranches")
          .select("*")
          .eq("debt_id", debtId)
          .order("tranche_date", { ascending: true })
          .order("created_at", { ascending: true }),
      ) as DebtTranche[]
      return rows.map((r) => ({ ...r, amount: Number(r.amount) }))
    },

    async addTranche(input) {
      const row = unwrap(
        await supabase.rpc("add_debt_tranche", {
          p_debt_id: input.debt_id,
          p_amount: input.amount,
          p_date: input.date,
          p_note: input.note,
          p_wallet_id: input.wallet_id,
          p_exchange_rate: input.exchange_rate,
          p_attachment: input.attachment_path,
        }),
      ) as DebtTranche
      return { ...row, amount: Number(row.amount) }
    },

    async deleteTranche(id) {
      const row = unwrap(
        await supabase.from("debt_tranches").select("attachment_path").eq("id", id).single(),
      ) as Pick<DebtTranche, "attachment_path">
      unwrap(await supabase.rpc("delete_debt_tranche", { p_tranche_id: id }))
      if (row.attachment_path) await repo.deleteReceipt(row.attachment_path).catch(() => {})
    },

    // --- notifications (created by the daily run_debt_alerts() job) ---------

    async listNotifications(workspaceId) {
      return unwrap(
        await supabase
          .from("notifications")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("scheduled_at", { ascending: false })
          .limit(50),
      ) as AppNotification[]
    },

    async markNotificationsRead(workspaceId) {
      unwrap(
        await supabase.from("notifications").update({ is_read: true }).eq("workspace_id", workspaceId).eq("is_read", false),
      )
    },

    async syncDueAlerts() {
      // Server-side: pg_cron runs public.run_debt_alerts() every day at 08:00 (Asia/Phnom_Penh).
      return []
    },

    // --- telegram (owner-only row) ------------------------------------------

    async getTelegramSettings() {
      const row = unwrap(
        await supabase.from("telegram_settings").select("bot_token, chat_id, enabled, language").maybeSingle(),
      ) as TelegramSettings | null
      return row
    },

    async saveTelegramSettings(settings) {
      const { data } = await supabase.auth.getUser()
      if (!data.user) throw new Error("Not signed in")
      if (!settings) {
        unwrap(await supabase.from("telegram_settings").delete().eq("user_id", data.user.id))
        return
      }
      unwrap(
        await supabase
          .from("telegram_settings")
          .upsert({ user_id: data.user.id, ...settings, updated_at: new Date().toISOString() }),
      )
    },

    // --- receipts: private bucket, receipts/<uid>/<uuid>.jpg -----------------

    async uploadReceipt(image) {
      const path = `${userId}/${uuid()}.jpg`
      const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, image, { contentType: image.type })
      if (error) throw error
      return path
    },

    async getReceiptUrl(ref) {
      // Photos sent to the bot in a pool group stay on Telegram; the app fetches them for members.
      if (isTelegramReceipt(ref)) return `/api/tg-photo?ref=${encodeURIComponent(ref)}`
      const { data } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(ref, SIGNED_URL_SECONDS)
      return data?.signedUrl ?? null
    },

    async deleteReceipt(ref) {
      // Only the uploader's own folder can be cleaned up; a member's photo stays with their account.
      if (!ref.startsWith(`${userId}/`) || isTelegramReceipt(ref)) return
      await supabase.storage.from(RECEIPT_BUCKET).remove([ref])
    },
  }
  return repo
}
