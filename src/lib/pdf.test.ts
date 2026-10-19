import { describe, expect, it } from "vitest";
import type { Estudio, Material } from "../types";
import { crearEstudio, nuevoItem, nuevoMaterial } from "./espacio";
import { aLatin1, anchosDeTabla, centrado, envolver, informePDF, medidasDeFoto, paginasDelInforme } from "./pdf";

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

/**
 * La columna de unidad en caracteres: dónde arranca (por la rejilla) y qué
 * ancho tiene (por el cálculo de anchos).
 *
 * En Courier de 9 cada letra mide 0,6 em (5,4 puntos) desde el margen de 42:
 * así la prueba ubica la columna igual que el dibujo, sin depender de dónde
 * caiga el título centrado. El borde derecho de la rejilla incluye el espacio
 * separador, así que el ancho de texto sale de anchosDeTabla.
 */
function bordesDeUnidad(estudio: Estudio, unidades: string[]): [number, number] {
  const hoja = paginasDelInforme(estudio, [cable, fuente])[0];
  const xs = [...new Set(hoja.rects.filter((r) => r.ancho === 0.8).map((r) => r.x))].sort(
    (a, b) => a - b,
  );
  const inicio = Math.round((xs[2] - 42) / 5.4);
  return [inicio, inicio + anchosDeTabla(unidades).unidad];
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

  it("el número de sección va entero dentro de su pastilla, sin asomar", () => {
    // El dígito se salía por arriba de la pastilla y se leía montado con lo
    // de antes: la base tiene que dejar lugar a los ascendentes.
    const paginas = paginasDelInforme(estudioCon([nuevoItem(cable.id, 4)]), [cable, fuente]);
    for (const hoja of paginas) {
      const pastillas = hoja.rects.filter((r) => r.ancho === 24 && r.alto === 15);
      for (const p of pastillas) {
        const digito = hoja.lineas.find(
          (l) =>
            l.texto.length === 1 && l.x > p.x && l.x < p.x + p.ancho && Math.abs(l.y - p.y) < 20,
        );
        expect(digito).toBeDefined();
        // Base 10 puntos bajo el borde: ni los ascendentes asoman arriba ni
        // toca el fondo abajo.
        expect(digito!.y).toBeLessThanOrEqual(p.y - 8);
        expect(digito!.y).toBeGreaterThanOrEqual(p.y - 13);
      }
    }
    expect(paginas.flatMap((h) => h.rects).filter((r) => r.ancho === 24)).not.toHaveLength(0);
  });

  it("la lista es una tabla con rejilla: reglas y bordes por fila", () => {
    const paginas = paginasDelInforme(
      estudioCon([nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)]),
      [cable, fuente],
    );
    const rects = paginas.flatMap((h) => h.rects);
    const tabla = rects.filter((r) => r.ancho > 400);
    // Reglas horizontales: arriba y abajo del encabezado, una por fila.
    const reglas = tabla.filter((r) => r.alto === 0.8);
    expect(reglas).toHaveLength(4);
    // Bordes verticales: cinco por fila (izquierdo, tres divisiones, derecho).
    const verticales = rects.filter((r) => r.ancho === 0.8);
    expect(new Set(verticales.map((r) => Math.round(r.x * 100)))).toHaveLength(5);
    expect(verticales).toHaveLength(5 * 3);
  });

  it("el texto de datos no se monta sobre el filete de su tarjeta", () => {
    // El filete de acento (3 puntos) y el texto arrancaban en el mismo borde:
    // la primera letra quedaba encimada sobre la barra.
    const paginas = paginasDelInforme(estudioCon([nuevoItem(cable.id, 4)]), [cable, fuente]);
    for (const hoja of paginas) {
      const filetes = hoja.rects.filter((r) => r.ancho === 3 && r.alto > 50);
      for (const f of filetes) {
        const encima = hoja.lineas.filter(
          (l) => l.x < f.x + 7 && l.y <= f.y && l.y >= f.y - f.alto,
        );
        expect(encima).toEqual([]);
      }
    }
    expect(paginas.flatMap((h) => h.rects).filter((r) => r.ancho === 3)).not.toHaveLength(0);
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

  it("centra el texto corto en su ancho", () => {
    expect(centrado("u", 9)).toBe("    u    ");
    expect(centrado("UNIDAD", 9)).toBe(" UNIDAD  ");
    expect(centrado("4", 13)).toBe("      4      ");
    expect(centrado("", 3)).toBe("   ");
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

    // La columna de unidad, juntando los dos renglones, dice la unidad
    // entera. Los bordes salen de la rejilla: la columna ya no se ubica por
    // el título, que ahora va centrado como el resto.
    const [iniU, finU] = bordesDeUnidad(
      estudioCon([nuevoItem(cable.id, 2, "rollo de cable UTP de 100 metros")]),
      ["UNIDAD", "rollo de cable UTP de 100 metros"],
    );
    const unidadEscrita = `${lineas[inicio].slice(iniU, finU)} ${continuacion.slice(iniU, finU)}`
      .replace(/\s+/g, " ")
      .trim();
    expect(unidadEscrita).toBe("rollo de cable UTP de 100 metros");
  });

  it("las columnas de unidad y cantidad van centradas", () => {
    const paginas = paginasDelInforme(
      estudioCon([nuevoItem(cable.id, 4, "rollo de 100 m"), nuevoItem(fuente.id, 250)]),
      [cable, fuente],
    );
    const hoja = paginas[0];
    const textos = hoja.lineas.map((l) => l.texto);
    const [iniU, finU] = bordesDeUnidad(
      estudioCon([nuevoItem(cable.id, 4, "rollo de 100 m"), nuevoItem(fuente.id, 250)]),
      ["UNIDAD", "rollo de 100 m", "u"],
    );
    // La unidad larga queda con el mismo aire a cada lado (más uno si es impar).
    const fila1 = textos.find((l) => l.trim().startsWith("1 ")) ?? "";
    const unidad = fila1.slice(iniU, finU);
    const izqU = unidad.indexOf("rollo de 100 m");
    expect(Math.abs(izqU - (unidad.length - izqU - "rollo de 100 m".length))).toBeLessThanOrEqual(1);
    // La de una letra también: ya no arranca pegada al borde.
    const fila2 = textos.find((l) => l.trim().startsWith("2 ")) ?? "";
    const sola = fila2.slice(iniU, finU);
    const izqS = sola.indexOf("u");
    expect(izqS).toBeGreaterThan(0);
    expect(Math.abs(izqS - (sola.length - izqS - 1))).toBeLessThanOrEqual(1);
    // La cantidad va centrada en sus 13 lugares, encabezado incluido.
    const cant1 = fila1.slice(-13);
    const i4 = cant1.indexOf("4");
    expect(Math.abs(i4 - (cant1.length - i4 - 1))).toBeLessThanOrEqual(1);
    const enc = encabezadoDe(textos);
    expect(enc.slice(iniU, finU).trim()).toBe("UNIDAD");
    const hU = enc.slice(iniU, finU);
    expect(Math.abs(hU.indexOf("UNIDAD") - (hU.length - hU.indexOf("UNIDAD") - 6))).toBeLessThanOrEqual(1);
    // Y las filas ocupan el mismo ancho que el encabezado: nada se desarma
    // (sin recortar, porque lo centrado termina en espacios).
    expect(fila1.length).toBe(enc.length);
    expect(fila2.length).toBe(enc.length);
  });

  it("no imprime el resumen por unidad de la tabla, que es para el cliente", async () => {
    const { lineas } = await abrir(
      estudioCon([nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)]),
    );
    const texto = lineas.join("\n");
    // El total separado por unidad («250 u · 4 rollo») no va en el documento:
    // cada cantidad se lee en su fila, con su unidad.
    expect(texto).not.toContain("Total por unidad");
    // La tabla abre con su banda oscura de encabezado, sin rayas de guiones:
    // el encabezado con fondo es lo que la abre y la cierra a la vista.
    expect(lineas.filter((l) => /^-+$/.test(l.trim()))).toHaveLength(0);
    expect(lineas.some((l) => l.includes("MATERIAL") && l.includes("CANTIDAD"))).toBe(true);
    const paginas = paginasDelInforme(
      estudioCon([nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)]),
      [cable, fuente],
    );
    const bandas = paginas.flatMap((p) => p.rects).filter((r) => r.ancho > 400 && r.alto >= 14);
    expect(bandas.length).toBeGreaterThan(0);
    // Y tampoco va el conteo de materiales: el informe lista cada material
    // con su cantidad, sin resúmenes de compra.
    expect(texto).not.toContain("Materiales listados");
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

  it("el título va pegado a la primera foto, nunca huérfano al pie", () => {
    // Foto alta (400x1500) que no entra en lo que dejan las observaciones:
    // antes el título quedaba solo al pie y la foto arrancaba en la otra hoja.
    const alta =
      "data:image/jpeg;base64," +
      Buffer.from([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x05, 0xdc, 0x01, 0x90, 0x03, 0x01, 0x22,
        0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
      ]).toString("base64");
    const paginas = paginasDelInforme(
      estudioCon([nuevoItem(cable.id, 4)], {
        notas: "x ".repeat(100),
        fotos: [{ id: "f1", imagen: alta, comentario: "Panorámica", updatedAt: "" }],
      }),
      [cable, fuente],
    );
    const conTitulo = paginas.filter((p) => p.lineas.some((l) => l.texto.includes("Fotografías")));
    expect(conTitulo.length).toBeGreaterThan(0);
    for (const hoja of conTitulo) expect(hoja.imagenes.length).toBeGreaterThan(0);
  });

  it("sin logo la primera hoja no trae emblema, como antes", () => {
    const paginas = paginasDelInforme(estudioCon([nuevoItem(cable.id, 4)]), [cable, fuente]);
    expect(paginas[0].logo).toBeNull();
  });

  it("el logo sale arriba a la derecha de la franja", async () => {
    // JPEG de 451x443 (el tamaño real del logo): se achica al alto de 64.
    const logo =
      "data:image/jpeg;base64," +
      Buffer.from([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xbb, 0x01, 0xc3, 0x03, 0x01, 0x22,
        0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
      ]).toString("base64");
    const paginas = paginasDelInforme(estudioCon([nuevoItem(cable.id, 4)]), [cable, fuente], logo);
    const emblema = paginas[0].logo;
    expect(emblema).not.toBeNull();
    // Pegado al margen derecho (hoja de 595.28 con margen 42) y arriba.
    expect(Math.abs(emblema!.x + emblema!.ancho - 553.28)).toBeLessThan(0.01);
    expect(emblema!.y).toBeLessThan(841.89 - 10);
    expect(emblema!.alto).toBeLessThanOrEqual(64.01);
    expect(emblema!.url).toBe(logo);
    // Y va embebido en el archivo con su propio objeto de imagen.
    const conLogo = await textoDe(informePDF(estudioCon([nuevoItem(cable.id, 4)]), [cable, fuente], logo));
    expect(conLogo).toContain("/DCTDecode");
    expect(conLogo).toContain("/Im1 Do");
  });

  it("un logo roto se salta sin romper el informe", () => {
    const paginas = paginasDelInforme(estudioCon([nuevoItem(cable.id, 4)]), [cable, fuente], "rota");
    expect(paginas[0].logo).toBeNull();
    expect(paginas[0].lineas.some((l) => l.texto.includes("LISTA DE MATERIALES"))).toBe(true);
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
