/** Acceso a datos y reglas de negocio del CRM. Todas las funciones reciben el usuario para aplicar permisos. */
import { z } from "zod";
import { esCerrada, ETAPAS, IDS_ETAPAS, ORIGENES, posicionEntre, TIPOS_ACTIVIDAD, type Etapa, type Oportunidad } from "../shared/crm";
import type { Usuario } from "./auth";
import type { DB } from "./db";

export class ErrorApi extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
const noEncontrado = (que: string) => new ErrorApi(404, `${que} no existe.`);
const sinPermiso = () => new ErrorApi(403, "No tienes permiso sobre este registro.");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida (AAAA-MM-DD)");
const texto = (max: number) => z.string().trim().max(max).default("");

// ───────────────────────── Esquemas de entrada ─────────────────────────

export const esquemaContacto = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  empresa: texto(120),
  cargo: texto(80),
  email: z.union([z.literal(""), z.email("Email no válido")]).default(""),
  telefono: texto(40),
  origen: z.enum(ORIGENES).default("otro"),
  notas: texto(2000),
  responsable_id: z.number().int().positive().nullable().optional(),
});

export const esquemaOportunidad = z.object({
  titulo: z.string().trim().min(3, "Ponle un título a la oportunidad").max(150),
  contacto_id: z.number().int().positive(),
  valor_centavos: z.number().int().min(0).max(1e12),
  etapa: z.enum(IDS_ETAPAS).default("nuevo"),
  cierre_estimado: fecha.nullable().default(null),
  responsable_id: z.number().int().positive().optional(),
  motivo_perdida: texto(300),
});

export const esquemaMover = z.object({
  etapa: z.enum(IDS_ETAPAS),
  /** Id de la tarjeta delante de la cual se suelta; null = al final de la columna. */
  antes_de: z.number().int().positive().nullable().default(null),
  motivo_perdida: texto(300),
});

export const esquemaActividad = z
  .object({
    tipo: z.enum(TIPOS_ACTIVIDAD),
    descripcion: z.string().trim().min(2, "Describe la actividad").max(1000),
    contacto_id: z.number().int().positive(),
    oportunidad_id: z.number().int().positive().nullable().default(null),
    vence_en: fecha.nullable().default(null),
  })
  .refine((a) => a.tipo !== "tarea" || a.vence_en, { message: "Las tareas necesitan fecha de vencimiento", path: ["vence_en"] });

// ───────────────────────── Contactos ─────────────────────────

