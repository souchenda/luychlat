# Startup advisor — App Luy Chlat as a business (founder only)

**Decided by the founder on 4/11/2026.** An advisor for **App Luy Chlat itself**, for the founder alone, in Admin › Super.
It shows where the startup stands and how far each stage is: stops losing money («លែងខាត») → stands on its own
(«រួចខ្លួន») → profits steadily («ចំណេញជាលំដាប់»). An AI writes the plan and the marketing actions from the real numbers.

## Decisions

- The numbers come by clear rules, never guessed. Every forecast is labelled an estimate. If growth is zero or negative, no date is given.
- Revenue: the super admin metrics already in place (`admin_exec_metrics`: MRR, paying users, conversion, churn). They are used as input, not shown twice.
- Costs: from the expense categories in the app (a workspace he chooses, monthly average), which he can then edit. Kinds: FIXED (server, database, domain…) and PER_PAYING (AI and payment cost per paying user).
- Self-sustaining = fixed costs + his own monthly pay. Steady profit = that + his profit target (% of revenue).
- The AI plan and marketing actions respect his standing strategy: personal-first marketing, no «AI slop», preview-first publishing, the Play Store launch on 2027-01-01, and spend only when needed. The AI addresses him as «បង».

## Phases

- [x] 1a: the calculations — `src/lib/startup-economics.ts` (ARPU, contribution, the paying users each stage needs, months away at the last 3 months' net growth, the stage now) with tests.
- [ ] 1b: data — his costs and targets (super admin only), and the paying users at the end of each month (subscription history).
- [ ] 1c: the screen in Admin › Super: the stage, the three milestones, the levers (price, conversion, churn), and the costs editor with an import from a workspace's categories.
- [ ] 2: the AI plan — a 90-day plan and weekly marketing actions from the numbers, cached, regenerated on demand.
- [ ] 3: one line in the monthly report («ខែនេះ៖ X អ្នកបង់ · ត្រូវការ Y ទៀតដើម្បីលែងខាត»).
