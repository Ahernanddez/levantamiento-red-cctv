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
import { unidadDe } from "./espacio";
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

/**
 * Tamaño dibujado y bloque que ocupa una foto con su epígrafe.
 *
 * Devuelve null si la imagen no sirve: esa foto se salta en vez de romper el
 * informe. Lo usan tanto el dibujo como la cuenta previa que evita dejar el
 * título de la sección huérfano al pie de la página.
 */
function dibujoDeFoto(
  url: string,
  epigrafe: string,
  comentario: string,
): { ancho: number; alto: number; bloque: number } | null {
  const medidas = medidasDeFoto(url);
  if (!medidas) return null;
  const escala = Math.min(1, ANCHO_UTIL / medidas.ancho, ALTO_FOTO / medidas.alto);
  const ancho = Math.max(1, medidas.ancho * escala);
  const alto = Math.max(1, medidas.alto * escala);
  const texto = epigrafe + (comentario.trim() ? ` — ${comentario.trim()}` : "");
  const renglones = envolver(texto, CARACTERES).length;
  return { ancho, alto, bloque: alto + 8 + renglones * INTERLINEA + 10 };
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

/** Color RGB en rango 0–1, para texto y fondos del informe. */
export type ColorPDF = [number, number, number];

/** Paleta del informe: azul petróleo de acento, tinta y grises. */
export const COLOR_TINTA: ColorPDF = [0.06, 0.09, 0.16];
export const COLOR_TENUE: ColorPDF = [0.39, 0.45, 0.55];
export const COLOR_ACENTO: ColorPDF = [0.05, 0.45, 0.56];
export const COLOR_ACENTO_OSCURO: ColorPDF = [0.05, 0.29, 0.43];
export const COLOR_FONDO: ColorPDF = [0.97, 0.98, 0.99];
export const COLOR_BLANCO: ColorPDF = [1, 1, 1];
/** Gris de la rejilla de la tabla: se lee sobre blanco y sobre la banda oscura. */
export const COLOR_REJILLA: ColorPDF = [0.62, 0.68, 0.75];

function colorPDF(c: ColorPDF): string {
  const f = (n: number) => (Math.min(1, Math.max(0, n)) === 1 ? "1" : Number(Math.min(1, Math.max(0, n)).toFixed(3)).toString());
  return `${f(c[0])} ${f(c[1])} ${f(c[2])}`;
}

/** Una línea ya ubicada dentro de la hoja: así se dibuja acá y en el PDF. */
export interface LineaPDF {
  texto: string;
  fuente: Fuente;
  tamano: number;
  x: number;
  y: number;
  /** Color del texto; si falta, tinta. */
  color?: ColorPDF;
}

/**
 * Un rectángulo de fondo ya ubicado dentro de la hoja.
 *
 * La `y` es el borde de ARRIBA, igual que en las fotos: al escribir el PDF se
 * descuenta el alto porque dibuja desde abajo, y la vista previa hace la
 * misma cuenta al revés.
 */
export interface RectPDF {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  color: ColorPDF;
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
  rects: RectPDF[];
}



/** Lleva las líneas de cada página y baja el cursor, abriendo página si hace falta. */
class Documento {
  private hojas: LineaPDF[][] = [[]];
  private dibujos: ImagenPDF[][] = [[]];
  private fondos: RectPDF[][] = [[]];
  private y = ALTO_PAGINA - MARGEN;

  get paginas(): LineaPDF[][] {
    return this.hojas;
  }

  /** Las hojas con su texto, fondos y fotos, para el archivo y la vista previa. */
  get hojasCompletas(): HojaPDF[] {
    return this.hojas.map((lineas, i) => ({
      lineas,
      imagenes: this.dibujos[i] ?? [],
      rects: this.fondos[i] ?? [],
    }));
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
    this.fondos.push([]);
    this.y = ALTO_PAGINA - MARGEN;
  }

  /** Un rectángulo de fondo en la página actual (la `y` es el borde de arriba). */
  rect(x: number, y: number, ancho: number, alto: number, color: ColorPDF): void {
    this.fondos[this.fondos.length - 1].push({ x, y, ancho, alto, color });
  }

  private escribir(
    texto: string,
    fuente: Fuente,
    tamano: number,
    x: number,
    interlinea: number,
    color?: ColorPDF,
  ): void {
    if (!this.entra(interlinea)) this.nuevaPagina();
    this.hoja.push({ texto, fuente, tamano, x, y: this.y, ...(color ? { color } : {}) });
    this.y -= interlinea;
  }

  linea(
    texto: string,
    opciones: { fuente?: Fuente; tamano?: number; x?: number; interlinea?: number; color?: ColorPDF } = {},
  ): void {
    this.escribir(
      texto,
      opciones.fuente ?? "F1",
      opciones.tamano ?? TAMANO,
      opciones.x ?? MARGEN,
      opciones.interlinea ?? INTERLINEA,
      opciones.color,
    );
  }

  /** Párrafo que se corta solo en varias líneas. */
  parrafo(
    texto: string,
    opciones: { fuente?: Fuente; tamano?: number; x?: number; color?: ColorPDF } = {},
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
      color: COLOR_TINTA,
    });
  }

  /**
   * Franja superior del informe: fondo azul petróleo a sangre con el título
   * en blanco y los datos clave del estudio.
   *
   * Se dibuja una sola vez, al abrir la primera página.
   */
  franja(titulo: string, estudio: string, meta: string, subtitulo: string): void {
    // Alto de sobra para las cinco líneas: si el subtítulo cae sobre el
    // filete de abajo, los dos se leen encimados.
    const alto = 118;
    // El fondo cubre hasta el borde de arriba (a sangre).
    this.rect(0, ALTO_PAGINA, ANCHO_PAGINA, alto, COLOR_ACENTO_OSCURO);
    // Filete de acento al pie de la franja.
    this.rect(0, ALTO_PAGINA - alto, ANCHO_PAGINA, 5, COLOR_ACENTO);
    this.linea("LEVANTAMIENTO - RED Y CCTV", {
      fuente: "F3",
      tamano: 8,
      interlinea: 15,
      color: COLOR_BLANCO,
    });
    this.linea(titulo, { fuente: "F3", tamano: 20, interlinea: 26, color: COLOR_BLANCO });
    this.linea(estudio, { fuente: "F3", tamano: 10, interlinea: 15, color: COLOR_BLANCO });
    this.linea(meta, { tamano: 8, interlinea: 12, color: COLOR_BLANCO });
    this.linea(subtitulo, { tamano: 8, interlinea: 12, color: COLOR_BLANCO });
    this.y -= 10;
  }

  /**
   * Tarjeta clara con filete de acento detrás del próximo bloque.
   *
   * Si el bloque no entra, abre página primero para no cortarla a la mitad.
   */
  tarjeta(alto: number): void {
    if (!this.entra(alto)) this.nuevaPagina();
    this.rect(MARGEN, this.y, ANCHO_UTIL, alto, COLOR_FONDO);
    this.rect(MARGEN, this.y, 3, alto, COLOR_ACENTO);
  }

  /**
   * Título de sección moderno: pastilla con el número, título y filete.
   *
   * El renglón del título lleva el texto completo («1. Datos generales»):
   * es lo que buscan las pruebas y lo que lee el lector de PDF.
   */
  seccion(numero: string, titulo: string): void {
    const alto = 20;
    if (!this.entra(alto + 8)) this.nuevaPagina();
    const y = this.y;
    // Pastilla del número, con el dígito entero adentro: la base va 10
    // puntos bajo el borde de arriba para que los ascendentes no asomen por
    // encima de la pastilla ni se monten con lo que viene antes.
    this.rect(MARGEN, y, 24, 15, COLOR_ACENTO);
    this.hoja.push({ texto: numero, fuente: "F3", tamano: 10, x: MARGEN + 8.4, y: y - 10, color: COLOR_BLANCO });
    // Título en la misma base y filete de acento debajo, con aire para los
    // descendentes (la «g» de «generales» no lo puede tocar).
    this.hoja.push({
      texto: `${numero}. ${titulo}`,
      fuente: "F3",
      tamano: 11,
      x: MARGEN + 30,
      y: y - 10,
      color: COLOR_TINTA,
    });
    this.rect(MARGEN + 30, y - 14, ANCHO_UTIL - 30, 1.6, COLOR_ACENTO);
    this.y -= alto + 4;
  }

  /**
   * Línea centrada en el ancho útil (para epígrafes de fotos).
   *
   * En Courier cada letra mide lo mismo, así que el centro sale exacto sin
   * adivinar anchos: se descuenta la mitad de lo que ocupa el renglón.
   */
  centrar(texto: string, opciones: { fuente?: Fuente; tamano?: number } = {}): void {
    const tamano = opciones.tamano ?? TAMANO;
    const maximo = Math.floor(ANCHO_UTIL / (ANCHO_CARACTER * tamano));
    for (const parte of envolver(texto, maximo)) {
      const x = MARGEN + (ANCHO_UTIL - parte.length * ANCHO_CARACTER * tamano) / 2;
      this.linea(parte, { fuente: opciones.fuente, tamano, x });
    }
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
    // sin títulos de columna no se entiende. El encabezado ocupa 12 puntos
    // más por el aire de su banda.
    if (!this.entra(renglones * INTERLINEA + (datos.encabezado ? 12 : 0))) {
      this.nuevaPagina();
      this.fila(ENCABEZADO_TABLA, anchos);
    }

    // La tabla se dibuja como tal: banda oscura para el encabezado y rejilla
    // de bordes para cada fila, con las columnas en los mismos anchos que el
    // texto para que cada dato caiga dentro de su celda.
    const CW = ANCHO_CARACTER * TAMANO;
    const izq = MARGEN;
    const xMat = MARGEN + (NUMERO_ANCHO + HUECO) * CW;
    const xUni = xMat + (anchos.material + 1) * CW;
    const xCant = xUni + (anchos.unidad + 1) * CW;
    const der = xCant + CANTIDAD_ANCHO * CW;
    const anchoTabla = der - izq;
    const bordes = [izq, xMat, xUni, xCant, der];
    const TRAZO = 0.8;
    // El encabezado va sobre fondo oscuro con texto blanco. La banda deja
    // aire sobre los ascendentes y por debajo: sin ese aire, la fila de abajo
    // se le metía encima y las dos se leían superpuestas.
    if (datos.encabezado) {
      this.rect(MARGEN, this.y + 7, anchoTabla, renglones * INTERLINEA + 12, COLOR_ACENTO_OSCURO);
    }

    for (let i = 0; i < renglones; i += 1) {
      const primera = i === 0;
      const texto =
        (primera ? (datos.numero ?? "").padStart(NUMERO_ANCHO) : " ".repeat(NUMERO_ANCHO)) +
        " ".repeat(HUECO) +
        (lineasMaterial[i] ?? "").padEnd(anchos.material) +
        " " +
        // Unidad y cantidad van centradas en su columna, encabezado incluido.
        centrado(lineasUnidad[i] ?? "", anchos.unidad) +
        " " +
        (primera ? centrado(datos.cantidad.slice(0, CANTIDAD_ANCHO), CANTIDAD_ANCHO) : " ".repeat(CANTIDAD_ANCHO));
      this.escribir(texto, fuente, TAMANO, MARGEN, INTERLINEA, datos.encabezado ? COLOR_BLANCO : undefined);
    }
    if (datos.encabezado) {
      // Banda completa: regla arriba y abajo, y verticales que bajan dos
      // puntos más allá de la banda para empalmar con la primera fila.
      const bandaAbajo = this.y - 5;
      this.rect(izq, this.y + renglones * INTERLINEA + 7, anchoTabla, TRAZO, COLOR_REJILLA);
      this.rect(izq, bandaAbajo + TRAZO, anchoTabla, TRAZO, COLOR_REJILLA);
      for (const x of bordes) {
        const arriba = this.y + renglones * INTERLINEA + 7;
        this.rect(x - TRAZO / 2, arriba, TRAZO, arriba - (bandaAbajo - 2), COLOR_REJILLA);
      }
      this.y -= 12;
    } else {
      // Cada fila cierra con su regla y sus verticales, que empalman justo
      // con la fila siguiente para que la rejilla no tenga cortes.
      const abajo = this.y + 6;
      this.rect(izq, abajo + TRAZO, anchoTabla, TRAZO, COLOR_REJILLA);
      for (const x of bordes) {
        const arriba = this.y + renglones * INTERLINEA + 6;
        this.rect(x - TRAZO / 2, arriba, TRAZO, arriba - abajo, COLOR_REJILLA);
      }
    }
  }

  /** Escribe al pie de una página concreta (se usa para numerarlas al final). */
  pie(pagina: number, texto: string): void {
    const x = MARGEN + (ANCHO_UTIL - texto.length * ANCHO_CARACTER * 8) / 2;
    this.hojas[pagina].push({ texto, fuente: "F1", tamano: 8, x, y: MARGEN, color: COLOR_TENUE });
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
    const dibujo = bytes ? dibujoDeFoto(url, epigrafe, comentario) : null;
    const medidas = bytes ? medidasDeFoto(url) : null;
    if (!bytes || !dibujo || !medidas) return false;
    const { ancho, alto, bloque } = dibujo;
    const texto = epigrafe + (comentario.trim() ? ` — ${comentario.trim()}` : "");
    if (!this.entra(bloque)) this.nuevaPagina();
    // Tarjeta clara detrás de la foto y su epígrafe.
    this.rect(MARGEN, this.y, ANCHO_UTIL, bloque, COLOR_FONDO);
    this.rect(MARGEN, this.y, 3, bloque, COLOR_ACENTO);
    this.dibujos[this.dibujos.length - 1].push({
      // Centrada en el ancho útil, como su epígrafe.
      x: MARGEN + (ANCHO_UTIL - ancho) / 2,
      y: this.y,
      ancho,
      alto,
      url,
      binario: binarioDeFoto(bytes),
      anchoPx: medidas.ancho,
      altoPx: medidas.alto,
    });
    this.y -= alto + 8;
    this.centrar(texto);
    this.espacio(10);
    return true;
  }
}

