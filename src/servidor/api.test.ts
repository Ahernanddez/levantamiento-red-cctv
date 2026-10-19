import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { crearEspacio, crearEstudio, nuevoMaterial } from "../lib/espacio";
import { olvidarEsquema, type BaseDeDatos, type Persona } from "./almacen";
import { atenderApi } from "./api";

/**
 * Estas pruebas ejercitan la API tal como la llama el navegador, contra una base
 * D1 real con el mismo motor que producción.
 *
 * Lo único que se reemplaza es la sesión: quién es cada persona lo resuelve la
 * plataforma y sin credenciales no se puede iniciar sesión de verdad. Los
 * permisos, en cambio, se prueban enteros: son la parte que hay que poder
 * creer, y son las que deciden si alguien puede escribir en el espacio.
 */
const ORIGEN = "http://localhost:8787";

let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let db: BaseDeDatos;

/** Distingue cada corrida: el almacenamiento local se reutiliza entre pruebas. */
const corrida = Math.random().toString(36).slice(2, 8);
let contador = 0;
const persona = (nombre: string): Persona => {
  contador += 1;
  return { sub: `api-${corrida}-${nombre}-${contador}`, name: nombre };
};

beforeAll(async () => {
  // Sin persistencia: estas pruebas arman y borran espacios propios y no deben
  // compartir base con las de la capa de datos.
  proxy = await getPlatformProxy({ configPath: "wrangler.jsonc", persist: false });
  db = (proxy.env as { DB: BaseDeDatos }).DB;
  olvidarEsquema();
}, 120_000);

afterAll(async () => {
  await proxy?.dispose();
});

interface Salida {
  estado: number;
  datos: Record<string, unknown> | null;
}

