import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = Database.Database;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin', 'vendedor')),
  password_hash TEXT NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contactos (
  id             INTEGER PRIMARY KEY,
  nombre         TEXT NOT NULL,
  empresa        TEXT NOT NULL DEFAULT '',
  cargo          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  telefono       TEXT NOT NULL DEFAULT '',
  origen         TEXT NOT NULL DEFAULT 'otro',
  notas          TEXT NOT NULL DEFAULT '',
  responsable_id INTEGER REFERENCES usuarios(id),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oportunidades (
  id              INTEGER PRIMARY KEY,
  titulo          TEXT NOT NULL,
  contacto_id     INTEGER NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  responsable_id  INTEGER NOT NULL REFERENCES usuarios(id),
  valor_centavos  INTEGER NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
  etapa           TEXT NOT NULL DEFAULT 'nuevo'
                  CHECK (etapa IN ('nuevo', 'contactado', 'propuesta', 'negociacion', 'ganado', 'perdido')),
  posicion        REAL NOT NULL DEFAULT 1000,
  cierre_estimado TEXT,
  motivo_perdida  TEXT NOT NULL DEFAULT '',
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  cerrado_en      TEXT
);

CREATE TABLE IF NOT EXISTS eventos_etapa (
  id             INTEGER PRIMARY KEY,
  oportunidad_id INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  desde          TEXT,
  hasta          TEXT NOT NULL,
  usuario_id     INTEGER REFERENCES usuarios(id),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actividades (
  id             INTEGER PRIMARY KEY,
  tipo           TEXT NOT NULL CHECK (tipo IN ('llamada', 'email', 'reunion', 'whatsapp', 'nota', 'tarea')),
  descripcion    TEXT NOT NULL,
  contacto_id    INTEGER NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  oportunidad_id INTEGER REFERENCES oportunidades(id) ON DELETE CASCADE,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  vence_en       TEXT,            -- solo tareas: fecha AAAA-MM-DD
  completada     INTEGER NOT NULL DEFAULT 0,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oport_etapa ON oportunidades (etapa, posicion);
CREATE INDEX IF NOT EXISTS idx_oport_resp ON oportunidades (responsable_id);
CREATE INDEX IF NOT EXISTS idx_act_contacto ON actividades (contacto_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_act_tareas ON actividades (usuario_id, completada, vence_en);
CREATE INDEX IF NOT EXISTS idx_eventos ON eventos_etapa (oportunidad_id);
`;

export function abrirDb(ruta = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "crm.sqlite")): DB {
  if (ruta !== ":memory:") fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  if (ruta !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(ESQUEMA);
  return db;
}
