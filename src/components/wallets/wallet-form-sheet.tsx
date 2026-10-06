"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowRightLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CreditCardIcon,
  CrownIcon,
  FileSpreadsheetIcon,
  LockIcon,
  Loader2Icon,
  PencilLineIcon,
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Amount } from "@/components/money/amount"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { stepUp } from "@/components/security/step-up"
import { useActiveWorkspace, useMembers, useProfile, useWalletMutations, useWallets } from "@/lib/data/hooks"
import { isCard } from "@/lib/credit-card"
import { PersonalWalletError, PlanLimitError, WalletInUseError, type Currency, type Wallet, type WalletKind, type WalletVisibility } from "@/lib/data/types"
import { type MessageKey, pick as pickText, type Locale } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { parseAmount, roundMoney } from "@/lib/money"
import { showUpgrade, usePlan } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { getProvider, POPULAR_PROVIDERS, searchProviders } from "@/lib/wallets/providers"
import { useLocaleStore } from "@/stores/locale-store"

import { CardMeter, PayCardSheet } from "./credit-card"
import { MoveWalletSheet } from "./move-wallet-sheet"
import { ReconcileSheet } from "./reconcile-sheet"
import { WalletAvatar } from "./wallet-avatar"

const schema = z.object({
  icon: z.string(),
  name: z.string().trim().min(1, "walletForm.nameRequired").max(60),
  // BOTH (new bank wallets only): a USD and a KHR wallet in one go, as Cambodian bank accounts come in pairs.
  currency: z.enum(["USD", "KHR", "BOTH"]),
  balance: z.string().refine((v) => !Number.isNaN(parseAmount(v)), "walletForm.amountInvalid"),
  balanceKhr: z.string().refine((v) => !Number.isNaN(parseAmount(v)), "walletForm.amountInvalid"),
  // Bank account numbers (digits, spaces, dashes); the KHR ones are for "$ + ៛".
  accountNo: z.string().trim().regex(/^([0-9][0-9 -]{2,29})?$/, "walletForm.accountInvalid"),
  accountNoKhr: z.string().trim().regex(/^([0-9][0-9 -]{2,29})?$/, "walletForm.accountInvalid"),
  odLimitKhr: z.string(),
  visibility: z.enum(["SHARED", "PERSONAL"]),
  kind: z.enum(["STANDARD", "CREDIT_CARD"]),
  creditLimit: z.string(),
  odLimit: z.string(),
  statementDay: z.string(),
  dueDay: z.string(),
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


function ProviderTile({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] leading-tight transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}

/**
 * Bank / wallet picker: the popular ones first, "More" opens every bank with a
 * search box, and "Type a name" covers anything not listed.
 */
function ProviderPicker({ value, name, locale, onPick }: { value: string; name: string; locale: Locale; onPick: (key: string) => void }) {
  const t = useT()
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState("")
  const pick = (key: string) => {
    onPick(key)
    setShowAll(false)
    setQuery("")
  }

  if (showAll) {
    const results = searchProviders(query)
    return (
      <div className="space-y-2 rounded-xl border p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("walletForm.search")}
            className="h-10 pl-9"
            aria-label={t("walletForm.search")}
          />
        </div>
        <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto p-0.5">
          {results.map((p) => (
            <ProviderTile key={p.key} active={value === p.key} onClick={() => pick(p.key)}>
              <WalletAvatar icon={p.key} className="size-9" />
              <span className="line-clamp-2 text-center">{pickText(p.name, locale)}</span>
            </ProviderTile>
          ))}
          <ProviderTile active={value === "other"} onClick={() => pick("other")}>
            <span className="flex size-9 items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground">
              <PencilLineIcon className="size-4" aria-hidden />
            </span>
            <span className="line-clamp-2 text-center">{t("walletForm.custom")}</span>
          </ProviderTile>
        </div>
        {results.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t("walletForm.noMatch", { q: query.trim() })}</p>}
        <button type="button" onClick={() => setShowAll(false)} className="flex w-full items-center justify-center gap-1 py-1 text-sm text-primary">
          <ChevronUpIcon className="size-4" aria-hidden />
          {t("walletForm.showLess")}
        </button>
      </div>
    )
  }

  // The chosen bank stays visible even when it is not one of the popular ones.
  const keys = POPULAR_PROVIDERS.includes(value) ? POPULAR_PROVIDERS : [...POPULAR_PROVIDERS, value]
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-2">
        {keys.map((key) => {
          const p = getProvider(key)
          const custom = key === "other"
          return (
            <ProviderTile key={key} active={value === key} onClick={() => pick(key)}>
              <WalletAvatar icon={key} name={custom ? name : undefined} className="size-9" />
              <span className="line-clamp-1">{custom ? name.trim() || t("walletForm.custom") : pickText(p.name, locale)}</span>
            </ProviderTile>
          )
        })}
        <ProviderTile active={false} onClick={() => setShowAll(true)}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
            <PlusIcon className="size-5" aria-hidden />
          </span>
          <span className="line-clamp-1 font-medium text-primary">{t("walletForm.more")}</span>
        </ProviderTile>
      </div>
      <p className="text-xs text-muted-foreground">{t("walletForm.customHint")}</p>
    </div>
  )
}

