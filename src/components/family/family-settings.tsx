"use client"

import {
  CheckIcon,
  CopyIcon,
  FlaskConicalIcon,
  Loader2Icon,
  LogOutIcon,
  PlusIcon,
  Share2Icon,
  TicketIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { MemberAvatar } from "@/components/family/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFamilyMutations, useInvites, useMembers, useProfile, useWorkspaces } from "@/lib/data/hooks"
import type { Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole } from "@/lib/data/types"
import { simulateJoin, simulateMemberExpense } from "@/lib/family/guest-simulation"
import { formatCode, inviteLink, normalizeCode } from "@/lib/family/invite-code"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

type InviteRole = Exclude<WorkspaceRole, "OWNER">

function useIsGuest() {
  return useSessionStore((s) => s.isGuest && !s.user)
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error(text)
  }
}

/** Display name used for "កត់ដោយ៖ ..." on everything this user records. */
function DisplayNameRow() {
  const t = useT()
  const profile = useProfile().data
  const { updateProfile } = useFamilyMutations()
  const [name, setName] = useState("")
  useEffect(() => setName(profile?.display_name ?? ""), [profile?.display_name])
  const trimmed = name.trim()
  const changed = trimmed.length > 0 && trimmed !== profile?.display_name

  return (
    <form
      className="space-y-2 px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!changed) return
        await updateProfile.mutateAsync(trimmed)
        toast.success(t("family.nameSaved"))
      }}
    >
      <Label htmlFor="display-name">{t("family.displayName")}</Label>
      <div className="flex gap-2">
        <Input
          id="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={t("family.displayNamePlaceholder")}
          className="h-10"
        />
        {changed && (
          <Button type="submit" disabled={updateProfile.isPending}>
            {t("common.save")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("family.displayNameHint")}</p>
    </form>
  )
}

