import { z } from "zod"

import type { Snapshot } from "./snapshot"

/**
 * The ONLY data that may leave the device for a live AI model. Every object is
 * `.strict()` (unknown keys are rejected) and strings are restricted to enums
 * or short generic identifiers, so names, phone numbers and notes can't be
 * smuggled through. The server re-validates with the same schema.
 */
const amount = z.number().finite().min(-1e12).max(1e12)
const categoryKey = z.string().regex(/^(custom_\d{1,3}|uncategorized|[a-z_]{2,24})$/)

export const anonymousSnapshotSchema = z
  .object({
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    workspaceType: z.enum(["PERSONAL", "BUSINESS", "FAMILY"]),
    khrPerUsd: amount,
    cashUsd: amount,
    walletCount: z.number().int().min(0).max(1000),
    months: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), income: amount, expense: amount }).strict()).max(12),
    avgIncome: amount,
    avgExpense: amount,
    thisMonth: z
      .object({ income: amount, expense: amount, net: amount, daysElapsed: z.number().int(), daysInMonth: z.number().int() })
      .strict(),
    savingsRate: z.number().nullable(),
    topExpenses: z.array(z.object({ category: categoryKey, usd: amount, share: z.number() }).strict()).max(10),
    anomalies: z
      .array(z.object({ category: categoryKey, thisMonth: amount, avgPrevious: amount, ratio: z.number() }).strict())
      .max(10),
    debts: z
      .array(
        z
          .object({
            ref: z.string().regex(/^[PR]\d{1,3}$/),
            type: z.enum(["PAYABLE", "RECEIVABLE"]),
            remainingUsd: amount,
            totalUsd: amount,
            annualRatePct: z.number().min(0).max(10000),
            daysLeft: z.number().int().nullable(),
            status: z.enum(["ACTIVE", "PARTIALLY_PAID", "OVERDUE"]),
          })
          .strict(),
      )
      .max(100),
    payableUsd: amount,
    receivableUsd: amount,
    monthlyDebtService: amount,
    dti: z.number().nullable(),
    payablesDue30: amount,
    receivablesDue30: amount,
    projectedCash30: amount,
    shortfall30: amount,
    overduePayables: z.number().int(),
    overdueReceivables: z.number().int(),
    score: z.number().int().min(300).max(850),
    scoreFactors: z
      .object({
        repayment: z.number().min(0).max(1),
        dti: z.number().min(0).max(1),
        savings: z.number().min(0).max(1),
        buffer: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict()

export type AnonymousSnapshot = z.infer<typeof anonymousSnapshotSchema>

/** Validates the snapshot against the allowlist (throws if anything identifying slipped in). */
export function toAnonymousPayload(snapshot: Snapshot): AnonymousSnapshot {
  return anonymousSnapshotSchema.parse(snapshot)
}

export const advisorRequestSchema = z
  .object({
    // "luysmart": Pro AI with the server's own key (quota checked on the server).
    provider: z.enum(["anthropic", "openai", "luysmart"]),
    apiKey: z.string().min(20).max(300).optional(),
    model: z.string().regex(/^[a-zA-Z0-9._:-]{2,64}$/).optional(),
    language: z.enum(["km", "en"]),
    snapshot: anonymousSnapshotSchema,
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }).strict())
      .max(12),
    question: z.string().min(1).max(1000),
  })
  .strict()
  .refine((r) => r.provider === "luysmart" || Boolean(r.apiKey), { message: "apiKey required", path: ["apiKey"] })

export type AdvisorRequest = z.infer<typeof advisorRequestSchema>
