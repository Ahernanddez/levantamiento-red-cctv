/**
 * Modelo de datos.
 *
 * Hay dos cosas separadas:
 *  - El CATALOGO de materiales, que es uno solo y se comparte entre todos los
 *    estudios. Se carga una vez y se reutiliza.
 *  - Los ESTUDIOS, cada uno con los datos del cliente, de quien lo realizo y
 *    una lista de materiales con sus cantidades.
 *
 * No hay precios ni calculos automaticos: el material y la cantidad los
 * define quien realiza el estudio.
 */

/** Un material del catalogo compartido. */
export interface Material {
  id: string;
  nombre: string;
  /** Unidad de medida: u, m, caja, rollo, global… */
  unidad: string;
  /**
   * Cuando se creo o se edito por ultima vez. Sirve para que, al combinar el
   * catalogo de dos personas, gane el cambio mas reciente en vez de quedar
   * siempre el que llego primero.
   */
  updatedAt: string;
}

/** Una linea de la lista de un estudio. */
export interface ItemLista {
  id: string;
  /** Referencia al material del catalogo. */
  materialId: string;
  cantidad: number;
  /**
   * Unidad elegida para esta linea. Vacio quiere decir «la del catalogo», que es
   * como se comportaba antes de que se pudiera elegir: asi un estudio viejo
   * sigue mostrando lo mismo y una linea sin tocar sigue a su material.
   */
  unidad?: string;
}

/**
 * Una fotografía del estudio, con su comentario.
 *
 * La imagen viaja reducida (JPEG en data URL): tal cual se muestra en la
 * pantalla va al PDF, y así también entra en el guardado local y en la
 * sincronización sin romper sus topes de tamaño.
 */
export interface Foto {
  id: string;
  /** JPEG reducido en data URL (`data:image/jpeg;base64,…`). */
  imagen: string;
  comentario: string;
  /**
   * Id del renglón de la lista al que va ligada (`ItemLista.id`).
   * Ausente o vacío: foto suelta, que sale en la sección Fotografías.
   * Ligada: sale justo debajo de su renglón en la tabla del PDF.
   */
  materialId?: string;
  updatedAt: string;
}

/** Un estudio hecho en un sitio. */
export interface Estudio {
  id: string;
  nombre: string;
  cliente: string;
  sitio: string;
  ciudad: string;
  /** Fecha del estudio, formato YYYY-MM-DD. */
  fecha: string;
  /** Quien realizo el estudio. */
  realizo: string;
  notas: string;
  items: ItemLista[];
  /** Fotografías del sitio, en el orden en que se agregaron. */
  fotos: Foto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Lo que se borro, con la fecha del borrado.
 *
 * Sin esto, borrar no sirve de nada al compartir: el equipo de la otra persona
 * todavia tiene el material o el estudio guardado, y al sincronizar volveria a
 * aparecer. La marca de borrado gana sobre la copia vieja.
 */
export interface Borrados {
  materiales: Record<string, string>;
  estudios: Record<string, string>;
  /** Por identificador de unidad propia; ver Unidad. */
  unidades: Record<string, string>;
}

/**
 * Una unidad de medida propia del equipo, ademas de las universales.
 *
 * Lleva identificador y fecha por el mismo motivo que un material: para que
 * quitar una unidad sea definitivo al compartir. Si se identificara por su
 * nombre, volver a agregarle despues de quitarla seria indistinguible de nunca
 * haberla tocado, y en la otra computadora quedaria borrada para siempre.
 */
export interface Unidad {
  id: string;
  nombre: string;
  updatedAt: string;
}

/**
 * Si una unidad universal se usa en el equipo o no.
 *
 * Las universales vienen con la aplicacion y no se pueden borrar, pero cada
 * equipo trabaja con unas pocas: las demas se ocultan para que el desplegable se
 * recorra de un vistazo. Se guarda tambien el estado «visible» (con su fecha)
 * porque si no, volver a mostrar una unidad en una computadora no tendria como
 * ganarle a la copia vieja de otra que todavia la tenia oculta.
 */
export interface AjusteUnidad {
  oculta: boolean;
  updatedAt: string;
}

/** Todo el contenido de la aplicacion, tal como se guarda y se sincroniza. */
export interface Espacio {
  version: number;
  catalogo: Material[];
  estudios: Estudio[];
  /** Unidades propias del equipo, que se suman a las universales. */
  unidades: Unidad[];
  /**
   * Que universales no se usan, por su nombre tal como figura en la lista de la
   * aplicacion. Los nombres estan fijos en el codigo, asi que alcanza con ellos
   * como clave: no pueden repetirse ni cambiar de escritura.
   */
  unidadesOcultas: Record<string, AjusteUnidad>;
  borrados: Borrados;
}

export const VERSION_ESPACIO = 5;

/**
 * Unidades de medida que trae la aplicación, agrupadas por lo que miden.
 *
 * Son las del equipo y nada más: metro y pie para longitudes, pieza para contar
 * y lance para el trabajo por tirada. Lo que haga falta fuera de acá se suma
 * desde el catálogo, en «Propias del equipo», y queda para todo el equipo: la
 * lista no es una jaula, pero tampoco ofrece lo que nadie usa.
 *
 * Unidades que alguna vez estuvieron (caja, rollo, hora, yarda…) siguen
 * funcionando donde ya estén escritas: una lista que las use no cambia, se lee
 * igual que antes. Solo dejan de ofrecerse.
 */
export const UNIDADES_GRUPOS: { grupo: string; unidades: string[] }[] = [
  { grupo: "Longitud", unidades: ["m", "pie"] },
  { grupo: "Cantidad", unidades: ["pieza"] },
  { grupo: "Trabajo", unidades: ["lance"] },
];

/** Las mismas unidades en una sola lista, para las sugerencias al escribir. */
export const UNIDADES_SUGERIDAS: string[] = UNIDADES_GRUPOS.flatMap((g) => g.unidades);
