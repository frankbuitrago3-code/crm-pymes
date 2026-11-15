import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import type { Rol } from "../shared/crm";

export const COOKIE = "crm_sesion";
const DURACION_S = 10 * 60 * 60;

export function hashPassword(password: string): string {
  const sal = randomBytes(16);
  return `scrypt:${sal.toString("hex")}:${scryptSync(password, sal, 64).toString("hex")}`;
}

export function verificarPassword(password: string, guardado: string): boolean {
  const [alg, sal, hash] = guardado.split(":");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "hex");
  return timingSafeEqual(esperado, scryptSync(password, Buffer.from(sal, "hex"), esperado.length));
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

declare module "express-serve-static-core" {
  interface Request {
    usuario?: Usuario;
  }
}

function clave(): Uint8Array {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) {
    if (process.env.NODE_ENV === "production") throw new Error("Define la variable SESSION_SECRET.");
    return new TextEncoder().encode("solo-desarrollo-cambiar-en-produccion-crm-0123456789");
  }
  return new TextEncoder().encode(secreto);
}

export async function crearToken(u: Usuario): Promise<string> {
  return new SignJWT({ nombre: u.nombre, email: u.email, rol: u.rol })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime(`${DURACION_S}s`)
    .sign(clave());
}

export function opcionesCookie() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: DURACION_S * 1000,
    path: "/",
  };
}

/** Lee la sesión de la cookie (si existe y es válida). */
export async function leerSesion(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { payload } = await jwtVerify(token, clave(), { algorithms: ["HS256"] });
      req.usuario = { id: Number(payload.sub), nombre: String(payload.nombre), email: String(payload.email), rol: payload.rol as Rol };
    } catch {
      /* token caducado o manipulado: se trata como no autenticado */
    }
  }
  next();
}

export function requerirSesion(req: Request, res: Response, next: NextFunction) {
  if (!req.usuario) return res.status(401).json({ error: "Inicia sesión para continuar." });
  next();
}

export function requerirAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.usuario?.rol !== "admin") return res.status(403).json({ error: "Solo un administrador puede hacer esto." });
  next();
}

/**
 * Defensa CSRF para una API JSON con cookies: las peticiones que cambian datos deben
 * llevar la cabecera X-CRM, que un formulario de otra web no puede añadir sin pasar por CORS.
 */
export function protegerCsrf(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-CRM") !== "1") return res.status(403).json({ error: "Petición rechazada (CSRF)." });
  next();
}

export class LimitadorIntentos {
  private fallos = new Map<string, number[]>();
  constructor(
    private maximo = 5,
    private ventanaMs = 10 * 60 * 1000,
  ) {}
  private recientes(clave: string, ahora: number) {
    const lista = (this.fallos.get(clave) ?? []).filter((t) => ahora - t < this.ventanaMs);
    this.fallos.set(clave, lista);
    return lista;
  }
  bloqueado(clave: string, ahora = Date.now()) {
    return this.recientes(clave, ahora).length >= this.maximo;
  }
  fallo(clave: string, ahora = Date.now()) {
    this.recientes(clave, ahora).push(ahora);
  }
  limpiar(clave: string) {
    this.fallos.delete(clave);
  }
}
