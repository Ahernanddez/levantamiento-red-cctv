/**
 * Reglas del espacio de datos: saneamiento, fusión y marcas de borrado.
 *
 * Este módulo es puro a propósito. Lo usan los dos lados:
 *  - el navegador, donde el espacio vive en el almacenamiento local y se
 *    sincroniza con el servidor y con Google Drive;
 *  - el Worker, donde vive el espacio compartido del equipo.
 *
 * Si cada lado tuviera su propia copia de la regla de fusión, con el tiempo se
 * separarían y una diferencia ahí termina en trabajo perdido en silencio.
 */
import {
  UNIDADES_GRUPOS,
  UNIDADES_SUGERIDAS,
  VERSION_ESPACIO,
  type AjusteUnidad,
  type Borrados,
  type Espacio,
  type Estudio,
  type ItemLista,
  type Material,
  type Unidad,
} from "../types";
import { hoyISO } from "./format";

// --- Herramientas -----------------------------------------------------------

const str = (v: unknown, def = ""): string => (typeof v === "string" ? v : def);
const num = (v: unknown, def = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : def);
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Marca de tiempo del momento actual, en UTC. */
export function ahora(): string {
  return new Date().toISOString();
}

// --- Piezas nuevas ----------------------------------------------------------

export function nuevoMaterial(nombre = "", unidad = "pieza"): Material {
  return { id: newId(), nombre, unidad: unidad || "pieza", updatedAt: ahora() };
}

export function nuevoItem(materialId: string, cantidad = 1, unidad = ""): ItemLista {
  return { id: newId(), materialId, cantidad: Math.max(0, cantidad), unidad };
}

// --- Unidades propias del equipo --------------------------------------------

/** Hasta cuánto puede medir el nombre de una unidad; más que esto no se lee. */
export const LARGO_UNIDAD = 40;

/** Deja el nombre de una unidad en una sola línea, sin sobras. */
export function limpiarUnidad(nombre: string): string {
  return typeof nombre === "string"
    ? nombre.replace(/\s+/g, " ").trim().slice(0, LARGO_UNIDAD)
    : "";
}

/** Clave con la que se comparan dos unidades sin distinguir mayúsculas. */
export function claveDeUnidad(nombre: string): string {
  return limpiarUnidad(nombre).toLowerCase();
}

/**
 * La forma exacta con la que está escrita una unidad universal, si lo es.
 *
 * Devuelve la del catálogo de unidades y no lo que se escribió: si alguien teclea
 * «CAJA», la línea tiene que quedar como «caja» o el total se parte en dos
 * grupos por una mayúscula.
 */
export function formaUniversal(nombre: string): string | null {
  const clave = claveDeUnidad(nombre);
  if (clave === "") return null;
  return UNIDADES_SUGERIDAS.find((u) => claveDeUnidad(u) === clave) ?? null;
}

/** ¿Ya viene entre las universales que trae la aplicación? */
export function esUnidadUniversal(nombre: string): boolean {
  return formaUniversal(nombre) !== null;
}

export function nuevaUnidad(nombre = ""): Unidad {
  return { id: newId(), nombre: limpiarUnidad(nombre), updatedAt: ahora() };
}

export function normalizarUnidad(raw: unknown): Unidad {
  const r = objeto(raw);
  return {
    id: str(r.id) || newId(),
    nombre: limpiarUnidad(str(r.nombre)),
    // Sin fecha se considera lo más viejo: cualquier edición posterior gana.
    updatedAt: str(r.updatedAt),
  };
}

export function normalizarUnidades(raw: unknown): Unidad[] {
  return lista(raw)
    .map(normalizarUnidad)
    .filter((u) => u.nombre !== "");
}

/**
 * La unidad del equipo que lleva ese nombre, si ya existe.
 *
 * Se busca sin distinguir mayúsculas para no terminar con «Rollo» y «rollo»
 * como dos entradas distintas del desplegable.
 */
