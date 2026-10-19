/**
 * Capa de datos del espacio compartido, sobre Cloudflare D1.
 *
 * Vive aparte del Worker para dos motivos: se puede leer y probar sin tener un
 * servidor levantado, y la comprobación de tipos la cubre (el Worker está en
 * JavaScript y no lo está). El Worker solo enruta y decide quién puede pasar.
 *
 * Nota sobre D1 y la concurrencia: en vez de "leer, cambiar, escribir" —que
 * pisaría el trabajo de otra persona si guarda en el medio— cada escritura
 * incluye el número de revisión que se leyó. Si no coincide, ninguna fila
 * cambia y se vuelve a empezar con lo último.
 */
import catalogoInicial from "../datos/catalogo-inicial.json";
import type { Espacio } from "../types";
import { rolInvitado, rolValido, type Rol } from "../lib/permisos";
import {
  ahora,
  combinarEspacios,
  crearEspacio,
  normalizarCatalogo,
  normalizarEspacio,
  sembrarCatalogoInicial,
} from "../lib/espacio";

// --- Lo mínimo que usamos de D1 ---------------------------------------------

export interface Sentencia {
  bind(...valores: unknown[]): Sentencia;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
}

export interface BaseDeDatos {
  prepare(sql: string): Sentencia;
  batch(sentencias: Sentencia[]): Promise<unknown>;
}

// --- Configuración ----------------------------------------------------------

/** Cuánto dura una invitación. */
export const DIAS_INVITACION = 30;

/** Catálogo que se entrega: un espacio nuevo ya nace con estos materiales. */
const CATALOGO_ENTREGADO = normalizarCatalogo(catalogoInicial.catalogo);

