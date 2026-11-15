import { useState } from "react";
import { Link } from "react-router";
import { esCerrada, ETAPAS, formatearDinero, type Etapa, type Oportunidad } from "../../shared/crm";
import { aCentavos, api, formatearFecha, useDatos } from "../api";
import { Aviso, Cargando, LineaTiempo, Modal, NuevaActividad, type Actividad } from "../componentes";
import { useSesion } from "../sesion";

export function FormOportunidad({ inicial, contactoFijo, onGuardada }: { inicial?: Oportunidad; contactoFijo?: number; onGuardada: (id: number) => void }) {
  const { usuario } = useSesion();
  const { datos: contactos } = useDatos<{ id: number; nombre: string; empresa: string }[]>("/contactos/opciones");
  const { datos: usuarios } = useDatos<{ id: number; nombre: string }[]>(usuario!.rol === "admin" ? "/usuarios" : null);
  const [f, setF] = useState({
    titulo: inicial?.titulo ?? "",
    contacto_id: String(inicial?.contacto_id ?? contactoFijo ?? ""),
    valor: inicial ? String(inicial.valor_centavos / 100).replace(".", ",") : "",
    etapa: (inicial?.etapa ?? "nuevo") as Etapa,
    cierre_estimado: inicial?.cierre_estimado ?? "",
    responsable_id: String(inicial?.responsable_id ?? usuario!.id),
    motivo_perdida: inicial?.motivo_perdida ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const cambiar = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [campo]: e.target.value });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = aCentavos(f.valor);
    if (valor === null) return setError("El valor no es un importe válido.");
    const cuerpo = {
      titulo: f.titulo,
      contacto_id: Number(f.contacto_id),
      valor_centavos: valor,
      etapa: f.etapa,
      cierre_estimado: f.cierre_estimado || null,
      responsable_id: Number(f.responsable_id),
      motivo_perdida: f.motivo_perdida,
    };
    try {
      if (inicial) {
        await api(`/oportunidades/${inicial.id}`, { method: "PUT", body: cuerpo });
        onGuardada(inicial.id);
      } else {
        const r = await api<{ id: number }>("/oportunidades", { method: "POST", body: cuerpo });
        onGuardada(r.id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="formulario" onSubmit={enviar}>
      <Aviso texto={error} />
      <label className="campo">
        Título
        <input value={f.titulo} onChange={cambiar("titulo")} required minLength={3} placeholder="Ej.: Página web corporativa" autoFocus />
      </label>
      <label className="campo">
        Contacto
        <select value={f.contacto_id} onChange={cambiar("contacto_id")} required disabled={!!contactoFijo}>
          <option value="">Elige un contacto…</option>
          {contactos?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.empresa && ` · ${c.empresa}`}
            </option>
          ))}
        </select>
      </label>
      <div className="fila-campos">
        <label className="campo">
          Valor ($)
          <input value={f.valor} onChange={cambiar("valor")} inputMode="decimal" placeholder="1.500" required />
        </label>
        <label className="campo">
          Cierre estimado
          <input type="date" value={f.cierre_estimado} onChange={cambiar("cierre_estimado")} />
        </label>
      </div>
      <div className="fila-campos">
        <label className="campo">
          Etapa
          <select value={f.etapa} onChange={cambiar("etapa")}>
            {ETAPAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        {usuarios && (
          <label className="campo">
            Responsable
            <select value={f.responsable_id} onChange={cambiar("responsable_id")}>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {f.etapa === "perdido" && (
        <label className="campo">
          Motivo de la pérdida
          <input value={f.motivo_perdida} onChange={cambiar("motivo_perdida")} required placeholder="Ej.: Eligió a otro proveedor" />
        </label>
      )}
      <button className="boton">{inicial ? "Guardar cambios" : "Crear oportunidad"}</button>
    </form>
  );
}

export function PedirMotivo({ onConfirmar, onCancelar }: { onConfirmar: (motivo: string) => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const sugerencias = ["Eligió a otro proveedor", "Precio demasiado alto", "Sin presupuesto", "No respondió más"];
  return (
    <Modal titulo="¿Por qué se perdió?" onCerrar={onCancelar} ancho={440}>
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirmar(motivo);
        }}
      >
        <p className="suave">Registrar el motivo ayuda a entender qué mejorar.</p>
        <div className="sugerencias">
          {sugerencias.map((s) => (
            <button type="button" key={s} className="chip" onClick={() => setMotivo(s)}>
              {s}
            </button>
          ))}
        </div>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} placeholder="Motivo" autoFocus />
        <div className="fila">
          <button type="button" className="boton secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="boton peligro-lleno">Marcar como perdida</button>
        </div>
      </form>
    </Modal>
  );
}

