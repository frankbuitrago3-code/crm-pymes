/** Datos de demostración: una agencia de marketing digital con su cartera de clientes. */
import { pathToFileURL } from "node:url";
import { posicionEntre, type Etapa } from "../shared/crm";
import { hashPassword } from "./auth";
import { abrirDb, type DB } from "./db";

const CONTACTOS: [string, string, string, string][] = [
  ["Laura Méndez", "Clínica Dental Sonrisa", "Directora", "web"],
  ["Carlos Pérez", "Ferretería El Tornillo", "Dueño", "referido"],
  ["Ana Rodríguez", "Panadería La Espiga", "Gerente", "redes"],
  ["José Hernández", "Hotel Llanero Real", "Gerente de marketing", "feria"],
  ["María Fernández", "Gimnasio PowerFit", "Socia", "redes"],
  ["Luis Torres", "Restaurante El Fogón", "Chef propietario", "llamada"],
  ["Valentina Rojas", "Óptica Visión Clara", "Administradora", "web"],
  ["Pedro Castillo", "Constructora Andes", "Director comercial", "referido"],
  ["Gabriela Díaz", "Farmacia San Rafael", "Gerente", "web"],
  ["Miguel Sánchez", "Taller Mecánico Turbo", "Dueño", "llamada"],
  ["Daniela Vargas", "Boutique Bella", "Propietaria", "redes"],
  ["Andrés Morales", "Colegio Los Pinos", "Director", "feria"],
  ["Carolina Ruiz", "Inmobiliaria Horizonte", "Agente principal", "referido"],
  ["Ricardo Gómez", "Distribuidora Del Llano", "Gerente de ventas", "web"],
  ["Sofía Herrera", "Spa Armonía", "Fundadora", "redes"],
  ["Fernando Silva", "Clínica Veterinaria Patitas", "Veterinario", "otro"],
];

const PROPUESTAS = [
  ["Gestión de redes sociales", 35000],
  ["Página web corporativa", 120000],
  ["Campaña Google Ads", 60000],
  ["Tienda online", 250000],
  ["Sesión de fotos de producto", 40000],
  ["Branding e identidad visual", 90000],
  ["Mantenimiento web anual", 48000],
  ["Email marketing", 30000],
];

