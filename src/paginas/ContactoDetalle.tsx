import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { etapa, formatearDinero, NOMBRE_ORIGEN, type Oportunidad } from "../../shared/crm";
import { api, formatearFecha, useDatos } from "../api";
import { Aviso, Cargando, Iniciales, LineaTiempo, Modal, NuevaActividad, type Actividad } from "../componentes";
import { useSesion } from "../sesion";
import { FormContacto, type Contacto } from "./Contactos";
import { DetalleOportunidad, FormOportunidad } from "./Oportunidad";

interface Detalle {
  contacto: Contacto & { creado_en: string };
  oportunidades: Oportunidad[];
  actividades: Actividad[];
}

const soloDigitos = (t: string) => t.replace(/\D/g, "").replace(/^0/, "58");

export default function ContactoDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { usuario } = useSesion();
  const { datos, error, recargar } = useDatos<Detalle>(`/contactos/${id}`);
  const [editando, setEditando] = useState(false);
  const [nuevaOp, setNuevaOp] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);

  if (error) return <Aviso texto={error} />;
  if (!datos) return <Cargando />;
  const c = datos.contacto;

  const eliminar = async () => {
    if (!confirm(`¿Eliminar a ${c.nombre} con todas sus oportunidades y actividades?`)) return;
    await api(`/contactos/${c.id}`, { method: "DELETE" });
    navegar("/contactos");
  };

  return (
    <>
      <Link to="/contactos" className="volver">
        ← Contactos
      </Link>
      <header className="cabecera">
        <div className="con-avatar grande">
          <Iniciales nombre={c.nombre} />
          <div>
            <h1>{c.nombre}</h1>
            <p className="suave">
              {c.cargo}
              {c.cargo && c.empresa && " · "}
              {c.empresa}
            </p>
          </div>
        </div>
        <div className="fila">
          {c.telefono && (
            <a className="boton whatsapp" href={`https://wa.me/${soloDigitos(c.telefono)}`} target="_blank" rel="noreferrer">
              💬 WhatsApp
            </a>
          )}
          {c.email && (
            <a className="boton secundario" href={`mailto:${c.email}`}>
              ✉️ Email
            </a>
          )}
          <button className="boton secundario" onClick={() => setEditando(true)}>
            Editar
          </button>
          {usuario!.rol === "admin" && (
            <button className="boton peligro" onClick={eliminar}>
              Eliminar
            </button>
          )}
        </div>
      </header>

      <div className="dos-col ancha">
        <div className="columna-izq">
          <section className="tarjeta">
            <h2>Datos</h2>
            <dl className="datos">
              <dt>Email</dt>
              <dd>{c.email || "—"}</dd>
              <dt>Teléfono</dt>
              <dd>{c.telefono || "—"}</dd>
              <dt>Origen</dt>
              <dd>{NOMBRE_ORIGEN[c.origen]}</dd>
              <dt>Responsable</dt>
              <dd>{c.responsable ?? "—"}</dd>
              <dt>Cliente desde</dt>
              <dd>{formatearFecha(c.creado_en)}</dd>
            </dl>
            {c.notas && <p className="notas">{c.notas}</p>}
          </section>

          <section className="tarjeta">
            <div className="titulo-seccion">
              <h2>Oportunidades</h2>
              <button className="boton pequeno" onClick={() => setNuevaOp(true)}>
                + Nueva
              </button>
            </div>
            {datos.oportunidades.length === 0 && <p className="suave">Sin oportunidades{usuario!.rol !== "admin" && " tuyas"} con este contacto.</p>}
            <ul className="lista-op">
              {datos.oportunidades.map((o) => (
                <li key={o.id}>
                  <button onClick={() => setAbierta(o.id)}>
                    <span>
                      <b>{o.titulo}</b>
                      <br />
                      <span className="etiqueta" style={{ background: etapa(o.etapa).color }}>
                        {etapa(o.etapa).nombre}
                      </span>
                    </span>
                    <strong>{formatearDinero(o.valor_centavos, false)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="tarjeta">
          <h2>Actividad</h2>
          <NuevaActividad contactoId={c.id} onCreada={recargar} />
          <LineaTiempo actividades={datos.actividades} onCambio={recargar} />
        </section>
      </div>

      {editando && (
        <Modal titulo="Editar contacto" onCerrar={() => setEditando(false)}>
          <FormContacto
            inicial={c}
            onGuardado={() => {
              setEditando(false);
              recargar();
            }}
          />
        </Modal>
      )}
      {nuevaOp && (
        <Modal titulo={`Nueva oportunidad con ${c.nombre}`} onCerrar={() => setNuevaOp(false)}>
          <FormOportunidad
            contactoFijo={c.id}
            onGuardada={() => {
              setNuevaOp(false);
              recargar();
            }}
          />
        </Modal>
      )}
      {abierta !== null && <DetalleOportunidad id={abierta} onCerrar={() => setAbierta(null)} onCambio={recargar} />}
    </>
  );
}
