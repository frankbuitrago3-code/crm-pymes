import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../server/app";
import { hashPassword } from "../server/auth";
import { abrirDb, type DB } from "../server/db";
import { cargarDemo } from "../server/demo";

let db: DB;
let app: ReturnType<typeof crearApp>;

/** Agente con sesión iniciada y la cabecera anti-CSRF que añade la web. */
async function entrar(email: string, password: string) {
  const agente = request.agent(app);
  const r = await agente.post("/api/auth/login").set("X-CRM", "1").send({ email, password });
  expect(r.status).toBe(200);
  return {
    get: (url: string) => agente.get(url),
    post: (url: string, body: object) => agente.post(url).set("X-CRM", "1").send(body),
    put: (url: string, body: object) => agente.put(url).set("X-CRM", "1").send(body),
    patch: (url: string, body: object) => agente.patch(url).set("X-CRM", "1").send(body),
    delete: (url: string) => agente.delete(url).set("X-CRM", "1"),
  };
}

beforeEach(() => {
  db = abrirDb(":memory:");
  const ins = db.prepare("INSERT INTO usuarios (email, nombre, rol, password_hash) VALUES (?, ?, ?, ?)");
  ins.run("jefa@test.com", "Jefa", "admin", hashPassword("clave-jefa"));
  ins.run("ana@test.com", "Ana", "vendedor", hashPassword("clave-ana"));
  ins.run("beto@test.com", "Beto", "vendedor", hashPassword("clave-beto"));
  app = crearApp(db);
});

async function crearContactoYOportunidad(sesion: Awaited<ReturnType<typeof entrar>>, etapa = "nuevo", valor = 100000) {
  const c = await sesion.post("/api/contactos", { nombre: "Cliente Prueba", empresa: "Empresa X", origen: "web" });
  const o = await sesion.post("/api/oportunidades", { titulo: "Web corporativa", contacto_id: c.body.id, valor_centavos: valor, etapa });
  expect(o.status).toBe(201);
  return { contactoId: c.body.id as number, oportunidadId: o.body.id as number };
}

describe("autenticación y seguridad", () => {
  it("rechaza credenciales incorrectas y bloquea tras varios intentos", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post("/api/auth/login").set("X-CRM", "1").send({ email: "ana@test.com", password: "mal" });
      expect(r.status).toBe(401);
    }
    const r = await request(app).post("/api/auth/login").set("X-CRM", "1").send({ email: "ana@test.com", password: "clave-ana" });
    expect(r.status).toBe(429);
  });

  it("la cookie de sesión es HttpOnly y SameSite", async () => {
    const r = await request(app).post("/api/auth/login").set("X-CRM", "1").send({ email: "ANA@test.com", password: "clave-ana" });
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({ nombre: "Ana", rol: "vendedor" });
    expect(r.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(r.headers["set-cookie"][0]).toMatch(/SameSite=Lax/);
    expect(r.body.usuario.password_hash).toBeUndefined();
  });

  it("sin sesión no se accede a los datos", async () => {
    expect((await request(app).get("/api/contactos")).status).toBe(401);
    expect((await request(app).get("/api/auth/yo")).body).toEqual({ usuario: null });
  });

  it("las peticiones que cambian datos sin la cabecera anti-CSRF se rechazan", async () => {
    const agente = request.agent(app);
    await agente.post("/api/auth/login").set("X-CRM", "1").send({ email: "ana@test.com", password: "clave-ana" });
    const r = await agente.post("/api/contactos").send({ nombre: "Ataque" });
    expect(r.status).toBe(403);
    expect(db.prepare("SELECT COUNT(*) AS n FROM contactos").get()).toEqual({ n: 0 });
  });
});

describe("contactos", () => {
  it("valida los datos y devuelve mensajes claros", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const r = await ana.post("/api/contactos", { nombre: "A", email: "no-es-email" });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("El nombre es obligatorio");
    expect(r.body.error).toContain("Email no válido");
  });

  it("busca por nombre, empresa o email y pagina", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    await ana.post("/api/contactos", { nombre: "Laura Méndez", empresa: "Clínica Sonrisa", email: "laura@sonrisa.com" });
    await ana.post("/api/contactos", { nombre: "Carlos Pérez", empresa: "Ferretería" });
    const r = await ana.get("/api/contactos?q=sonrisa");
    expect(r.body.total).toBe(1);
    expect(r.body.contactos[0]).toMatchObject({ nombre: "Laura Méndez", responsable: "Ana", abiertas: 0 });
  });

  it("solo el administrador puede eliminar contactos", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const { contactoId } = await crearContactoYOportunidad(ana);
    expect((await ana.delete(`/api/contactos/${contactoId}`)).status).toBe(403);
    const jefa = await entrar("jefa@test.com", "clave-jefa");
    expect((await jefa.delete(`/api/contactos/${contactoId}`)).status).toBe(204);
    expect(db.prepare("SELECT COUNT(*) AS n FROM oportunidades").get()).toEqual({ n: 0 }); // en cascada
  });
});

