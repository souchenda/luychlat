-- The loan reminder carries the CBC tip (founder, 20/10/2026): «💡 បង់ទាន់ពេលដើម្បីរក្សាកូដ [0] ក្នុងប្រព័ន្ធ CBC!» under
-- each scheduled installment — in the app and on Telegram (English: «Pay on time to keep code [0] at the CBC»). The
-- Telegram signature becomes the brand's «អេប លុយឆ្លាត · App Luy Chlat» (never a bare «LuyChlat»). Rebuilt from the
-- live definition of public.run_debt_alerts(); each replacement must hit exactly once, or the migration stops.
do $$
declare
  def text;
  r record;
begin
  def := pg_get_functiondef('public.run_debt_alerts()'::regprocedure);
  for r in
    select * from (values
      ($a$body := '🧾 បង់រំលោះលើកទី ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency);$a$,
       $a$body := '🧾 បង់រំលោះលើកទី ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency)
        || E'\n💡 បង់ទាន់ពេលដើម្បីរក្សាកូដ [0] ក្នុងប្រព័ន្ធ CBC!';$a$),
      ($b$E'\n🧾 បង់រំលោះលើកទី ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency)
        else$b$,
       $b$E'\n🧾 បង់រំលោះលើកទី ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency)
          || E'\n💡 បង់ទាន់ពេលដើម្បីរក្សាកូដ [0] ក្នុងប្រព័ន្ធ CBC!'
        else$b$),
      ($c$E'\n🧾 Installment ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency) end;$c$,
       $c$E'\n🧾 Installment ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency)
          || E'\n💡 Pay on time to keep code [0] at the Credit Bureau (CBC)!' end;$c$),
      ($d$— លុយឆ្លាត · LuyChlat$d$, $d$— អេប លុយឆ្លាត · App Luy Chlat$d$)
    ) as v(old_text, new_text)
  loop
    if (length(def) - length(replace(def, r.old_text, ''))) / length(r.old_text) <> 1 then
      raise exception 'loan reminder CBC tip: % hits for «%»', (length(def) - length(replace(def, r.old_text, ''))) / length(r.old_text), left(r.old_text, 60);
    end if;
    def := replace(def, r.old_text, r.new_text);
  end loop;
  execute def;
end $$;