function aleatorio(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

const dias = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fechaHora = (n: number, hora = 10) => `${dias(n)} ${String(hora).padStart(2, "0")}:00:00`;

export function cargarDemo(db: DB) {
  const azar = aleatorio(11);
  const elegir = <T>(lista: T[]) => lista[Math.floor(azar() * lista.length)];

  db.transaction(() => {
    const usuario = db.prepare("INSERT INTO usuarios (email, nombre, rol, password_hash) VALUES (?, ?, ?, ?)");
    const admin = Number(usuario.run("admin@crm.test", "Andrea Admin", "admin", hashPassword("admin123")).lastInsertRowid);
    const ventas1 = Number(usuario.run("vendedor@crm.test", "Diego Ventas", "vendedor", hashPassword("vendedor123")).lastInsertRowid);
    const ventas2 = Number(usuario.run("paula@crm.test", "Paula Comercial", "vendedor", hashPassword("paula123")).lastInsertRowid);
    const equipo = [admin, ventas1, ventas1, ventas2, ventas2];

    const insContacto = db.prepare(
      "INSERT INTO contactos (nombre, empresa, cargo, email, telefono, origen, responsable_id, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const contactos = CONTACTOS.map(([nombre, empresa, cargo, origen], i) => {
      const email = `${nombre.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}@${empresa.split(" ").slice(-1)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}.com`;
      const tel = `04${elegir(["14", "24", "12", "16"])}-${String(1000000 + Math.floor(azar() * 8999999)).slice(0, 7)}`;
      const resp = equipo[i % equipo.length];
      return { id: Number(insContacto.run(nombre, empresa, cargo, email, tel, origen, resp, fechaHora(-90 + i * 3)).lastInsertRowid), resp };
    });

    const insOport = db.prepare(
      `INSERT INTO oportunidades (titulo, contacto_id, responsable_id, valor_centavos, etapa, posicion, cierre_estimado, motivo_perdida, creado_en, actualizado_en, cerrado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insEvento = db.prepare("INSERT INTO eventos_etapa (oportunidad_id, desde, hasta, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?)");
    const insAct = db.prepare(
      "INSERT INTO actividades (tipo, descripcion, contacto_id, oportunidad_id, usuario_id, vence_en, completada, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const posiciones = new Map<Etapa, number | null>();
    const orden: Etapa[] = ["nuevo", "contactado", "propuesta", "negociacion", "ganado", "perdido"];
    const reparto: Etapa[] = ["nuevo", "nuevo", "nuevo", "contactado", "contactado", "contactado", "propuesta", "propuesta", "propuesta", "negociacion", "negociacion", "ganado", "ganado", "ganado", "ganado", "ganado", "perdido", "perdido", "perdido"];
    const motivos = ["Eligió a otro proveedor", "Sin presupuesto este año", "Precio demasiado alto", "No respondió más"];

    reparto.forEach((etapa, i) => {
      const contacto = contactos[i % contactos.length];
      const [nombre, base] = PROPUESTAS[(i * 3) % PROPUESTAS.length] as [string, number];
      const valor = Math.round((base * (0.8 + azar() * 0.6)) / 1000) * 1000;
      const creado = -75 + i * 3;
      const cerrada = etapa === "ganado" || etapa === "perdido";
      const cierre = cerrada ? fechaHora(Math.min(-1, creado + 20 + Math.floor(azar() * 15)), 16) : null;
      const pos = posicionEntre(posiciones.get(etapa) ?? null, null);
      posiciones.set(etapa, pos);
      const idO = Number(
        insOport.run(
          `${nombre} · ${CONTACTOS[i % CONTACTOS.length][1]}`,
          contacto.id,
          contacto.resp,
          valor,
          etapa,
          pos,
          cerrada ? null : dias(5 + Math.floor(azar() * 40)),
          etapa === "perdido" ? elegir(motivos) : "",
          fechaHora(creado),
          cierre ?? fechaHora(creado + 5),
          cierre,
        ).lastInsertRowid,
      );
      // Historial de etapas hasta la actual
      const hasta = orden.indexOf(etapa);
      let previa: Etapa | null = null;
      for (let k = 0; k <= Math.min(hasta, 3); k++) {
        insEvento.run(idO, previa, orden[k], contacto.resp, fechaHora(creado + k * 4));
        previa = orden[k];
      }
      if (cerrada) insEvento.run(idO, previa, etapa, contacto.resp, cierre);

      insAct.run("llamada", "Primera llamada para conocer sus necesidades.", contacto.id, idO, contacto.resp, null, 0, fechaHora(creado, 11));
      if (hasta >= 2) insAct.run("email", "Enviada la propuesta con precios y plazos.", contacto.id, idO, contacto.resp, null, 0, fechaHora(creado + 8, 15));
      if (hasta >= 3) insAct.run("reunion", "Reunión para revisar la propuesta y resolver dudas.", contacto.id, idO, contacto.resp, null, 0, fechaHora(creado + 12, 10));
      if (!cerrada) {
        const vence = Math.floor(azar() * 10) - 3; // algunas atrasadas, otras para hoy y futuras
        const tareas = ["Llamar para dar seguimiento", "Enviar presupuesto actualizado", "Agendar reunión de cierre", "Mandar casos de éxito por WhatsApp"];
        insAct.run("tarea", elegir(tareas), contacto.id, idO, contacto.resp, dias(vence), 0, fechaHora(-2, 9));
      }
    });
    insAct.run("nota", "Prefiere que lo contacten por WhatsApp por las tardes.", contactos[1].id, null, ventas1, null, 0, fechaHora(-6, 18));
    insAct.run("tarea", "Felicitar por el aniversario de la empresa", contactos[4].id, null, ventas2, dias(0), 0, fechaHora(-1, 9));
    insAct.run("tarea", "Pedir testimonio para la web", contactos[0].id, null, admin, dias(2), 0, fechaHora(-1, 9));
  })();
}

// Ejecución directa: `npm run demo` reinicia la base de datos con datos de ejemplo.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const db = abrirDb();
  db.exec("DELETE FROM actividades; DELETE FROM eventos_etapa; DELETE FROM oportunidades; DELETE FROM contactos; DELETE FROM usuarios;");
  cargarDemo(db);
  console.log("Datos de demostración cargados. Usuarios: admin@crm.test/admin123 · vendedor@crm.test/vendedor123");
}
