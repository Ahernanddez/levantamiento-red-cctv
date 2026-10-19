/**
 * Generador de PDF del informe, sin dependencias.
 *
 * La aplicación se instala y funciona sin internet, así que el informe no puede
 * depender de un servicio externo. Y la salida del navegador —imprimir y elegir
 * «Guardar como PDF»— no permite separar «generar» de «guardar», ni mostrar el
 * archivo antes de bajarlo, que es justamente lo que se pidió.
 *
 * Solo se usan las fuentes que todo lector de PDF trae incorporadas (Courier,
 * Courier-Bold y Helvetica-Bold) con codificación WinAnsi, que cubre el
 * castellano: así el archivo no lleva ninguna fuente adentro y pesa pocos KB.
 *
 * La lista se arma en Courier a propósito: al medir siempre lo mismo por
 * carácter, las columnas quedan alineadas y el corte de línea es exacto, sin
 * tener que adivinar el ancho de cada letra.
 */
import { fechaCorta, numero } from "./format";
import { totalPorUnidad, unidadDe } from "./espacio";
import type { Estudio, ItemLista, Material } from "../types";

// --- Medidas de la página ---------------------------------------------------

/** A4 en puntos (72 por pulgada). */
const ANCHO_PAGINA = 595.28;
const ALTO_PAGINA = 841.89;
const MARGEN = 42;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;
const TAMANO = 9;
const INTERLINEA = 12;
/** En Courier cada carácter mide 0,6 em, así que el ancho se calcula exacto. */
const ANCHO_CARACTER = 0.6;
const CARACTERES = Math.floor(ANCHO_UTIL / (ANCHO_CARACTER * TAMANO));
/** Alto máximo de una fotografía en el informe, en puntos. */
const ALTO_FOTO = 340;

/**
 * Anchos fijos de la tabla, en caracteres. La columna de unidad no está acá:
 * se calcula con lo que necesite la unidad más larga de la lista, porque las
 * unidades del equipo («rollo de 100 m») no entran en el ancho de una palabra.
 */
const NUMERO_ANCHO = 4;
const HUECO = 2;
const CANTIDAD_ANCHO = 13;
/** Lo mínimo que ocupa la columna de unidad: entra el título «UNIDAD». */
const UNIDAD_MINIMA = 9;
/** Tope del ancho: más que esto le come demasiado lugar al nombre del material. */
const UNIDAD_MAXIMA = 22;

/**
 * Anchos de las columnas que se reparten el ancho útil de la tabla.
 *
 * El nombre del material se queda con lo que sobra: como se corta en varias
 * líneas, es el que mejor aguanta achicarse.
 */
export function anchosDeTabla(unidades: string[]): { material: number; unidad: number } {
  const masLarga = unidades.reduce((max, u) => Math.max(max, aLatin1(u).length), 0);
  const unidad = Math.min(Math.max(UNIDAD_MINIMA, masLarga), UNIDAD_MAXIMA);
  const material = CARACTERES - NUMERO_ANCHO - HUECO - 1 - unidad - 1 - CANTIDAD_ANCHO;
  return { material, unidad };
}

type Fuente = "F1" | "F2" | "F3";

// --- Texto ------------------------------------------------------------------

/**
 * Reemplazos de signos que WinAnsi no guarda donde los pone Unicode.
 *
 * El resto de los acentos y la eñe entran tal cual: están en las dos tablas.
 */
const EQUIVALENTES: Record<string, string> = {
  "\u2014": "-",
  "\u2013": "-",
  "\u201c": '"',
  "\u201d": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u2026": "...",
  "\u2022": "-",
  "\u00a0": " ",
};

/** Deja el texto en caracteres de un solo byte, que es como los guarda el PDF. */
export function aLatin1(texto: string): string {
  let salida = "";
  for (const caracter of texto) {
    for (const c of EQUIVALENTES[caracter] ?? caracter) {
      salida += (c.codePointAt(0) ?? 0) <= 0xff ? c : "?";
    }
  }
  return salida;
}

/** Dentro de una cadena de PDF, los paréntesis y la barra se escapan. */
function escapar(texto: string): string {
  return aLatin1(texto).replace(/([\\()])/g, "\\$1");
}

// --- Fotografías ------------------------------------------------------------

/**
 * Los bytes del JPEG que trae una data URL de foto.
 *
 * Devuelve null si no es un JPEG en base64: una foto rota no puede voltear el
 * informe, simplemente se salta.
 */
