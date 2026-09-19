-- A short name for the injury — "left knee" — so the drawer and the calendar
-- can tell two apart (Mads, 2026-09-18, showable-version/28a). Nullable:
-- every existing row stays unnamed and renders as "Injury", as before. For
-- human eyes only; nothing on a prompt path reads it. Nothing here changes data.
ALTER TABLE "injury" ADD COLUMN "name" text;