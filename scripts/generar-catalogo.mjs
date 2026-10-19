/**
 * Convierte datos/lista-materiales.txt al JSON que importa la aplicación.
 *
 * Uso:
 *   node scripts/generar-catalogo.mjs
 *
 * Genera src/datos/catalogo-inicial.json, el catálogo que la aplicación trae
 * incorporado y agrega sola la primera vez que se abre.
 *
 * Los identificadores se derivan del nombre, así que volver a importar el
 * mismo archivo no duplica materiales: la fusión los reconoce por id.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const entrada = join(raiz, "datos", "lista-materiales.txt");
// Vive dentro de src/ para que la aplicación lo empaquete y lo cargue sola.
const salida = join(raiz, "src", "datos", "catalogo-inicial.json");

/** Clave de comparación: sin mayúsculas ni espacios repetidos. */
function normalizar(texto) {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

function idDe(nombre) {
  return `mat-${createHash("sha1").update(normalizar(nombre)).digest("hex").slice(0, 12)}`;
}

/**
 * Nombre del material: la línea tal como está escrita.
 *
 * Se conserva el código de modelo («[GAFO-0068] …», «F22/ID/ADMS) …») porque
 * en muchos casos es el único dato que permite encontrar el material, y es
 * el texto que la persona reconoce de su propio listado. Solo se limpia un
 * corchete de apertura sin cierre, que es un error de tipeo.
 */
function limpiarNombre(linea) {
  let texto = linea.trim();
  if (texto.startsWith("[") && !texto.includes("]")) {
    // El corchete quedó abierto: «[CODIGO) texto» se endereza a «[CODIGO] texto».
    const sinCorchete = texto.slice(1).trim();
    const malFormado = /^([A-Za-z0-9][^\]\)]{0,39})\)\s+(.+)$/.exec(sinCorchete);
    texto = malFormado ? `[${malFormado[1].trim()}] ${malFormado[2].trim()}` : sinCorchete;
  }

  // «[CODIGO] CODIGO descripción» repite el código: se deja una sola vez.
  const conCodigo = /^\[([^\]]+)\]\s*(.+)$/.exec(texto);
  if (conCodigo) {
    const codigo = conCodigo[1].trim();
    const resto = conCodigo[2].trim();
    const patron = new RegExp(`^${codigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i");
    if (patron.test(resto)) {
      const sinRepeticion = resto.replace(patron, "").trim();
      if (sinRepeticion) texto = `[${codigo}] ${sinRepeticion}`;
    }
  }

  return texto.replace(/\s+/g, " ").trim();
}

/** Solo señales explícitas de que el material se mide por longitud. */
function unidadDe(nombre) {
  if (/\(ML\)/i.test(nombre)) return "m";
  if (/\bpor metro\b/i.test(nombre)) return "m";
  if (/\bx metro\b/i.test(nombre)) return "m";
  if (/\bpor pie\b/i.test(nombre)) return "pie";
  if (/\bx pie\b/i.test(nombre)) return "pie";
  return "u";
}

const lineas = readFileSync(entrada, "utf8").split(/\r?\n/);
const vistos = new Map();
const repetidos = [];
const conCodigo = [];
const sinNombre = [];
const deduplicados = [];

for (const cruda of lineas) {
  const linea = cruda.trim();
  if (!linea) continue;

  const nombre = limpiarNombre(linea);
  if (!nombre) {
    sinNombre.push(linea);
    continue;
  }

  const clave = normalizar(nombre);
  if (vistos.has(clave)) {
    repetidos.push(linea);
    continue;
  }

  if (/^\[?[A-Za-z0-9][^\]\)]{1,40}[\]\)]/.test(nombre)) conCodigo.push(nombre);
  if (normalizar(nombre) !== normalizar(linea)) deduplicados.push({ antes: linea, despues: nombre });

  vistos.set(clave, {
    id: idDe(nombre),
    nombre,
    unidad: unidadDe(nombre),
  });
}

const catalogo = [...vistos.values()];
const porLongitud = catalogo.filter((m) => m.unidad !== "u");

mkdirSync(join(raiz, "src", "datos"), { recursive: true });
writeFileSync(
  salida,
  JSON.stringify(
    {
      version: 2,
      generado: new Date().toISOString(),
      catalogo,
      estudios: [],
    },
    null,
    2,
  ),
  "utf8",
);

const formatear = (t) => t.replace(/\s+/g, " ").slice(0, 78);

console.log(`Líneas leídas:            ${lineas.length}`);
console.log(`Materiales únicos:        ${catalogo.length}`);
console.log(`Con código de modelo:     ${conCodigo.length}`);
console.log(`Duplicados descartados:   ${repetidos.length}`);
console.log(`Sin nombre utilizable:    ${sinNombre.length}`);
console.log(`Con unidad por longitud:  ${porLongitud.length}`);
console.log(`Con el código repetido:   ${deduplicados.length} (se deja una sola vez)`);
console.log("");
console.log("Materiales con unidad distinta de «u»:");
for (const m of porLongitud) console.log(`  [${m.unidad}] ${formatear(m.nombre)}`);
console.log("");
console.log("Primeros 5 del catálogo:");
for (const m of catalogo.slice(0, 5)) console.log(`  ${m.id}  [${m.unidad}] ${formatear(m.nombre)}`);
console.log("");
console.log("Códigos repetidos corregidos:");
for (const d of deduplicados) console.log(`  antes:   ${formatear(d.antes)}\n  después: ${formatear(d.despues)}`);
console.log("");
console.log("Duplicados descartados (muestra):");
for (const r of repetidos.slice(0, 8)) console.log(`  ${formatear(r)}`);
console.log("");
console.log(`Escrito: ${salida}`);
