import path from "node:path";
import { crearApp } from "./app";
import { abrirDb } from "./db";
import { cargarDemo } from "./demo";

const db = abrirDb();
const vacia = (db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n === 0;
if (vacia) {
  if (process.env.DATOS_DEMO === "0") {
    console.warn("Base de datos vacía. Ejecuta `npm run demo` o crea un usuario para empezar.");
  } else {
    cargarDemo(db);
    console.log("Datos de demostración cargados (admin@crm.test / admin123).");
  }
}

const puerto = Number(process.env.PORT ?? 3200);
crearApp(db, { carpetaWeb: path.join(process.cwd(), "dist") }).listen(puerto, () => {
  console.log(`CRM escuchando en http://localhost:${puerto}`);
});
