CREATE TABLE lumo_network (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE lumo_records (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX lumo_records_kind_tenant ON lumo_records (kind, tenant_id);
--> statement-breakpoint
CREATE TABLE lumo_storage_clock (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE lumo_commit_guard (
  id TEXT PRIMARY KEY NOT NULL
);
