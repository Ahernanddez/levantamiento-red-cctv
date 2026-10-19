/**
 * Genera los iconos de la aplicación (public/iconos/*.png).
 *
 * Uso:
 *   node scripts/generar-iconos.mjs
 *
 * Escribe PNG a mano con zlib en lugar de sumar una dependencia de dibujo:
 * son cuatro imágenes simples y así el proyecto no crece por esto.
 *
 * El glifo es una lista: tres renglones con su viñeta. Se dibuja cuatro veces
 * más grande y luego se reduce, que es lo que le da los bordes suaves.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = join(aqui, "..", "public", "iconos");

// --- Codificación PNG -------------------------------------------------------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos) {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

function aPNG(ancho, alto, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // 10, 11 y 12 quedan en cero: deflate, filtro adaptativo, sin entrelazado.

  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y += 1) {
    const base = y * (ancho * 4 + 1);
    filas[base] = 0; // filtro «none»
    rgba.copy(filas, base + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// --- Dibujo -----------------------------------------------------------------

const AZUL_ARRIBA = [59, 130, 246]; // #3b82f6
const AZUL_ABAJO = [29, 78, 216]; // #1d4ed8
const BLANCO = [255, 255, 255];
const MARGEN = 4; // factor de supermuestreo

class Lienzo {
  constructor(lado) {
    this.lado = lado;
    this.px = new Uint8Array(lado * lado * 4);
  }

  pintar(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= this.lado || y >= this.lado) return;
    const i = (y * this.lado + x) * 4;
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
    this.px[i + 3] = 255;
  }

  /** Degradado vertical de fondo, sin transparencia. */
  fondo(radio, opacoArriba, opacoAbajo) {
    for (let y = 0; y < this.lado; y += 1) {
      const t = y / (this.lado - 1);
      const color = [0, 1, 2].map((i) => Math.round(opacoArriba[i] + (opacoAbajo[i] - opacoArriba[i]) * t));
      for (let x = 0; x < this.lado; x += 1) {
        if (radio > 0 && !dentroDeRedondeado(x, y, 0, 0, this.lado, this.lado, radio)) continue;
        this.pintar(x, y, color);
      }
    }
  }

  rectRedondeado(x0, y0, x1, y1, radio, color) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
        if (dentroDeRedondeado(x, y, x0, y0, x1, y1, radio)) this.pintar(x, y, color);
      }
    }
  }

  circulo(cx, cy, r, color) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.pintar(x, y, color);
      }
    }
  }

  /** Reduce por promedio de bloques: de ahí salen los bordes suaves. */
  reducir(ladoFinal) {
    const factor = this.lado / ladoFinal;
    const salida = Buffer.alloc(ladoFinal * ladoFinal * 4);
    for (let y = 0; y < ladoFinal; y += 1) {
      for (let x = 0; x < ladoFinal; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let sy = Math.floor(y * factor); sy < Math.floor((y + 1) * factor); sy += 1) {
          for (let sx = Math.floor(x * factor); sx < Math.floor((x + 1) * factor); sx += 1) {
            const i = (sy * this.lado + sx) * 4;
            r += this.px[i];
            g += this.px[i + 1];
            b += this.px[i + 2];
            a += this.px[i + 3];
            n += 1;
          }
        }
        const j = (y * ladoFinal + x) * 4;
        salida[j] = Math.round(r / n);
        salida[j + 1] = Math.round(g / n);
        salida[j + 2] = Math.round(b / n);
        salida[j + 3] = Math.round(a / n);
      }
    }
    return salida;
  }
}

function dentroDeRedondeado(x, y, x0, y0, x1, y1, radio) {
  const px = x + 0.5;
  const py = y + 0.5;
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + radio), x1 - radio);
  const cy = Math.min(Math.max(py, y0 + radio), y1 - radio);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radio * radio;
}

/** Dibuja el glifo de lista centrado, con el ancho total indicado. */
function dibujarGlifo(lienzo, anchoGlifo) {
  const centro = lienzo.lado / 2;
  const u = anchoGlifo * lienzo.lado;
  const alto = u * 0.11;
  const filas = [-0.34, 0, 0.34];
  const largos = [0.62, 0.5, 0.38];

  for (let i = 0; i < filas.length; i += 1) {
    const cy = centro + filas[i] * u;
    const x0 = centro - u / 2;
    lienzo.rectRedondeado(x0, cy - alto / 2, x0 + largos[i] * u, cy + alto / 2, alto / 2, BLANCO);
    lienzo.circulo(x0 + u * 0.86, cy, alto * 0.62, BLANCO);
  }
}

function icono(lado, { radio, glifo }) {
  const lienzo = new Lienzo(lado * MARGEN);
  lienzo.fondo(radio * lado * MARGEN, AZUL_ARRIBA, AZUL_ABAJO);
  dibujarGlifo(lienzo, glifo);
  return aPNG(lado, lado, lienzo.reducir(lado));
}

mkdirSync(destino, { recursive: true });

const archivos = [
  // Icono normal: esquinas redondeadas, glifo grande.
  { nombre: "icono-192.png", dato: icono(192, { radio: 0.22, glifo: 0.5 }) },
  { nombre: "icono-512.png", dato: icono(512, { radio: 0.22, glifo: 0.5 }) },
  // Maskable: el sistema recorta la forma, así que el fondo va de borde a
  // borde y el glifo se encoge al círculo seguro del centro.
  { nombre: "icono-maskable-512.png", dato: icono(512, { radio: 0, glifo: 0.4 }) },
  // iOS aplica su propia mascara: fondo completo y glifo algo mayor.
  { nombre: "manzana-180.png", dato: icono(180, { radio: 0, glifo: 0.54 }) },
];

for (const a of archivos) {
  writeFileSync(join(destino, a.nombre), a.dato);
  const kb = (a.dato.length / 1024).toFixed(1);
  console.log(`${a.nombre.padEnd(28)} ${kb} KB`);
}
console.log(`\n${archivos.length} iconos escritos en ${destino}`);
