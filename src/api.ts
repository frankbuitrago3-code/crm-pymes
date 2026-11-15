import { useCallback, useEffect, useState } from "react";

export class ErrorApi extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Llamada a la API: envía la cookie de sesión y la cabecera anti-CSRF, y convierte los errores en excepciones. */
export async function api<T = unknown>(url: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api${url}`, {
    method: opciones.method ?? "GET",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CRM": "1" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  if (r.status === 401 && !url.startsWith("/auth/")) window.dispatchEvent(new Event("sesion-caducada"));
  if (r.status === 204) return undefined as T;
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, datos.error ?? "Algo salió mal. Inténtalo de nuevo.");
  return datos as T;
}

/** Carga datos de la API y permite recargarlos. */
export function useDatos<T>(url: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!url) return;
    let vigente = true;
    setCargando(true);
    api<T>(url)
      .then((d) => vigente && (setDatos(d), setError(null)))
      .catch((e: Error) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [url, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, setDatos, error, cargando, recargar };
}

export const hoy = () => new Date().toLocaleDateString("en-CA");

export function formatearFecha(texto: string | null, conHora = false): string {
  if (!texto) return "—";
  const d = new Date(texto.length === 10 ? `${texto}T12:00:00` : texto.replace(" ", "T") + "Z");
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function haceCuanto(texto: string | null): string {
  if (!texto) return "nunca";
  const dias = Math.floor((Date.now() - new Date(texto.replace(" ", "T") + "Z").getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

/** "1.250,50" o "1250.5" → 125050 centavos. */
export function aCentavos(texto: string): number | null {
  const t = texto.trim().replace(/[$\s]/g, "");
  if (!t) return 0;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