export function unidadPorNombre(unidades: Unidad[], nombre: string): Unidad | null {
  const clave = claveDeUnidad(nombre);
  if (!clave) return null;
  return unidades.find((u) => claveDeUnidad(u.nombre) === clave) ?? null;
}

/**
 * Los nombres para mostrar, sin repetidos y sin los que ya son universales.
 *
 * Se deduplica acá y no al guardar porque dos personas pueden haber agregado la
 * misma unidad en paralelo, cada una con su identificador: al fusionar quedan
 * las dos, y lo que corresponde es mostrarla una sola vez.
 */
export function nombresDeUnidades(unidades: Unidad[]): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const unidad of unidades) {
    const clave = claveDeUnidad(unidad.nombre);
    if (!clave || vistas.has(clave) || esUnidadUniversal(unidad.nombre)) continue;
    vistas.add(clave);
    salida.push(unidad.nombre);
  }
  return salida;
}

/** Agrega una unidad propia; devuelve el espacio intacto si no hay nada que agregar. */
export function agregarUnidad(espacio: Espacio, nombre: string): Espacio {
  const limpio = limpiarUnidad(nombre);
  if (!limpio || esUnidadUniversal(limpio) || unidadPorNombre(espacio.unidades, limpio)) {
    return espacio;
  }
  return { ...espacio, unidades: [...espacio.unidades, nuevaUnidad(limpio)] };
}

// --- Unidades universales que el equipo no usa ------------------------------

/**
 * Los nombres de las universales que el equipo tiene ocultas.
 *
 * Se recorre la lista fija de la aplicación en vez de las claves guardadas: si
 * alguna vez se quita una unidad del código, su ajuste viejo queda ignorado en
 * lugar de aparecer como una unidad fantasma.
 */
export function nombresOcultos(ocultas: Record<string, AjusteUnidad>): string[] {
  return UNIDADES_SUGERIDAS.filter((u) => ocultas[u]?.oculta === true);
}

/**
 * Los grupos de unidades universales tal como van en el desplegable.
 *
 * Un grupo que se queda sin unidades no se muestra: un título sin nada abajo
 * solo alarga la lista.
 */
export function gruposDeUnidades(
  ocultas: Record<string, AjusteUnidad>,
): { grupo: string; unidades: string[] }[] {
  const fuera = new Set(nombresOcultos(ocultas));
  return UNIDADES_GRUPOS.map((g) => ({
    grupo: g.grupo,
    unidades: g.unidades.filter((u) => !fuera.has(u)),
  })).filter((g) => g.unidades.length > 0);
}

/**
 * Deja una universal fuera del desplegable para todo el equipo.
 *
 * No se borra: las universales vienen con la aplicación y una lista que ya la
 * esté usando tiene que seguir diciendo lo mismo. Solo deja de ofrecerse.
 */
export function ocultarUnidad(espacio: Espacio, nombre: string): Espacio {
  const universal = formaUniversal(nombre);
  if (!universal || espacio.unidadesOcultas[universal]?.oculta === true) return espacio;
  return {
    ...espacio,
    unidadesOcultas: {
      ...espacio.unidadesOcultas,
      [universal]: { oculta: true, updatedAt: ahora() },
    },
  };
}

/** Vuelve a ofrecerla en el desplegable. */
export function mostrarUnidad(espacio: Espacio, nombre: string): Espacio {
  const universal = formaUniversal(nombre);
  if (!universal || espacio.unidadesOcultas[universal]?.oculta === false) return espacio;
  return {
    ...espacio,
    unidadesOcultas: {
      ...espacio.unidadesOcultas,
      [universal]: { oculta: false, updatedAt: ahora() },
    },
  };
}

/**
 * Unidad con la que se cuenta una linea de la lista.
 *
 * Es una sola regla para los tres lugares que la muestran —la lista, el informe
 * impreso y el PDF—: si cada uno decidiera por su cuenta, tarde o temprano el
 * papel diria algo distinto que la pantalla.
 */