function bytesDeFoto(url: string): Uint8Array | null {
  const prefijo = "data:image/jpeg;base64,";
  if (!url.startsWith(prefijo)) return null;
  try {
    const crudo = atob(url.slice(prefijo.length));
    const bytes = new Uint8Array(crudo.length);
    for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i) & 0xff;
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Ancho y alto en píxeles de un JPEG, leídos de su marcador SOF.
 *
 * No se decodifica la imagen: solo se buscan los dos bytes que dicen cuánto
 * mide, para dibujarla con su proporción en el informe y en la vista previa.
 */
export function medidasDeFoto(url: string): { ancho: number; alto: number } | null {
  const bytes = bytesDeFoto(url);
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marca = bytes[i + 1];
    if (marca === 0xd9) return null;
    if (marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
      i += 2;
      continue;
    }
    const largo = (bytes[i + 2] << 8) | bytes[i + 3];
    if (largo < 2) return null;
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      if (i + 8 >= bytes.length) return null;
      const alto = (bytes[i + 5] << 8) | bytes[i + 6];
      const ancho = (bytes[i + 7] << 8) | bytes[i + 8];
      return ancho > 0 && alto > 0 ? { ancho, alto } : null;
    }
    i += 2 + largo;
  }
  return null;
}

/** Los bytes del JPEG como cadena de un byte por carácter, para el flujo PDF. */
function binarioDeFoto(bytes: Uint8Array): string {
  let salida = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    salida += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return salida;
}

function numeroPDF(valor: number): string {
  return (Number.isFinite(valor) ? valor : 0).toFixed(2);
}

/**
 * Corta el texto en líneas que entren en el ancho dado.
 *
 * Una palabra más larga que la columna se parte: antes cortada que saliéndose de
 * la hoja.
 */
export function envolver(texto: string, maximo: number): string[] {
  const salida: string[] = [];
  for (const parrafo of aLatin1(texto).split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/)) {
      if (!palabra) continue;
      if (palabra.length > maximo) {
        if (actual) {
          salida.push(actual);
          actual = "";
        }
        for (let i = 0; i < palabra.length; i += maximo) {
          const trozo = palabra.slice(i, i + maximo);
          if (trozo.length === maximo) salida.push(trozo);
          else actual = trozo;
        }
        continue;
      }
      if (!actual) {
        actual = palabra;
      } else if (actual.length + 1 + palabra.length <= maximo) {
        actual += ` ${palabra}`;
      } else {
        salida.push(actual);
        actual = palabra;
      }
    }
    salida.push(actual);
  }
  return salida;
}

/** Fecha en el formato que pide el PDF: D:20261016143000-03'00' */
function fechaPDF(fecha = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const minutos = -fecha.getTimezoneOffset();
  const signo = minutos >= 0 ? "+" : "-";
  return [
    "D:",
    fecha.getFullYear(),
    p(fecha.getMonth() + 1),
    p(fecha.getDate()),
    p(fecha.getHours()),
    p(fecha.getMinutes()),
    p(fecha.getSeconds()),
    signo,
    p(Math.floor(Math.abs(minutos) / 60)),
    "'",
    p(Math.abs(minutos) % 60),
    "'",
  ].join("");
}

// --- Armado del archivo -----------------------------------------------------

/**
 * Escribe el archivo llevando la cuenta de en qué byte empieza cada objeto: la
 * tabla final del PDF guarda esas posiciones, y con una sola mal el lector
 * rechaza el archivo entero.
 */
class Archivo {
  private trozos: string[] = [];
  private largo = 0;
  private desplazamientos: number[] = [];

