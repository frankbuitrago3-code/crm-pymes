import { useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router";
import { Aviso, Cargando, Iniciales } from "./componentes";
import ContactoDetalle from "./paginas/ContactoDetalle";
import Contactos from "./paginas/Contactos";
import Embudo from "./paginas/Embudo";
import Panel from "./paginas/Panel";
import Tareas from "./paginas/Tareas";
import { useSesion } from "./sesion";

export default function App() {
  const { usuario, cargando } = useSesion();
  if (cargando) return <Cargando />;
  if (!usuario) return <Login />;

  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Panel />} />
        <Route path="embudo" element={<Embudo />} />
        <Route path="contactos" element={<Contactos />} />
        <Route path="contactos/:id" element={<ContactoDetalle />} />
        <Route path="tareas" element={<Tareas />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Estructura() {
  const { usuario, salir } = useSesion();
  return (
    <div className="app">
      <aside className="lateral">
        <div className="logo">
          <span>📈</span> CRM Ventas
        </div>
        <nav>
          <NavLink to="/" end>
            📊 Panel
          </NavLink>
          <NavLink to="/embudo">🗂 Embudo</NavLink>
          <NavLink to="/contactos">👥 Contactos</NavLink>
          <NavLink to="/tareas">✅ Tareas</NavLink>
        </nav>
        <div className="perfil">
          <Iniciales nombre={usuario!.nombre} />
          <div>
            <strong>{usuario!.nombre}</strong>
            <small>{usuario!.rol === "admin" ? "Administrador" : "Vendedor"}</small>
          </div>
          <button onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión">
            ⎋
          </button>
        </div>
      </aside>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}

function Login() {
  const { entrar } = useSesion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await entrar(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="login">
      <form className="tarjeta" onSubmit={enviar}>
        <div className="logo oscuro">
          <span>📈</span> CRM Ventas
        </div>
        <h1>Bienvenido</h1>
        <p className="suave">Gestiona tus clientes y oportunidades de venta.</p>
        <Aviso texto={error} />
        <label className="campo">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        </label>
        <label className="campo">
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button className="boton ancho" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        {import.meta.env.DEV && (
          <p className="suave pequeno">
            Demo: <code>admin@crm.test</code> / <code>admin123</code> · <code>vendedor@crm.test</code> / <code>vendedor123</code>
          </p>
        )}
      </form>
    </main>
  );
}
