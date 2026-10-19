/**
 * Service worker: hace que la app se pueda instalar y que abra sin internet.
 *
 * Estrategia:
 *  - Navegación (el HTML): primero la red, y si no hay, lo guardado. Así una
 *    versión nueva se ve enseguida y no queda pegada la vieja.
 *  - Recursos (JS, CSS, iconos): primero lo guardado. Los nombres llevan hash
 *    del contenido, así que un archivo con el mismo nombre nunca cambia.
 *  - /api/: nunca se guarda. Los datos del equipo siempre se piden frescos.
 *
 * Sube VERSION cuando cambie la lista de archivos del armazón.
 */
const VERSION = "materiales-2";
/**
 * Raíz que atiende este service worker: en el sitio publicado es el dominio y
 * en GitHub Pages (sitio de proyecto) el subdirectorio /<repo>/. Todo lo
 * guardado cuelga de acá para que en ambos casos abra sin internet.
 */
const BASE = (() => {
  try {
    const alcance = self.registration?.scope;
    if (typeof alcance === "string" && alcance) return new URL(alcance).pathname;
  } catch {
    // Sin registro a la vista, se asume raíz como antes.
  }
  return "/";
})();
const ARMAZON = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}iconos/icono-192.png`,
  `${BASE}iconos/icono-512.png`,
  `${BASE}iconos/manzana-180.png`,
];

/** Tope de archivos guardados, para que la caché no crezca sin control. */
const MAXIMO = 80;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // addAll falla entero si un archivo falta; mejor uno por uno.
      await Promise.all(
        ARMAZON.map((ruta) => cache.add(new Request(ruta, { cache: "reload" })).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n)));

      const cache = await caches.open(VERSION);
      const guardados = await cache.keys();
      if (guardados.length > MAXIMO) {
        await Promise.all(
          guardados.slice(0, guardados.length - MAXIMO).map((k) => cache.delete(k)),
        );
      }

      await self.clients.claim();
    })(),
  );
});

async function redPrimero(peticion) {
  const cache = await caches.open(VERSION);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta && respuesta.ok) {
      // Se guarda como index.html porque es lo que se pide al abrir sin red.
      await cache.put(`${BASE}index.html`, respuesta.clone());
    }
    return respuesta;
  } catch {
    return (
      (await cache.match(`${BASE}index.html`)) ??
      (await cache.match(BASE)) ??
      new Response("Sin conexión y sin copia guardada.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cachePrimero(peticion) {
  const cache = await caches.open(VERSION);
  const guardado = await cache.match(peticion);
  if (guardado) return guardado;

  const respuesta = await fetch(peticion);
  if (respuesta && respuesta.ok && respuesta.type === "basic") {
    await cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // La sesión vive en /auth/freebuff/session y cambia con cada entrada o
  // salida: si se guardara, al recargar se repetiría la respuesta vieja (por
  // ejemplo «sin usuario») y parecería que la sesión se perdió.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/sw.js"
  )
    return;

  if (request.mode === "navigate") {
    evento.respondWith(redPrimero(request));
    return;
  }
  evento.respondWith(cachePrimero(request));
});