  constructor() {
    // La segunda línea marca el archivo como binario, como pide la norma.
    this.escribir("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  }

  private escribir(texto: string): void {
    this.trozos.push(texto);
    this.largo += texto.length;
  }

  objeto(numero: number, cuerpo: string): void {
    this.desplazamientos[numero] = this.largo;
    this.escribir(`${numero} 0 obj\n${cuerpo}\nendobj\n`);
  }

  /** Cierra con la tabla de posiciones y devuelve el archivo listo. */
  cerrar(raiz: number, cuantos: number, info: number): Blob {
    const inicio = this.largo;
    let tabla = `xref\n0 ${cuantos}\n0000000000 65535 f \n`;
    for (let i = 1; i < cuantos; i += 1) {
      tabla += `${String(this.desplazamientos[i] ?? 0).padStart(10, "0")} 00000 n \n`;
    }
    this.escribir(tabla);
    this.escribir(
      `trailer\n<< /Size ${cuantos} /Root ${raiz} 0 R /Info ${info} 0 R >>\nstartxref\n${inicio}\n%%EOF\n`,
    );

    const texto = this.trozos.join("");
    // Un carácter por byte: por eso el largo del texto es el largo del archivo.
    const bytes = new Uint8Array(new ArrayBuffer(texto.length));
    for (let i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: "application/pdf" });
  }
}

/** Medidas de la hoja en puntos, para dibujar la vista previa igual. */
export const MEDIDAS_HOJA = { ancho: ANCHO_PAGINA, alto: ALTO_PAGINA } as const;

// --- Dibujo -----------------------------------------------------------------

/** Una línea ya ubicada dentro de la hoja: así se dibuja acá y en el PDF. */
export interface LineaPDF {
  texto: string;
  fuente: Fuente;
  tamano: number;
  x: number;
  y: number;
}

/**
 * Una imagen ya ubicada dentro de la hoja.
 *
 * La `y` es el borde de ARRIBA (de ahí cuelga la foto): el PDF dibuja desde
 * abajo, así que al escribir se descuenta el alto. La vista previa hace la
 * misma cuenta al revés y muestra la misma página.
 */
export interface ImagenPDF {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** La data URL, para dibujarla en la vista previa. */
  url: string;
  /** Los bytes del JPEG, para el archivo. */
  binario: string;
  anchoPx: number;
  altoPx: number;
}

/** Una hoja del informe con todo lo que lleva dibujado. */
export interface HojaPDF {
  lineas: LineaPDF[];
  imagenes: ImagenPDF[];
}



/** Lleva las líneas de cada página y baja el cursor, abriendo página si hace falta. */
class Documento {
  private hojas: LineaPDF[][] = [[]];
  private dibujos: ImagenPDF[][] = [[]];
  private y = ALTO_PAGINA - MARGEN;

  get paginas(): LineaPDF[][] {
    return this.hojas;
  }

  /** Las hojas con su texto y sus fotos, para el archivo y la vista previa. */
  get hojasCompletas(): HojaPDF[] {
    return this.hojas.map((lineas, i) => ({ lineas, imagenes: this.dibujos[i] ?? [] }));
  }

  private get hoja(): LineaPDF[] {
    return this.hojas[this.hojas.length - 1];
  }

  /** ¿Entra un bloque de esta altura en lo que queda de la página? */
  entra(alto: number): boolean {
    return this.y - alto >= MARGEN;
  }

  nuevaPagina(): void {
    this.hojas.push([]);
    this.dibujos.push([]);
    this.y = ALTO_PAGINA - MARGEN;
  }

  private escribir(
    texto: string,
    fuente: Fuente,
    tamano: number,
    x: number,
    interlinea: number,
  ): void {
    if (!this.entra(interlinea)) this.nuevaPagina();
    this.hoja.push({ texto, fuente, tamano, x, y: this.y });
    this.y -= interlinea;
  }

  linea(
    texto: string,
    opciones: { fuente?: Fuente; tamano?: number; x?: number; interlinea?: number } = {},
  ): void {
    this.escribir(
      texto,
      opciones.fuente ?? "F1",
      opciones.tamano ?? TAMANO,
      opciones.x ?? MARGEN,
      opciones.interlinea ?? INTERLINEA,
    );
  }

  /** Párrafo que se corta solo en varias líneas. */
  parrafo(
    texto: string,
    opciones: { fuente?: Fuente; tamano?: number; x?: number } = {},
  ): void {
    const x = opciones.x ?? MARGEN;
    const maximo = Math.floor((ANCHO_PAGINA - MARGEN - x) / (ANCHO_CARACTER * (opciones.tamano ?? TAMANO)));
    for (const parte of envolver(texto, maximo)) {
      this.linea(parte, { ...opciones, x });
    }
  }

  /** Título de sección, con aire arriba y abajo. */
  titulo(texto: string, opciones: { tamano?: number; fuente?: Fuente } = {}): void {
    this.linea(texto, {
      fuente: opciones.fuente ?? "F2",
      tamano: opciones.tamano ?? 10,
      interlinea: (opciones.tamano ?? 10) + 7,
    });
  }