export function listarContactos(db: DB, filtros: { q?: string; origen?: string; pagina?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filtros.q) {
    where.push("(c.nombre LIKE ? OR c.empresa LIKE ? OR c.email LIKE ? OR c.telefono LIKE ?)");
    params.push(...Array(4).fill(`%${filtros.q}%`));
  }
  if (filtros.origen) {
    where.push("c.origen = ?");
    params.push(filtros.origen);
  }
  const condicion = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const porPagina = 25;
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contactos c ${condicion}`).get(...params) as { n: number }).n;
  const filas = db
    .prepare(
      `SELECT c.*, u.nombre AS responsable,
              (SELECT COUNT(*) FROM oportunidades o WHERE o.contacto_id = c.id AND o.etapa NOT IN ('ganado','perdido')) AS abiertas,
              (SELECT COALESCE(SUM(valor_centavos),0) FROM oportunidades o WHERE o.contacto_id = c.id AND o.etapa = 'ganado') AS ganado_centavos,
              (SELECT MAX(creado_en) FROM actividades a WHERE a.contacto_id = c.id) AS ultima_actividad
       FROM contactos c LEFT JOIN usuarios u ON u.id = c.responsable_id
       ${condicion}
       ORDER BY c.nombre COLLATE NOCASE
       LIMIT ? OFFSET ?`,
    )
    .all(...params, porPagina, (pagina - 1) * porPagina);
  return { contactos: filas, total, pagina, paginas: Math.max(1, Math.ceil(total / porPagina)) };
}

export function obtenerContacto(db: DB, id: number, usuario: Usuario) {
  const contacto = db
    .prepare("SELECT c.*, u.nombre AS responsable FROM contactos c LEFT JOIN usuarios u ON u.id = c.responsable_id WHERE c.id = ?")
    .get(id);
  if (!contacto) throw noEncontrado("El contacto");
  return {
    contacto,
    oportunidades: listarOportunidades(db, usuario, { contactoId: id }),
    actividades: listarActividades(db, usuario, { contactoId: id }),
  };
}

export function guardarContacto(db: DB, usuario: Usuario, datos: z.infer<typeof esquemaContacto>, id?: number) {
  const responsable = datos.responsable_id ?? usuario.id;
  const valores = [datos.nombre, datos.empresa, datos.cargo, datos.email, datos.telefono, datos.origen, datos.notas, responsable];
  if (id === undefined) {
    const r = db
      .prepare("INSERT INTO contactos (nombre, empresa, cargo, email, telefono, origen, notas, responsable_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(...valores);
    return Number(r.lastInsertRowid);
  }
  const r = db
    .prepare(
      `UPDATE contactos SET nombre = ?, empresa = ?, cargo = ?, email = ?, telefono = ?, origen = ?, notas = ?,
              responsable_id = ?, actualizado_en = datetime('now') WHERE id = ?`,
    )
    .run(...valores, id);
  if (r.changes === 0) throw noEncontrado("El contacto");
  return id;
}

export function eliminarContacto(db: DB, usuario: Usuario, id: number) {
  if (usuario.rol !== "admin") throw new ErrorApi(403, "Solo un administrador puede eliminar contactos.");
  const r = db.prepare("DELETE FROM contactos WHERE id = ?").run(id);
  if (r.changes === 0) throw noEncontrado("El contacto");
}

// ───────────────────────── Oportunidades ─────────────────────────

const SELECT_OPORTUNIDAD = `
  SELECT o.*, c.nombre AS contacto, c.empresa, u.nombre AS responsable,
         (SELECT COUNT(*) FROM actividades a WHERE a.oportunidad_id = o.id AND a.tipo = 'tarea' AND a.completada = 0) AS tareas_pendientes
  FROM oportunidades o
  JOIN contactos c ON c.id = o.contacto_id
  JOIN usuarios u ON u.id = o.responsable_id`;

/** Los vendedores solo ven sus propias oportunidades; el administrador ve todas (o filtra por responsable). */
export function listarOportunidades(db: DB, usuario: Usuario, filtros: { responsableId?: number; contactoId?: number; q?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const responsable = usuario.rol === "admin" ? filtros.responsableId : usuario.id;
  if (responsable) {
    where.push("o.responsable_id = ?");
    params.push(responsable);
  }
  if (filtros.contactoId) {
    where.push("o.contacto_id = ?");
    params.push(filtros.contactoId);
  }
  if (filtros.q) {
    where.push("(o.titulo LIKE ? OR c.nombre LIKE ? OR c.empresa LIKE ?)");
    params.push(...Array(3).fill(`%${filtros.q}%`));
  }
  return db
    .prepare(`${SELECT_OPORTUNIDAD} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY o.posicion, o.id`)
    .all(...params) as Oportunidad[];
}

function oportunidadConPermiso(db: DB, usuario: Usuario, id: number): Oportunidad {
  const o = db.prepare(`${SELECT_OPORTUNIDAD} WHERE o.id = ?`).get(id) as Oportunidad | undefined;
  if (!o) throw noEncontrado("La oportunidad");
  if (usuario.rol !== "admin" && o.responsable_id !== usuario.id) throw sinPermiso();
  return o;
}

export function obtenerOportunidad(db: DB, usuario: Usuario, id: number) {
  const oportunidad = oportunidadConPermiso(db, usuario, id);
  const eventos = db
    .prepare(
      `SELECT e.*, u.nombre AS usuario FROM eventos_etapa e LEFT JOIN usuarios u ON u.id = e.usuario_id
       WHERE e.oportunidad_id = ? ORDER BY e.creado_en, e.id`,
    )
    .all(id);
  return { oportunidad, eventos, actividades: listarActividades(db, usuario, { oportunidadId: id }) };
}

function ultimaPosicion(db: DB, etapa: Etapa): number | null {
  return (db.prepare("SELECT MAX(posicion) AS p FROM oportunidades WHERE etapa = ?").get(etapa) as { p: number | null }).p;
}

export function crearOportunidad(db: DB, usuario: Usuario, datos: z.infer<typeof esquemaOportunidad>) {
  if (!db.prepare("SELECT 1 FROM contactos WHERE id = ?").get(datos.contacto_id)) throw noEncontrado("El contacto");
  const responsable = usuario.rol === "admin" ? (datos.responsable_id ?? usuario.id) : usuario.id;
  const crear = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO oportunidades (titulo, contacto_id, responsable_id, valor_centavos, etapa, posicion, cierre_estimado, motivo_perdida, cerrado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IN ('ganado','perdido') THEN datetime('now') END)`,
      )
      .run(
        datos.titulo,
        datos.contacto_id,
        responsable,
        datos.valor_centavos,
        datos.etapa,
        posicionEntre(ultimaPosicion(db, datos.etapa), null),
        datos.cierre_estimado,
        datos.motivo_perdida,
        datos.etapa,
      );
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO eventos_etapa (oportunidad_id, desde, hasta, usuario_id) VALUES (?, NULL, ?, ?)").run(id, datos.etapa, usuario.id);
    return id;
  });
  return crear.immediate();
}