function contenidoDe(lineas: LineaPDF[], imagenes: ImagenPDF[], rects: RectPDF[], base: number): string {
  const partes: string[] = [];
  // Fondos primero: el texto y las fotos van encima.
  for (const r of rects) {
    partes.push(
      `${colorPDF(r.color)} rg\n${numeroPDF(r.x)} ${numeroPDF(r.y - r.alto)} ` +
        `${numeroPDF(r.ancho)} ${numeroPDF(r.alto)} re f\n`,
    );
  }
  partes.push("BT\n");
  for (const linea of lineas) {
    partes.push(`${colorPDF(linea.color ?? COLOR_TINTA)} rg\n`);
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

/**
 * Texto centrado en un ancho fijo, para las columnas de unidad y cantidad.
 *
 * En Courier cada letra mide lo mismo, así que centrar es repartir los
 * espacios: si sobra un lugar impar, va uno más a la derecha.
 */
export function centrado(texto: string, ancho: number): string {
  const sobra = Math.max(0, ancho - texto.length);
  const izq = Math.floor(sobra / 2);
  return " ".repeat(izq) + texto + " ".repeat(sobra - izq);
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

  doc.franja(
    "LISTA DE MATERIALES",
    estudio.nombre || "Estudio sin nombre",
    `${fechaCorta(estudio.fecha)}  ·  ${estudio.cliente || "—"}`,
    "Instalaciones de red y sistemas de CCTV",
  );
  doc.espacio(12);

  doc.seccion("1", "Datos generales");
  const datos: [string, string][] = [
    ["Cliente", estudio.cliente],
    ["Sitio", estudio.sitio],
    ["Ciudad", estudio.ciudad],
    ["Fecha del estudio", fechaCorta(estudio.fecha)],
    ["Estudio realizado por", estudio.realizo],
  ];
  // Tarjeta clara con filete de acento detrás de los datos. El texto arranca
  // a la derecha del filete: si empieza en el mismo borde, la primera letra
  // queda montada sobre la barra y se lee encimada.
  doc.tarjeta(datos.length * INTERLINEA + 12);
  doc.espacio(6);
  for (const [etiqueta, valor] of datos) {
    doc.parrafo(`${etiqueta}: ${valor || "—"}`, { x: MARGEN + 8 });
  }
  doc.espacio(6 + 14);

  doc.seccion("2", "Lista de materiales");
  if (estudio.items.length === 0) {
    doc.linea("Todavía no se agregaron materiales.");
  } else {
    const filas = filasDe(estudio.items, porId);
    // El ancho de la columna de unidad sale de la lista: si el equipo usa
    // «rollo de 100 m», la tabla le hace lugar en vez de cortarla.
    const anchos = anchosDeTabla([ENCABEZADO_TABLA.unidad, ...filas.map((f) => f.unidad)]);
    doc.fila(ENCABEZADO_TABLA, anchos);
    for (const fila of filas) doc.fila(fila, anchos);
    // El resumen por unidad no va: este informe se entrega al cliente y el
    // total separado por unidad de medida («120 m · 30 pieza») se lee como un
    // dato de compra que no es. En la aplicación sí está, que es donde sirve
    // para revisar el trabajo antes de pasarlo.
    doc.espacio(4);
  }

  if (estudio.notas.trim()) {
    doc.espacio(14);
    doc.seccion("3", "Observaciones");
    doc.parrafo(estudio.notas);
  }

  const validas = (estudio.fotos ?? []).filter((f) => medidasDeFoto(f.imagen) !== null);
  if (validas.length > 0) {
    doc.espacio(14);
    // El título va pegado a la primera foto: si no entran juntos en lo que
    // queda, se abre página antes del título para no dejarlo huérfano al pie
    // mientras la foto arranca en la siguiente.
    const primero = dibujoDeFoto(validas[0].imagen, "Fotografía 1", validas[0].comentario);
    if (primero && !doc.entra(28 + primero.bloque)) doc.nuevaPagina();
    const nFoto = estudio.notas.trim() ? "4" : "3";
    doc.seccion(nFoto, "Fotografías");
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
    const contenido = contenidoDe(hoja.lineas, hoja.imagenes, hoja.rects ?? [], 1);
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
