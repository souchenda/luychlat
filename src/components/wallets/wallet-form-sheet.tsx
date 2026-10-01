"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArchiveIcon, ArchiveRestoreIcon, LockIcon, Loader2Icon, ScaleIcon, Trash2Icon, UserIcon, UsersIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Amount } from "@/components/money/amount"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveWorkspace, useMembers, useProfile, useWalletMutations } from "@/lib/data/hooks"
import { PersonalWalletError, WalletInUseError, type Currency, type Wallet, type WalletVisibility } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { getProvider, WALLET_PROVIDERS } from "@/lib/wallets/providers"
import { useLocaleStore } from "@/stores/locale-store"

import { ReconcileSheet } from "./reconcile-sheet"
import { WalletAvatar } from "./wallet-avatar"

const schema = z.object({
  icon: z.string(),
  name: z.string().trim().min(1, "walletForm.nameRequired").max(60),
  currency: z.enum(["USD", "KHR"]),
  balance: z.string().refine((v) => !Number.isNaN(parseAmount(v)), "walletForm.amountInvalid"),
  visibility: z.enum(["SHARED", "PERSONAL"]),
})
type FormValues = z.infer<typeof schema>

type WalletFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  /** Edit this wallet; create a new one when omitted. */
  wallet?: Wallet | null
  /** True when the wallet has transactions (currency becomes read-only). */
  hasHistory?: boolean
}

