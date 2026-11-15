import { Link } from "react-router";
import { formatearDinero, NOMBRE_ORIGEN, type Etapa, type Origen } from "../../shared/crm";
import { useDatos } from "../api";
import { Aviso, Cargando, Iniciales } from "../componentes";
import { useSesion } from "../sesion";

interface Resumen {
  embudo: { etapa: Etapa; nombre: string; color: string; cantidad: number; valor_centavos: number }[];
  abierto_centavos: number;
  oportunidades_abiertas: number;
  prevision_ponderada: number;
  ganado_mes: number;
  ganadas_mes: number;
  perdidas_mes: number;
  tasa_exito: number | null;
  ticket_medio: number;
  tareas_atrasadas: number;
  tareas_hoy: number;
  vendedores: { id: number; nombre: string; abierto: number; ganado_mes: number; abiertas: number }[];
  origenes: { origen: Origen; ganadas: number; valor: number }[];
}

export default function Panel() {
  const { usuario } = useSesion();
  const { datos: r, error } = useDatos<Resumen>("/panel");
  if (error) return <Aviso texto={error} />;
  if (!r) return <Cargando />;

  const abiertas = r.embudo.filter((e) => e.etapa !== "ganado" && e.etapa !== "perdido");
  const maxValor = Math.max(1, ...abiertas.map((e) => e.valor_centavos));
  const maxOrigen = Math.max(1, ...r.origenes.map((o) => o.valor));

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Hola, {usuario!.nombre.split(" ")[0]} 👋</h1>
          <p className="suave">{usuario!.rol === "admin" ? "Resumen de todo el equipo comercial" : "Resumen de tus ventas"}</p>
        </div>
        <Link to="/embudo" className="boton">
          Ir al embudo →
        </Link>
      </header>

      {(r.tareas_atrasadas > 0 || r.tareas_hoy > 0) && (
        <Link to="/tareas" className="banda-tareas">
          ⏰ Tienes <b>{r.tareas_hoy}</b> tarea{r.tareas_hoy === 1 ? "" : "s"} para hoy
          {r.tareas_atrasadas > 0 && (
            <>
              {" "}
              y <b className="rojo">{r.tareas_atrasadas} atrasada{r.tareas_atrasadas === 1 ? "" : "s"}</b>
            </>
          )}
          . Ver tareas →
        </Link>
      )}

      <section className="kpis">
        <div className="kpi">
          <span>Embudo abierto</span>
          <strong>{formatearDinero(r.abierto_centavos, false)}</strong>
          <small>{r.oportunidades_abiertas} oportunidades</small>
        </div>
        <div className="kpi">
          <span>Previsión ponderada</span>
          <strong>{formatearDinero(r.prevision_ponderada, false)}</strong>
          <small>según la probabilidad de cada etapa</small>
        </div>
        <div className="kpi verde">
          <span>Ganado este mes</span>
          <strong>{formatearDinero(r.ganado_mes, false)}</strong>
          <small>
            {r.ganadas_mes} ganadas · {r.perdidas_mes} perdidas
          </small>
        </div>
        <div className="kpi">
          <span>Tasa de éxito</span>
          <strong>{r.tasa_exito === null ? "—" : `${r.tasa_exito} %`}</strong>
          <small>ticket medio {formatearDinero(r.ticket_medio, false)}</small>
        </div>
      </section>

      <div className="dos-col">
        <section className="tarjeta">
          <h2>Embudo por etapa</h2>
          <div className="embudo-grafico">
            {abiertas.map((e) => (
              <div key={e.etapa} className="fila-embudo">
                <span className="nombre">{e.nombre}</span>
                <div className="barra-fondo">
                  <div className="barra" style={{ width: `${Math.max(2, (e.valor_centavos / maxValor) * 100)}%`, background: e.color }} />
                </div>
                <span className="valor">
                  {formatearDinero(e.valor_centavos, false)} <small>({e.cantidad})</small>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="tarjeta">
          <h2>¿De dónde vienen las ventas?</h2>
          {r.origenes.length === 0 && <p className="suave">Aún no hay oportunidades ganadas.</p>}
          <div className="embudo-grafico">
            {r.origenes.map((o) => (
              <div key={o.origen} className="fila-embudo">
                <span className="nombre">{NOMBRE_ORIGEN[o.origen]}</span>
                <div className="barra-fondo">
                  <div className="barra" style={{ width: `${(o.valor / maxOrigen) * 100}%` }} />
                </div>
                <span className="valor">
                  {formatearDinero(o.valor, false)} <small>({o.ganadas})</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {r.vendedores.length > 0 && (
        <section className="tarjeta" style={{ marginTop: "1rem" }}>
          <h2>Equipo comercial</h2>
          <div className="tabla">
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="num">Oportunidades abiertas</th>
                  <th className="num">Valor abierto</th>
                  <th className="num">Ganado este mes</th>
                </tr>
              </thead>
              <tbody>
                {r.vendedores.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="con-avatar">
                        <Iniciales nombre={v.nombre} /> {v.nombre}
                      </span>
                    </td>
                    <td className="num">{v.abiertas}</td>
                    <td className="num">{formatearDinero(v.abierto, false)}</td>
                    <td className="num">
                      <b>{formatearDinero(v.ganado_mes, false)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