export function actualizarOportunidad(db: DB, usuario: Usuario, id: number, datos: z.infer<typeof esquemaOportunidad>) {
  const actual = oportunidadConPermiso(db, usuario, id);
  const responsable = usuario.rol === "admin" ? (datos.responsable_id ?? actual.responsable_id) : actual.responsable_id;
  db.prepare(
    `UPDATE oportunidades SET titulo = ?, contacto_id = ?, valor_centavos = ?, cierre_estimado = ?, responsable_id = ?,
            motivo_perdida = ?, actualizado_en = datetime('now') WHERE id = ?`,
  ).run(datos.titulo, datos.contacto_id, datos.valor_centavos, datos.cierre_estimado, responsable, datos.motivo_perdida, id);
  if (datos.etapa !== actual.etapa) moverOportunidad(db, usuario, id, { etapa: datos.etapa, antes_de: null, motivo_perdida: datos.motivo_perdida });
}

/**
 * Mueve una tarjeta en el tablero Kanban: cambia de etapa y/o de posición.
 * Registra el cambio de etapa en el historial y la fecha de cierre si se gana o se pierde.
 */
export function moverOportunidad(db: DB, usuario: Usuario, id: number, datos: z.infer<typeof esquemaMover>) {
  const mover = db.transaction(() => {
    const actual = oportunidadConPermiso(db, usuario, id);
    if (datos.etapa === "perdido" && actual.etapa !== "perdido" && !datos.motivo_perdida && !actual.motivo_perdida) {
      throw new ErrorApi(400, "Indica por qué se perdió la oportunidad.");
    }

    let posicion: number;
    if (datos.antes_de === null) {
      posicion = posicionEntre(
        (db.prepare("SELECT MAX(posicion) AS p FROM oportunidades WHERE etapa = ? AND id != ?").get(datos.etapa, id) as { p: number | null }).p,
        null,
      );
    } else {
      const siguiente = db.prepare("SELECT posicion, etapa FROM oportunidades WHERE id = ?").get(datos.antes_de) as
        | { posicion: number; etapa: Etapa }
        | undefined;
      if (!siguiente || siguiente.etapa !== datos.etapa) throw new ErrorApi(400, "La tarjeta de referencia no está en esa columna.");
      const anterior = db
        .prepare("SELECT MAX(posicion) AS p FROM oportunidades WHERE etapa = ? AND posicion < ? AND id != ?")
        .get(datos.etapa, siguiente.posicion, id) as { p: number | null };
      posicion = posicionEntre(anterior.p, siguiente.posicion);
    }

    const cambiaEtapa = datos.etapa !== actual.etapa;
    db.prepare(
      `UPDATE oportunidades
       SET etapa = ?, posicion = ?, actualizado_en = datetime('now'),
           motivo_perdida = CASE WHEN ? = 'perdido' THEN COALESCE(NULLIF(?, ''), motivo_perdida) ELSE '' END,
           cerrado_en = CASE WHEN ? IN ('ganado', 'perdido') THEN COALESCE(CASE WHEN ? THEN NULL ELSE cerrado_en END, datetime('now')) ELSE NULL END
       WHERE id = ?`,
    ).run(datos.etapa, posicion, datos.etapa, datos.motivo_perdida, datos.etapa, cambiaEtapa ? 1 : 0, id);
    if (cambiaEtapa) {
      db.prepare("INSERT INTO eventos_etapa (oportunidad_id, desde, hasta, usuario_id) VALUES (?, ?, ?, ?)").run(id, actual.etapa, datos.etapa, usuario.id);
    }
    return oportunidadConPermiso(db, usuario, id);
  });
  return mover.immediate();
}