interface Detalle {
  oportunidad: Oportunidad;
  eventos: { id: number; desde: string | null; hasta: string; usuario: string; creado_en: string }[];
  actividades: Actividad[];
}

export function DetalleOportunidad({ id, onCerrar, onCambio }: { id: number; onCerrar: () => void; onCambio: () => void }) {
  const { datos, error, recargar } = useDatos<Detalle>(`/oportunidades/${id}`);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const refrescar = () => {
    recargar();
    onCambio();
  };

  const mover = async (etapa: Etapa, motivo = "") => {
    try {
      await api(`/oportunidades/${id}/mover`, { method: "PATCH", body: { etapa, antes_de: null, motivo_perdida: motivo } });
      setAviso(null);
      refrescar();
    } catch (e) {
      setAviso((e as Error).message);
    }
  };

  const eliminar = async () => {
    if (!confirm("¿Eliminar esta oportunidad y su historial?")) return;
    await api(`/oportunidades/${id}`, { method: "DELETE" });
    onCambio();
    onCerrar();
  };

  return (
    <Modal titulo={datos?.oportunidad.titulo ?? "Oportunidad"} onCerrar={onCerrar} ancho={720}>
      {error && <Aviso texto={error} />}
      {!datos && !error && <Cargando />}
      {datos && (
        <>
          <Aviso texto={aviso} />
          <div className="etapas-selector" role="group" aria-label="Cambiar etapa">
            {ETAPAS.map((e) => (
              <button
                key={e.id}
                className={e.id === datos.oportunidad.etapa ? "activa" : ""}
                style={e.id === datos.oportunidad.etapa ? { background: e.color, borderColor: e.color } : undefined}
                onClick={() => (e.id === "perdido" ? setPedirMotivo(true) : mover(e.id))}
                disabled={e.id === datos.oportunidad.etapa}
              >
                {e.nombre}
              </button>
            ))}
          </div>

          {editando ? (
            <FormOportunidad
              inicial={datos.oportunidad}
              onGuardada={() => {
                setEditando(false);
                refrescar();
              }}
            />
          ) : (
            <>
              <dl className="datos">
                <dt>Valor</dt>
                <dd className="grande">{formatearDinero(datos.oportunidad.valor_centavos)}</dd>
                <dt>Contacto</dt>
                <dd>
                  <Link to={`/contactos/${datos.oportunidad.contacto_id}`} onClick={onCerrar}>
                    {datos.oportunidad.contacto}
                  </Link>
                  {datos.oportunidad.empresa && ` · ${datos.oportunidad.empresa}`}
                </dd>
                <dt>Responsable</dt>
                <dd>{datos.oportunidad.responsable}</dd>
                <dt>{esCerrada(datos.oportunidad.etapa) ? "Cerrada" : "Cierre estimado"}</dt>
                <dd>{formatearFecha(esCerrada(datos.oportunidad.etapa) ? datos.oportunidad.cerrado_en : datos.oportunidad.cierre_estimado)}</dd>
                {datos.oportunidad.motivo_perdida && (
                  <>
                    <dt>Motivo</dt>
                    <dd>{datos.oportunidad.motivo_perdida}</dd>
                  </>
                )}
              </dl>
              <div className="fila">
                <button className="boton secundario" onClick={() => setEditando(true)}>
                  Editar
                </button>
                <button className="boton peligro" onClick={eliminar}>
                  Eliminar
                </button>
              </div>
            </>
          )}

          <h3 className="subtitulo">Registrar actividad</h3>
          <NuevaActividad contactoId={datos.oportunidad.contacto_id} oportunidadId={id} onCreada={refrescar} />
          <h3 className="subtitulo">Historial</h3>
          <LineaTiempo actividades={datos.actividades} eventos={datos.eventos} onCambio={refrescar} />
        </>
      )}
      {pedirMotivo && (
        <PedirMotivo
          onCancelar={() => setPedirMotivo(false)}
          onConfirmar={(m) => {
            setPedirMotivo(false);
            void mover("perdido", m);
          }}
        />
      )}
    </Modal>
  );
}
