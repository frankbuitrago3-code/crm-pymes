import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Rol } from "../shared/crm";
import { api } from "./api";

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

interface Contexto {
  usuario: Usuario | null;
  cargando: boolean;
  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
}

const SesionContexto = createContext<Contexto | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<{ usuario: Usuario | null }>("/auth/yo")
      .then((r) => setUsuario(r.usuario))
      .finally(() => setCargando(false));
    const caducada = () => setUsuario(null);
    window.addEventListener("sesion-caducada", caducada);
    return () => window.removeEventListener("sesion-caducada", caducada);
  }, []);

  const entrar = async (email: string, password: string) => {
    const r = await api<{ usuario: Usuario }>("/auth/login", { method: "POST", body: { email, password } });
    setUsuario(r.usuario);
  };
  const salir = async () => {
    await api("/auth/logout", { method: "POST" });
    setUsuario(null);
  };

  return <SesionContexto.Provider value={{ usuario, cargando, entrar, salir }}>{children}</SesionContexto.Provider>;
}

export function useSesion() {
  const c = useContext(SesionContexto);
  if (!c) throw new Error("useSesion fuera de ProveedorSesion");
  return c;
}
