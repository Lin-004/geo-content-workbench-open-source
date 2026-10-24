// Add import audit storage without rewriting legacy business records.
async function createEnum(db, name, values) {
 const found = await db.query('SELECT 1 FROM pg_type WHERE typname=$1',[name]);
 if (!found.rowCount) await db.query(`CREATE TYPE ${name} AS ENUM (${values.map(v=>"'"+v+"'").join(',')})`);
}
export async function migratePlanImport(db) {
  await createEnum(db, "enum_plan_import_batches_source_format", ["xlsx", "docx", "md"]);
  await createEnum(db, "enum_plan_import_batches_mode", ["xlsx", "legacy"]);
  await createEnum(db, "enum_plan_import_batches_status", ["committed", "failed"]);
  await db.query(`
    CREATE TABLE IF NOT EXISTS plan_import_batches (
      id serial PRIMARY KEY,
      project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_filename varchar NOT NULL,
      source_hash varchar NOT NULL,
      source_format enum_plan_import_batches_source_format NOT NULL,
      template_id varchar NOT NULL,
      template_version numeric NOT NULL,
      mode enum_plan_import_batches_mode NOT NULL,
      status enum_plan_import_batches_status NOT NULL,
      summary_create numeric NOT NULL,
      summary_update numeric NOT NULL,
      summary_unchanged numeric NOT NULL,
      summary_conflict numeric NOT NULL,
      summary_error numeric NOT NULL,
      details jsonb NOT NULL,
      operator_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS plan_import_batches_project_idx ON plan_import_batches (project_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS plan_import_batches_operator_idx ON plan_import_batches (operator_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS plan_import_batches_updated_at_idx ON plan_import_batches (updated_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS plan_import_batches_created_at_idx ON plan_import_batches (created_at)`);
  await db.query(`
    ALTER TABLE payload_locked_documents_rels
    ADD COLUMN IF NOT EXISTS plan_import_batches_id integer REFERENCES plan_import_batches(id) ON DELETE CASCADE
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_plan_import_batches_id_idx ON payload_locked_documents_rels (plan_import_batches_id)`);

  await db.query("INSERT INTO workbench_schema_versions(version) VALUES('20261009-xlsx-import') ON CONFLICT DO NOTHING");
}
