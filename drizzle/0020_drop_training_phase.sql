-- training-architecture/03 — the Training Phase stops being stored.
--
-- It is now the name of the Training Block today falls inside, derived on every
-- read from the Target Race. The column it replaces was written once at
-- onboarding and never recomputed, so an athlete who onboarded eleven months out
-- was still 'Base Building' in race week — and every Coach prompt read that
-- string as fact.
--
-- Nothing is migrated out of it. There is nowhere for the value to go: the
-- derivation needs a Race Date, which the column never had, and the string it
-- held was a guess made from a race name by four regexes (retired in 0019).
--
-- The phase is consequently NO LONGER A CLOSED SET. It read
-- 'Base Building | Build Phase | Peak Phase | Taper | Recovery'; it is now
-- whatever the current block is called, and nothing may switch on its value.
-- Verified at the time of writing: nothing in src/ ever did.

ALTER TABLE "athlete" DROP COLUMN "training_phase";