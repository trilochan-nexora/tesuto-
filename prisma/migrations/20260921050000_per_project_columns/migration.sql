-- Board columns move from one global set to a set per project, matching how
-- GitHub Projects keeps its columns scoped to a single board. Existing
-- columns are cloned onto every project so no board goes empty, and any of
-- the five standard columns (Backlog/To Do/In Progress/In Review/Done)
-- missing for a project — e.g. because they were previously deleted on a
-- shared board and vanished everywhere — are restored.

-- 1. Add the new FK column, nullable until backfilled.
ALTER TABLE "columns" ADD COLUMN "project_id" TEXT;

-- 2. Drop the old single-column primary key so the same id (e.g. "backlog")
--    can exist once per project.
ALTER TABLE "columns" DROP CONSTRAINT "columns_pkey";

-- 3. Clone every existing (global) column onto every project.
CREATE TEMP TABLE "_old_columns" AS TABLE "columns";
DELETE FROM "columns";

INSERT INTO "columns" ("id", "project_id", "label", "description", "dot", "terminal", "limit", "order")
SELECT oc."id", p."id", oc."label", oc."description", oc."dot", oc."terminal", oc."limit", oc."order"
FROM "projects" p
CROSS JOIN "_old_columns" oc;

-- 4. Restore any of the five standard columns a project is missing.
INSERT INTO "columns" ("id", "project_id", "label", "description", "dot", "terminal", "limit", "order")
SELECT d."id", p."id", d."label", NULL, d."dot", d."terminal", NULL, d."ord"
FROM "projects" p
CROSS JOIN (VALUES
  ('backlog', 'Backlog', 'bg-muted-foreground', false, 0),
  ('todo', 'To Do', 'bg-sky-500', false, 1),
  ('in_progress', 'In Progress', 'bg-amber-500', false, 2),
  ('review', 'In Review', 'bg-violet-500', false, 3),
  ('done', 'Done', 'bg-emerald-500', true, 4)
) AS d("id", "label", "dot", "terminal", "ord")
WHERE NOT EXISTS (
  SELECT 1 FROM "columns" c WHERE c."project_id" = p."id" AND c."id" = d."id"
);

-- 5. Enforce the new shape: required FK, composite primary key.
ALTER TABLE "columns" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "columns" ADD CONSTRAINT "columns_pkey" PRIMARY KEY ("project_id", "id");
ALTER TABLE "columns" ADD CONSTRAINT "columns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
