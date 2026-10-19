import { describe, expect, it } from "vitest";
import type { Estudio, Material } from "../types";
import { crearEstudio, nuevoItem, nuevoMaterial } from "./espacio";
import { aLatin1, envolver, informePDF, medidasDeFoto, paginasDelInforme } from "./pdf";

/**
 * El PDF se revisa por dentro, no solo por fuera. Los lectores de PDF no
 * perdonan: si la tabla de posiciones de los objetos está corrida un byte, el
 * archivo se abre en blanco o directamente no se abre, y eso no se nota hasta
 * que alguien lo manda por correo. Por eso estas pruebas leen los bytes reales.
 */

const cable: Material = { ...nuevoMaterial("Cable UTP Cat6", "caja"), id: "m1" };
const fuente: Material = { ...nuevoMaterial("Fuente 12V 1A", "u"), id: "m2" };

function estudioCon(items: Estudio["items"], extra: Partial<Estudio> = {}): Estudio {
  return {
    ...crearEstudio("Materiales sede norte"),
    id: "e1",
    cliente: "Ferretería El Tornillo",
    sitio: "Av. Los Álamos 1450",
    ciudad: "Santiago",
    realizo: "J. Ramírez",
    notas: "Falta confirmar el tendido del segundo piso.",
    items,
    ...extra,
  };
}

/** Un PDF sin comprimir se lee como texto de un byte por carácter. */
async function textoDe(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let salida = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    salida += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return salida;
}

/** Lo que el PDF dibuja, ya desescapado. */
function lineasDe(flujo: string): string[] {
  const salida: string[] = [];
  for (const trozo of flujo.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)) {
    salida.push(trozo[1].replace(/\\([\\()])/g, "$1"));
  }
  return salida;
}

function flujosDe(contenido: string): string[] {
  return [...contenido.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]);
}

async function abrir(estudio: Estudio, catalogo: Material[] = [cable, fuente]) {
  const blob = informePDF(estudio, catalogo);
  const contenido = await textoDe(blob);
  const flujos = flujosDe(contenido);
  return {
    blob,
    contenido,
    lineas: flujos.flatMap(lineasDe),
    paginas: flujos.length,
  };
}

/** La fila de la tabla que empieza con ese número. */
function filaDe(lineas: string[], numero: number): string {
  return cruda(lineas, numero).trim();
}

/** La misma fila, sin recortar: para revisar dónde cae cada columna. */
function cruda(lineas: string[], numero: number): string {
  const encontrada = lineas.find((l) => l.trim().startsWith(`${numero} `));
  if (!encontrada) throw new Error(`No hay ninguna fila ${numero} en el informe.`);
  return encontrada;
}

/** La línea de títulos de la tabla. */
function encabezadoDe(lineas: string[]): string {
  const encontrada = lineas.find((l) => l.includes("MATERIAL") && l.includes("UNIDAD"));
  if (!encontrada) throw new Error("No hay encabezado de tabla en el informe.");
  return encontrada;
}

