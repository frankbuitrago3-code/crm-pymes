import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import {
  COOKIE,
  crearToken,
  LimitadorIntentos,
  leerSesion,
  opcionesCookie,
  protegerCsrf,
  requerirSesion,
  verificarPassword,
  type Usuario,
} from "./auth";
import * as crm from "./crm";
import type { DB } from "./db";

const id = (req: Request) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new crm.ErrorApi(400, "Identificador no válido.");
  return n;
};
const yo = (req: Request) => req.usuario as Usuario;
const hoyLocal = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: process.env.ZONA_HORARIA ?? "America/Caracas" }).format(new Date());

export function crearApp(db: DB, opciones: { carpetaWeb?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
    next();
  });

  const api = express.Router();
  api.use(leerSesion, protegerCsrf);

  // ───── Autenticación ─────
  const limitador = new LimitadorIntentos();
  const esquemaLogin = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

  api.post("/auth/login", async (req, res) => {
    const { email, password } = esquemaLogin.parse(req.body);
    const clave = `${req.ip}:${email}`;
    if (limitador.bloqueado(clave)) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });
    const fila = db.prepare("SELECT * FROM usuarios WHERE email = ? AND activo = 1").get(email) as
      | (Usuario & { password_hash: string })
      | undefined;
    if (!fila || !verificarPassword(password, fila.password_hash)) {
      limitador.fallo(clave);
      return res.status(401).json({ error: "Email o contraseña incorrectos." });
    }
    limitador.limpiar(clave);
    const usuario: Usuario = { id: fila.id, nombre: fila.nombre, email: fila.email, rol: fila.rol };
    res.cookie(COOKIE, await crearToken(usuario), opcionesCookie());
    res.json({ usuario });
  });

  api.post("/auth/logout", (_req, res) => {
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  api.get("/auth/yo", (req, res) => res.json({ usuario: req.usuario ?? null }));

  // A partir de aquí todo exige sesión.
  api.use(requerirSesion);

  api.get("/usuarios", (_req, res) => {
    res.json(db.prepare("SELECT id, nombre, email, rol FROM usuarios WHERE activo = 1 ORDER BY nombre").all());
  });

  api.get("/panel", (req, res) => res.json(crm.resumenPanel(db, yo(req), hoyLocal())));

  // ───── Contactos ─────
  api.get("/contactos", (req, res) => {
    res.json(
      crm.listarContactos(db, {
        q: String(req.query.q ?? "").trim() || undefined,
        origen: String(req.query.origen ?? "") || undefined,
        pagina: Number(req.query.pagina) || 1,
      }),
    );
  });
  api.get("/contactos/opciones", (_req, res) => {
    res.json(db.prepare("SELECT id, nombre, empresa FROM contactos ORDER BY nombre COLLATE NOCASE").all());
  });
  api.post("/contactos", (req, res) => {
    res.status(201).json({ id: crm.guardarContacto(db, yo(req), crm.esquemaContacto.parse(req.body)) });
  });
  api.get("/contactos/:id", (req, res) => res.json(crm.obtenerContacto(db, id(req), yo(req))));
  api.put("/contactos/:id", (req, res) => {
    res.json({ id: crm.guardarContacto(db, yo(req), crm.esquemaContacto.parse(req.body), id(req)) });
  });
  api.delete("/contactos/:id", (req, res) => {
    crm.eliminarContacto(db, yo(req), id(req));
    res.status(204).end();
  });

  // ───── Oportunidades ─────
  api.get("/oportunidades", (req, res) => {
    res.json(
      crm.listarOportunidades(db, yo(req), {
        responsableId: Number(req.query.responsable) || undefined,
        q: String(req.query.q ?? "").trim() || undefined,
      }),
    );
  });
  api.post("/oportunidades", (req, res) => {
    res.status(201).json({ id: crm.crearOportunidad(db, yo(req), crm.esquemaOportunidad.parse(req.body)) });
  });
  api.get("/oportunidades/:id", (req, res) => res.json(crm.obtenerOportunidad(db, yo(req), id(req))));
  api.put("/oportunidades/:id", (req, res) => {
    crm.actualizarOportunidad(db, yo(req), id(req), crm.esquemaOportunidad.parse(req.body));
    res.json(crm.obtenerOportunidad(db, yo(req), id(req)));
  });
  api.patch("/oportunidades/:id/mover", (req, res) => {
    res.json(crm.moverOportunidad(db, yo(req), id(req), crm.esquemaMover.parse(req.body)));
  });
  api.delete("/oportunidades/:id", (req, res) => {
    crm.eliminarOportunidad(db, yo(req), id(req));
    res.status(204).end();
  });

  // ───── Actividades y tareas ─────
  api.get("/tareas", (req, res) => res.json(crm.listarActividades(db, yo(req), { tareasPendientes: true })));
  api.post("/actividades", (req, res) => {
    res.status(201).json({ id: crm.crearActividad(db, yo(req), crm.esquemaActividad.parse(req.body)) });
  });
  api.patch("/actividades/:id", (req, res) => {
    crm.completarTarea(db, yo(req), id(req), z.object({ completada: z.boolean() }).parse(req.body).completada);
    res.json({ ok: true });
  });
  api.delete("/actividades/:id", (req, res) => {
    crm.eliminarActividad(db, yo(req), id(req));
    res.status(204).end();
  });

  api.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));
  app.use("/api", api);

  // ───── Aplicación web (build de Vite) ─────
  const carpetaWeb = opciones.carpetaWeb;
  if (carpetaWeb && fs.existsSync(carpetaWeb)) {
    app.use(express.static(carpetaWeb, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(carpetaWeb, "index.html")));
  }

  // ───── Errores ─────
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((i) => i.message).join(". "), campos: err.issues.map((i) => i.path.join(".")) });
    }
    if (err instanceof crm.ErrorApi) return res.status(err.status).json({ error: err.message });
    if (err instanceof SyntaxError) return res.status(400).json({ error: "JSON no válido." });
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor." });
  });

  return app;
}
