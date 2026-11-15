import { useMemo, useState } from "react";
import { esCerrada, ETAPAS, formatearDinero, previsionPonderada, type Etapa, type Oportunidad } from "../../shared/crm";
import { api, formatearFecha, hoy, useDatos } from "../api";
import { Aviso, Cargando, Iniciales, Modal } from "../componentes";
import { useSesion } from "../sesion";
import { DetalleOportunidad, FormOportunidad, PedirMotivo } from "./Oportunidad";

type Arrastre = { id: number; etapa: Etapa; antesDe: number | null } | null;

/** Recoloca la tarjeta en la lista local (actualización optimista antes de que responda el servidor). */
function recolocar(lista: Oportunidad[], id: number, etapa: Etapa, antesDe: number | null): Oportunidad[] {
  const tarjeta = lista.find((o) => o.id === id);
  if (!tarjeta) return lista;
  const resto = lista.filter((o) => o.id !== id);
  const movida = { ...tarjeta, etapa };
  const indice = antesDe === null ? -1 : resto.findIndex((o) => o.id === antesDe);
  if (indice === -1) {
    // al final de su columna
    const ultimo = resto.map((o) => o.etapa).lastIndexOf(etapa);
    resto.splice(ultimo + 1 || resto.length, 0, movida);
  } else {
    resto.splice(indice, 0, movida);
  }
  return resto;
}