describe("estructura del archivo", () => {
  it("empieza y termina como un PDF", async () => {
    const { blob, contenido } = await abrir(estudioCon([nuevoItem(cable.id, 4)]));
    expect(blob.type).toBe("application/pdf");
    expect(contenido.startsWith("%PDF-1.4")).toBe(true);
    expect(contenido.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("la tabla de posiciones apunta justo al principio de cada objeto", async () => {
    const { contenido } = await abrir(
      estudioCon([nuevoItem(cable.id, 4), nuevoItem(fuente.id, 250)]),
    );

    const inicio = Number(/startxref\n(\d+)/.exec(contenido)?.[1]);
    expect(Number.isFinite(inicio)).toBe(true);

    const cabecera = /^xref\n0 (\d+)\n/.exec(contenido.slice(inicio));
    expect(cabecera).not.toBeNull();
    const cuantos = Number(cabecera![1]);

    // La entrada 0 es la libre y ocupa el primer lugar; la del objeto n está en
    // el lugar n, y su posición tiene que caer donde empieza ese objeto.
    for (let n = 1; n < cuantos; n += 1) {
      const desde = inicio + cabecera![0].length + n * 20;
      const entrada = contenido.slice(desde, desde + 20);
      expect(entrada).toHaveLength(20);
      const posicion = Number(entrada.slice(0, 10));
      expect(contenido.slice(posicion, posicion + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
  });

  it("el largo declarado de cada flujo coincide con lo que mide", async () => {
    const { contenido } = await abrir(estudioCon([nuevoItem(cable.id, 4)]));
    const conLargo = [...contenido.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
    expect(conLargo.length).toBeGreaterThan(0);
    for (const [, declarado, cuerpo] of conLargo) {
      expect(cuerpo.length).toBe(Number(declarado));
    }
  });

  it("declara tantas páginas como dibuja", async () => {
    const { contenido, paginas } = await abrir(estudioCon([nuevoItem(cable.id, 4)]));
    expect(paginas).toBe(1);
    expect(contenido).toContain("/Count 1");
    expect([...contenido.matchAll(/\/Type \/Page[^s]/g)]).toHaveLength(1);
  });
});

describe("contenido del informe", () => {
  it("lleva los datos del estudio y del cliente", async () => {
    const { lineas } = await abrir(estudioCon([nuevoItem(cable.id, 4)]));
    const texto = lineas.join("\n");
    expect(texto).toContain("LISTA DE MATERIALES");
    expect(texto).toContain("Materiales sede norte");
    expect(texto).toContain("Cliente: Ferretería El Tornillo");
    expect(texto).toContain("Sitio: Av. Los Álamos 1450");
    expect(texto).toContain("Estudio realizado por: J. Ramírez");
    expect(texto).toContain("3. Observaciones");
  });

  it("usa la unidad elegida en la línea, que es lo que se pidió", async () => {
    const { lineas } = await abrir(
      estudioCon([nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)]),
    );
    // Número, material, unidad y cantidad, en ese orden y en la misma fila.
    expect(filaDe(lineas, 1)).toMatch(/^1\s+Cable UTP Cat6\s+rollo\s+4$/);
    // La que no eligió nada sigue a su material del catálogo.
    expect(filaDe(lineas, 2)).toMatch(/^2\s+Fuente 12V 1A\s+u\s+250$/);
  });

  it("imprime entera una unidad del equipo, sin cortarla", async () => {
    // La tabla tenía una columna fija de 9 caracteres: «rollo de 100 m» salía
    // cortada y el papel decía otra cosa que la pantalla.
    const { lineas } = await abrir(estudioCon([nuevoItem(cable.id, 4, "rollo de 100 m")]));
    expect(filaDe(lineas, 1)).toMatch(/^1\s+Cable UTP Cat6\s+rollo de 100 m\s+4$/);
  });

  it("una unidad larguísima se reparte en dos líneas sin perder nada", async () => {
    const { lineas } = await abrir(
      estudioCon([nuevoItem(cable.id, 2, "rollo de cable UTP de 100 metros")]),
    );
    const inicio = lineas.findIndex((l) => l.trim().startsWith("1 "));
    const continuacion = lineas[inicio + 1] ?? "";
    expect(continuacion.trim()).not.toBe("");
    // La continuación no repite número de fila ni cantidad: sigue siendo la
    // misma fila, con la unidad repartida en dos renglones.
    expect(continuacion.slice(0, 6).trim()).toBe("");
    expect(continuacion.slice(-13).trim()).toBe("");

    // La columna de unidad, juntando los dos renglones, dice la unidad entera.
    const columna = encabezadoDe(lineas).indexOf("UNIDAD");
    const ancho = encabezadoDe(lineas).trimEnd().length - 13 - 1 - columna;
    const unidadEscrita = `${lineas[inicio].slice(columna, columna + ancho)} ${continuacion.slice(
      columna,
      columna + ancho,
    )}`
      .replace(/\s+/g, " ")
      .trim();
    expect(unidadEscrita).toBe("rollo de cable UTP de 100 metros");
  });

  it("las columnas siguen alineadas, aunque la unidad sea más ancha", async () => {
    const { lineas } = await abrir(
      estudioCon([nuevoItem(cable.id, 4, "rollo de 100 m"), nuevoItem(fuente.id, 250)]),
    );
    const encabezado = encabezadoDe(lineas);
    const columna = encabezado.indexOf("UNIDAD");
    // La unidad arranca donde arranca el título UNIDAD, y la cantidad termina
    // donde termina CANTIDAD: la tabla no se desarma por una unidad larga.
    expect(cruda(lineas, 1).indexOf("rollo de 100 m")).toBe(columna);
    expect(cruda(lineas, 2).slice(columna, columna + 1)).toBe("u");
    expect(cruda(lineas, 1).trimEnd().length).toBe(encabezado.trimEnd().length);
    expect(cruda(lineas, 2).trimEnd().length).toBe(encabezado.trimEnd().length);
  });

  it("no imprime el resumen por unidad de la tabla, que es para el cliente", async () => {
    const { lineas } = await abrir(
      estudioCon([nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)]),
    );
    const texto = lineas.join("\n");
    // El total separado por unidad («250 u · 4 rollo») no va en el documento:
    // cada cantidad se lee en su fila, con su unidad.
    expect(texto).not.toContain("Total por unidad");
    // Pero la tabla sigue cerrada con su raya, sin quedar abierta.
    expect(lineas.filter((l) => /^-+$/.test(l.trim()))).toHaveLength(2);
    // Y el resumen que sí queda es el de los datos generales.
    expect(texto).toContain("Materiales listados: 2 (250 u · 4 rollo)");
  });

  it("avisa cuando la lista está vacía", async () => {
    const { lineas } = await abrir(estudioCon([]));
    expect(lineas.join("\n")).toContain("Todavía no se agregaron materiales.");
  });

  it("deja constancia de un material que ya no está en el catálogo", async () => {
    const { lineas } = await abrir(estudioCon([nuevoItem("m-que-no-existe", 3)]), [cable]);
    expect(lineas.join("\n")).toContain("(material no disponible)");
  });
});

describe("texto que llega de afuera", () => {
  it("aguanta paréntesis y barras en el nombre del material", async () => {
    const raro: Material = { ...nuevoMaterial("Cable (UTP) 4\\par", "caja"), id: "m3" };
    const { lineas } = await abrir(estudioCon([nuevoItem(raro.id, 1, "m")]), [raro]);
    expect(filaDe(lineas, 1)).toMatch(/^1\s+Cable \(UTP\) 4\\par\s+m\s+1$/);
  });

  it("los acentos van y vuelven igual", async () => {
    const { lineas } = await abrir(estudioCon([nuevoItem(cable.id, 1)]));
    const texto = lineas.join("\n");
    expect(texto).toContain("Ferretería El Tornillo");
    expect(texto).toContain("Los Álamos");
  });

  it("un nombre larguísimo se corta en dos líneas sin repetir número ni cantidad", async () => {
    const largo: Material = {
      ...nuevoMaterial(
        "[ADS-12FG-12N 12012EPCU,12V1A] FUENTE DE PODER INDIVIDUAL DE 1 AMPERIO, HIKVISION PROFESIONAL",
        "u",
      ),
      id: "m4",
    };
    const { lineas } = await abrir(estudioCon([nuevoItem(largo.id, 2)]), [largo]);

    const inicio = lineas.findIndex((l) => l.trim().startsWith("1 "));
    const continuacion = lineas[inicio + 1] ?? "";
    expect(continuacion.trim()).not.toBe("");
    expect(continuacion.trim()).not.toMatch(/^\d+\s/);
    expect(`${lineas[inicio]} ${continuacion}`.replace(/\s+/g, " ")).toContain("HIKVISION");
    expect(lineas[inicio].trim()).toMatch(/^1\s+\[ADS-12FG-12N/);
  });
});

describe("paginación", () => {
  it("una lista larga se reparte en páginas y las numera", async () => {
    const catalogo: Material[] = Array.from({ length: 90 }, (_, i) => ({
      ...nuevoMaterial(`Material número ${i + 1} de la lista larga`, "u"),
      id: `m-${i}`,
    }));
    const { contenido, lineas, paginas } = await abrir(
      estudioCon(catalogo.map((m, i) => nuevoItem(m.id, (i % 9) + 1))),
      catalogo,
    );

    expect(paginas).toBeGreaterThan(1);
    expect(contenido).toContain(`/Count ${paginas}`);
    const texto = lineas.join("\n");
    expect(texto).toContain(`Página 1 de ${paginas}`);
    expect(texto).toContain(`Página ${paginas} de ${paginas}`);
    // El encabezado de la tabla se repite en cada página, o la segunda no se entiende.
    expect(lineas.filter((l) => l.includes("MATERIAL")).length).toBe(paginas);
    // Y no se pierde ninguna fila al cortar: están las 90.
    expect(lineas.filter((l) => l.includes("de la lista larga")).length).toBe(90);
  });
});

describe("fotografías en el informe", () => {
  // JPEG mínimo de 3x2 (SOI + SOF0 + EOI): alcanza para medir y embeber.
  const jpeg =
    "data:image/jpeg;base64," +
    Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x22, 0x00,
      0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
    ]).toString("base64");
  const foto = { id: "f1", imagen: jpeg, comentario: "Tablero principal", updatedAt: "" };

  it("lee el tamaño del JPEG sin decodificarlo", () => {
    expect(medidasDeFoto(jpeg)).toEqual({ ancho: 3, alto: 2 });
    expect(medidasDeFoto("data:image/png;base64,xx")).toBeNull();
    expect(medidasDeFoto("no-es-una-imagen")).toBeNull();
  });

  it("dibuja cada foto con su epígrafe en la sección Fotografías", async () => {
    const segunda = { ...foto, id: "f2", comentario: "" };
    const { contenido, lineas } = await abrir(estudioCon([], { fotos: [foto, segunda] }));
    expect(contenido).toContain("/DCTDecode");
    expect(contenido).toContain("/Im1 Do");
    expect(lineas.some((l) => l.includes("Fotografías"))).toBe(true);
    expect(lineas.some((l) => l.includes("Fotografía 1"))).toBe(true);
    expect(lineas.some((l) => l.includes("Tablero principal"))).toBe(true);
    expect(lineas.some((l) => l.includes("Fotografía 2"))).toBe(true);
  });

  it("las fotos altas abren páginas nuevas y llegan a la vista previa", () => {
    // El encabezado dice 400x1500: el dibujo se limita a 340 de alto y cada
    // foto pide su lugar, así que seis no entran en una hoja.
    const alta =
      "data:image/jpeg;base64," +
      Buffer.from([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x05, 0xdc, 0x01, 0x90, 0x03, 0x01, 0x22,
        0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
      ]).toString("base64");
    expect(medidasDeFoto(alta)).toEqual({ ancho: 400, alto: 1500 });
    const muchas = Array.from({ length: 6 }, (_, i) => ({ ...foto, id: `f${i}`, imagen: alta }));
    const paginas = paginasDelInforme(estudioCon([], { fotos: muchas }), [cable, fuente]);
    expect(paginas.length).toBeGreaterThan(2);
    const conFoto = paginas.filter((p) => p.imagenes.length > 0);
    expect(conFoto.flatMap((p) => p.imagenes)).toHaveLength(6);
    // La vista previa recibe la misma imagen que el archivo.
    expect(conFoto[0].imagenes[0].url).toBe(alta);
  });

  it("la tabla de posiciones coincide con los objetos reales, con fotos", async () => {
    const { contenido } = await abrir(estudioCon([], { fotos: [foto] }));
    const tabla = contenido.slice(contenido.indexOf("xref\n"));
    // Solo las entradas en uso (la libre no cuenta): cada una apunta al
    // encabezado de su objeto, esté donde esté en el archivo.
    const entradas = [...tabla.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    expect(entradas.length).toBe(9);
    entradas.forEach((pos, k) => {
      expect(contenido.startsWith(`${k + 1} 0 obj`, pos)).toBe(true);
    });
  });

  it("la foto y su epígrafe van centrados en la hoja", () => {
    const paginas = paginasDelInforme(estudioCon([], { fotos: [foto] }), [cable, fuente]);
    const conFoto = paginas.filter((p) => p.imagenes.length > 0);
    expect(conFoto).toHaveLength(1);
    const img = conFoto[0].imagenes[0];
    // Márgenes iguales a izquierda y derecha (hoja de 595.28 con margen 42).
    expect(Math.abs(img.x - 42 - (553.28 - (img.x + img.ancho)))).toBeLessThan(0.01);
    // Y el epígrafe no arranca en el margen: también va centrado.
    const epigrafe = conFoto[0].lineas.find((l) => l.texto.includes("Fotografía 1"));
    expect(epigrafe).toBeDefined();
    expect(epigrafe!.x).toBeGreaterThan(42);
  });

  it("una foto rota se salta sin romper el informe", async () => {
    const rota = { id: "f9", imagen: "data:image/jpeg;base64,!!!", comentario: "rota", updatedAt: "" };
    const { contenido, lineas } = await abrir(estudioCon([], { fotos: [rota] }));
    expect(contenido).not.toContain("/DCTDecode");
    // Y la sección ni se abre si no queda ninguna válida.
    expect(lineas.some((l) => l.includes("Fotografías"))).toBe(false);
  });
});

describe("ayudas de texto", () => {
  it("corta una palabra más larga que la columna", () => {
    const partes = envolver("A".repeat(150), 64);
    expect(partes.every((p) => p.length <= 64)).toBe(true);
    expect(partes.join("")).toBe("A".repeat(150));
  });

  it("reemplaza los signos que no entran en un byte", () => {
    expect(aLatin1("Obra—terminada… (50 %)—ok")).toBe("Obra-terminada... (50 %)-ok");
    expect(aLatin1("emoji 😀")).toBe("emoji ?");
    expect(aLatin1("ñáéÍÓÚ")).toBe("ñáéÍÓÚ");
  });
});