describe("embudo de ventas", () => {
  it("cada vendedor ve y modifica solo sus oportunidades; el administrador ve todas", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const beto = await entrar("beto@test.com", "clave-beto");
    const { oportunidadId } = await crearContactoYOportunidad(ana);
    await crearContactoYOportunidad(beto);

    expect((await ana.get("/api/oportunidades")).body).toHaveLength(1);
    expect((await beto.get(`/api/oportunidades/${oportunidadId}`)).status).toBe(403);
    expect((await beto.patch(`/api/oportunidades/${oportunidadId}/mover`, { etapa: "ganado" })).status).toBe(403);

    const jefa = await entrar("jefa@test.com", "clave-jefa");
    expect((await jefa.get("/api/oportunidades")).body).toHaveLength(2);
    expect((await jefa.get("/api/oportunidades?responsable=2")).body).toHaveLength(1);
  });

  it("un vendedor no puede asignarse oportunidades a nombre de otro", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const c = await ana.post("/api/contactos", { nombre: "Cliente" });
    const r = await ana.post("/api/oportunidades", { titulo: "Trato", contacto_id: c.body.id, valor_centavos: 100, responsable_id: 3 });
    const o = await ana.get(`/api/oportunidades/${r.body.id}`);
    expect(o.body.oportunidad.responsable).toBe("Ana");
  });

  it("mover una tarjeta cambia la etapa, la ordena y guarda el historial", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const a = await crearContactoYOportunidad(ana, "propuesta");
    const b = await crearContactoYOportunidad(ana, "propuesta");
    const c = await crearContactoYOportunidad(ana, "nuevo");

    // Soltar C en "propuesta" delante de B → orden A, C, B
    const r = await ana.patch(`/api/oportunidades/${c.oportunidadId}/mover`, { etapa: "propuesta", antes_de: b.oportunidadId });
    expect(r.status).toBe(200);
    const columna = (await ana.get("/api/oportunidades")).body.filter((o: { etapa: string }) => o.etapa === "propuesta");
    expect(columna.map((o: { id: number }) => o.id)).toEqual([a.oportunidadId, c.oportunidadId, b.oportunidadId]);

    const detalle = await ana.get(`/api/oportunidades/${c.oportunidadId}`);
    expect(detalle.body.eventos.map((e: { desde: string; hasta: string }) => [e.desde, e.hasta])).toEqual([
      [null, "nuevo"],
      ["nuevo", "propuesta"],
    ]);
  });

  it("reordenar dentro de la misma columna no crea eventos", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const a = await crearContactoYOportunidad(ana);
    const b = await crearContactoYOportunidad(ana);
    await ana.patch(`/api/oportunidades/${b.oportunidadId}/mover`, { etapa: "nuevo", antes_de: a.oportunidadId });
    const ids = (await ana.get("/api/oportunidades")).body.map((o: { id: number }) => o.id);
    expect(ids).toEqual([b.oportunidadId, a.oportunidadId]);
    expect((await ana.get(`/api/oportunidades/${b.oportunidadId}`)).body.eventos).toHaveLength(1);
  });

  it("ganar fija la fecha de cierre y perder exige un motivo", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const { oportunidadId } = await crearContactoYOportunidad(ana);
    const ganada = await ana.patch(`/api/oportunidades/${oportunidadId}/mover`, { etapa: "ganado" });
    expect(ganada.body.cerrado_en).toBeTruthy();

    const otra = await crearContactoYOportunidad(ana);
    const sinMotivo = await ana.patch(`/api/oportunidades/${otra.oportunidadId}/mover`, { etapa: "perdido" });
    expect(sinMotivo.status).toBe(400);
    const conMotivo = await ana.patch(`/api/oportunidades/${otra.oportunidadId}/mover`, { etapa: "perdido", motivo_perdida: "Precio alto" });
    expect(conMotivo.body).toMatchObject({ etapa: "perdido", motivo_perdida: "Precio alto" });

    const reabierta = await ana.patch(`/api/oportunidades/${otra.oportunidadId}/mover`, { etapa: "negociacion" });
    expect(reabierta.body).toMatchObject({ cerrado_en: null, motivo_perdida: "" });
  });

  it("rechaza referencias a tarjetas de otra columna", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const a = await crearContactoYOportunidad(ana, "nuevo");
    const b = await crearContactoYOportunidad(ana, "propuesta");
    const r = await ana.patch(`/api/oportunidades/${a.oportunidadId}/mover`, { etapa: "contactado", antes_de: b.oportunidadId });
    expect(r.status).toBe(400);
  });
});

