-- Saved inbox views added more product and persistence complexity than the
-- current inbox needs. This forward migration keeps deployed databases aligned
-- without rewriting the already-applied migration history.
DROP TABLE IF EXISTS "saved_views";
