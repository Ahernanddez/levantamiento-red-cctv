/**
 * La API del espacio compartido, y el único lugar donde se autoriza.
 *
 * Está fuera del Worker a propósito. El Worker resuelve la sesión —eso depende
 * de la plataforma y no se puede probar sin credenciales— y le pasa la persona
 * ya identificada; acá quedan las rutas y los permisos, que sí se prueban
 * contra una base D1 real en las pruebas.
 *
 * Reglas que se cumplen acá, sin importar lo que haga la interfaz:
 *  - sin sesión no se lee ni se escribe nada (401);
 *  - lo que cambia datos tiene que venir de nuestra propia página (403);
 *  - solo el dueño del espacio reparte acceso;
 *  - quien está en solo lectura no modifica el espacio (403).
 */
import { isSameOriginRequest } from "@freebuff/auth";
import { puedeEditar, puedeInvitar, rolInvitado, type Rol } from "../lib/permisos";
import {
  NOMBRE_ESPACIO,
  aceptarInvitacion,
  asegurarEsquema,
  espacioDe,
  equipoDe,
  fusionarEnEspacio,
  invitacionVigente,
  leerContenido,
  rolEn,
  rotarInvitacion,
  type BaseDeDatos,
  type Persona,
} from "./almacen";

/** Tope del cuerpo que aceptamos, para no guardar cualquier cosa. */
const MAXIMO_CUERPO = 4 * 1024 * 1024;

export interface EntornoApi {
  DB: BaseDeDatos;
  APP_ORIGIN: string;
}

export function esRutaApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Son datos de personas: que ningún intermediario los guarde.
      "cache-control": "private, no-store",
    },
  });
}

function falla(mensaje: string, estado: number): Response {
  return json({ error: mensaje }, estado);
}

/** Lee el cuerpo con un tope de tamaño. Devuelve null si no sirve. */
async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAXIMO_CUERPO) return null;
  const texto = await request.text();
  if (texto.length > MAXIMO_CUERPO) return null;
  try {
    const datos = JSON.parse(texto) as unknown;
    return datos && typeof datos === "object" && !Array.isArray(datos)
      ? (datos as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function rutas(
  request: Request,
  env: EntornoApi,
  persona: Persona,
  url: URL,
): Promise<Response> {
  const espacioId = await espacioDe(env.DB, persona);
  const rol = await rolEn(env.DB, espacioId, persona.sub);
  const ruta = `${request.method} ${url.pathname}`;

  if (ruta === "GET /api/espacio") {
    return json({
      espacio: await leerContenido(env.DB, espacioId),
      espacioId,
      rol,
      equipo: {
        nombre: NOMBRE_ESPACIO,
        miembros: await equipoDe(env.DB, espacioId, persona.sub),
      },
      // El código es de quien reparte acceso: si lo pudiera leer cualquier
      // miembro, podría invitar por su cuenta y el permiso no serviría de nada.
      invitacion: puedeInvitar(rol) ? await invitacionVigente(env.DB, espacioId) : null,
    });
  }

  if (ruta === "POST /api/espacio") {
    // Aquí se decide si alguien puede escribir. Es el único camino de escritura,
    // así que no hay otra puerta que dejar cerrada.
    if (!puedeEditar(rol)) {
      return falla(
        "Estás en solo lectura: quien creó el espacio no te dio permiso para editarlo.",
        403,
      );
    }
    const cuerpo = await leerCuerpo(request);
    if (!cuerpo || typeof cuerpo.espacio !== "object" || cuerpo.espacio === null) {
      return falla("Falta el espacio a guardar.", 400);
    }
    return json({ espacio: await fusionarEnEspacio(env.DB, espacioId, cuerpo.espacio) });
  }

  if (ruta === "POST /api/invitaciones") {
    if (!puedeInvitar(rol)) {
      return falla("Solo quien creó el espacio puede dar acceso a otras personas.", 403);
    }
    // El rol que se entrega: editor si no se aclara, porque dar acceso es
    // justamente lo que se pidió al generar el enlace.
    const cuerpo = await leerCuerpo(request);
    const paraInvitado: Rol = rolInvitado(cuerpo?.rol);
    return json({ invitacion: await rotarInvitacion(env.DB, espacioId, paraInvitado) });
  }

  if (ruta === "POST /api/invitaciones/aceptar") {
    const cuerpo = await leerCuerpo(request);
    if (typeof cuerpo?.codigo !== "string") return falla("Falta el código de invitación.", 400);

    const resultado = await aceptarInvitacion(env.DB, persona, cuerpo.codigo);
    if (resultado.estado === "no-existe") {
      return falla("Ese código no existe o ya fue reemplazado.", 404);
    }
    if (resultado.estado === "vencida") return falla("Esa invitación venció.", 410);
    return json(resultado);
  }

  return falla("No existe esa dirección.", 404);
}

/**
 * Atiende una ruta /api/. Recibe la persona ya resuelta (o null si no hay
 * sesión): quién es lo decide la plataforma, qué puede hacer se decide acá.
 */
export async function atenderApi(
  request: Request,
  env: EntornoApi,
  persona: Persona | null,
): Promise<Response> {
  // Lo que cambia datos tiene que venir de nuestra propia página, y se revisa
  // antes que nada: una petición de otro sitio se rechaza sin siquiera mirar la
  // sesión. SameSite=Lax por sí solo no alcanza contra CSRF.
  if (request.method !== "GET" && !isSameOriginRequest(request, env.APP_ORIGIN)) {
    return falla("Origen no permitido.", 403);
  }

  if (!persona) return falla("Necesitas iniciar sesión.", 401);

  try {
    await asegurarEsquema(env.DB);
    return await rutas(request, env, persona, new URL(request.url));
  } catch (e) {
    // Nunca se registran cookies, códigos ni tokens; solo el motivo.
    console.error("Error en /api:", e instanceof Error ? e.message : e);
    return falla("No se pudo completar la operación.", 500);
  }
}
