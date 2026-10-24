import { createHash } from "crypto"

/** A SoundBox device's feed token, kept only as its SHA-256 (Task #487 — soundbox_devices.native_token_hash). */
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
