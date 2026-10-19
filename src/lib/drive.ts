/**
 * Google Drive como almacenamiento de los levantamientos.
 *
 * La app es totalmente estática, así que usa el "token model" de Google
 * Identity Services: el usuario está presente, la app recibe un access token
 * de vida corta y llama directamente a la Drive REST API v3 desde el
 * navegador. No hay backend ni client secret.
 *
 * Se pide el scope `drive.file`, el menos privilegiado de los tres posibles:
 * la app solo ve los archivos que ella misma creó, nunca el resto del Drive.
 * `drive.readonly` es un scope restringido y no se usa.
 *
 * El access token vive solo en memoria: nunca se guarda en localStorage ni se
 * escribe en el proyecto.
 */

const GIS_URL = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
export const NOMBRE_CARPETA = "Levantamiento Red & CCTV";
export const NOMBRE_ARCHIVO = "levantamientos.json";

const CLAVE_CLIENT_ID = "levantamiento-red-cctv:google-client-id";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/** La sesión de Google venció y hay que volver a conectar. */
export class SesionExpirada extends Error {
  constructor() {
    super("La sesión de Google venció. Vuelve a conectar con Drive.");
    this.name = "SesionExpirada";
  }
}

export interface SesionDrive {
  accessToken: string;
  /** Momento (epoch ms) en que el token deja de servir. */
  expiraEn: number;
}

// --- Identificador de cliente ----------------------------------------------

/** El client ID es público, no es un secreto; puede vivir en la configuracion. */
export function leerClientId(): string {
  const deEntorno = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (typeof deEntorno === "string" && deEntorno.trim()) return deEntorno.trim();
  try {
    return localStorage.getItem(CLAVE_CLIENT_ID)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function guardarClientId(id: string): void {
  try {
    const limpio = id.trim();
    if (limpio) localStorage.setItem(CLAVE_CLIENT_ID, limpio);
    else localStorage.removeItem(CLAVE_CLIENT_ID);
  } catch {
    /* almacenamiento no disponible: queda solo en memoria */
  }
}

// --- Carga de la libreria de Google ----------------------------------------

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface GoogleOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }): { requestAccessToken(opciones?: { prompt?: string }): void };
  revoke(token: string, done?: () => void): void;
}

function oauth2(): GoogleOauth2 | null {
  const g = (globalThis as { google?: { accounts?: { oauth2?: GoogleOauth2 } } }).google;
  return g?.accounts?.oauth2 ?? null;
}

let cargaGIS: Promise<void> | null = null;

export function cargarGIS(): Promise<void> {
  if (cargaGIS) return cargaGIS;
  cargaGIS = new Promise((resolve, reject) => {
    if (oauth2()) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          "No se pudo cargar la librería de Google Identity Services. Revisa tu conexión o un bloqueador de scripts.",
        ),
      );
    document.head.appendChild(script);
  });
  return cargaGIS;
}

/**
 * Traduce el codigo de error de Google a algo accionable.
 *
 * El caso mas comun no es un fallo del codigo: si el origen desde el que se
 * abre la app no esta en «Origenes de JavaScript autorizados», Google bloquea
 * el acceso con «no registered origin (Error 401: invalid_client)», no devuelve
 * token y la ventana se cierra. Google Identity Services lo reporta como
 * "popup_closed", que por si solo no explica nada.
 */
function traducirError(codigo: string | undefined): string {
  const origen = typeof location !== "undefined" ? location.origin : "(este sitio)";
  const ajuste =
    "Google Cloud Console → Credenciales → tu cliente OAuth → «Orígenes de JavaScript autorizados»";
  switch (codigo) {
    case "access_denied":
      return "Cancelaste el permiso de Google Drive.";
    case "popup_closed":
      return `Google cerró la ventana sin autorizar. La causa más común es que el origen ${origen} no esté agregado en ${ajuste}; en ese caso Google muestra «no registered origin (Error 401: invalid_client)». Copia el origen desde «Ajustes de Drive» y agrégalo tal cual, sin barra final.`;
    case "popup_failed_to_open":
      return "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio.";
    case "invalid_client":
      return `Google rechazó la autorización. Revisa que ${origen} esté en ${ajuste} y que el identificador corresponda a un cliente de tipo «Aplicación web».`;
    default:
      return `No se pudo autorizar con Google${codigo ? ` (${codigo})` : ""}. Origen de esta app: ${origen}.`;
  }
}

