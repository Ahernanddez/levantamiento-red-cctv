import type { AjusteUnidad, Unidad } from "../types";

/**
 * Todo lo que la interfaz puede hacer con las unidades del equipo, junto.
 *
 * Son seis cosas que se usan siempre en los mismos dos lugares —el desplegable
 * de cada línea de la lista y el panel del catálogo— y pasarlas sueltas obligaba
 * a tocar cinco archivos cada vez que se sumaba una.
 */
export interface ApiUnidades {
  /** Unidades propias del equipo, además de las universales. */
  propias: Unidad[];
  /** Qué universales no usa el equipo; ver AjusteUnidad. */
  ocultas: Record<string, AjusteUnidad>;
  /** Suma una unidad propia al espacio del equipo. */
  agregar: (nombre: string) => void;
  /** Quita una unidad propia, con su marca de borrado. */
  quitar: (id: string) => void;
  /** Deja de ofrecer una unidad universal, para todo el equipo. */
  ocultar: (nombreUniversal: string) => void;
  /** Vuelve a ofrecerla. */
  mostrar: (nombreUniversal: string) => void;
}

/**
 * Deja una universal fuera del desplegable de todo el equipo, con su aviso.
 *
 * Sacar una unidad es la misma decisión se mire desde donde se mire —el panel
 * del catálogo o el desplegable de una línea—, así que el aviso también es el
 * mismo y no puede quedar distinto en cada lugar.
 */
export function sacarUniversal(
  unidades: ApiUnidades,
  avisar: (mensaje: string) => void,
  nombre: string,
): void {
  unidades.ocultar(nombre);
  avisar(
    `«${nombre}» queda fuera del desplegable para todo el equipo. Las listas que ya la usan no cambian.`,
  );
}

/** Vuelve a ofrecer una universal que estaba oculta, con su aviso. */
export function devolverUniversal(
  unidades: ApiUnidades,
  avisar: (mensaje: string) => void,
  nombre: string,
): void {
  unidades.mostrar(nombre);
  avisar(`«${nombre}» vuelve a aparecer en el desplegable.`);
}