export function eliminarOportunidad(db: DB, usuario: Usuario, id: number) {
  oportunidadConPermiso(db, usuario, id);
  db.prepare("DELETE FROM oportunidades WHERE id = ?").run(id);
}

// ───────────────────────── Actividades ─────────────────────────

const SELECT_ACTIVIDAD = `
  SELECT a.*, c.nombre AS contacto, c.empresa, u.nombre AS usuario, o.titulo AS oportunidad
  FROM actividades a
  JOIN contactos c ON c.id = a.contacto_id
  JOIN usuarios u ON u.id = a.usuario_id
  LEFT JOIN oportunidades o ON o.id = a.oportunidad_id`;

export function listarActividades(
  db: DB,
  usuario: Usuario,
  filtros: { contactoId?: number; oportunidadId?: number; tareasPendientes?: boolean } = {},
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filtros.contactoId) {
    where.push("a.contacto_id = ?");
    params.push(filtros.contactoId);
  }
  if (filtros.oportunidadId) {
    where.push("a.oportunidad_id = ?");
    params.push(filtros.oportunidadId);
  }
  if (filtros.tareasPendientes) {
    where.push("a.tipo = 'tarea' AND a.completada = 0");
    if (usuario.rol !== "admin") {
      where.push("a.usuario_id = ?");
      params.push(usuario.id);
    }
  }
  const orden = filtros.tareasPendientes ? "a.vence_en, a.id" : "a.creado_en DESC, a.id DESC";
  return db.prepare(`${SELECT_ACTIVIDAD} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orden} LIMIT 200`).all(...params);
}

export function crearActividad(db: DB, usuario: Usuario, datos: z.infer<typeof esquemaActividad>) {
  if (!db.prepare("SELECT 1 FROM contactos WHERE id = ?").get(datos.contacto_id)) throw noEncontrado("El contacto");
  if (datos.oportunidad_id) {
    const o = oportunidadConPermiso(db, usuario, datos.oportunidad_id);
    if (o.contacto_id !== datos.contacto_id) throw new ErrorApi(400, "La oportunidad no pertenece a ese contacto.");
  }
  const r = db
    .prepare("INSERT INTO actividades (tipo, descripcion, contacto_id, oportunidad_id, usuario_id, vence_en) VALUES (?, ?, ?, ?, ?, ?)")
    .run(datos.tipo, datos.descripcion, datos.contacto_id, datos.oportunidad_id, usuario.id, datos.tipo === "tarea" ? datos.vence_en : null);
  return Number(r.lastInsertRowid);
}

export function completarTarea(db: DB, usuario: Usuario, id: number, completada: boolean) {
  const tarea = db.prepare("SELECT usuario_id, tipo FROM actividades WHERE id = ?").get(id) as { usuario_id: number; tipo: string } | undefined;
  if (!tarea || tarea.tipo !== "tarea") throw noEncontrado("La tarea");
  if (usuario.rol !== "admin" && tarea.usuario_id !== usuario.id) throw sinPermiso();
  db.prepare("UPDATE actividades SET completada = ? WHERE id = ?").run(completada ? 1 : 0, id);
}

export function eliminarActividad(db: DB, usuario: Usuario, id: number) {
  const a = db.prepare("SELECT usuario_id FROM actividades WHERE id = ?").get(id) as { usuario_id: number } | undefined;
  if (!a) throw noEncontrado("La actividad");
  if (usuario.rol !== "admin" && a.usuario_id !== usuario.id) throw sinPermiso();
  db.prepare("DELETE FROM actividades WHERE id = ?").run(id);
}

// ───────────────────────── Panel ─────────────────────────

