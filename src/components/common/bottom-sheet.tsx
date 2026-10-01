"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/** Mobile bottom sheet used for all forms. */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-md gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
        <SheetHeader>
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className={description ? undefined : "sr-only"}>{description ?? title}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