/** Abre el consentimiento de Google y devuelve un token de acceso. */
export async function conectar(clientId: string): Promise<SesionDrive> {
  const id = clientId.trim();
  if (!id) throw new Error("Falta el identificador de cliente de Google (OAuth).");
  await cargarGIS();
  const api = oauth2();
  if (!api) throw new Error("La librería de Google no quedó disponible en la página.");

  return new Promise<SesionDrive>((resolve, reject) => {
    const client = api.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(traducirError(resp.error)));
          return;
        }
        const segundos = Number(resp.expires_in) || 3600;
        resolve({
          accessToken: resp.access_token,
          expiraEn: Date.now() + segundos * 1000,
        });
      },
      error_callback: (err) => reject(new Error(traducirError(err?.type))),
    });
    client.requestAccessToken();
  });
}

export function revocar(sesion: SesionDrive): void {
  try {
    oauth2()?.revoke(sesion.accessToken);
  } catch {
    /* revocar es best-effort */
  }
}

// --- Llamadas a la Drive REST API v3 ----------------------------------------

async function pedir(token: string, url: string, init?: RequestInit): Promise<Response> {
  const respuesta = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (respuesta.status === 401) throw new SesionExpirada();
  if (!respuesta.ok) {
    throw new Error(`Google Drive respondió ${respuesta.status}. ${await respuesta.text()}`);
  }
  return respuesta;
}

function escapar(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function primerId(token: string, q: string, espacios = "drive"): Promise<string | null> {
  const url = `${DRIVE_API}?q=${encodeURIComponent(q)}&spaces=${espacios}&fields=${encodeURIComponent(
    "files(id,name)",
  )}`;
  const datos = (await (await pedir(token, url)).json()) as { files?: { id: string }[] };
  return datos.files?.[0]?.id ?? null;
}

export async function buscarCarpeta(token: string, nombre: string): Promise<string | null> {
  return primerId(
    token,
    `name = '${escapar(nombre)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
}

export async function crearCarpeta(token: string, nombre: string): Promise<string> {
  const datos = (await (
    await pedir(token, DRIVE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, mimeType: "application/vnd.google-apps.folder" }),
    })
  ).json()) as { id: string };
  return datos.id;
}

export async function buscarArchivo(
  token: string,
  carpetaId: string,
  nombre: string,
): Promise<string | null> {
  return primerId(
    token,
    `name = '${escapar(nombre)}' and '${escapar(carpetaId)}' in parents and trashed = false`,
  );
}

function cuerpoMultipart(metadata: Record<string, unknown>, contenido: string) {
  const boundary = `levantamiento${Math.random().toString(36).slice(2)}`;
  const cuerpo = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    contenido,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { boundary, cuerpo };
}

export async function crearArchivo(
  token: string,
  carpetaId: string,
  nombre: string,
  contenido: string,
): Promise<string> {
  const { boundary, cuerpo } = cuerpoMultipart(
    { name: nombre, mimeType: "application/json", parents: [carpetaId] },
    contenido,
  );
  const url = `${DRIVE_UPLOAD}?uploadType=multipart&fields=${encodeURIComponent("id,name")}`;
  const datos = (await (
    await pedir(token, url, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: cuerpo,
    })
  ).json()) as { id: string };
  return datos.id;
}

export async function leerArchivo(token: string, archivoId: string): Promise<unknown> {
  const texto = await (
    await pedir(token, `${DRIVE_API}/${archivoId}?alt=media`, { cache: "no-store" })
  ).text();
  if (!texto.trim()) return null;
  return JSON.parse(texto);
}

export async function actualizarArchivo(
  token: string,
  archivoId: string,
  contenido: string,
): Promise<void> {
  await pedir(token, `${DRIVE_UPLOAD}/${archivoId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: contenido,
  });
}

export interface UbicacionDrive {
  carpetaId: string;
  archivoId: string;
  /** true si el archivo existía de una sesión anterior en otro dispositivo. */
  existente: boolean;
}

/** Localiza (o crea) la carpeta y el archivo donde vive la base de datos. */
export async function ubicarBaseDeDatos(
  token: string,
  carpeta = NOMBRE_CARPETA,
  archivo = NOMBRE_ARCHIVO,
): Promise<UbicacionDrive> {
  const carpetaId = (await buscarCarpeta(token, carpeta)) ?? (await crearCarpeta(token, carpeta));
  const encontrado = await buscarArchivo(token, carpetaId, archivo);
  if (encontrado) return { carpetaId, archivoId: encontrado, existente: true };
  const archivoId = await crearArchivo(
    token,
    carpetaId,
    archivo,
    JSON.stringify({ version: 2, catalogo: [], estudios: [] }),
  );
  return { carpetaId, archivoId, existente: false };
}
