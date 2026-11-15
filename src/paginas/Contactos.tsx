import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { formatearDinero, NOMBRE_ORIGEN, ORIGENES, type Origen } from "../../shared/crm";
import { api, haceCuanto, useDatos } from "../api";
import { Aviso, Cargando, Iniciales, Modal } from "../componentes";

export interface Contacto {
  id: number;
  nombre: string;
  empresa: string;
  cargo: string;
  email: string;
  telefono: string;
  origen: Origen;
  notas: string;
  responsable_id: number | null;
  responsable: string | null;
  abiertas?: number;
  ganado_centavos?: number;
  ultima_actividad?: string | null;
}

interface Listado {
  contactos: Contacto[];
  total: number;
  pagina: number;
  paginas: number;
}

export function FormContacto({ inicial, onGuardado }: { inicial?: Contacto; onGuardado: (id: number) => void }) {
  const [f, setF] = useState({
    nombre: inicial?.nombre ?? "",
    empresa: inicial?.empresa ?? "",
    cargo: inicial?.cargo ?? "",
    email: inicial?.email ?? "",
    telefono: inicial?.telefono ?? "",
    origen: inicial?.origen ?? "web",
    notas: inicial?.notas ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const cambiar = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [campo]: e.target.value });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cuerpo = { ...f, responsable_id: inicial?.responsable_id ?? undefined };
      const r = inicial
        ? await api<{ id: number }>(`/contactos/${inicial.id}`, { method: "PUT", body: cuerpo })
        : await api<{ id: number }>("/contactos", { method: "POST", body: cuerpo });
      onGuardado(r.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="formulario" onSubmit={enviar}>
      <Aviso texto={error} />
      <div className="fila-campos">
        <label className="campo">
          Nombre
          <input value={f.nombre} onChange={cambiar("nombre")} required minLength={2} autoFocus />
        </label>
        <label className="campo">
          Empresa
          <input value={f.empresa} onChange={cambiar("empresa")} />
        </label>
      </div>
      <div className="fila-campos">
        <label className="campo">
          Email
          <input type="email" value={f.email} onChange={cambiar("email")} />
        </label>
        <label className="campo">
          Teléfono
          <input type="tel" value={f.telefono} onChange={cambiar("telefono")} />
        </label>
      </div>
      <div className="fila-campos">
        <label className="campo">
          Cargo
          <input value={f.cargo} onChange={cambiar("cargo")} />
        </label>
        <label className="campo">
          ¿Cómo nos conoció?
          <select value={f.origen} onChange={cambiar("origen")}>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>
                {NOMBRE_ORIGEN[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="campo">
        Notas
        <textarea value={f.notas} onChange={cambiar("notas")} rows={3} />
      </label>
      <button className="boton">{inicial ? "Guardar cambios" : "Crear contacto"}</button>
    </form>
  );
}

export default function Contactos() {
  const navegar = useNavigate();
  const [q, setQ] = useState("");
  const [origen, setOrigen] = useState("");
  const [pagina, setPagina] = useState(1);
  const [nuevo, setNuevo] = useState(false);
  const { datos, error } = useDatos<Listado>(`/contactos?${new URLSearchParams({ q, origen, pagina: String(pagina) })}`);

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Contactos</h1>
          <p className="suave">{datos ? `${datos.total} contactos` : " "}</p>
        </div>
        <button className="boton" onClick={() => setNuevo(true)}>
          + Nuevo contacto
        </button>
      </header>
      <div className="barra-herramientas">
        <input
          type="search"
          placeholder="Buscar por nombre, empresa, email o teléfono…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPagina(1);
          }}
        />
        <select
          value={origen}
          onChange={(e) => {
            setOrigen(e.target.value);
            setPagina(1);
          }}
          aria-label="Origen"
        >
          <option value="">Todos los orígenes</option>
          {ORIGENES.map((o) => (
            <option key={o} value={o}>
              {NOMBRE_ORIGEN[o]}
            </option>
          ))}
        </select>
      </div>
      <Aviso texto={error} />
      {!datos ? (
        <Cargando />
      ) : (
        <div className="tabla tarjeta sin-relleno">
          <table>
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Origen</th>
                <th className="num">Abiertas</th>
                <th className="num">Ganado</th>
                <th>Última actividad</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {datos.contactos.map((c) => (
                <tr key={c.id} className="clicable" onClick={() => navegar(`/contactos/${c.id}`)}>
                  <td>
                    <span className="con-avatar">
                      <Iniciales nombre={c.nombre} />
                      <span>
                        <Link to={`/contactos/${c.id}`} onClick={(e) => e.stopPropagation()}>
                          <b>{c.nombre}</b>
                        </Link>
                        <br />
                        <small className="suave">
                          {c.cargo}
                          {c.cargo && c.empresa && " · "}
                          {c.empresa}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td>{c.telefono || "—"}</td>
                  <td>
                    <span className="chip">{NOMBRE_ORIGEN[c.origen]}</span>
                  </td>
                  <td className="num">{c.abiertas || "—"}</td>
                  <td className="num">{c.ganado_centavos ? formatearDinero(c.ganado_centavos, false) : "—"}</td>
                  <td>{haceCuanto(c.ultima_actividad ?? null)}</td>
                  <td>{c.responsable ?? "—"}</td>
                </tr>
              ))}
              {datos.contactos.length === 0 && (
                <tr>
                  <td colSpan={7} className="suave">
                    No hay contactos con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {datos && datos.paginas > 1 && (
        <nav className="paginacion">
          <button className="boton secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            ← Anterior
          </button>
          <span>
            Página {datos.pagina} de {datos.paginas}
          </span>
          <button className="boton secundario" disabled={pagina >= datos.paginas} onClick={() => setPagina(pagina + 1)}>
            Siguiente →
          </button>
        </nav>
      )}
      {nuevo && (
        <Modal titulo="Nuevo contacto" onCerrar={() => setNuevo(false)}>
          <FormContacto onGuardado={(id) => navegar(`/contactos/${id}`)} />
        </Modal>
      )}
    </>
  );
}
