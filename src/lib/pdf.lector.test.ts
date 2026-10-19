import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Estudio, Material } from "../types";
import { crearEstudio, nuevoItem, nuevoMaterial } from "./espacio";
import { informePDF } from "./pdf";

/**
 * El PDF se abre con un lector de verdad, el mismo motor que usan Firefox y
 * muchos visores (Mozilla PDF.js).
 *
 * Las pruebas de pdf.test.ts revisan la estructura por dentro, pero podrían
 * estar de acuerdo conmigo en un error: acá el archivo lo interpreta un tercero
 * que no sabe nada de cómo lo escribí. Si esto pasa, el archivo se abre.
 *
 * El informe usa las fuentes que todo visor trae de fábrica (Courier y
 * Helvetica), así que el archivo no lleva ninguna adentro. Acá el lector avisa
 * que no encuentra los archivos de esas fuentes, que es cosa de correrlo fuera
 * del navegador: para leer el texto no hacen falta, porque la codificación va
 * declarada en el archivo.
 */

const cable: Material = { ...nuevoMaterial("Cable UTP Cat6", "caja"), id: "m1" };
const fuente: Material = { ...nuevoMaterial("Fuente 12V 1A", "u"), id: "m2" };
const catalogo = [cable, fuente];

function estudioCon(items: Estudio["items"]): Estudio {
  return {
    ...crearEstudio("Materiales sede norte"),
    id: "e1",
    cliente: "Ferretería El Tornillo",
    sitio: "Av. Los Álamos 1450",
    realizo: "J. Ramírez",
    notas: "Falta confirmar el tendido del segundo piso.",
    items,
  };
}

async function leerPDF(estudio: Estudio, materiales: Material[] = catalogo) {
  const datos = new Uint8Array(await informePDF(estudio, materiales).arrayBuffer());
  // El motor entiende «isEvalSupported», pero los tipos que trae el paquete no
  // lo declaran: por eso la opción se declara acá y no se toca la librería.
  const opciones = { data: datos, isEvalSupported: false } as Parameters<typeof getDocument>[0] & {
    isEvalSupported?: boolean;
  };
  const tarea = getDocument(opciones);
  const documento = await tarea.promise;
  const paginas: string[] = [];
  for (let n = 1; n <= documento.numPages; n += 1) {
    const pagina = await documento.getPage(n);
    const contenido = await pagina.getTextContent();
    paginas.push(contenido.items.map((i) => ("str" in i ? i.str : "")).join(""));
  }
  const cuantas = documento.numPages;
  await tarea.destroy();
  return { cuantas, paginas, texto: paginas.join("\n") };
}

describe("el informe visto por un lector de PDF", () => {
  it("se abre y trae lo que el estudio tiene", async () => {
    const { cuantas, texto } = await leerPDF(
      estudioCon([nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)]),
    );

    expect(cuantas).toBe(1);
    expect(texto).toContain("LISTA DE MATERIALES");
    expect(texto).toContain("Materiales sede norte");
    expect(texto).toContain("Ferretería El Tornillo");
    expect(texto).toContain("Av. Los Álamos 1450");
    expect(texto).toContain("J. Ramírez");
    expect(texto).toContain("Falta confirmar el tendido del segundo piso.");
  });

  it("y trae la unidad elegida en la línea", async () => {
    const { texto } = await leerPDF(
      estudioCon([nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)]),
    );
    expect(texto).toContain("Cable UTP Cat6");
    expect(texto).toContain("rollo");
    // El resumen por unidad no va en el documento que se entrega.
    expect(texto).not.toContain("Total por unidad");
    // Las cantidades siguen enteras: 4 con su unidad elegida y 250 con la suya.
    expect(texto).toContain("4");
    expect(texto).toContain("250");
    // Y sin el conteo de materiales en los datos.
    expect(texto).not.toContain("Materiales listados");
  });

  it("una lista larga se abre con todas sus páginas", async () => {
    const largos: Material[] = Array.from({ length: 80 }, (_, i) => ({
      ...nuevoMaterial(`Material ${i + 1} de relleno para llenar páginas`, "u"),
      id: `m-${i}`,
    }));
    const { cuantas, texto } = await leerPDF(
      estudioCon(largos.map((m, i) => nuevoItem(m.id, i + 1))),
      largos,
    );

    expect(cuantas).toBeGreaterThan(1);
    expect(texto).toContain("Material 80 de relleno para llenar páginas");
    expect(texto).toContain(`Página 1 de ${cuantas}`);
  });
});
