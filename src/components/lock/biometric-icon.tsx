import { FingerprintIcon, ScanFaceIcon } from "lucide-react"

import type { BiometricKind } from "@/lib/security/biometric"
import { cn } from "@/lib/utils"

/** Face ID, fingerprint, or both when the device may use either. */
export function BiometricIcon({ kind, className }: { kind: BiometricKind; className?: string }) {
  if (kind === "face") return <ScanFaceIcon className={className} aria-hidden />
  if (kind === "fingerprint") return <FingerprintIcon className={className} aria-hidden />
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden>
      <ScanFaceIcon className="size-[55%]" />
      <FingerprintIcon className="size-[55%]" />
    </span>
  )
}
