import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import {
  crearEspacio,
  crearEstudio,
  marcarBorrado,
  nuevaUnidad,
  nuevoMaterial,
} from "../lib/espacio";
import {
  aceptarInvitacion,
  asegurarEsquema,
  cambiarRolMiembro,
  espacioDe,
  equipoDe,
  fusionarEnEspacio,
  invitacionVigente,
  leerContenido,
  olvidarEsquema,
  quitarMiembro,
  rolEn,
  rotarInvitacion,
  type BaseDeDatos,
} from "./almacen";

/**
 * Estas pruebas corren contra un D1 de verdad, con el mismo motor (workerd) y
 * la misma configuración que usa el servidor publicado. Una base falsa escrita
 * a mano no probaría el SQL, que es justamente donde están la concurrencia, las
 * claves primarias y el conteo de filas cambiadas.
 */
let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let db: BaseDeDatos;

/** Distingue cada corrida: el almacenamiento local se reutiliza entre pruebas. */
const corrida = Math.random().toString(36).slice(2, 8);
let contador = 0;
const nuevaPersona = (nombre: string) => {
  contador += 1;
  return { sub: `sub-${corrida}-${nombre}-${contador}`, name: nombre };
};

beforeAll(async () => {
  proxy = await getPlatformProxy({ configPath: "wrangler.jsonc" });
  // getPlatformProxy no tipa su entorno; las claves son las de wrangler.jsonc.
  db = (proxy.env as { DB: BaseDeDatos }).DB;
  olvidarEsquema();
  await asegurarEsquema(db);
}, 120_000);

afterAll(async () => {
  await proxy?.dispose();
});

describe("esquema", () => {
  it("crea las tablas y se puede volver a pedir sin romper", async () => {
    await asegurarEsquema(db);
    const filas = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all<{ name: string }>();
    const nombres = (filas.results ?? []).map((f) => f.name);
    for (const tabla of ["contenido", "espacios", "invitaciones", "miembros"]) {
      expect(nombres).toContain(tabla);
    }
  });
});

describe("espacioDe", () => {
  it("crea el espacio con el catálogo entregado", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    const espacio = await leerContenido(db, espacioId);
    expect(espacio.catalogo.length).toBeGreaterThan(490);
    expect(espacio.estudios).toEqual([]);
  });

  it("devuelve siempre el mismo espacio para la misma persona", async () => {
    const ana = nuevaPersona("Ana");
    const primero = await espacioDe(db, ana);
    expect(await espacioDe(db, ana)).toBe(primero);
  });

  it("cada persona arranca con su propio espacio, sin ver el de las demás", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);
    const deBeto = await espacioDe(db, beto);
    expect(deAna).not.toBe(deBeto);

    await fusionarEnEspacio(db, deBeto, {
      ...crearEspacio(),
      estudios: [crearEstudio("Solo de Beto")],
    });

    const loDeAna = await leerContenido(db, deAna);
    expect(loDeAna.estudios.map((e) => e.nombre)).not.toContain("Solo de Beto");
  });

  it("guarda el nombre de la persona para poder mostrar quién está", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    const equipo = await equipoDe(db, espacioId, ana.sub);
    expect(equipo).toHaveLength(1);
    expect(equipo[0]).toEqual({
      id: ana.sub,
      nombre: "Ana",
      correo: null,
      soyYo: true,
      rol: "dueno",
    });
  });
});

describe("gestión de miembros", () => {
  /** Ana crea el espacio y Beto entra como editor. */
  async function equipoConBeto() {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const espacioId = await espacioDe(db, ana);
    const inv = await rotarInvitacion(db, espacioId, "editor");
    const entrado = await aceptarInvitacion(db, beto, inv.codigo);
    if (entrado.estado !== "entrado") throw new Error("Beto no pudo entrar.");
    return { ana, beto, espacioId };
  }

  it("cambia el rol entre editor y solo lectura", async () => {
    const { beto, espacioId } = await equipoConBeto();
    expect(await cambiarRolMiembro(db, espacioId, beto.sub, "lectura")).toEqual({ estado: "ok" });
    expect(await rolEn(db, espacioId, beto.sub)).toBe("lectura");
    expect(await cambiarRolMiembro(db, espacioId, beto.sub, "editor")).toEqual({ estado: "ok" });
    expect(await rolEn(db, espacioId, beto.sub)).toBe("editor");
  });

  it("no toca al creador ni a quien no está, y rechaza roles raros", async () => {
    const { ana, espacioId } = await equipoConBeto();
    expect(await cambiarRolMiembro(db, espacioId, ana.sub, "lectura")).toEqual({
      estado: "es-dueno",
    });
    expect(await cambiarRolMiembro(db, espacioId, "sub-fantasma", "lectura")).toEqual({
      estado: "no-miembro",
    });
    expect(await cambiarRolMiembro(db, espacioId, ana.sub, "dueno")).toEqual({
      estado: "rol-invalido",
    });
    expect(await cambiarRolMiembro(db, espacioId, ana.sub, "admin")).toEqual({
      estado: "rol-invalido",
    });
    expect(await rolEn(db, espacioId, ana.sub)).toBe("dueno");
  });

  it("quita a un miembro y lo deja fuera del equipo", async () => {
    const { ana, beto, espacioId } = await equipoConBeto();
    expect(await quitarMiembro(db, espacioId, beto.sub)).toEqual({ estado: "ok" });
    const equipo = await equipoDe(db, espacioId, ana.sub);
    expect(equipo.map((m) => m.id)).toEqual([ana.sub]);
  });

  it("al creador no se lo puede quitar, ni a quien no está", async () => {
    const { ana, espacioId } = await equipoConBeto();
    expect(await quitarMiembro(db, espacioId, ana.sub)).toEqual({ estado: "es-dueno" });
    expect(await quitarMiembro(db, espacioId, "sub-fantasma")).toEqual({ estado: "no-miembro" });
    expect(await equipoDe(db, espacioId, ana.sub)).toHaveLength(2);
  });
});

