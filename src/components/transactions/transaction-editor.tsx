"use client"

import { TransferSheet } from "@/components/wallets/transfer-sheet"
import type { Transaction, Wallet } from "@/lib/data/types"

import { EntryFormSheet } from "./entry-form-sheet"

/** Opens the right edit sheet (entry or transfer) for a selected transaction. */
export function TransactionEditor({
  workspaceId,
  wallets,
  transaction,
  onClose,
}: {
  workspaceId: string | undefined
  wallets: Wallet[]
  transaction: Transaction | null
  onClose: () => void
}) {
  const isTransfer = transaction?.type === "TRANSFER"
  return (
    <>
      <EntryFormSheet
        open={Boolean(transaction) && !isTransfer}
        onOpenChange={(open) => !open && onClose()}
        workspaceId={workspaceId}
        wallets={wallets}
        type={transaction?.type === "INCOME" ? "INCOME" : "EXPENSE"}
        transaction={isTransfer ? null : transaction}
      />
      <TransferSheet
        open={isTransfer}
        onOpenChange={(open) => !open && onClose()}
        workspaceId={workspaceId}
        wallets={wallets}
        transaction={isTransfer ? transaction : null}
      />
    </>
  )
}