  espacio(alto: number): void {
    this.y -= alto;
  }

  /**
   * Fila de la tabla.
   *
   * El material y la unidad se cortan cada uno en tantas líneas como necesiten,
   * y la fila ocupa las que pida el más largo: así una unidad del equipo se lee
   * entera en vez de quedar cortada, y las columnas siguen alineadas porque los
   * dos se dibujan con el ancho que les toca.
   */
  fila(
    datos: {
      numero?: string;
      material: string;
      unidad: string;
      cantidad: string;
      encabezado?: boolean;
    },
    anchos: { material: number; unidad: number },
  ): void {
    const fuente: Fuente = datos.encabezado ? "F2" : "F1";
    const lineasMaterial = envolver(datos.material, anchos.material);
    const lineasUnidad = envolver(datos.unidad, anchos.unidad);
    const renglones = Math.max(lineasMaterial.length, lineasUnidad.length);

    // Si no entra, se abre página y se repite el encabezado: una lista cortada
    // sin títulos de columna no se entiende.
    if (!this.entra(renglones * INTERLINEA)) {
      this.nuevaPagina();
      this.fila(ENCABEZADO_TABLA, anchos);
      this.linea(separador());
    }

    for (let i = 0; i < renglones; i += 1) {
      const primera = i === 0;
      const texto =
        (primera ? (datos.numero ?? "").padStart(NUMERO_ANCHO) : " ".repeat(NUMERO_ANCHO)) +
        " ".repeat(HUECO) +
        (lineasMaterial[i] ?? "").padEnd(anchos.material) +
        " " +
        (lineasUnidad[i] ?? "").padEnd(anchos.unidad) +
        " " +
        (primera
          ? datos.cantidad.slice(0, CANTIDAD_ANCHO).padStart(CANTIDAD_ANCHO)
          : " ".repeat(CANTIDAD_ANCHO));
      this.escribir(texto, fuente, TAMANO, MARGEN, INTERLINEA);
    }
  }

  /** Escribe al pie de una página concreta (se usa para numerarlas al final). */
  pie(pagina: number, texto: string): void {
    this.hojas[pagina].push({ texto, fuente: "F1", tamano: 8, x: MARGEN, y: MARGEN });
  }