/** Code, link and share actions for a fresh invitation. */
function InviteSheet({ open, onOpenChange, workspace }: { open: boolean; onOpenChange: (v: boolean) => void; workspace: Workspace }) {
  const t = useT()
  const isGuest = useIsGuest()
  const queryClient = useQueryClient()
  const { createInvite } = useFamilyMutations()
  const [role, setRole] = useState<InviteRole>("MEMBER")
  const [invite, setInvite] = useState<WorkspaceInvite | null>(null)
  const [partnerName, setPartnerName] = useState("")

  useEffect(() => {
    if (open) {
      setInvite(null)
      setRole("MEMBER")
      setPartnerName(t("family.samplePartner"))
    }
  }, [open, t])

  const generate = async () => {
    try {
      setInvite(await createInvite.mutateAsync({ workspaceId: workspace.id, role }))
    } catch {
      toast.error(t("common.error"))
    }
  }

  const link = invite ? inviteLink(invite.code) : ""
  const share = async () => {
    if (!invite) return
    const text = t("family.shareText", { code: formatCode(invite.code), name: workspace.name })
    if (navigator.share) {
      try {
        await navigator.share({ title: t("family.invite"), text, url: link })
      } catch {
        // Cancelled by the user.
      }
    } else await copy(`${text}\n${link}`, t("family.linkCopied"))
  }

  const simulate = () => {
    const member = simulateJoin(workspace.id, partnerName)
    void queryClient.invalidateQueries()
    toast.success(t("family.simJoined", { name: member.display_name }))
    onOpenChange(false)
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("family.invite")} description={workspace.name}>
      {!invite ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("family.inviteRole")}</Label>
            <Segmented
              aria-label={t("family.inviteRole")}
              value={role}
              onChange={setRole}
              options={[
                { value: "MEMBER", label: t("family.role.MEMBER") },
                { value: "VIEWER", label: t("family.role.VIEWER") },
              ]}
            />
            <p className="text-xs text-muted-foreground">{t(`family.roleHint.${role}`)}</p>
          </div>
          <Button className="h-12 w-full text-base" onClick={generate} disabled={createInvite.isPending}>
            {createInvite.isPending ? <Loader2Icon className="animate-spin" /> : <TicketIcon />}
            {t("family.generate")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-5 text-center">
            <p className="text-xs text-muted-foreground">{t("family.codeLabel")}</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-primary" aria-live="polite">
              {formatCode(invite.code)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("family.expires", { date: format(new Date(invite.expires_at), "dd/MM/yyyy") })} · {t(`family.role.${invite.role}`)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => copy(invite.code, t("family.codeCopied"))}>
              <CopyIcon />
              {t("family.copyCode")}
            </Button>
            <Button variant="outline" onClick={() => copy(link, t("family.linkCopied"))}>
              <CopyIcon />
              {t("family.copyLink")}
            </Button>
          </div>
          <Button className="h-12 w-full text-base" onClick={share}>
            <Share2Icon />
            {t("family.share")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("family.howToJoin")}</p>

          {isGuest && (
            <div className="space-y-2 rounded-xl bg-amber-500/10 p-3">
              <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <FlaskConicalIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("family.guestDemo")}
              </p>
              <div className="flex gap-2">
                <Input
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  maxLength={40}
                  aria-label={t("family.simName")}
                  className="h-9 bg-background"
                />
                <Button size="sm" className="h-9" onClick={simulate} disabled={!partnerName.trim()}>
                  <CheckIcon />
                  {t("family.simAccept")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

function MemberRow({ member, workspace, me }: { member: WorkspaceMember; workspace: Workspace; me: string | undefined }) {
  const t = useT()
  const router = useRouter()
  const lang = useLocaleStore((s) => s.locale)
  const isGuest = useIsGuest()
  const queryClient = useQueryClient()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const { setRole, removeMember } = useFamilyMutations()
  const isMe = member.user_id === me
  const owner = workspace.role === "OWNER"

  const remove = async () => {
    const question = isMe ? t("family.leaveConfirm", { name: workspace.name }) : t("family.removeConfirm", { name: member.display_name })
    if (!window.confirm(question)) return
    await removeMember.mutateAsync(member.id)
    if (isMe) {
      setActive("PERSONAL")
      router.push("/home")
    }
    toast.success(isMe ? t("family.left") : t("family.removed", { name: member.display_name }))
  }

  const simulateExpense = async () => {
    const result = await simulateMemberExpense(workspace.id, member, lang)
    if (!result) return toast.error(t("family.simNeedsWallet"))
    void queryClient.invalidateQueries()
    toast(result.notification.title, { description: result.notification.message })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <MemberAvatar id={member.user_id} name={member.display_name} className="size-9 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.display_name}
          {isMe && <span className="text-muted-foreground"> ({t("family.you")})</span>}
        </p>
        <p className="text-xs text-muted-foreground">{t(`family.role.${member.role}`)}</p>
      </div>
      {owner && member.role !== "OWNER" && (
        <Select value={member.role} onValueChange={(role) => setRole.mutate({ memberId: member.id, role: role as InviteRole })}>
          <SelectTrigger className="h-8 w-28 text-xs" aria-label={t("family.inviteRole")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MEMBER">{t("family.role.MEMBER")}</SelectItem>
            <SelectItem value="VIEWER">{t("family.role.VIEWER")}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {member.role !== "OWNER" && (owner || isMe) && (
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={remove}
          aria-label={isMe ? t("family.leave") : t("family.remove", { name: member.display_name })}
        >
          {isMe ? <LogOutIcon className="size-4" /> : <UserMinusIcon className="size-4" />}
        </Button>
      )}
      {isGuest && !isMe && member.role !== "VIEWER" && (
        <Button size="sm" variant="secondary" className="basis-full" onClick={simulateExpense}>
          <FlaskConicalIcon />
          {t("family.simExpense", { name: member.display_name })}
        </Button>
      )}
    </li>
  )
}

function FamilyCard({ workspace }: { workspace: Workspace }) {
  const t = useT()
  const router = useRouter()
  const me = useProfile().data?.id
  const owner = workspace.role === "OWNER"
  const members = useMembers(workspace.id).data ?? []
  const invites = useInvites(workspace.id, owner).data ?? []
  const { revokeInvite, deleteFamily } = useFamilyMutations()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const [inviteOpen, setInviteOpen] = useState(false)

  const remove = async () => {
    if (!window.confirm(t("family.deleteConfirm", { name: workspace.name }))) return
    await deleteFamily.mutateAsync(workspace.id)
    setActive("PERSONAL")
    toast.success(t("family.deleted"))
    router.push("/home")
  }

  return (
    <div className="space-y-0 divide-y">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UsersIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{workspace.name}</p>
          <p className="text-xs text-muted-foreground">{t("family.memberCount", { count: members.length || workspace.member_count })}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setActive("FAMILY", workspace.id)}>
          {t("family.open")}
        </Button>
      </div>

      <ul className="divide-y">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} workspace={workspace} me={me} />
        ))}
      </ul>

      {owner && (
        <div className="space-y-2 px-4 py-3">
          <Button className="h-11 w-full" onClick={() => setInviteOpen(true)}>
            <UserPlusIcon />
            {t("family.invite")}
          </Button>
          {invites.length > 0 && (
            <ul className="space-y-1.5">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
                  <TicketIcon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="font-mono font-semibold tracking-wider">{formatCode(i.code)}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {t(`family.role.${i.role}`)}
                  </Badge>
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {t("family.expires", { date: format(new Date(i.expires_at), "dd/MM") })}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => copy(inviteLink(i.code), t("family.linkCopied"))}
                    aria-label={t("family.copyLink")}
                  >
                    <CopyIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 hover:text-destructive"
                    onClick={() => revokeInvite.mutate(i.id)}
                    aria-label={t("family.revoke")}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" className="w-full text-destructive" onClick={remove}>
            <Trash2Icon />
            {t("family.delete")}
          </Button>
        </div>
      )}
      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} workspace={workspace} />
    </div>
  )
}

function JoinByCode() {
  const t = useT()
  const router = useRouter()
  const [code, setCode] = useState("")
  return (
    <form
      className="flex items-end gap-2 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length === 6) router.push(`/join?code=${code}`)
      }}
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="join-code">{t("family.haveCode")}</Label>
        <Input
          id="join-code"
          value={formatCode(code)}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="ABC-123"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-10 font-mono tracking-widest uppercase"
        />
      </div>
      <Button type="submit" variant="secondary" disabled={code.length !== 6}>
        {t("family.join")}
      </Button>
    </form>
  )
}

/** Settings › "Family / partner account": display name, family workspace, members and invitations. */
export function FamilySettings() {
  const t = useT()
  const families = (useWorkspaces().data ?? []).filter((w) => w.type === "FAMILY")
  const { createFamily } = useFamilyMutations()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const [name, setName] = useState("")

  const create = async () => {
    try {
      const workspace = await createFamily.mutateAsync(name.trim() || t("ws.FAMILY"))
      setActive("FAMILY", workspace.id)
      toast.success(t("family.created"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <section id="family" className="space-y-2 scroll-mt-20">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("family.section")}</h2>
      <Card className="gap-0 divide-y py-0">
        <DisplayNameRow />
        {families.map((w) => (
          <FamilyCard key={w.id} workspace={w} />
        ))}
        {families.length === 0 && (
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UsersIcon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{t("family.createTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("family.createHint")}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder={t("family.namePlaceholder")}
                aria-label={t("family.name")}
                className="h-10"
              />
              <Button onClick={create} disabled={createFamily.isPending}>
                {createFamily.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                {t("family.create")}
              </Button>
            </div>
          </div>
        )}
        <JoinByCode />
      </Card>
    </section>
  )
}