export function unidadDe(item: ItemLista, material?: Material): string {
  return (item.unidad ?? "").trim() || (material?.unidad ?? "").trim() || "pieza";
}

/**
 * Total de la lista, separado por unidad.
 *
 * Sumar 4 cajas con 250 unidades daría 254 de nada: una cantidad solo significa
 * algo junto a su unidad, así que se agrupa en vez de mezclarse.
 */
export function totalPorUnidad(
  items: ItemLista[],
  porId: Map<string, Material>,
): { unidad: string; total: number }[] {
  const totales = new Map<string, number>();
  for (const item of items) {
    const unidad = unidadDe(item, porId.get(item.materialId));
    totales.set(unidad, (totales.get(unidad) ?? 0) + item.cantidad);
  }
  return [...totales.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([unidad, total]) => ({ unidad, total }));
}

export function crearEstudio(nombre = "Nuevo estudio"): Estudio {
  const marca = ahora();
  return {
    id: newId(),
    nombre,
    cliente: "",
    sitio: "",
    ciudad: "",
    fecha: hoyISO(),
    realizo: "",
    notas: "",
    items: [],
    createdAt: marca,
    updatedAt: marca,
  };
}

export function crearEspacio(): Espacio {
  return {
    version: VERSION_ESPACIO,
    catalogo: [],
    estudios: [],
    unidades: [],
    unidadesOcultas: {},
    borrados: { materiales: {}, estudios: {}, unidades: {} },
  };
}

// --- Saneamiento de datos que llegan de afuera ------------------------------

/**
 * Nombres viejos de unidades que hoy se llaman de otra manera.
 *
 * «u» era la unidad de siempre para contar cosas sueltas; desde que la lista del
 * equipo dice «pieza», lo guardado con el nombre viejo se lee con el nuevo. El
 * cambio se hace al leer el espacio, así vale igual para lo que hay en el
 * navegador y para lo que llega del servidor, sin tocar material por material.
 */
const UNIDADES_RENOMBRADAS: Record<string, string> = { u: "pieza" };

/** La unidad con el nombre que le corresponde hoy. */
function alDia(unidad: string): string {
  const limpio = limpiarUnidad(unidad);
  return UNIDADES_RENOMBRADAS[claveDeUnidad(limpio)] ?? limpio;
}

export function normalizarMaterial(raw: unknown): Material {
  const r = objeto(raw);
  return {
    id: str(r.id) || newId(),
    nombre: str(r.nombre),
    unidad: alDia(str(r.unidad)) || "pieza",
    // Sin fecha se considera lo más viejo: cualquier cambio posterior gana.
    updatedAt: str(r.updatedAt),
  };
}

function normalizarItem(raw: unknown): ItemLista {
  const r = objeto(raw);
  return {
    id: str(r.id) || newId(),
    materialId: str(r.materialId),
    cantidad: Math.max(0, num(r.cantidad)),
    // Sin unidad propia la pone el material del catálogo; ver unidadDe().
    unidad: alDia(str(r.unidad)),
  };
}

/** Acepta estudios parciales o de versiones anteriores y los completa. */
export function normalizarEstudio(raw: unknown): Estudio | null {
  const r = objeto(raw);
  if (Object.keys(r).length === 0) return null;
  const marca = ahora();
  return {
    id: str(r.id) || newId(),
    nombre: str(r.nombre, "Estudio sin nombre"),
    cliente: str(r.cliente),
    sitio: str(r.sitio),
    ciudad: str(r.ciudad),
    fecha: str(r.fecha) || hoyISO(),
    realizo: str(r.realizo),
    notas: str(r.notas),
    items: lista(r.items).map(normalizarItem).filter((it) => it.materialId),
    createdAt: str(r.createdAt, marca),
    updatedAt: str(r.updatedAt, marca),
  };
}