describe("fusionarEnEspacio", () => {
  it("suma sin perder lo que ya había", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    const mio = nuevoMaterial("Cable de prueba", "caja");

    await fusionarEnEspacio(db, espacioId, { ...crearEspacio(), catalogo: [mio] });
    const segundo = await fusionarEnEspacio(db, espacioId, {
      ...crearEspacio(),
      estudios: [crearEstudio("Segundo aporte")],
    });

    expect(segundo.catalogo.map((m) => m.id)).toContain(mio.id);
    expect(segundo.estudios.map((e) => e.nombre)).toContain("Segundo aporte");
  });

  it("no deja volver lo que otra persona borró", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    const estudio = crearEstudio("Se va a borrar");

    await fusionarEnEspacio(db, espacioId, { ...crearEspacio(), estudios: [estudio] });
    const conMarca = marcarBorrado(
      { ...crearEspacio(), estudios: [estudio] },
      "estudios",
      estudio.id,
    );
    await fusionarEnEspacio(db, espacioId, conMarca);

    // Otra computadora, que todavía no se enteró del borrado, manda su copia.
    const tarde = await fusionarEnEspacio(db, espacioId, {
      ...crearEspacio(),
      estudios: [estudio],
    });
    expect(tarde.estudios).toEqual([]);
  });

  it("las unidades del equipo viajan al servidor y se juntan", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    const suya = nuevaUnidad("rollo de 100 m");

    await fusionarEnEspacio(db, espacioId, { ...crearEspacio(), unidades: [suya] });
    // Otra persona del equipo agrega la suya desde su computadora.
    const final = await fusionarEnEspacio(db, espacioId, {
      ...crearEspacio(),
      unidades: [nuevaUnidad("caja de 12")],
    });

    const nombres = final.unidades.map((u) => u.nombre);
    expect(nombres).toContain(suya.nombre);
    expect(nombres).toContain("caja de 12");
    expect(nombres).toHaveLength(2);
  });

  it("no deja volver una unidad del equipo que alguien quitó", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    const unidad = nuevaUnidad("rollo de 100 m");

    await fusionarEnEspacio(db, espacioId, { ...crearEspacio(), unidades: [unidad] });
    await fusionarEnEspacio(
      db,
      espacioId,
      marcarBorrado({ ...crearEspacio(), unidades: [unidad] }, "unidades", unidad.id),
    );

    // La otra computadora todavía la tiene y manda su copia.
    const tarde = await fusionarEnEspacio(db, espacioId, {
      ...crearEspacio(),
      unidades: [unidad],
    });
    expect(tarde.unidades).toEqual([]);
  });

  it("un espacio guardado antes de que existieran las unidades propias se sigue leyendo", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    // Así era el contenido antes: sin el campo de unidades propias.
    await db
      .prepare("UPDATE contenido SET datos = ? WHERE espacio_id = ?")
      .bind(JSON.stringify({ version: 3, catalogo: [], estudios: [], borrados: {} }), espacioId)
      .run();

    const leido = await leerContenido(db, espacioId);
    expect(leido.unidades).toEqual([]);

    const despues = await fusionarEnEspacio(db, espacioId, {
      ...crearEspacio(),
      unidades: [nuevaUnidad("rollo de 100 m")],
    });
    expect(despues.unidades).toHaveLength(1);
  });

  it("dos guardados simultáneos no se pisan", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);

    const uno = nuevoMaterial("Material uno");
    const dos = nuevoMaterial("Material dos");
    await Promise.all([
      fusionarEnEspacio(db, espacioId, { ...crearEspacio(), catalogo: [uno] }),
      fusionarEnEspacio(db, espacioId, { ...crearEspacio(), catalogo: [dos] }),
    ]);

    const final = await leerContenido(db, espacioId);
    const ids = final.catalogo.map((m) => m.id);
    expect(ids).toContain(uno.id);
    expect(ids).toContain(dos.id);
  });

  it("sobrevive a un contenido guardado ilegible", async () => {
    const ana = nuevaPersona("Ana");
    const espacioId = await espacioDe(db, ana);
    await db
      .prepare("UPDATE contenido SET datos = ? WHERE espacio_id = ?")
      .bind("no es json", espacioId)
      .run();

    const despues = await fusionarEnEspacio(db, espacioId, {
      ...crearEspacio(),
      estudios: [crearEstudio("Después del daño")],
    });
    expect(despues.estudios.map((e) => e.nombre)).toContain("Después del daño");
  });
});