export function WalletFormSheet({ open, onOpenChange, workspaceId, wallet, hasHistory }: WalletFormSheetProps) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const mutations = useWalletMutations(workspaceId)
  const { workspace } = useActiveWorkspace()
  const me = useProfile().data?.id
  const members = useMembers(workspace?.type === "FAMILY" ? workspace.id : undefined).data ?? []
  const editing = Boolean(wallet)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  // Shared vs personal only matters in a family workspace.
  const family = workspace?.type === "FAMILY"
  // Someone else's personal wallet: visible, but only its owner may change or use it.
  const othersPersonal = Boolean(wallet && wallet.visibility === "PERSONAL" && wallet.owner_id && wallet.owner_id !== me)
  const ownerName = members.find((m) => m.user_id === wallet?.owner_id)?.display_name
  const canChangeVisibility = !wallet || !wallet.owner_id || wallet.owner_id === me

  const defaults = (): FormValues =>
    wallet
      ? {
          icon: wallet.icon ?? "other",
          name: wallet.name,
          currency: wallet.currency,
          balance: String(wallet.balance),
          visibility: wallet.visibility,
        }
      : { icon: "cash", name: getProvider("cash").name[locale], currency: "USD", balance: "", visibility: "SHARED" }

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() })
  const { register, control, handleSubmit, setValue, getValues, reset, formState } = form

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, wallet?.id])

  const pickProvider = (key: string) => {
    const previous = getProvider(getValues("icon"))
    const next = getProvider(key)
    setValue("icon", key)
    // Replace the name only if it is still the previous preset's (untouched) name.
    const name = getValues("name").trim()
    if (!name || name === previous.name.km || name === previous.name.en) {
      setValue("name", key === "other" ? "" : next.name[locale], { shouldValidate: key !== "other" })
    }
    if (!editing) setValue("currency", next.defaultCurrency)
  }

  const onSubmit = handleSubmit(async (values) => {
    const currency = values.currency as Currency
    const visibility: WalletVisibility = family ? values.visibility : (wallet?.visibility ?? "SHARED")
    const input = {
      name: values.name.trim(),
      icon: values.icon,
      color: null,
      visibility,
      currency,
      balance: roundMoney(parseAmount(values.balance || "0"), currency),
    }
    try {
      // Existing wallets: the balance only changes through the ledger or Reconcile.
      if (wallet) {
        await mutations.update.mutateAsync({
          id: wallet.id,
          input: { name: input.name, icon: input.icon, color: input.color, visibility, currency },
        })
      } else await mutations.create.mutateAsync(input)
      toast.success(t("walletForm.saved"))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof PersonalWalletError ? t("wallet.personalOnly") : t("common.error"))
    }
  })

  const toggleArchive = async () => {
    if (!wallet) return
    const archived = !wallet.archived_at
    await mutations.setArchived.mutateAsync({ id: wallet.id, archived })
    if (archived) toast.success(t("walletForm.archivedToast"))
    onOpenChange(false)
  }

  const remove = async () => {
    if (!wallet || !window.confirm(t("walletForm.deleteConfirm", { name: wallet.name }))) return
    try {
      await mutations.remove.mutateAsync(wallet.id)
      toast.success(t("walletForm.deleted"))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof WalletInUseError ? t("walletForm.inUse") : t("common.error"))
    }
  }

  const errorText = (message?: string) => (message ? t(message as MessageKey) : undefined)
  const busy = formState.isSubmitting

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("walletForm.editTitle") : t("walletForm.createTitle")}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {othersPersonal && (
          <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("wallet.othersPersonal", { name: ownerName ?? t("family.someone") })}
          </p>
        )}
        <fieldset disabled={othersPersonal} className="space-y-5">
        <div className="space-y-2">
          <Label>{t("walletForm.provider")}</Label>
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <div className="grid grid-cols-4 gap-2">
                {WALLET_PROVIDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => pickProvider(p.key)}
                    aria-pressed={field.value === p.key}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] leading-tight transition-colors",
                      field.value === p.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                    )}
                  >
                    <WalletAvatar icon={p.key} className="size-9" />
                    <span className="line-clamp-1">{p.name[locale]}</span>
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wallet-name">{t("walletForm.name")}</Label>
          <Input id="wallet-name" className="h-11" maxLength={60} {...register("name")} aria-invalid={Boolean(formState.errors.name)} />
          {formState.errors.name && <p className="text-sm text-destructive">{errorText(formState.errors.name.message)}</p>}
        </div>

        <div className="space-y-2">
          <Label>{t("walletForm.currency")}</Label>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Segmented
                aria-label={t("walletForm.currency")}
                value={field.value}
                onChange={field.onChange}
                disabled={hasHistory}
                options={[
                  { value: "USD", label: "$ USD" },
                  { value: "KHR", label: "៛ KHR" },
                ]}
              />
            )}
          />
          {hasHistory && <p className="text-xs text-muted-foreground">{t("walletForm.currencyLocked")}</p>}
        </div>

        {family && (
          <div className="space-y-2">
            <Label>{t("wallet.visibility")}</Label>
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <Segmented
                  aria-label={t("wallet.visibility")}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={!canChangeVisibility}
                  options={[
                    {
                      value: "SHARED",
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <UsersIcon className="size-4" aria-hidden />
                          {t("wallet.SHARED")}
                        </span>
                      ),
                    },
                    {
                      value: "PERSONAL",
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <UserIcon className="size-4" aria-hidden />
                          {t("wallet.PERSONAL")}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">{t("wallet.visibilityHint")}</p>
          </div>
        )}

        {wallet ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("walletForm.balance")}</p>
              <Amount value={wallet.balance} currency={wallet.currency} className="text-lg font-semibold" />
            </div>
            <Button type="button" variant="outline" onClick={() => setReconcileOpen(true)}>
              <ScaleIcon />
              {t("reconcile.button")}
            </Button>
          </div>
        ) : (
        <div className="space-y-2">
          <Label htmlFor="wallet-balance">{t("walletForm.openingBalance")}</Label>
          <Input
            id="wallet-balance"
            className="h-11 text-base tabular-nums"
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            {...register("balance")}
            aria-invalid={Boolean(formState.errors.balance)}
          />
          {formState.errors.balance && <p className="text-sm text-destructive">{errorText(formState.errors.balance.message)}</p>}
        </div>
        )}

        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>

        {wallet && !othersPersonal && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={toggleArchive}>
              {wallet.archived_at ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {wallet.archived_at ? t("walletForm.unarchive") : t("walletForm.archive")}
            </Button>
            <Button type="button" variant="outline" className="text-destructive" onClick={remove}>
              <Trash2Icon />
              {t("walletForm.delete")}
            </Button>
          </div>
        )}
        </fieldset>
      </form>
      {wallet && <ReconcileSheet open={reconcileOpen} onOpenChange={setReconcileOpen} wallet={wallet} />}
    </BottomSheet>
  )
}