/** Nombre con el que se muestra el espacio compartido. */
export const NOMBRE_ESPACIO = "Espacio del equipo";

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS espacios (
     id TEXT PRIMARY KEY,
     nombre TEXT NOT NULL,
     creado TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS miembros (
     usuario TEXT PRIMARY KEY,
     espacio_id TEXT NOT NULL,
     nombre TEXT,
     correo TEXT,
     desde TEXT NOT NULL,
     rol TEXT NOT NULL DEFAULT 'editor'
   )`,
  `CREATE INDEX IF NOT EXISTS idx_miembros_espacio ON miembros (espacio_id)`,
  `CREATE TABLE IF NOT EXISTS contenido (
     espacio_id TEXT PRIMARY KEY,
     datos TEXT NOT NULL,
     actualizado TEXT NOT NULL,
     revision INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS invitaciones (
     codigo TEXT PRIMARY KEY,
     espacio_id TEXT NOT NULL,
     creada TEXT NOT NULL,
     expira TEXT NOT NULL,
     usos INTEGER NOT NULL DEFAULT 0,
     rol TEXT NOT NULL DEFAULT 'editor'
   )`,
  `CREATE INDEX IF NOT EXISTS idx_invitaciones_espacio ON invitaciones (espacio_id)`,
];

// --- Esquema ----------------------------------------------------------------

let esquemaListo = false;

/** Nombres de las columnas de una tabla, tal como están en la base. */
async function columnasDe(db: BaseDeDatos, tabla: string): Promise<string[]> {
  const info = await db.prepare(`PRAGMA table_info(${tabla})`).all<{ name: string }>();
  return (info.results ?? []).map((c) => c.name);
}

/**
 * Agrega una columna que no estaba, para las bases creadas antes de que existiera.
 *
 * `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya existe, así que la
 * ampliación tiene que ir aparte. Se pregunta primero en vez de intentar a
 * ciegas, porque un ALTER que falla corta el lote entero donde vaya.
 */
async function agregarColumna(
  db: BaseDeDatos,
  tabla: string,
  columna: string,
  definicion: string,
): Promise<void> {
  if ((await columnasDe(db, tabla)).includes(columna)) return;
  try {
    await db.prepare(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`).run();
  } catch (e) {
    // Dos instancias pueden arrancar a la vez y agregarla las dos; la segunda
    // falla sin haber roto nada. Cualquier otro error sí se informa.
    if (!(await columnasDe(db, tabla)).includes(columna)) throw e;
  }
}

/**
 * Un espacio siempre tiene dueño. En los que ya existían antes de los permisos,
 * el dueño es quien lo creó: la fila más vieja de cada espacio.
 */
const DAR_DUENO = `UPDATE miembros SET rol = 'dueno'
   WHERE rowid IN (SELECT MIN(rowid) FROM miembros GROUP BY espacio_id)
     AND NOT EXISTS (
       SELECT 1 FROM miembros x WHERE x.espacio_id = miembros.espacio_id AND x.rol = 'dueno'
     )`;

/**
 * Crea las tablas si no existen y las pone al día. Es idempotente y se hace una
 * vez por instancia en lugar de en cada petición.
 */
export async function asegurarEsquema(db: BaseDeDatos): Promise<void> {
  if (esquemaListo) return;
  await db.batch(ESQUEMA.map((sql) => db.prepare(sql)));
  await agregarColumna(db, "miembros", "rol", "TEXT NOT NULL DEFAULT 'editor'");
  await agregarColumna(db, "invitaciones", "rol", "TEXT NOT NULL DEFAULT 'editor'");
  await db.prepare(DAR_DUENO).run();
  esquemaListo = true;
}

/** Solo para las pruebas: obliga a volver a crear el esquema. */
export function olvidarEsquema(): void {
  esquemaListo = false;
}

// --- Personas y espacios ----------------------------------------------------

export interface Persona {
  sub: string;
  name?: string;
  email?: string;
}

/**
 * El espacio de una persona; si todavía no tiene, se le crea uno con el
 * catálogo que se entrega. Se usa INSERT OR IGNORE en vez de comprobar antes:
 * si dos pestañas entran a la vez, gana una y la otra no rompe nada.
 */
export async function espacioDe(db: BaseDeDatos, persona: Persona): Promise<string> {
  const mio = await db
    .prepare("SELECT espacio_id FROM miembros WHERE usuario = ?")
    .bind(persona.sub)
    .first<{ espacio_id: string }>();
  if (mio) return mio.espacio_id;

  const id = crypto.randomUUID();
  const marca = ahora();
  const inicial = sembrarCatalogoInicial(crearEspacio(), CATALOGO_ENTREGADO, false);

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO espacios (id, nombre, creado) VALUES (?, ?, ?)").bind(
      id,
      NOMBRE_ESPACIO,
      marca,
    ),
    // Quien crea el espacio es su dueño y el único que puede dar acceso.
    db
      .prepare(
        "INSERT OR IGNORE INTO miembros (usuario, espacio_id, nombre, correo, desde, rol) VALUES (?, ?, ?, ?, ?, 'dueno')",
      )
      .bind(persona.sub, id, persona.name ?? null, persona.email ?? null, marca),
    db
      .prepare(
        "INSERT OR IGNORE INTO contenido (espacio_id, datos, actualizado, revision) VALUES (?, ?, ?, 0)",
      )
      .bind(id, JSON.stringify(inicial), marca),
  ]);

  const creado = await db
    .prepare("SELECT espacio_id FROM miembros WHERE usuario = ?")
    .bind(persona.sub)
    .first<{ espacio_id: string }>();
  if (!creado) throw new Error("No se pudo crear el espacio de trabajo.");

  // Las otras pestañas pueden haber creado el suyo; si quedó otro contenido
  // vacío de por medio, se descarta el nuestro para no dejar copias sueltas.
  if (creado.espacio_id !== id) {
    await db.batch([
      db.prepare("DELETE FROM contenido WHERE espacio_id = ?").bind(id),
      db.prepare("DELETE FROM espacios WHERE id = ?").bind(id),
    ]);
  }
  return creado.espacio_id;
}

export interface Miembro {
  nombre: string | null;
  correo: string | null;
  soyYo: boolean;
  rol: Rol;
}

/** El permiso de una persona dentro de un espacio. */
export async function rolEn(db: BaseDeDatos, espacioId: string, usuario: string): Promise<Rol> {
  const fila = await db
    .prepare("SELECT rol FROM miembros WHERE usuario = ? AND espacio_id = ?")
    .bind(usuario, espacioId)
    .first<{ rol: string }>();
  // Sin fila no hay permiso. Se cierra en lugar de abrirse.
  return fila ? rolValido(fila.rol) : "lectura";
}

export async function equipoDe(
  db: BaseDeDatos,
  espacioId: string,
  yo: string,
): Promise<Miembro[]> {
  const filas = await db
    .prepare(
      "SELECT usuario, nombre, correo, rol FROM miembros WHERE espacio_id = ? ORDER BY desde, usuario",
    )
    .bind(espacioId)
    .all<{ usuario: string; nombre: string | null; correo: string | null; rol: string }>();

  return (filas.results ?? []).map((m) => ({
    nombre: m.nombre,
    correo: m.correo,
    soyYo: m.usuario === yo,
    rol: rolValido(m.rol),
  }));
}

// --- Contenido --------------------------------------------------------------

/**
 * Lee el contenido guardado sin confiar en que sea legible.
 *
 * Si el texto quedara corrupto, devolver un espacio vacío es horrible pero
 * permite seguir trabajando; dejar que la excepción suba condena el espacio
 * para siempre, porque cada guardado fallaría igual.
 */
function interpretar(datos: unknown): Espacio {
  if (typeof datos !== "string") return crearEspacio();
  try {
    return normalizarEspacio(JSON.parse(datos));
  } catch {
    return crearEspacio();
  }
}

export async function leerContenido(db: BaseDeDatos, espacioId: string): Promise<Espacio> {
  const fila = await db
    .prepare("SELECT datos FROM contenido WHERE espacio_id = ?")
    .bind(espacioId)
    .first<{ datos: string }>();
  return fila ? interpretar(fila.datos) : crearEspacio();
}

/**
 * Combina lo que manda un cliente con lo que ya está guardado y devuelve el
 * resultado. Reintenta si alguien guardó en el medio.
 */
export async function fusionarEnEspacio(
  db: BaseDeDatos,
  espacioId: string,
  entrante: unknown,
): Promise<Espacio> {
  for (let intento = 0; intento < 5; intento += 1) {
    const fila = await db
      .prepare("SELECT datos, revision FROM contenido WHERE espacio_id = ?")
      .bind(espacioId)
      .first<{ datos: string; revision: number }>();

    const actual = fila ? interpretar(fila.datos) : crearEspacio();
    const combinado = combinarEspacios(actual, normalizarEspacio(entrante));
    const datos = JSON.stringify(combinado);
    const marca = ahora();

    if (!fila) {
      try {
        await db
          .prepare(
            "INSERT INTO contenido (espacio_id, datos, actualizado, revision) VALUES (?, ?, ?, 1)",
          )
          .bind(espacioId, datos, marca)
          .run();
        return combinado;
      } catch {
        continue; // Lo creó otro primero; se reintenta leyéndolo.
      }
    }

    const resultado = await db
      .prepare(
        "UPDATE contenido SET datos = ?, actualizado = ?, revision = revision + 1 WHERE espacio_id = ? AND revision = ?",
      )
      .bind(datos, marca, espacioId, fila.revision)
      .run();

    if (resultado.meta?.changes === 1) return combinado;
  }

  throw new Error("El espacio se está guardando desde otro lado; vuelve a intentar.");
}

// --- Invitaciones -----------------------------------------------------------

export interface Invitacion {
  codigo: string;
  expira: string;
  /** Qué permitirá cuando alguien entre con este código. */
  rol: Rol;
}

/** Código legible: sin letras que se confundan al dictarlo por teléfono. */
export function nuevoCodigo(): string {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

function sumarDias(dias: number): string {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}

export async function invitacionVigente(
  db: BaseDeDatos,
  espacioId: string,
): Promise<Invitacion | null> {
  const fila = await db
    .prepare(
      "SELECT codigo, expira, rol FROM invitaciones WHERE espacio_id = ? AND expira > ? ORDER BY creada DESC LIMIT 1",
    )
    .bind(espacioId, ahora())
    .first<{ codigo: string; expira: string; rol: string }>();
  return fila ? { codigo: fila.codigo, expira: fila.expira, rol: rolInvitado(fila.rol) } : null;
}

/**
 * Crea un código nuevo e invalida el anterior del mismo espacio.
 *
 * El rol lo elige quien invita, y solo puede ser editor o solo lectura: la
 * propiedad del espacio no se entrega con un enlace.
 */
export async function rotarInvitacion(
  db: BaseDeDatos,
  espacioId: string,
  rol: Rol,
): Promise<Invitacion> {
  const codigo = nuevoCodigo();
  const expira = sumarDias(DIAS_INVITACION);
  const paraInvitado = rolInvitado(rol);
  await db.batch([
    db.prepare("DELETE FROM invitaciones WHERE espacio_id = ?").bind(espacioId),
    db
      .prepare(
        "INSERT INTO invitaciones (codigo, espacio_id, creada, expira, usos, rol) VALUES (?, ?, ?, ?, 0, ?)",
      )
      .bind(codigo, espacioId, ahora(), expira, paraInvitado),
  ]);
  return { codigo, expira, rol: paraInvitado };
}

export type ResultadoInvitacion =
  | { estado: "no-existe" }
  | { estado: "vencida" }
  | { estado: "ya-estaba"; espacioId: string; rol: Rol }
  | { estado: "entrado"; espacioId: string; espacio: Espacio; rol: Rol };

/**
 * Entra al espacio del equipo que emitió el código.
 *
 * Lo que la persona ya tenía se suma al espacio destino: nadie pierde su
 * trabajo por entrar, y tampoco se borra el espacio anterior, por si alguien
 * más lo estaba usando.
 *
 * El permiso con el que entra es el del enlace. Si ya estaba adentro, el enlace
 * sirve para corregirlo (por ejemplo, darle edición a quien se invitó por
 * error), pero nunca para sacarle la propiedad al dueño.
 */
export async function aceptarInvitacion(
  db: BaseDeDatos,
  persona: Persona,
  codigoCrudo: string,
): Promise<ResultadoInvitacion> {
  const codigo = codigoCrudo.trim().toUpperCase();
  if (!codigo) return { estado: "no-existe" };

  const invitacion = await db
    .prepare("SELECT espacio_id, expira, rol FROM invitaciones WHERE codigo = ?")
    .bind(codigo)
    .first<{ espacio_id: string; expira: string; rol: string }>();
  if (!invitacion) return { estado: "no-existe" };
  if (invitacion.expira <= ahora()) return { estado: "vencida" };

  const prometido = rolInvitado(invitacion.rol);
  const actual = await espacioDe(db, persona);

  if (invitacion.espacio_id === actual) {
    const yaTiene = await rolEn(db, actual, persona.sub);
    const rol = yaTiene === "dueno" ? yaTiene : prometido;
    if (rol !== yaTiene) {
      await db.prepare("UPDATE miembros SET rol = ? WHERE usuario = ?").bind(rol, persona.sub).run();
    }
    return { estado: "ya-estaba", espacioId: actual, rol };
  }

  await fusionarEnEspacio(db, invitacion.espacio_id, await leerContenido(db, actual));

  await db.batch([
    db
      .prepare("UPDATE miembros SET espacio_id = ?, desde = ?, rol = ? WHERE usuario = ?")
      .bind(invitacion.espacio_id, ahora(), prometido, persona.sub),
    db.prepare("UPDATE invitaciones SET usos = usos + 1 WHERE codigo = ?").bind(codigo),
  ]);

  return {
    estado: "entrado",
    espacioId: invitacion.espacio_id,
    espacio: await leerContenido(db, invitacion.espacio_id),
    rol: prometido,
  };
}
