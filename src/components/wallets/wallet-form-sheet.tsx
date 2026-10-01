"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWalletMutations } from "@/lib/data/hooks"
import { WalletInUseError, type Currency, type Wallet } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { getProvider, WALLET_PROVIDERS } from "@/lib/wallets/providers"
import { useLocaleStore } from "@/stores/locale-store"

import { WalletAvatar } from "./wallet-avatar"

const schema = z.object({
  icon: z.string(),
  name: z.string().trim().min(1, "walletForm.nameRequired").max(60),
  currency: z.enum(["USD", "KHR"]),
  balance: z.string().refine((v) => !Number.isNaN(parseAmount(v)), "walletForm.amountInvalid"),
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
  const editing = Boolean(wallet)

  const defaults = (): FormValues =>
    wallet
      ? { icon: wallet.icon ?? "other", name: wallet.name, currency: wallet.currency, balance: String(wallet.balance) }
      : { icon: "cash", name: getProvider("cash").name[locale], currency: "USD", balance: "" }

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
    const input = {
      name: values.name.trim(),
      icon: values.icon,
      color: null,
      currency,
      balance: roundMoney(parseAmount(values.balance || "0"), currency),
    }
    try {
      if (wallet) await mutations.update.mutateAsync({ id: wallet.id, input })
      else await mutations.create.mutateAsync(input)
      toast.success(t("walletForm.saved"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
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

        <div className="space-y-2">
          <Label htmlFor="wallet-balance">{t("walletForm.balance")}</Label>
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

        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>

        {wallet && (
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
      </form>
    </BottomSheet>
  )
}