export function normalizarCatalogo(raw: unknown): Material[] {
  return lista(raw)
    .map(normalizarMaterial)
    .filter((m) => m.nombre.trim() !== "");
}

/** Cada marca de borrado es un id con la fecha en que se borro. */
export function normalizarBorrados(raw: unknown): Borrados {
  const r = objeto(raw);
  const pares = (v: unknown): Record<string, string> => {
    const salida: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(objeto(v))) {
      if (clave && typeof valor === "string") salida[clave] = valor;
    }
    return salida;
  };
  return {
    materiales: pares(r.materiales),
    estudios: pares(r.estudios),
    unidades: pares(r.unidades),
  };
}

/**
 * Que universales estan ocultas, descartando lo que no sea una de ellas.
 *
 * Se acepta el estado guardado tal cual vino —oculta o visible— porque el
 * segundo tambien dice algo: que la unidad se usa, y desde cuando.
 */
export function normalizarOcultas(raw: unknown): Record<string, AjusteUnidad> {
  const salida: Record<string, AjusteUnidad> = {};
  for (const [nombre, valor] of Object.entries(objeto(raw))) {
    const universal = formaUniversal(nombre);
    if (!universal) continue;
    const v = objeto(valor);
    salida[universal] = { oculta: v.oculta === true, updatedAt: str(v.updatedAt) };
  }
  return salida;
}

/**
 * Acepta el espacio completo, un arreglo de estudios, un estudio suelto o un
 * respaldo antiguo, y siempre devuelve algo utilizable.
 */
export function normalizarEspacio(raw: unknown): Espacio {
  const r = objeto(raw);
  if (Array.isArray(raw)) {
    return {
      ...crearEspacio(),
      estudios: lista(raw).map(normalizarEstudio).filter((e): e is Estudio => e !== null),
    };
  }
  const estudios = lista(r.estudios).map(normalizarEstudio).filter((e): e is Estudio => e !== null);
  if (estudios.length > 0 || Array.isArray(r.estudios)) {
    return {
      version: VERSION_ESPACIO,
      catalogo: normalizarCatalogo(r.catalogo),
      estudios,
      unidades: normalizarUnidades(r.unidades),
      unidadesOcultas: normalizarOcultas(r.unidadesOcultas),
      borrados: normalizarBorrados(r.borrados),
    };
  }
  const suelto = normalizarEstudio(raw);
  return {
    ...crearEspacio(),
    estudios: suelto ? [suelto] : [],
  };
}

// --- Borrados ---------------------------------------------------------------

export type ClaseDeContenido = "materiales" | "estudios" | "unidades";

/**
 * Quita un elemento y deja la marca de que se borro, para que la copia que
 * todavía tengan las otras personas no lo haga volver.
 */
export function marcarBorrado(espacio: Espacio, clase: ClaseDeContenido, id: string): Espacio {
  return {
    ...espacio,
    catalogo: clase === "materiales" ? espacio.catalogo.filter((m) => m.id !== id) : espacio.catalogo,
    estudios: clase === "estudios" ? espacio.estudios.filter((e) => e.id !== id) : espacio.estudios,
    unidades: clase === "unidades" ? espacio.unidades.filter((u) => u.id !== id) : espacio.unidades,
    borrados: {
      ...espacio.borrados,
      [clase]: { ...espacio.borrados[clase], [id]: ahora() },
    },
  };
}

/** Une dos listas de marcas quedándose con la fecha más reciente de cada id. */
export function fusionarBorrados(a: Borrados, b: Borrados): Borrados {
  const unir = (x: Record<string, string>, y: Record<string, string>) => {
    const salida = { ...x };
    for (const [id, fecha] of Object.entries(y)) {
      if (!salida[id] || fecha > salida[id]) salida[id] = fecha;
    }
    return salida;
  };
  return {
    materiales: unir(a.materiales, b.materiales),
    estudios: unir(a.estudios, b.estudios),
    unidades: unir(a.unidades, b.unidades),
  };
}

