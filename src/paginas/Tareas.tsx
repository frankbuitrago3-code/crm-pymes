import { Link } from "react-router";
import { api, formatearFecha, hoy, useDatos } from "../api";
import { Aviso, Cargando, type Actividad } from "../componentes";
import { useSesion } from "../sesion";

export default function Tareas() {
  const { usuario } = useSesion();
  const { datos, setDatos, error, recargar } = useDatos<Actividad[]>("/tareas");
  if (error) return <Aviso texto={error} />;
  if (!datos) return <Cargando />;

  const h = hoy();
  const grupos = [
    { titulo: "Atrasadas", clase: "rojo", tareas: datos.filter((t) => t.vence_en! < h) },
    { titulo: "Para hoy", clase: "ambar", tareas: datos.filter((t) => t.vence_en === h) },
    { titulo: "Próximas", clase: "", tareas: datos.filter((t) => t.vence_en! > h) },
  ];

  const completar = async (t: Actividad) => {
    setDatos(datos.filter((x) => x.id !== t.id)); // desaparece al momento
    try {
      await api(`/actividades/${t.id}`, { method: "PATCH", body: { completada: true } });
    } catch {
      recargar();
    }
  };

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Tareas</h1>
          <p className="suave">
            {datos.length} pendientes{usuario!.rol === "admin" ? " en todo el equipo" : ""}
          </p>
        </div>
      </header>
      {datos.length === 0 && <div className="tarjeta vacia-grande">🎉 ¡Todo al día! No tienes tareas pendientes.</div>}
      <div className="grupos-tareas">
        {grupos
          .filter((g) => g.tareas.length)
          .map((g) => (
            <section key={g.titulo} className="tarjeta">
              <h2 className={g.clase}>
                {g.titulo} <small>({g.tareas.length})</small>
              </h2>
              <ul className="lista-tareas">
                {g.tareas.map((t) => (
                  <li key={t.id}>
                    <input type="checkbox" onChange={() => completar(t)} aria-label={`Completar: ${t.descripcion}`} />
                    <div>
                      <p>{t.descripcion}</p>
                      <small className="suave">
                        <Link to={`/contactos/${t.contacto_id}`}>{t.contacto}</Link>
                        {t.empresa && ` · ${t.empresa}`}
                        {t.oportunidad && ` · ${t.oportunidad}`}
                        {usuario!.rol === "admin" && ` · ${t.usuario}`}
                      </small>
                    </div>
                    <span className={`chip ${g.clase}`}>{formatearFecha(t.vence_en)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </>
  );
}
