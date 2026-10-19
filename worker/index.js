/**
 * Worker del sitio: entrega la aplicación construida y resuelve la sesión.
 *
 * Nada más. Las rutas /api/ y los permisos viven en ../src/servidor/api.ts, que
 * es un módulo con tipos y con pruebas; acá queda lo único que no se puede
 * probar sin credenciales: quién es la persona que hace la petición.
 *
 * Sin sesión la aplicación sigue funcionando, pero con los datos solo en el
 * navegador: toda ruta /api/ devuelve 401 si no hay usuario.
 */
import { createFreebuffAuth } from "@freebuff/auth";
import { atenderApi, esRutaApi } from "../src/servidor/api";

async function enrutar(request, env, auth) {
  const url = new URL(request.url);

  // Todo lo que no sea /api/ lo sirve el sitio construido.
  if (!esRutaApi(url.pathname)) return env.ASSETS.fetch(request);

  const persona = await auth.getUser(request);
  return atenderApi(request, env, persona);
}

let preparado = null;

function preparar(env) {
  if (preparado) return preparado;
  const auth = createFreebuffAuth({
    clientId: env.FREEBUFF_CLIENT_ID,
    issuer: env.FREEBUFF_ISSUER,
    baseUrl: env.APP_ORIGIN,
    // Solo cuando la configuración apunta a un sitio local sin HTTPS.
    allowInsecureLocalhost: String(env.APP_ORIGIN ?? "").startsWith("http://"),
  });
  preparado = { auth, app: auth.wrap((request, e) => enrutar(request, e, auth)) };
  return preparado;
}

export default {
  fetch(request, env) {
    return preparar(env).app(request, env);
  },
};
