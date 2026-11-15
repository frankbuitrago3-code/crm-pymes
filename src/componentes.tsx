import { useEffect, useRef, useState, type ReactNode } from "react";
import { etapa, ICONO_ACTIVIDAD, NOMBRE_ACTIVIDAD, TIPOS_ACTIVIDAD, type Etapa, type TipoActividad } from "../shared/crm";
import { api, formatearFecha, hoy } from "./api";

export function Modal({ titulo, onCerrar, children, ancho = 560 }: { titulo: string; onCerrar: () => void; children: ReactNode; ancho?: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" style={{ maxWidth: ancho }} onClose={onCerrar} onClick={(e) => e.target === ref.current && onCerrar()}>
      <div className="modal-cabecera">
        <h2>{titulo}</h2>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <div className="modal-cuerpo">{children}</div>
    </dialog>
  );
}

export function Aviso({ texto, tipo = "error" }: { texto: string | null; tipo?: "error" | "ok" }) {
  if (!texto) return null;
  return (
    <div className={`aviso ${tipo}`} role={tipo === "error" ? "alert" : "status"}>
      {texto}
    </div>
  );
}

export function Cargando() {
  return <div className="cargando">Cargando…</div>;
}

export function Iniciales({ nombre, titulo }: { nombre: string; titulo?: string }) {
  const ini = nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="iniciales" style={{ background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 60% 30%)` }} title={titulo ?? nombre}>
      {ini}
    </span>
  );
}

export interface Actividad {
  id: number;
  tipo: TipoActividad;
  descripcion: string;
  contacto_id: number;
  contacto: string;
  empresa: string;
  oportunidad_id: number | null;
  oportunidad: string | null;
  usuario: string;
  vence_en: string | null;
  completada: number;
  creado_en: string;
}

export function LineaTiempo({ actividades, eventos = [], onCambio }: { actividades: Actividad[]; eventos?: { id: number; desde: string | null; hasta: string; usuario: string; creado_en: string }[]; onCambio: () => void }) {
  type Item = { clave: string; fecha: string; nodo: ReactNode };
  const items: Item[] = [
    ...actividades.map((a) => ({
      clave: `a${a.id}`,
      fecha: a.creado_en,
      nodo: (
        <>
          <span className="icono-tl">{ICONO_ACTIVIDAD[a.tipo]}</span>
          <div>
            <p className={a.tipo === "tarea" && a.completada ? "tachado" : ""}>
              {a.tipo === "tarea" && (
                <input
                  type="checkbox"
                  checked={!!a.completada}
                  aria-label="Completada"
                  onChange={(e) => api(`/actividades/${a.id}`, { method: "PATCH", body: { completada: e.target.checked } }).then(onCambio)}
                />
              )}{" "}
              {a.descripcion}
            </p>
            <small>
              {NOMBRE_ACTIVIDAD[a.tipo]} · {a.usuario} · {formatearFecha(a.creado_en, true)}
              {a.vence_en && <> · vence {formatearFecha(a.vence_en)}</>}
              {a.oportunidad && <> · {a.oportunidad}</>}
            </small>
          </div>
        </>
      ),
    })),
    ...eventos.map((e) => ({
      clave: `e${e.id}`,
      fecha: e.creado_en,
      nodo: (
        <>
          <span className="icono-tl">➜</span>
          <div>
            <p>{e.desde ? <>Pasó de <b>{etapa(e.desde as Etapa).nombre}</b> a <b>{etapa(e.hasta as Etapa).nombre}</b></> : <>Creada en <b>{etapa(e.hasta as Etapa).nombre}</b></>}</p>
            <small>
              {e.usuario} · {formatearFecha(e.creado_en, true)}
            </small>
          </div>
        </>
      ),
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (!items.length) return <p className="suave">Todavía no hay actividad registrada.</p>;
  return (
    <ul className="linea-tiempo">
      {items.map((i) => (
        <li key={i.clave}>{i.nodo}</li>
      ))}
    </ul>
  );
}

export function NuevaActividad({ contactoId, oportunidadId = null, onCreada }: { contactoId: number; oportunidadId?: number | null; onCreada: () => void }) {
  const [tipo, setTipo] = useState<TipoActividad>("llamada");
  const [descripcion, setDescripcion] = useState("");
  const [vence, setVence] = useState(hoy());
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await api("/actividades", {
        method: "POST",
        body: { tipo, descripcion, contacto_id: contactoId, oportunidad_id: oportunidadId, vence_en: tipo === "tarea" ? vence : null },
      });
      setDescripcion("");
      setError(null);
      onCreada();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="nueva-actividad" onSubmit={enviar}>
      <div className="tipos" role="radiogroup" aria-label="Tipo de actividad">
        {TIPOS_ACTIVIDAD.map((t) => (
          <button type="button" key={t} className={t === tipo ? "activo" : ""} onClick={() => setTipo(t)} aria-pressed={t === tipo}>
            {ICONO_ACTIVIDAD[t]} {NOMBRE_ACTIVIDAD[t]}
          </button>
        ))}
      </div>
      <textarea
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        rows={2}
        placeholder={tipo === "tarea" ? "¿Qué hay que hacer?" : "¿Qué pasó? Resumen de la conversación…"}
        required
        minLength={2}
      />
      <div className="fila">
        {tipo === "tarea" && (
          <label className="en-linea">
            Vence <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} required />
          </label>
        )}
        <button className="boton" disabled={enviando}>
          {tipo === "tarea" ? "Crear tarea" : "Registrar"}
        </button>
      </div>
      <Aviso texto={error} />
    </form>
  );
}