export default function Embudo() {
  const { usuario } = useSesion();
  const [responsable, setResponsable] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const url = `/oportunidades?${new URLSearchParams({ responsable, q: busqueda })}`;
  const { datos, setDatos, error, recargar } = useDatos<Oportunidad[]>(url);
  const { datos: usuarios } = useDatos<{ id: number; nombre: string }[]>(usuario!.rol === "admin" ? "/usuarios" : null);

  const [arrastre, setArrastre] = useState<Arrastre>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [nueva, setNueva] = useState(false);
  const [pendientePerdida, setPendientePerdida] = useState<{ id: number; antesDe: number | null } | null>(null);
  const [verCerradas, setVerCerradas] = useState(true);

  const columnas = useMemo(() => {
    const porEtapa = new Map<Etapa, Oportunidad[]>(ETAPAS.map((e) => [e.id, []]));
    for (const o of datos ?? []) porEtapa.get(o.etapa)!.push(o);
    return porEtapa;
  }, [datos]);

  const mover = async (id: number, etapa: Etapa, antesDe: number | null, motivo = "") => {
    const anterior = datos;
    setDatos((lista) => (lista ? recolocar(lista, id, etapa, antesDe) : lista));
    try {
      await api(`/oportunidades/${id}/mover`, { method: "PATCH", body: { etapa, antes_de: antesDe, motivo_perdida: motivo } });
      if (etapa === "ganado") setAviso("¡Oportunidad ganada! 🎉");
      recargar();
    } catch (e) {
      setDatos(anterior); // si el servidor lo rechaza, se deshace el movimiento
      setAviso((e as Error).message);
    }
  };

  const soltar = (etapa: Etapa) => {
    if (!arrastre) return;
    const { id, antesDe } = arrastre;
    setArrastre(null);
    const tarjeta = datos?.find((o) => o.id === id);
    if (!tarjeta || (tarjeta.etapa === etapa && antesDe === id)) return;
    if (etapa === "perdido" && tarjeta.etapa !== "perdido") return setPendientePerdida({ id, antesDe });
    void mover(id, etapa, antesDe);
  };

  if (error) return <Aviso texto={error} />;
  if (!datos) return <Cargando />;

  const abiertas = datos.filter((o) => !esCerrada(o.etapa));
  const etapasVisibles = ETAPAS.filter((e) => verCerradas || !esCerrada(e.id));

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Embudo de ventas</h1>
          <p className="suave">
            {abiertas.length} abiertas · {formatearDinero(abiertas.reduce((s, o) => s + o.valor_centavos, 0), false)} · previsión{" "}
            {formatearDinero(previsionPonderada(abiertas), false)}
          </p>
        </div>
        <button className="boton" onClick={() => setNueva(true)}>
          + Nueva oportunidad
        </button>
      </header>

      <div className="barra-herramientas">
        <input type="search" placeholder="Buscar por título, contacto o empresa…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        {usuarios && (
          <select value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Responsable">
            <option value="">Todo el equipo</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        )}
        <label className="en-linea">
          <input type="checkbox" checked={verCerradas} onChange={(e) => setVerCerradas(e.target.checked)} /> Mostrar ganadas y perdidas
        </label>
      </div>
      <Aviso texto={aviso} tipo={aviso?.includes("🎉") ? "ok" : "error"} />

      <div className="tablero" onDragEnd={() => setArrastre(null)}>
        {etapasVisibles.map((e) => {
          const tarjetas = columnas.get(e.id)!;
          const total = tarjetas.reduce((s, o) => s + o.valor_centavos, 0);
          const destino = arrastre?.etapa === e.id;
          return (
            <section
              key={e.id}
              className={`columna ${destino ? "destino" : ""}`}
              onDragOver={(ev) => {
                ev.preventDefault();
                if (arrastre && (arrastre.etapa !== e.id || ev.target === ev.currentTarget)) {
                  setArrastre({ ...arrastre, etapa: e.id, antesDe: ev.target === ev.currentTarget ? null : arrastre.antesDe });
                }
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                soltar(e.id);
              }}
              aria-label={`Etapa ${e.nombre}`}
            >
              <header style={{ borderTopColor: e.color }}>
                <div>
                  <h2>{e.nombre}</h2>
                  <small>
                    {tarjetas.length} · {formatearDinero(total, false)}
                  </small>
                </div>
                <span className="probabilidad" title="Probabilidad de cierre">
                  {e.probabilidad} %
                </span>
              </header>
              <div className="tarjetas">
                {tarjetas.map((o) => (
                  <div key={o.id}>
                    {destino && arrastre.antesDe === o.id && arrastre.id !== o.id && <div className="hueco" />}
                    <article
                      className={`tarjeta-op ${arrastre?.id === o.id ? "arrastrando" : ""}`}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.effectAllowed = "move";
                        ev.dataTransfer.setData("text/plain", String(o.id));
                        setArrastre({ id: o.id, etapa: o.etapa, antesDe: null });
                      }}
                      onDragOver={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (!arrastre) return;
                        const caja = ev.currentTarget.getBoundingClientRect();
                        const mitadInferior = ev.clientY > caja.top + caja.height / 2;
                        const i = tarjetas.indexOf(o);
                        const antesDe = mitadInferior ? (tarjetas[i + 1]?.id ?? null) : o.id;
                        if (arrastre.etapa !== e.id || arrastre.antesDe !== antesDe) setArrastre({ ...arrastre, etapa: e.id, antesDe });
                      }}
                      onClick={() => setAbierta(o.id)}
                      onKeyDown={(ev) => ev.key === "Enter" && setAbierta(o.id)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${o.titulo}, ${formatearDinero(o.valor_centavos)}`}
                    >
                      <h3>{o.titulo}</h3>
                      <p className="suave">
                        {o.contacto}
                        {o.empresa && ` · ${o.empresa}`}
                      </p>
                      <div className="pie-tarjeta">
                        <strong>{formatearDinero(o.valor_centavos, false)}</strong>
                        <span className="meta">
                          {o.tareas_pendientes > 0 && (
                            <span className="chip" title="Tareas pendientes">
                              ✅ {o.tareas_pendientes}
                            </span>
                          )}
                          {o.cierre_estimado && !esCerrada(o.etapa) && (
                            <span className={`chip ${o.cierre_estimado < hoy() ? "rojo" : ""}`} title="Cierre estimado">
                              📅 {formatearFecha(o.cierre_estimado)}
                            </span>
                          )}
                          <Iniciales nombre={o.responsable} />
                        </span>
                      </div>
                      {o.etapa === "perdido" && o.motivo_perdida && <p className="motivo">✖ {o.motivo_perdida}</p>}
                    </article>
                  </div>
                ))}
                {destino && arrastre.antesDe === null && <div className="hueco" />}
                {tarjetas.length === 0 && !destino && <div className="vacia">Arrastra aquí</div>}
              </div>
            </section>
          );
        })}
      </div>

      {nueva && (
        <Modal titulo="Nueva oportunidad" onCerrar={() => setNueva(false)}>
          <FormOportunidad
            onGuardada={() => {
              setNueva(false);
              recargar();
            }}
          />
        </Modal>
      )}
      {abierta !== null && (
        <DetalleOportunidad
          id={abierta}
          onCerrar={() => setAbierta(null)}
          onCambio={recargar}
        />
      )}
      {pendientePerdida && (
        <PedirMotivo
          onCancelar={() => setPendientePerdida(null)}
          onConfirmar={(motivo) => {
            void mover(pendientePerdida.id, "perdido", pendientePerdida.antesDe, motivo);
            setPendientePerdida(null);
          }}
        />
      )}
    </>
  );
}