describe("invitaciones", () => {
  it("un código sirve para que otra persona entre al espacio", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);

    await fusionarEnEspacio(db, deAna, {
      ...crearEspacio(),
      estudios: [crearEstudio("Trabajo de Ana")],
    });
    const invitacion = await rotarInvitacion(db, deAna, "editor");

    const resultado = await aceptarInvitacion(db, beto, invitacion.codigo);
    expect(resultado.estado).toBe("entrado");
    if (resultado.estado !== "entrado") return;

    expect(resultado.espacio.estudios.map((e) => e.nombre)).toContain("Trabajo de Ana");
    const equipo = await equipoDe(db, deAna, ana.sub);
    expect(equipo).toHaveLength(2);
    expect(equipo.map((m) => m.nombre).sort()).toEqual(["Ana", "Beto"]);
    expect(equipo.filter((m) => m.soyYo)).toHaveLength(1);
  });

  it("lo que traía quien entra se suma al espacio del equipo", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);
    const deBeto = await espacioDe(db, beto);

    const propio = nuevoMaterial("Material propio de Beto");
    await fusionarEnEspacio(db, deBeto, { ...crearEspacio(), catalogo: [propio] });
    const invitacion = await rotarInvitacion(db, deAna, "editor");

    const resultado = await aceptarInvitacion(db, beto, invitacion.codigo);
    expect(resultado.estado).toBe("entrado");
    if (resultado.estado !== "entrado") return;
    expect(resultado.espacio.catalogo.map((m) => m.id)).toContain(propio.id);
  });

  it("reemplazar el código invalida el anterior", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);

    const vieja = await rotarInvitacion(db, deAna, "editor");
    const nueva = await rotarInvitacion(db, deAna, "editor");
    expect(nueva.codigo).not.toBe(vieja.codigo);
    expect(await invitacionVigente(db, deAna)).toEqual(nueva);
    expect((await aceptarInvitacion(db, beto, vieja.codigo)).estado).toBe("no-existe");
  });

  it("avisa cuando el código no existe", async () => {
    const beto = nuevaPersona("Beto");
    expect((await aceptarInvitacion(db, beto, "ZZZZZZZZ")).estado).toBe("no-existe");
    expect((await aceptarInvitacion(db, beto, "")).estado).toBe("no-existe");
  });

  it("avisa cuando la invitación venció", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);
    const invitacion = await rotarInvitacion(db, deAna, "editor");

    await db
      .prepare("UPDATE invitaciones SET expira = ? WHERE codigo = ?")
      .bind("2020-01-01T00:00:00.000Z", invitacion.codigo)
      .run();

    expect((await aceptarInvitacion(db, beto, invitacion.codigo)).estado).toBe("vencida");
  });

  it("quien ya está adentro no vuelve a entrar", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);
    const invitacion = await rotarInvitacion(db, deAna, "editor");

    await aceptarInvitacion(db, beto, invitacion.codigo);
    const otra = await rotarInvitacion(db, deAna, "editor");
    const repetido = await aceptarInvitacion(db, beto, otra.codigo);
    expect(repetido.estado).toBe("ya-estaba");
    if (repetido.estado !== "ya-estaba") return;
    expect(repetido.espacioId).toBe(deAna);
  });
});

