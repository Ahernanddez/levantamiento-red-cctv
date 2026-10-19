/**
 * Empaqueta el Worker en un solo archivo.
 *
 * La plataforma recibe código ya construido, así que las dependencias (la
 * librería de sesión, las reglas compartidas del dato y el catálogo que se
 * entrega) tienen que quedar adentro del archivo. Esbuild hace ese trabajo y
 * además revisa que todo lo importado exista.
 *
 * Uso:
 *   node scripts/construir-worker.mjs
 *
 * Salida:
 *   worker/build/index.js   (esto es lo que se sube)
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "worker", "build", "index.js");

const resultado = await build({
  entryPoints: [join(raiz, "worker", "index.js")],
  outfile: salida,
  bundle: true,
  format: "esm",
  target: "es2022",
  // El Worker no corre en Node ni en un navegador: es su propio entorno.
  platform: "neutral",
  conditions: ["worker", "browser", "import", "default"],
  mainFields: ["module", "main"],
  loader: { ".json": "json" },
  minify: true,
  legalComments: "none",
  banner: { js: "// Generado por scripts/construir-worker.mjs. No editar a mano." },
  metafile: true,
});

// Esbuild informa la ruta con barras normales, sin importar el sistema.
const generado = Object.keys(resultado.metafile.outputs)[0];
const kb = (resultado.metafile.outputs[generado]?.bytes ?? 0) / 1024;
console.log(`Worker empaquetado: worker/build/index.js (${kb.toFixed(0)} KB)`);