export function WalletFormSheet({ open, onOpenChange, workspaceId, wallet, hasHistory }: WalletFormSheetProps) {
  const t = useT()
  const { isPro } = usePlan()
  const locale = useLocaleStore((s) => s.locale)
  const mutations = useWalletMutations(workspaceId)
  const { workspace } = useActiveWorkspace()
  const me = useProfile().data?.id
  const members = useMembers(workspace?.type === "FAMILY" ? workspace.id : undefined).data ?? []
  const editing = Boolean(wallet)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
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
          balanceKhr: "",
          accountNo: wallet.account_no ?? "",
          accountNoKhr: "",
          odLimitKhr: "",
          visibility: wallet.visibility,
          kind: wallet.kind ?? "STANDARD",
          creditLimit: wallet.credit_limit != null ? String(wallet.credit_limit) : "",
          odLimit: wallet.od_limit != null ? String(wallet.od_limit) : "",
          statementDay: wallet.statement_day != null ? String(wallet.statement_day) : "",
          dueDay: wallet.due_day != null ? String(wallet.due_day) : "",
        }
      : {
          icon: "cash",
          name: pickText(getProvider("cash").name, locale),
          currency: "USD",
          balance: "",
          balanceKhr: "",
          accountNo: "",
          accountNoKhr: "",
          odLimitKhr: "",
          visibility: "SHARED",
          kind: "STANDARD",
          creditLimit: "",
          odLimit: "",
          statementDay: "",
          dueDay: "",
        }

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() })
  const { register, control, handleSubmit, setValue, getValues, reset, setFocus, formState } = form
  const icon = useWatch({ control, name: "icon" })
  const kind = useWatch({ control, name: "kind" }) as WalletKind
  const card = kind === "CREDIT_CARD"
  const currencyChoice = useWatch({ control, name: "currency" })
  const both = !wallet && !card && currencyChoice === "BOTH"
  // A card is one currency: drop "$ + ៛" when switching to a card.
  useEffect(() => {
    if (card && getValues("currency") === "BOTH") setValue("currency", "USD")
  }, [card, getValues, setValue])
  const [payOpen, setPayOpen] = useState(false)
  const allWallets = useWallets(workspaceId).data ?? []
  const name = useWatch({ control, name: "name" })

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
      setValue("name", key === "other" ? "" : pickText(next.name, locale), { shouldValidate: key !== "other" })
    }
    if (!editing) setValue("currency", next.defaultCurrency)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (values.currency === "BOTH" && !wallet && values.kind !== "CREDIT_CARD") return void createPair(values)
    const currency = (values.currency === "BOTH" ? "USD" : values.currency) as Currency
    const visibility: WalletVisibility = family ? values.visibility : (wallet?.visibility ?? "SHARED")
    const isCardForm = values.kind === "CREDIT_CARD"
    const limit = parseAmount(values.creditLimit)
    const statementDay = Number(values.statementDay)
    const dueDay = Number(values.dueDay)
    if (isCardForm) {
      if (!(limit > 0)) return void toast.error(t("card.limitInvalid"))
      const okDay = (d: number) => Number.isInteger(d) && d >= 1 && d <= 31
      if (!okDay(statementDay) || !okDay(dueDay)) return void toast.error(t("card.dayInvalid"))
    }
    const cardFields = isCardForm
      ? { kind: "CREDIT_CARD" as const, credit_limit: roundMoney(limit, currency), statement_day: statementDay, due_day: dueDay }
      : {} // Ordinary wallets don't send the card columns (works before the card migration too).
    // A bank wallet's overdraft line (optional; empty or 0 = none).
    const od = parseAmount(values.odLimit || "0")
    if (!isCardForm && (Number.isNaN(od) || od < 0)) return void toast.error(t("walletForm.amountInvalid"))
    const odFields = isCardForm ? {} : { od_limit: od > 0 ? roundMoney(od, currency) : null, account_no: values.accountNo.trim() || null }
    const amount = roundMoney(parseAmount(values.balance || "0"), currency)
    const input = {
      name: values.name.trim(),
      icon: values.icon,
      color: null,
      visibility,
      currency,
      // A new card starts at what you already owe on it.
      balance: isCardForm ? -Math.abs(amount) : amount,
      ...cardFields,
      ...odFields,
    }
    try {
      // Existing wallets: the balance only changes through the ledger or Reconcile.
      if (wallet) {
        await mutations.update.mutateAsync({
          id: wallet.id,
          input: { name: input.name, icon: input.icon, color: input.color, visibility, currency, ...(isCard(wallet) ? cardFields : odFields) },
        })
      } else await mutations.create.mutateAsync(input)
      toast.success(t("walletForm.saved"))
      onOpenChange(false)
    } catch (error) {
      if (error instanceof PlanLimitError) return showUpgrade("wallets")
      toast.error(error instanceof PersonalWalletError ? t("wallet.personalOnly") : t("common.error"))
    }
  })

  /** "$ + ៛": the USD wallet, then the KHR one ("ACLEDA USD", "ACLEDA KHR"), each with its account number and OD. */
  const createPair = async (values: FormValues) => {
    const visibility: WalletVisibility = family ? values.visibility : "SHARED"
    const base = values.name.trim()
    const odUsd = parseAmount(values.odLimit || "0")
    const odKhr = parseAmount(values.odLimitKhr || "0")
    if (Number.isNaN(odUsd) || Number.isNaN(odKhr) || odUsd < 0 || odKhr < 0) return void toast.error(t("walletForm.amountInvalid"))
    const pair = [
      {
        currency: "USD" as const,
        balance: roundMoney(parseAmount(values.balance || "0"), "USD"),
        od_limit: odUsd > 0 ? roundMoney(odUsd, "USD") : null,
        account_no: values.accountNo.trim() || null,
      },
      {
        currency: "KHR" as const,
        balance: roundMoney(parseAmount(values.balanceKhr || "0"), "KHR"),
        od_limit: odKhr > 0 ? roundMoney(odKhr, "KHR") : null,
        account_no: values.accountNoKhr.trim() || null,
      },
    ]
    let made = 0
    try {
      for (const p of pair) {
        await mutations.create.mutateAsync({
          name: `${base} ${p.currency}`.slice(0, 60),
          icon: values.icon,
          color: null,
          visibility,
          currency: p.currency,
          balance: p.balance,
          ...(icon !== "cash" ? { od_limit: p.od_limit, account_no: p.account_no } : {}),
        })
        made += 1
      }
      toast.success(t("walletForm.pairSaved", { name: base }))
      onOpenChange(false)
    } catch (error) {
      if (made === 1) toast.message(t("walletForm.pairHalf", { name: `${base} USD` }))
      if (error instanceof PlanLimitError) return showUpgrade("wallets")
      toast.error(error instanceof PersonalWalletError ? t("wallet.personalOnly") : t("common.error"))
    }
  }

  const toggleArchive = async () => {
    if (!wallet) return
    const archived = !wallet.archived_at
    try {
      await mutations.setArchived.mutateAsync({ id: wallet.id, archived })
    } catch (error) {
      if (error instanceof PlanLimitError) return showUpgrade("wallets")
      return void toast.error(t("common.error"))
    }
    if (archived) toast.success(t("walletForm.archivedToast"))
    onOpenChange(false)
  }

  const remove = async () => {
    if (!wallet || !(await stepUp(t("walletForm.deleteConfirm", { name: wallet.name })))) return
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
        {wallet && isCard(wallet) && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("card.owed")}</p>
                <Amount value={Math.max(0, -wallet.balance)} currency={wallet.currency} className="text-lg font-semibold text-rose-600 dark:text-rose-400" />
              </div>
              <Button type="button" onClick={() => setPayOpen(true)} disabled={wallet.balance >= 0}>
                <CreditCardIcon />
                {t("card.pay")}
              </Button>
            </div>
            <CardMeter wallet={wallet} />
          </div>
        )}
        <div className="space-y-2">
          <Label>{t("walletForm.provider")}</Label>
          <ProviderPicker
            value={icon}
            name={name}
            locale={locale}
            onPick={(key) => {
              pickProvider(key)
              // "Type a name": go straight to the name field.
              if (key === "other") window.setTimeout(() => setFocus("name"), 50)
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wallet-name">{t("walletForm.name")}</Label>
          <Input
            id="wallet-name"
            className="h-11"
            maxLength={60}
            placeholder={icon === "other" ? t("walletForm.customPlaceholder") : undefined}
            {...register("name")}
            aria-invalid={Boolean(formState.errors.name)}
          />
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
                  { value: "USD", label: "$" },
                  { value: "KHR", label: "៛" },
                  // New, non-card wallets: both at once.
                  ...(!wallet && !card ? [{ value: "BOTH", label: "$ + ៛" }] : []),
                ]}
              />
            )}
          />
          {hasHistory && <p className="text-xs text-muted-foreground">{t("walletForm.currencyLocked")}</p>}
          {both && <p className="text-xs text-muted-foreground">{t("walletForm.pairHint", { name: name?.trim() || "ACLEDA" })}</p>}
        </div>

        {!wallet && (
          <div className="space-y-2">
            <Label>{t("card.walletType")}</Label>
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <Segmented
                  aria-label={t("card.walletType")}
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "STANDARD", label: t("card.standard") },
                    {
                      value: "CREDIT_CARD",
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <CreditCardIcon className="size-4" aria-hidden />
                          {t("card.kind")}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            />
          </div>
        )}

        {card && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-limit">{t("card.limit")}</Label>
              <Input id="card-limit" className="h-11 bg-background tabular-nums" inputMode="decimal" placeholder="1000" autoComplete="off" {...register("creditLimit")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="card-statement">{t("card.statementDay")}</Label>
                <Input id="card-statement" className="h-11 bg-background tabular-nums" inputMode="numeric" placeholder="20" maxLength={2} {...register("statementDay")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="card-due">{t("card.dueDay")}</Label>
                <Input id="card-due" className="h-11 bg-background tabular-nums" inputMode="numeric" placeholder="5" maxLength={2} {...register("dueDay")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("card.hint")}</p>
          </div>
        )}

        {/* Bank wallets (create and edit alike): the account number, and an optional overdraft / working-capital line. */}
        {!card && !both && icon !== "cash" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="account-no">{t("walletForm.accountNo")}</Label>
              <Input id="account-no" className="h-11 tabular-nums" inputMode="numeric" placeholder="0001 23 456789 1 2" autoComplete="off" maxLength={30} {...register("accountNo")} aria-invalid={Boolean(formState.errors.accountNo)} />
              {formState.errors.accountNo && <p className="text-sm text-destructive">{errorText(formState.errors.accountNo.message)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-limit">{t("od.limit")}</Label>
              <Input id="od-limit" className="h-11 tabular-nums" inputMode="decimal" placeholder={t("od.placeholder")} autoComplete="off" {...register("odLimit")} />
              <p className="text-xs text-muted-foreground">{t("od.hint")}</p>
            </div>
          </div>
        )}

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
        ) : null}
        {wallet && (
          <Link
            href={`/wallets/${wallet.id}/reconcile`}
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/60"
          >
            <FileSpreadsheetIcon className="size-5 shrink-0 text-emerald-600" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t("recon.title")}</span>
              <span className="block text-xs text-muted-foreground">{t("recon.entryHint")}</span>
            </span>
            {!isPro && <CrownIcon className="size-4 text-amber-500" aria-label="PRO" />}
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        )}
        {!wallet && both && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { sign: "$", code: "USD", account: "accountNo", balance: "balance", od: "odLimit" },
                { sign: "៛", code: "KHR", account: "accountNoKhr", balance: "balanceKhr", od: "odLimitKhr" },
              ] as const
            ).map((c) => (
              <div key={c.code} className="space-y-2 rounded-xl border bg-muted/30 p-2.5">
                <p className="text-sm font-semibold">
                  {c.sign} {c.code}
                </p>
                {icon !== "cash" && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t("walletForm.accountNoShort")}</Label>
                    <Input className="h-10 bg-background text-sm tabular-nums" inputMode="numeric" autoComplete="off" maxLength={30} aria-label={`${t("walletForm.accountNoShort")} ${c.code}`} {...register(c.account)} />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">{t("walletForm.openingBalance")}</Label>
                  <Input className="h-10 bg-background text-sm tabular-nums" inputMode="decimal" placeholder="0" autoComplete="off" aria-label={`${t("walletForm.openingBalance")} ${c.code}`} {...register(c.balance)} />
                </div>
                {icon !== "cash" && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t("od.line")}</Label>
                    <Input className="h-10 bg-background text-sm tabular-nums" inputMode="decimal" placeholder="0" autoComplete="off" aria-label={`${t("od.line")} ${c.code}`} {...register(c.od)} />
                  </div>
                )}
              </div>
            ))}
            {(formState.errors.balance || formState.errors.balanceKhr || formState.errors.accountNo || formState.errors.accountNoKhr) && (
              <p className="col-span-2 text-sm text-destructive">{t(formState.errors.accountNo || formState.errors.accountNoKhr ? "walletForm.accountInvalid" : "walletForm.amountInvalid")}</p>
            )}
          </div>
        )}
        {wallet || both ? null : (
        <div className="space-y-2">
          <Label htmlFor="wallet-balance">{t(card ? "card.owedNow" : "walletForm.openingBalance")}</Label>
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
            <Button type="button" variant="outline" className="col-span-2" onClick={() => setMoveOpen(true)}>
              <ArrowRightLeftIcon />
              {t("walletMove.button")}
            </Button>
          </div>
        )}
        </fieldset>
      </form>
      {wallet && <ReconcileSheet open={reconcileOpen} onOpenChange={setReconcileOpen} wallet={wallet} />}
      {wallet && <MoveWalletSheet open={moveOpen} onOpenChange={setMoveOpen} wallet={wallet} onMoved={() => onOpenChange(false)} />}
      {wallet && isCard(wallet) && <PayCardSheet open={payOpen} onOpenChange={setPayOpen} card={wallet} wallets={allWallets} />}
    </BottomSheet>
  )
}