describe("permisos", () => {
  it("quien crea el espacio es su dueño y es el único que reparte acceso", async () => {
    const ana = nuevaPersona("Ana");
    const deAna = await espacioDe(db, ana);

    expect(await rolEn(db, deAna, ana.sub)).toBe("dueno");
    const equipo = await equipoDe(db, deAna, ana.sub);
    expect(equipo[0].rol).toBe("dueno");
  });

  it("sin fila en el espacio no hay permiso, en vez de haberlo de más", async () => {
    const ana = nuevaPersona("Ana");
    const desconocido = nuevaPersona("Nadie");
    const deAna = await espacioDe(db, ana);

    expect(await rolEn(db, deAna, desconocido.sub)).toBe("lectura");
  });

  it("un rol que no entendemos no da permiso de escritura", async () => {
    const ana = nuevaPersona("Ana");
    const deAna = await espacioDe(db, ana);
    await db.prepare("UPDATE miembros SET rol = ? WHERE usuario = ?").bind("raro", ana.sub).run();

    expect(await rolEn(db, deAna, ana.sub)).toBe("lectura");
  });

  it("el permiso elegido viaja en el enlace y llega a quien entra", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const carla = nuevaPersona("Carla");
    const deAna = await espacioDe(db, ana);

    const deEditor = await rotarInvitacion(db, deAna, "editor");
    await aceptarInvitacion(db, beto, deEditor.codigo);
    const deLectura = await rotarInvitacion(db, deAna, "lectura");
    await aceptarInvitacion(db, carla, deLectura.codigo);

    expect(deEditor.rol).toBe("editor");
    expect(deLectura.rol).toBe("lectura");
    expect(await rolEn(db, deAna, beto.sub)).toBe("editor");
    expect(await rolEn(db, deAna, carla.sub)).toBe("lectura");
  });

  it("el enlace no entrega la propiedad, ni siquiera si se pide", async () => {
    const ana = nuevaPersona("Ana");
    const deAna = await espacioDe(db, ana);

    const invitacion = await rotarInvitacion(db, deAna, "dueno");
    expect(invitacion.rol).toBe("editor");
    if (invitacion.rol === "editor") {
      const invitacionCruda = await db
        .prepare("SELECT rol FROM invitaciones WHERE codigo = ?")
        .bind(invitacion.codigo)
        .first<{ rol: string }>();
      expect(invitacionCruda?.rol).toBe("editor");
    }
  });

  it("un enlace nuevo corrige el permiso de quien ya estaba adentro", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);

    const deLectura = await rotarInvitacion(db, deAna, "lectura");
    await aceptarInvitacion(db, beto, deLectura.codigo);
    expect(await rolEn(db, deAna, beto.sub)).toBe("lectura");

    const deEditor = await rotarInvitacion(db, deAna, "editor");
    const otraVez = await aceptarInvitacion(db, beto, deEditor.codigo);
    expect(otraVez.estado).toBe("ya-estaba");
    if (otraVez.estado !== "ya-estaba") return;
    expect(otraVez.rol).toBe("editor");
    expect(await rolEn(db, deAna, beto.sub)).toBe("editor");
  });

  it("ni con su propio enlace el dueño se saca la propiedad", async () => {
    const ana = nuevaPersona("Ana");
    const deAna = await espacioDe(db, ana);

    const deLectura = await rotarInvitacion(db, deAna, "lectura");
    const resultado = await aceptarInvitacion(db, ana, deLectura.codigo);
    expect(resultado.estado).toBe("ya-estaba");
    if (resultado.estado !== "ya-estaba") return;
    expect(resultado.rol).toBe("dueno");
    expect(await rolEn(db, deAna, ana.sub)).toBe("dueno");
  });
});

describe("poner al día una base que ya existía", () => {
  it("agrega la columna que falta y deja dueño al creador de cada espacio", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);
    const invitacion = await rotarInvitacion(db, deAna, "editor");
    await aceptarInvitacion(db, beto, invitacion.codigo);

    // Como si la base fuera de antes de que existieran los permisos: sin la
    // columna, todo el mundo queda en el valor por defecto.
    await db.prepare("ALTER TABLE miembros DROP COLUMN rol").run();
    await db.prepare("ALTER TABLE invitaciones DROP COLUMN rol").run();
    olvidarEsquema();
    await asegurarEsquema(db);

    // El dueño es quien creó el espacio, no quien entró después.
    expect(await rolEn(db, deAna, ana.sub)).toBe("dueno");
    expect(await rolEn(db, deAna, beto.sub)).toBe("editor");
  });

  it("no le cambia el permiso a quien ya lo tenía", async () => {
    const ana = nuevaPersona("Ana");
    const beto = nuevaPersona("Beto");
    const deAna = await espacioDe(db, ana);
    const invitacion = await rotarInvitacion(db, deAna, "lectura");
    await aceptarInvitacion(db, beto, invitacion.codigo);

    olvidarEsquema();
    await asegurarEsquema(db);

    expect(await rolEn(db, deAna, beto.sub)).toBe("lectura");
    expect(await rolEn(db, deAna, ana.sub)).toBe("dueno");
  });
});
