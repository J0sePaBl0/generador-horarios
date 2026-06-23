-- Recurrence for fixed rules: which occurrences of a weekday within the month
-- a rule applies to. NULL/empty = every week. Positive = nth from the start
-- (1..5); negative = from the end (-1 last, -2 second-to-last).
-- Run this once in the Supabase SQL editor for each environment.

alter table minister_fixed_rules
  add column if not exists week_ordinals smallint[];
