import type { Transaction, TransferInput, Wallet, WalletInput, Workspace } from "./types"

/**
 * Data access used by the UI. Two implementations share these semantics:
 * - guest-repo: Guest Mode, device-only (Zustand + localStorage)
 * - supabase-repo: signed-in users, protected by RLS
 */
export interface DataRepo {
  listWorkspaces(): Promise<Workspace[]>
  /** All wallets of a workspace, including archived ones, ordered by sort_order. */
  listWallets(workspaceId: string): Promise<Wallet[]>
  createWallet(workspaceId: string, input: WalletInput): Promise<Wallet>
  updateWallet(id: string, input: WalletInput): Promise<Wallet>
  reorderWallets(workspaceId: string, orderedIds: string[]): Promise<void>
  setWalletArchived(id: string, archived: boolean): Promise<void>
  /** Throws WalletInUseError when the wallet has transactions. */
  deleteWallet(id: string): Promise<void>
  listTransfers(workspaceId: string, limit?: number): Promise<Transaction[]>
  /** Throws InsufficientBalanceError when the source wallet would go negative. */
  createTransfer(input: TransferInput): Promise<Transaction>
}