export function resumenPanel(db: DB, usuario: Usuario, hoy: string) {
  const propias = usuario.rol === "admin" ? "" : `AND o.responsable_id = ${Number(usuario.id)}`;
  const inicioMes = `${hoy.slice(0, 7)}-01`;

  const porEtapa = db
    .prepare(`SELECT etapa, COUNT(*) AS n, COALESCE(SUM(valor_centavos), 0) AS valor FROM oportunidades o WHERE 1=1 ${propias} GROUP BY etapa`)
    .all() as { etapa: Etapa; n: number; valor: number }[];
  const embudo = ETAPAS.map((e) => {
    const f = porEtapa.find((x) => x.etapa === e.id);
    return { etapa: e.id, nombre: e.nombre, color: e.color, cantidad: f?.n ?? 0, valor_centavos: f?.valor ?? 0 };
  });

  const abiertas = embudo.filter((e) => !esCerrada(e.etapa));
  const ponderado = Math.round(
    abiertas.reduce((s, e) => s + (e.valor_centavos * ETAPAS.find((x) => x.id === e.etapa)!.probabilidad) / 100, 0),
  );

  const delMes = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN etapa = 'ganado' THEN valor_centavos END), 0) AS ganado,
              SUM(etapa = 'ganado') AS ganadas, SUM(etapa = 'perdido') AS perdidas
       FROM oportunidades o WHERE cerrado_en >= ? ${propias}`,
    )
    .get(inicioMes) as { ganado: number; ganadas: number | null; perdidas: number | null };

  const historico = db
    .prepare(`SELECT SUM(etapa = 'ganado') AS g, SUM(etapa = 'perdido') AS p, AVG(CASE WHEN etapa='ganado' THEN valor_centavos END) AS ticket FROM oportunidades o WHERE 1=1 ${propias}`)
    .get() as { g: number | null; p: number | null; ticket: number | null };
  const cerradas = (historico.g ?? 0) + (historico.p ?? 0);

  const filtroTareas = usuario.rol === "admin" ? "" : `AND a.usuario_id = ${Number(usuario.id)}`;
  const tareas = db
    .prepare(
      `SELECT SUM(vence_en < ?) AS atrasadas, SUM(vence_en = ?) AS hoy FROM actividades a
       WHERE tipo = 'tarea' AND completada = 0 ${filtroTareas}`,
    )
    .get(hoy, hoy) as { atrasadas: number | null; hoy: number | null };

  const vendedores =
    usuario.rol === "admin"
      ? db
          .prepare(
            `SELECT u.id, u.nombre,
                    COALESCE(SUM(CASE WHEN o.etapa NOT IN ('ganado','perdido') THEN o.valor_centavos END), 0) AS abierto,
                    COALESCE(SUM(CASE WHEN o.etapa = 'ganado' AND o.cerrado_en >= ? THEN o.valor_centavos END), 0) AS ganado_mes,
                    COUNT(CASE WHEN o.etapa NOT IN ('ganado','perdido') THEN 1 END) AS abiertas
             FROM usuarios u LEFT JOIN oportunidades o ON o.responsable_id = u.id
             WHERE u.activo = 1 GROUP BY u.id ORDER BY ganado_mes DESC, abierto DESC`,
          )
          .all(inicioMes)
      : [];

  const origenes = db
    .prepare(
      `SELECT c.origen, COUNT(*) AS ganadas, SUM(o.valor_centavos) AS valor
       FROM oportunidades o JOIN contactos c ON c.id = o.contacto_id
       WHERE o.etapa = 'ganado' ${propias} GROUP BY c.origen ORDER BY valor DESC`,
    )
    .all();

  return {
    embudo,
    abierto_centavos: abiertas.reduce((s, e) => s + e.valor_centavos, 0),
    oportunidades_abiertas: abiertas.reduce((s, e) => s + e.cantidad, 0),
    prevision_ponderada: ponderado,
    ganado_mes: delMes.ganado,
    ganadas_mes: delMes.ganadas ?? 0,
    perdidas_mes: delMes.perdidas ?? 0,
    tasa_exito: cerradas ? Math.round(((historico.g ?? 0) * 100) / cerradas) : null,
    ticket_medio: Math.round(historico.ticket ?? 0),
    tareas_atrasadas: tareas.atrasadas ?? 0,
    tareas_hoy: tareas.hoy ?? 0,
    vendedores,
    origenes,
  };
}