describe("actividades y tareas", () => {
  it("las tareas exigen fecha y se pueden completar", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const { contactoId, oportunidadId } = await crearContactoYOportunidad(ana);
    const sinFecha = await ana.post("/api/actividades", { tipo: "tarea", descripcion: "Llamar", contacto_id: contactoId });
    expect(sinFecha.status).toBe(400);

    const t = await ana.post("/api/actividades", { tipo: "tarea", descripcion: "Llamar", contacto_id: contactoId, oportunidad_id: oportunidadId, vence_en: "2026-01-01" });
    expect((await ana.get("/api/tareas")).body).toHaveLength(1);
    expect((await ana.get("/api/oportunidades")).body[0].tareas_pendientes).toBe(1);

    await ana.patch(`/api/actividades/${t.body.id}`, { completada: true });
    expect((await ana.get("/api/tareas")).body).toHaveLength(0);
  });

  it("una actividad no puede vincularse a una oportunidad de otro contacto", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const x = await crearContactoYOportunidad(ana);
    const y = await crearContactoYOportunidad(ana);
    const r = await ana.post("/api/actividades", { tipo: "nota", descripcion: "Nota", contacto_id: x.contactoId, oportunidad_id: y.oportunidadId });
    expect(r.status).toBe(400);
  });

  it("nadie completa ni borra las tareas de otro vendedor", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    const beto = await entrar("beto@test.com", "clave-beto");
    const { contactoId } = await crearContactoYOportunidad(ana);
    const t = await ana.post("/api/actividades", { tipo: "tarea", descripcion: "Llamar", contacto_id: contactoId, vence_en: "2026-12-01" });
    expect((await beto.patch(`/api/actividades/${t.body.id}`, { completada: true })).status).toBe(403);
    expect((await beto.delete(`/api/actividades/${t.body.id}`)).status).toBe(403);
    expect((await beto.get("/api/tareas")).body).toHaveLength(0);
  });
});

describe("panel", () => {
  it("calcula embudo, previsión ponderada y tasa de éxito", async () => {
    const ana = await entrar("ana@test.com", "clave-ana");
    await crearContactoYOportunidad(ana, "nuevo", 100000); // 10 %
    await crearContactoYOportunidad(ana, "negociacion", 200000); // 75 %
    const g = await crearContactoYOportunidad(ana, "nuevo", 50000);
    await ana.patch(`/api/oportunidades/${g.oportunidadId}/mover`, { etapa: "ganado" });
    const p = await crearContactoYOportunidad(ana, "nuevo", 70000);
    await ana.patch(`/api/oportunidades/${p.oportunidadId}/mover`, { etapa: "perdido", motivo_perdida: "Sin presupuesto" });

    const panel = (await ana.get("/api/panel")).body;
    expect(panel.abierto_centavos).toBe(300000);
    expect(panel.oportunidades_abiertas).toBe(2);
    expect(panel.prevision_ponderada).toBe(10000 + 150000);
    expect(panel.ganado_mes).toBe(50000);
    expect(panel.tasa_exito).toBe(50);
    expect(panel.embudo.find((e: { etapa: string }) => e.etapa === "negociacion")).toMatchObject({ cantidad: 1, valor_centavos: 200000 });
  });
});

describe("datos de demostración", () => {
  it("se cargan con usuarios, contactos y un embudo coherente", async () => {
    const demo = abrirDb(":memory:");
    cargarDemo(demo);
    app = crearApp(demo);
    const jefa = await entrar("admin@crm.test", "admin123");
    const panel = (await jefa.get("/api/panel")).body;
    expect(panel.oportunidades_abiertas).toBeGreaterThan(5);
    expect(panel.vendedores).toHaveLength(3);
    const contactos = (await jefa.get("/api/contactos")).body;
    expect(contactos.total).toBe(16);
  });
});