function filtrarBorrados<T extends { id: string }>(items: T[], marcas: Record<string, string>): T[] {
  return items.filter((i) => !marcas[i.id]);
}

// --- Fusión -----------------------------------------------------------------

export interface ResultadoFusion {
  elementos: Estudio[];
  nuevos: number;
  actualizados: number;
  ignorados: number;
}

/**
 * Combina estudios sin perder trabajo: con el mismo id gana el editado más
 * recientemente. La usan la importación JSON, la sincronización con Drive y la
 * del servidor.
 */
export function fusionarEstudios(actuales: Estudio[], entrantes: Estudio[]): ResultadoFusion {
  const porId = new Map(actuales.map((e) => [e.id, e] as const));
  let nuevos = 0;
  let actualizados = 0;
  let ignorados = 0;
  for (const entrante of entrantes) {
    const existente = porId.get(entrante.id);
    if (!existente) {
      porId.set(entrante.id, entrante);
      nuevos += 1;
    } else if (entrante.updatedAt > existente.updatedAt) {
      porId.set(entrante.id, entrante);
      actualizados += 1;
    } else {
      ignorados += 1;
    }
  }
  return { elementos: [...porId.values()], nuevos, actualizados, ignorados };
}

/** Combina el catálogo por id; con el mismo id gana la edición más reciente. */
export function fusionarCatalogo(actuales: Material[], entrantes: Material[]): Material[] {
  const porId = new Map(actuales.map((m) => [m.id, m] as const));
  for (const entrante of entrantes) {
    const existente = porId.get(entrante.id);
    if (!existente || entrante.updatedAt > existente.updatedAt) porId.set(entrante.id, entrante);
  }
  return [...porId.values()];
}

/**
 * Combina que universales usa el equipo: por unidad, gana el ultimo estado.
 *
 * Es lo que hace que ocultar en una computadora y volver a mostrar en otra
 * terminen de acuerdo en el mismo resultado, en vez de quedar la unidad fuera
 * por haber sido la copia que llego primero.
 */
export function fusionarOcultas(
  a: Record<string, AjusteUnidad>,
  b: Record<string, AjusteUnidad>,
): Record<string, AjusteUnidad> {
  const salida: Record<string, AjusteUnidad> = { ...a };
  for (const [nombre, ajuste] of Object.entries(b)) {
    const actual = salida[nombre];
    if (!actual || ganaAjuste(ajuste, actual)) salida[nombre] = ajuste;
  }
  return salida;
}

/**
 * Cual de los dos ajustes de una misma unidad queda.
 *
 * Con la misma fecha —dos computadoras decidiendo en el mismo milisegundo, o
 * dos registros viejos sin fecha— gana «se usa». Una unidad de más en el
 * desplegable molesta menos que una que alguien acaba de recuperar y desaparece
 * porque la otra copia llegó primero. El desempate no mira el orden en que se
 * combinan, así que las dos computadoras terminan con el mismo resultado.
 */
function ganaAjuste(candidato: AjusteUnidad, actual: AjusteUnidad): boolean {
  if (candidato.updatedAt !== actual.updatedAt) return candidato.updatedAt > actual.updatedAt;
  return actual.oculta && !candidato.oculta;
}

/**
 * Combina las unidades propias con la misma regla que el catálogo.
 *
 * Si dos personas agregaron la misma unidad, quedan las dos entradas (una por
 * cada identificador) y nombresDeUnidades se encarga de mostrarla una sola vez.
 */
export function fusionarUnidades(actuales: Unidad[], entrantes: Unidad[]): Unidad[] {
  const porId = new Map(actuales.map((u) => [u.id, u] as const));
  for (const entrante of entrantes) {
    const existente = porId.get(entrante.id);
    if (!existente || entrante.updatedAt > existente.updatedAt) porId.set(entrante.id, entrante);
  }
  return [...porId.values()];
}