/** Igual que una llamada del navegador: mismo origen, sesión ya resuelta. */
async function pedir(
  metodo: "GET" | "POST",
  ruta: string,
  quien: Persona | null,
  cuerpo?: unknown,
  origen: string | null = ORIGEN,
): Promise<Salida> {
  const headers = new Headers();
  if (metodo !== "GET") {
    if (origen) headers.set("origin", origen);
    if (cuerpo !== undefined) headers.set("content-type", "application/json");
  }
  const respuesta = await atenderApi(
    new Request(`${ORIGEN}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    }),
    { DB: db, APP_ORIGIN: ORIGEN },
    quien,
  );
  return {
    estado: respuesta.status,
    datos: (await respuesta.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

function invitacion(res: Salida): { codigo: string; rol: string } {
  const inv = res.datos?.invitacion as { codigo: string; rol: string } | undefined;
  if (!inv) throw new Error("La respuesta no trajo una invitación.");
  return inv;
}

/** Nombres de los estudios guardados, para comparar antes y después. */
async function estudiosDe(quien: Persona): Promise<string[]> {
  const res = await pedir("GET", "/api/espacio", quien);
  const espacio = res.datos?.espacio as { estudios: { nombre: string }[] } | undefined;
  return (espacio?.estudios ?? []).map((e) => e.nombre);
}

describe("sin sesión", () => {
  it("no se lee el espacio", async () => {
    expect((await pedir("GET", "/api/espacio", null)).estado).toBe(401);
  });

  it("no se escribe en el espacio", async () => {
    const res = await pedir("POST", "/api/espacio", null, { espacio: crearEspacio() });
    expect(res.estado).toBe(401);
  });

  it("no se entra con un código de invitación", async () => {
    const res = await pedir("POST", "/api/invitaciones/aceptar", null, { codigo: "ABC" });
    expect(res.estado).toBe(401);
  });
});

describe("peticiones de otro sitio", () => {
  it("se rechazan aunque haya sesión", async () => {
    const ana = persona("Ana");
    await pedir("GET", "/api/espacio", ana);

    const ajeno = await pedir("POST", "/api/invitaciones", ana, { rol: "editor" }, "https://otro.example");
    expect(ajeno.estado).toBe(403);

    const sinOrigen = await pedir("POST", "/api/invitaciones", ana, { rol: "editor" }, null);
    expect(sinOrigen.estado).toBe(403);
  });

  it("no dejan cambios a medias", async () => {
    const ana = persona("Ana");
    await pedir("POST", "/api/espacio", ana, {
      espacio: { ...crearEspacio(), estudios: [crearEstudio("Sin cambios")] },
    });

    const intruso = await pedir(
      "POST",
      "/api/espacio",
      ana,
      { espacio: { ...crearEspacio(), estudios: [crearEstudio("Metido desde afuera")] } },
      "https://otro.example",
    );
    expect(intruso.estado).toBe(403);
    expect(await estudiosDe(ana)).not.toContain("Metido desde afuera");
  });
});

describe("permisos del espacio", () => {
  /** Ana crea el espacio y reparte los dos roles; devuelve a las tres personas. */
  async function equipo() {
    const ana = persona("Ana");
    const beto = persona("Beto");
    const carla = persona("Carla");

    await pedir("POST", "/api/espacio", ana, {
      espacio: { ...crearEspacio(), estudios: [crearEstudio("Trabajo de Ana")] },
    });

    const deEditor = await pedir("POST", "/api/invitaciones", ana, { rol: "editor" });
    const entraEditor = await pedir("POST", "/api/invitaciones/aceptar", beto, {
      codigo: invitacion(deEditor).codigo,
    });
    expect(entraEditor.estado).toBe(200);

    const deLectura = await pedir("POST", "/api/invitaciones", ana, { rol: "lectura" });
    const entraLectura = await pedir("POST", "/api/invitaciones/aceptar", carla, {
      codigo: invitacion(deLectura).codigo,
    });
    expect(entraLectura.estado).toBe(200);

    return { ana, beto, carla };
  }

  it("quien crea el espacio queda como creador", async () => {
    const ana = persona("Ana");
    const res = await pedir("GET", "/api/espacio", ana);
    expect(res.estado).toBe(200);
    expect(res.datos?.rol).toBe("dueno");
  });

  it("quien entra con un enlace de edición guarda sin problema", async () => {
    const { beto } = await equipo();
    expect((await pedir("GET", "/api/espacio", beto)).datos?.rol).toBe("editor");

    const guardado = await pedir("POST", "/api/espacio", beto, {
      espacio: { ...crearEspacio(), estudios: [crearEstudio("Trabajo de Beto")] },
    });
    expect(guardado.estado).toBe(200);
    expect(await estudiosDe(beto)).toContain("Trabajo de Beto");
  });

  it("quien entra con un enlace de solo lectura no puede escribir", async () => {
    const { carla } = await equipo();
    expect((await pedir("GET", "/api/espacio", carla)).datos?.rol).toBe("lectura");

    const suyo = nuevoMaterial("Material que Carla no debería agregar");
    const intento = await pedir("POST", "/api/espacio", carla, {
      espacio: { ...crearEspacio(), catalogo: [suyo], estudios: [crearEstudio("De Carla")] },
    });

    expect(intento.estado).toBe(403);
    expect(intento.datos?.error).toContain("solo lectura");
  });

  it("lo que un lector intenta guardar no toca el espacio", async () => {
    const { ana, carla } = await equipo();
    const antes = await estudiosDe(ana);

    await pedir("POST", "/api/espacio", carla, {
      espacio: { ...crearEspacio(), estudios: [crearEstudio("De Carla")] },
    });

    expect(await estudiosDe(ana)).toEqual(antes);
    expect(await estudiosDe(ana)).not.toContain("De Carla");
  });

  it("un lector sí puede leer lo que el equipo guardó", async () => {
    const { ana, carla } = await equipo();
    await pedir("POST", "/api/espacio", ana, {
      espacio: { ...crearEspacio(), estudios: [crearEstudio("Nuevo de Ana")] },
    });
    expect(await estudiosDe(carla)).toContain("Nuevo de Ana");
  });

  it("solo el creador reparte acceso", async () => {
    const { beto, carla } = await equipo();
    expect((await pedir("POST", "/api/invitaciones", beto, { rol: "editor" })).estado).toBe(403);
    expect((await pedir("POST", "/api/invitaciones", carla, { rol: "editor" })).estado).toBe(403);
  });

  it("quien no es el creador no recibe el código de invitación", async () => {
    const { ana, beto, carla } = await equipo();
    const deAna = await pedir("POST", "/api/invitaciones", ana, { rol: "editor" });
    const codigo = invitacion(deAna).codigo;

    // Si un editor pudiera leer el código, repartiría acceso por su cuenta y el
    // permiso de "solo el creador invita" no serviría de nada.
    for (const quien of [beto, carla]) {
      const res = await pedir("GET", "/api/espacio", quien);
      expect(res.datos?.invitacion).toBeNull();
      expect(JSON.stringify(res.datos)).not.toContain(codigo);
    }

    expect((await pedir("GET", "/api/espacio", ana)).datos?.invitacion).not.toBeNull();
  });

  it("cada persona ve su propio permiso y los de los demás", async () => {
    const { ana, beto, carla } = await equipo();
    const res = await pedir("GET", "/api/espacio", ana);
    const miembros = (res.datos?.equipo as { miembros: { nombre: string; rol: string; soyYo: boolean }[] })
      .miembros;

    expect(miembros.map((m) => `${m.nombre}:${m.rol}`).sort()).toEqual([
      "Ana:dueno",
      "Beto:editor",
      "Carla:lectura",
    ]);
    expect(miembros.filter((m) => m.soyYo)).toHaveLength(1);

    const deCarla = await pedir("GET", "/api/espacio", carla);
    const suyo = (deCarla.datos?.equipo as { miembros: { soyYo: boolean; rol: string }[] }).miembros;
    expect(suyo.filter((m) => m.soyYo)[0]?.rol).toBe("lectura");

    const deBeto = await pedir("GET", "/api/espacio", beto);
    expect(deBeto.datos?.rol).toBe("editor");
  });

  it("un enlace de invitación no entrega la propiedad del espacio", async () => {
    const ana = persona("Ana");
    await pedir("GET", "/api/espacio", ana);

    const pedido = await pedir("POST", "/api/invitaciones", ana, { rol: "dueno" });
    expect(invitacion(pedido).rol).toBe("editor");

    const dani = persona("Dani");
    await pedir("POST", "/api/invitaciones/aceptar", dani, { codigo: invitacion(pedido).codigo });
    expect((await pedir("GET", "/api/espacio", dani)).datos?.rol).toBe("editor");
    expect((await pedir("GET", "/api/espacio", ana)).datos?.rol).toBe("dueno");
  });

  it("un enlace nuevo corrige el permiso de quien ya estaba", async () => {
    const { ana, carla } = await equipo();
    expect((await pedir("GET", "/api/espacio", carla)).datos?.rol).toBe("lectura");

    const ahoraEditor = await pedir("POST", "/api/invitaciones", ana, { rol: "editor" });
    const otraVez = await pedir("POST", "/api/invitaciones/aceptar", carla, {
      codigo: invitacion(ahoraEditor).codigo,
    });
    expect(otraVez.estado).toBe(200);
    expect((await pedir("GET", "/api/espacio", carla)).datos?.rol).toBe("editor");

    const guardado = await pedir("POST", "/api/espacio", carla, {
      espacio: { ...crearEspacio(), estudios: [crearEstudio("Ya puede guardar")] },
    });
    expect(guardado.estado).toBe(200);
  });

  it("ni con su propio enlace el creador se saca la propiedad", async () => {
    const ana = persona("Ana");
    await pedir("GET", "/api/espacio", ana);

    const deLectura = await pedir("POST", "/api/invitaciones", ana, { rol: "lectura" });
    await pedir("POST", "/api/invitaciones/aceptar", ana, { codigo: invitacion(deLectura).codigo });

    expect((await pedir("GET", "/api/espacio", ana)).datos?.rol).toBe("dueno");
    expect((await pedir("POST", "/api/invitaciones", ana, { rol: "editor" })).estado).toBe(200);
  });
});