  /**
   * Una fotografía con su epígrafe.
   *
   * La foto se dibuja con su proporción, sin pasar el ancho útil ni el alto
   * máximo; si el bloque no entra, se abre página. Devuelve false cuando la
   * imagen no sirve, y esa foto se salta en vez de romper el informe.
   */
  foto(url: string, epigrafe: string, comentario: string): boolean {
    const bytes = bytesDeFoto(url);
    const medidas = bytes ? medidasDeFoto(url) : null;
    if (!bytes || !medidas) return false;
    const escala = Math.min(1, ANCHO_UTIL / medidas.ancho, ALTO_FOTO / medidas.alto);
    const ancho = Math.max(1, medidas.ancho * escala);
    const alto = Math.max(1, medidas.alto * escala);
    const texto = epigrafe + (comentario.trim() ? ` — ${comentario.trim()}` : "");
    const renglones = envolver(texto, CARACTERES).length;
    const bloque = alto + 8 + renglones * INTERLINEA + 10;
    if (!this.entra(bloque)) this.nuevaPagina();
    this.dibujos[this.dibujos.length - 1].push({
      x: MARGEN,
      y: this.y,
      ancho,
      alto,
      url,
      binario: binarioDeFoto(bytes),
      anchoPx: medidas.ancho,
      altoPx: medidas.alto,
    });
    this.y -= alto + 8;
    this.parrafo(texto);
    this.espacio(10);
    return true;
  }
}

function contenidoDe(lineas: LineaPDF[], imagenes: ImagenPDF[], base: number): string {
  const partes = ["BT\n"];
  for (const linea of lineas) {
    partes.push(`/${linea.fuente} ${linea.tamano} Tf\n`);
    partes.push(`1 0 0 1 ${numeroPDF(linea.x)} ${numeroPDF(linea.y)} Tm\n`);
    partes.push(`(${escapar(linea.texto)}) Tj\n`);
  }
  partes.push("ET");
  // Cada foto se dibuja escalada en su lugar: la y guardada es el borde de
  // arriba y el PDF dibuja desde abajo, así que se descuenta el alto.
  imagenes.forEach((img, k) => {
    partes.push(
      `\nq ${numeroPDF(img.ancho)} 0 0 ${numeroPDF(img.alto)} ` +
        `${numeroPDF(img.x)} ${numeroPDF(img.y - img.alto)} cm\n/Im${base + k} Do\nQ`,
    );
  });
  return partes.join("");
}

// --- El informe -------------------------------------------------------------

/** Filas de la lista, con el nombre del material y su unidad ya resueltos. */
function filasDe(items: ItemLista[], porId: Map<string, Material>) {
  return items.map((item, i) => {
    const material = porId.get(item.materialId);
    return {
      numero: String(i + 1),
      material: material?.nombre ?? "(material no disponible)",
      unidad: unidadDe(item, material),
      cantidad: numero(item.cantidad, item.cantidad % 1 === 0 ? 0 : 2),
    };
  });
}

/** Un guion por carácter de ancho: la línea cruza justo la tabla. */
function separador(): string {
  return "-".repeat(CARACTERES);
}

/** Los totales por unidad en una sola frase: «4 caja · 250 pieza». */
function enTexto(totales: { unidad: string; total: number }[]): string {
  if (totales.length === 0) return "sin cantidades";
  return totales
    .map((t) => `${numero(t.total, t.total % 1 === 0 ? 0 : 2)} ${t.unidad}`)
    .join(" · ");
}

const ENCABEZADO_TABLA = {
  numero: "#",
  material: "MATERIAL",
  unidad: "UNIDAD",
  cantidad: "CANTIDAD",
  encabezado: true,
};

/**
 * Las hojas del informe ya dibujadas.
 *
 * Lo usan el archivo PDF y la vista previa: son las mismas líneas en las mismas
 * posiciones, así que lo que se ve en pantalla es lo que sale en el papel.
 */
export function paginasDelInforme(estudio: Estudio, catalogo: Material[]): HojaPDF[] {
  const porId = new Map(catalogo.map((m) => [m.id, m] as const));
  const doc = new Documento();

  doc.linea("LISTA DE MATERIALES", { fuente: "F3", tamano: 16, interlinea: 22 });
  doc.titulo(estudio.nombre || "Estudio sin nombre", { tamano: 11 });
  doc.linea("Instalaciones de red y sistemas de CCTV", { tamano: 9 });
  doc.espacio(12);

  doc.titulo("1. Datos generales");
  const datos: [string, string][] = [
    ["Cliente", estudio.cliente],
    ["Sitio", estudio.sitio],
    ["Ciudad", estudio.ciudad],
    ["Fecha del estudio", fechaCorta(estudio.fecha)],
    ["Estudio realizado por", estudio.realizo],
    ["Materiales listados", `${estudio.items.length} (${enTexto(totalPorUnidad(estudio.items, porId))})`],
  ];
  for (const [etiqueta, valor] of datos) {
    doc.parrafo(`${etiqueta}: ${valor || "—"}`);
  }
  doc.espacio(14);

  doc.titulo("2. Lista de materiales");
  if (estudio.items.length === 0) {
    doc.linea("Todavía no se agregaron materiales.");
  } else {
    const filas = filasDe(estudio.items, porId);
    // El ancho de la columna de unidad sale de la lista: si el equipo usa
    // «rollo de 100 m», la tabla le hace lugar en vez de cortarla.
    const anchos = anchosDeTabla([ENCABEZADO_TABLA.unidad, ...filas.map((f) => f.unidad)]);
    doc.fila(ENCABEZADO_TABLA, anchos);
    doc.linea(separador());
    for (const fila of filas) doc.fila(fila, anchos);
    // La tabla cierra con la raya. El resumen por unidad no va: este informe se
    // entrega al cliente y el total separado por unidad de medida («120 m ·
    // 30 pieza») se lee como un dato de compra que no es. En la aplicación sí
    // está, que es donde sirve para revisar el trabajo antes de pasarlo.
    doc.linea(separador());
  }

  if (estudio.notas.trim()) {
    doc.espacio(14);
    doc.titulo("3. Observaciones");
    doc.parrafo(estudio.notas);
  }

  const validas = (estudio.fotos ?? []).filter((f) => medidasDeFoto(f.imagen) !== null);
  if (validas.length > 0) {
    doc.espacio(14);
    doc.titulo(`${estudio.notas.trim() ? 4 : 3}. Fotografías`);
    validas.forEach((f, i) => {
      doc.foto(f.imagen, `Fotografía ${i + 1}`, f.comentario);
    });
  }

  doc.espacio(26);
  const segunda = MARGEN + 265;
  doc.linea("Estudio realizado por", { x: MARGEN });
  doc.linea("Cliente / conformidad", { x: segunda });
  doc.linea(" ", { x: MARGEN });
  doc.linea("_".repeat(34), { x: MARGEN });
  doc.linea("_".repeat(34), { x: segunda });
  doc.linea(estudio.realizo || " ", { x: MARGEN });
  doc.linea(estudio.cliente || " ", { x: segunda });

  doc.espacio(18);
  doc.parrafo(
    `Documento generado el ${fechaCorta(estudio.fecha)}. Las cantidades son las definidas en el ` +
      "estudio y deben confirmarse contra el recorrido real antes de comprar.",
  );

  // Numeración al final, cuando ya se sabe cuántas páginas hay.
  const cuantas = doc.paginas.length;
  for (let i = 0; i < cuantas; i += 1) {
    doc.pie(i, `Página ${i + 1} de ${cuantas}`);
  }

  return doc.hojasCompletas;
}

/**
 * Arma el archivo a partir de las hojas ya dibujadas.
 *
 * Va aparte de paginasDelInforme para que la vista previa dibuje exactamente
 * las mismas hojas: si cada una armara su propio documento, tarde o temprano la
 * pantalla mostraría algo distinto que el archivo.
 */
function armarArchivo(paginas: HojaPDF[], titulo: string): Blob {
  const cuantas = paginas.length;
  const archivo = new Archivo();

  // Los números se reparten en orden: cada foto suma un objeto, así que no se
  // pueden calcular de antemano como cuando solo había texto.
  let siguiente = 7;
  const numerosDePagina: number[] = [];
  const numeros: { contenido: number; pagina: number; imagenes: number[] }[] = [];
  for (const hoja of paginas) {
    const contenido = siguiente++;
    const pagina = siguiente++;
    const imagenes = hoja.imagenes.map(() => siguiente++);
    numeros.push({ contenido, pagina, imagenes });
    numerosDePagina.push(pagina);
  }

  archivo.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
  archivo.objeto(
    2,
    `<< /Type /Pages /Kids [${numerosDePagina.map((n) => `${n} 0 R`).join(" ")}] /Count ${cuantas} >>`,
  );
  archivo.objeto(
    3,
    `<< /Title (${escapar(titulo)}) /Producer (${escapar(
      "Levantamiento de red y CCTV",
    )}) /CreationDate (${fechaPDF()}) >>`,
  );
  archivo.objeto(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  archivo.objeto(
    5,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
  );
  archivo.objeto(
    6,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  paginas.forEach((hoja, i) => {
    const c = numeros[i];
    // El JPEG va tal cual: el lector lo decodifica con DCTDecode.
    hoja.imagenes.forEach((img, k) => {
      archivo.objeto(
        c.imagenes[k],
        `<< /Type /XObject /Subtype /Image /Width ${img.anchoPx} /Height ${img.altoPx} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
          `/Length ${img.binario.length} >>\nstream\n${img.binario}\nendstream`,
      );
    });
    const recursos = ["/Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>"];
    if (c.imagenes.length > 0) {
      recursos.push(
        `/XObject << ${hoja.imagenes.map((_, k) => `/Im${k + 1} ${c.imagenes[k]} 0 R`).join(" ")} >>`,
      );
    }
    const contenido = contenidoDe(hoja.lineas, hoja.imagenes, 1);
    archivo.objeto(c.contenido, `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
    archivo.objeto(
      c.pagina,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${numeroPDF(ANCHO_PAGINA)} ${numeroPDF(ALTO_PAGINA)}] ` +
        `/Resources << ${recursos.join(" ")} >> /Contents ${c.contenido} 0 R >>`,
    );
  });

  return archivo.cerrar(1, siguiente, 3);
}

/**
 * El informe completo de un estudio, como archivo PDF listo para bajar.
 *
 * Lleva lo mismo que el informe que se imprime desde la aplicación: los datos
 * del estudio, la lista con su unidad elegida y las observaciones.
 */
export function informePDF(estudio: Estudio, catalogo: Material[]): Blob {
  return armarArchivo(paginasDelInforme(estudio, catalogo), estudio.nombre || "Lista de materiales");
}
