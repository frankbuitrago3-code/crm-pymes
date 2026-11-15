/** Definiciones compartidas entre el servidor y el navegador. */

export const ETAPAS = [
  { id: "nuevo", nombre: "Nuevo", probabilidad: 10, color: "#64748b" },
  { id: "contactado", nombre: "Contactado", probabilidad: 20, color: "#0ea5e9" },
  { id: "propuesta", nombre: "Propuesta", probabilidad: 50, color: "#8b5cf6" },
  { id: "negociacion", nombre: "Negociación", probabilidad: 75, color: "#f59e0b" },
  { id: "ganado", nombre: "Ganado", probabilidad: 100, color: "#16a34a" },
  { id: "perdido", nombre: "Perdido", probabilidad: 0, color: "#dc2626" },
] as const;

export type Etapa = (typeof ETAPAS)[number]["id"];
export const IDS_ETAPAS = ETAPAS.map((e) => e.id) as [Etapa, ...Etapa[]];
export const ETAPAS_ABIERTAS: Etapa[] = ["nuevo", "contactado", "propuesta", "negociacion"];
export const esCerrada = (e: Etapa) => e === "ganado" || e === "perdido";
export const etapa = (id: Etapa) => ETAPAS.find((e) => e.id === id)!;

export const ORIGENES = ["web", "referido", "redes", "llamada", "feria", "otro"] as const;
export type Origen = (typeof ORIGENES)[number];
export const NOMBRE_ORIGEN: Record<Origen, string> = {
  web: "Página web",
  referido: "Referido",
  redes: "Redes sociales",
  llamada: "Llamada entrante",
  feria: "Feria / evento",
  otro: "Otro",
};

export const TIPOS_ACTIVIDAD = ["llamada", "email", "reunion", "whatsapp", "nota", "tarea"] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];
export const ICONO_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: "📞",
  email: "✉️",
  reunion: "🤝",
  whatsapp: "💬",
  nota: "📝",
  tarea: "✅",
};
export const NOMBRE_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  whatsapp: "WhatsApp",
  nota: "Nota",
  tarea: "Tarea",
};

export const ROLES = ["admin", "vendedor"] as const;
export type Rol = (typeof ROLES)[number];

/** 1234567 → "$12.345,67" (los importes viajan siempre en centavos). */
export function formatearDinero(centavos: number, decimales = true): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const enteros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const resto = decimales ? `,${String(abs % 100).padStart(2, "0")}` : "";
  return `${negativo ? "-" : ""}$${enteros}${resto}`;
}

/**
 * Calcula la posición de una tarjeta que se suelta entre otras dos (orden fraccionario):
 * así mover una tarjeta solo actualiza esa fila, no toda la columna.
 */
export function posicionEntre(anterior: number | null, siguiente: number | null): number {
  if (anterior === null && siguiente === null) return 1000;
  if (anterior === null) return siguiente! - 1000;
  if (siguiente === null) return anterior + 1000;
  return (anterior + siguiente) / 2;
}

export interface Oportunidad {
  id: number;
  titulo: string;
  contacto_id: number;
  contacto: string;
  empresa: string;
  responsable_id: number;
  responsable: string;
  valor_centavos: number;
  etapa: Etapa;
  posicion: number;
  cierre_estimado: string | null;
  motivo_perdida: string;
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
  tareas_pendientes: number;
}

/** Valor ponderado del embudo: cada oportunidad abierta cuenta según la probabilidad de su etapa. */
export function previsionPonderada(oportunidades: Pick<Oportunidad, "etapa" | "valor_centavos">[]): number {
  return Math.round(
    oportunidades
      .filter((o) => !esCerrada(o.etapa))
      .reduce((s, o) => s + (o.valor_centavos * etapa(o.etapa).probabilidad) / 100, 0),
  );
}