/**
 * Combina dos copias completas del espacio.
 *
 * El orden importa: primero se aplican las marcas de borrado de los dos lados y
 * recién después se unen. Si se uniera primero, un estudio borrado en una
 * computadora volvería desde la otra.
 */
export function combinarEspacios(local: Espacio, remoto: Espacio): Espacio {
  const borrados = fusionarBorrados(local.borrados, remoto.borrados);
  const catalogo = fusionarCatalogo(
    filtrarBorrados(local.catalogo, borrados.materiales),
    filtrarBorrados(remoto.catalogo, borrados.materiales),
  );
  const estudios = fusionarEstudios(
    filtrarBorrados(local.estudios, borrados.estudios),
    filtrarBorrados(remoto.estudios, borrados.estudios),
  ).elementos;
  const unidades = fusionarUnidades(
    filtrarBorrados(local.unidades, borrados.unidades),
    filtrarBorrados(remoto.unidades, borrados.unidades),
  );
  const unidadesOcultas = fusionarOcultas(local.unidadesOcultas, remoto.unidadesOcultas);

  return { version: VERSION_ESPACIO, catalogo, estudios, unidades, unidadesOcultas, borrados };
}

/**
 * Agrega el catálogo que viaja con la aplicación la primera vez que se abre.
 *
 * Se entrega como parámetro en vez de importarlo aquí para que este módulo
 * siga siendo puro: el navegador y el Worker lo cargan cada uno a su manera.
 * Solo se hace una vez, para que borrar un material sea definitivo.
 */
export function sembrarCatalogoInicial(
  espacio: Espacio,
  entregado: Material[],
  yaSembrado: boolean,
): Espacio {
  if (yaSembrado || entregado.length === 0) return espacio;
  return { ...espacio, catalogo: fusionarCatalogo(espacio.catalogo, entregado) };
}

/** Cuántas listas usan un material, para no borrarlo a ciegas. */
export function usosDeMaterial(estudios: Estudio[], materialId: string): number {
  return estudios.filter((e) => e.items.some((it) => it.materialId === materialId)).length;
}

/** Dónde se sigue usando una de esas universales que el equipo sacó del desplegable. */
export interface UsosDeUniversal {
  /** Materiales del catálogo que la tienen como unidad. */
  materiales: number;
  /** Líneas de las listas que la están usando. */
  lineas: number;
}

/**
 * Cuánto se sigue usando cada una de estas universales, en una sola pasada.
 *
 * Una universal oculta no rompe nada: las listas que la usan la conservan. Pero
 * conviene saber que se sigue usando, porque ya no se ofrece en el desplegable y
 * quien no la encuentre va a pensar que se perdió.
 *
 * Se cuenta lo mismo que muestra la aplicación —la unidad propia de la línea o,
 * si no tiene, la del material del catálogo— y sin distinguir mayúsculas, que es
 * como se comparan las unidades en todo el espacio.
 */
export function usosDeUniversales(
  catalogo: Material[],
  estudios: Estudio[],
  nombres: string[],
): Record<string, UsosDeUniversal> {
  const usos: Record<string, UsosDeUniversal> = {};
  const porClave = new Map<string, string>();
  for (const nombre of nombres) {
    usos[nombre] = { materiales: 0, lineas: 0 };
    porClave.set(claveDeUnidad(nombre), nombre);
  }

  for (const m of catalogo) {
    const nombre = porClave.get(claveDeUnidad(m.unidad));
    if (nombre) usos[nombre].materiales += 1;
  }

  const porId = new Map(catalogo.map((m) => [m.id, m] as const));
  for (const e of estudios) {
    for (const it of e.items) {
      const nombre = porClave.get(claveDeUnidad(unidadDe(it, porId.get(it.materialId))));
      if (nombre) usos[nombre].lineas += 1;
    }
  }

  return usos;
}
