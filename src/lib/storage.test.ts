import { describe, expect, it } from "vitest";
import { UNIDADES_SUGERIDAS } from "../types";
import type { AjusteUnidad, Espacio, Estudio, Material, Unidad } from "../types";
import {
  agregarUnidad,
  combinarEspacios,
  crearEspacio,
  crearEstudio,
  esUnidadUniversal,
  fusionarCatalogo,
  fusionarEstudios,
  fusionarOcultas,
  fusionarUnidades,
  gruposDeUnidades,
  marcarBorrado,
  mostrarUnidad,
  nombresDeUnidades,
  nombresOcultos,
  normalizarEspacio,
  normalizarOcultas,
  normalizarUnidades,
  ocultarUnidad,
  nuevaUnidad,
  nuevoItem,
  nuevoMaterial,
  totalPorUnidad,
  unidadDe,
  unidadPorNombre,
  usosDeMaterial,
  usosDeUniversales,
} from "./storage";

const antes = new Date("2026-01-01T10:00:00.000Z").toISOString();
const despues = new Date("2026-02-01T10:00:00.000Z").toISOString();

function estudio(over: Partial<Estudio>): Estudio {
  return { ...crearEstudio("Base"), ...over };
}

function material(over: Partial<Material>): Material {
  return { ...nuevoMaterial("Base", "pieza"), ...over };
}

function unidad(over: Partial<Unidad>): Unidad {
  return { ...nuevaUnidad("Base"), ...over };
}

describe("crearEspacio", () => {
  it("arranca vacío y con la versión actual", () => {
    const e = crearEspacio();
    expect(e.catalogo).toEqual([]);
    expect(e.estudios).toEqual([]);
    expect(e.unidades).toEqual([]);
    expect(e.unidadesOcultas).toEqual({});
    expect(e.borrados).toEqual({ materiales: {}, estudios: {}, unidades: {} });
    expect(e.version).toBe(5);
  });
});

describe("normalizarEspacio", () => {
  it("lee el espacio completo con catálogo y estudios", () => {
    const bruto = {
      version: 2,
      catalogo: [{ id: "m1", nombre: "Cable UTP", unidad: "caja" }],
      estudios: [{ id: "e1", nombre: "Sede norte", cliente: "ACME" }],
    };
    const e = normalizarEspacio(bruto);
    expect(e.catalogo).toHaveLength(1);
    expect(e.catalogo[0].unidad).toBe("caja");
    expect(e.estudios).toHaveLength(1);
    expect(e.estudios[0].cliente).toBe("ACME");
    expect(e.estudios[0].items).toEqual([]);
  });

  it("acepta un arreglo de estudios", () => {
    const e = normalizarEspacio([{ nombre: "A" }, { nombre: "B" }]);
    expect(e.estudios.map((x) => x.nombre)).toEqual(["A", "B"]);
    expect(e.catalogo).toEqual([]);
  });

  it("acepta un estudio suelto", () => {
    const e = normalizarEspacio({ nombre: "Solo uno" });
    expect(e.estudios).toHaveLength(1);
    expect(e.estudios[0].nombre).toBe("Solo uno");
  });

  it("devuelve un espacio vacío si no hay nada legible", () => {
    expect(normalizarEspacio({}).estudios).toEqual([]);
    expect(normalizarEspacio(null).estudios).toEqual([]);
    expect(normalizarEspacio("texto").estudios).toEqual([]);
  });

  it("descarta materiales sin nombre y líneas sin material", () => {
    const e = normalizarEspacio({
      catalogo: [{ nombre: "  " }, { nombre: "Válido", unidad: "m" }, "basura"],
      estudios: [{ nombre: "X", items: [{ materialId: "" }, { materialId: "m1", cantidad: 3 }] }],
    });
    expect(e.catalogo).toHaveLength(1);
    expect(e.catalogo[0].nombre).toBe("Válido");
    expect(e.estudios[0].items).toHaveLength(1);
    expect(e.estudios[0].items[0].cantidad).toBe(3);
  });

  it("sanea cantidades negativas y valores no numéricos", () => {
    const e = normalizarEspacio({
      estudios: [{ nombre: "X", items: [{ materialId: "m1", cantidad: -5 }, { materialId: "m2", cantidad: "mucho" }] }],
    });
    expect(e.estudios[0].items.map((it) => it.cantidad)).toEqual([0, 0]);
  });

  it("rellena la unidad por defecto y la fecha", () => {
    const e = normalizarEspacio({ catalogo: [{ nombre: "Tornillo" }], estudios: [{ nombre: "X" }] });
    expect(e.catalogo[0].unidad).toBe("pieza");
    expect(e.estudios[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("fusionarEstudios", () => {
  it("agrega los que no existían y cuenta bien", () => {
    const r = fusionarEstudios([estudio({ id: "a", updatedAt: antes })], [estudio({ id: "b" })]);
    expect(r.elementos.map((e) => e.id)).toEqual(["a", "b"]);
    expect([r.nuevos, r.actualizados, r.ignorados]).toEqual([1, 0, 0]);
  });

  it("conserva el más reciente y no pisa trabajo nuevo con uno viejo", () => {
    const locales = [estudio({ id: "a", nombre: "Local", updatedAt: despues })];
    const viejos = [estudio({ id: "a", nombre: "Viejo", updatedAt: antes })];
    const r = fusionarEstudios(locales, viejos);
    expect(r.elementos[0].nombre).toBe("Local");
    expect(r.ignorados).toBe(1);

    const nuevos = [estudio({ id: "a", nombre: "Nuevo", updatedAt: despues, createdAt: despues })];
    const r2 = fusionarEstudios([estudio({ id: "a", nombre: "Local", updatedAt: antes })], nuevos);
    expect(r2.elementos[0].nombre).toBe("Nuevo");
    expect(r2.actualizados).toBe(1);
  });

  it("no muta la entrada y es idempotente", () => {
    const locales = [estudio({ id: "a", nombre: "Local", updatedAt: antes })];
    const entrantes = [estudio({ id: "a", nombre: "Nuevo", updatedAt: despues })];
    const primera = fusionarEstudios(locales, entrantes);
    const segunda = fusionarEstudios(primera.elementos, entrantes);
    expect(locales[0].nombre).toBe("Local");
    expect(segunda.elementos).toEqual(primera.elementos);
    expect(segunda.ignorados).toBe(1);
  });
});

describe("fusionarCatalogo", () => {
  it("suma lo que falta y conserva la edición más reciente", () => {
    const locales = [material({ id: "m1", nombre: "Cable", updatedAt: despues })];
    const entrantes = [
      material({ id: "m1", nombre: "Otro nombre", updatedAt: antes }),
      material({ id: "m2", nombre: "Tornillo" }),
    ];
    const r = fusionarCatalogo(locales, entrantes);
    expect(r.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(r[0].nombre).toBe("Cable");
  });

  it("adopta el nombre nuevo cuando la edición entrante es más reciente", () => {
    const locales = [material({ id: "m1", nombre: "Cable", updatedAt: antes })];
    const entrantes = [material({ id: "m1", nombre: "Cable cat6", updatedAt: despues })];
    expect(fusionarCatalogo(locales, entrantes)[0].nombre).toBe("Cable cat6");
  });

  it("no duplica ids repetidos", () => {
    const r = fusionarCatalogo([], [material({ id: "m1" }), material({ id: "m1" })]);
    expect(r).toHaveLength(1);
  });
});

describe("combinarEspacios", () => {
  it("une el catálogo y los estudios de las dos copias", () => {
    const local = { ...crearEspacio(), catalogo: [material({ id: "m1" })], estudios: [estudio({ id: "e1" })] };
    const remoto = { ...crearEspacio(), catalogo: [material({ id: "m2" })], estudios: [estudio({ id: "e2" })] };
    const r = combinarEspacios(local, remoto);
    expect(r.catalogo.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(r.estudios.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("no deja volver un estudio borrado en la otra computadora", () => {
    const borrado = marcarBorrado({ ...crearEspacio(), estudios: [estudio({ id: "e1" })] }, "estudios", "e1");
    // La otra copia todavía lo tiene, porque se borró después de su última sincronización.
    const copiaVieja = { ...crearEspacio(), estudios: [estudio({ id: "e1" })] };
    expect(combinarEspacios(borrado, copiaVieja).estudios).toEqual([]);
    expect(combinarEspacios(copiaVieja, borrado).estudios).toEqual([]);
  });

  it("tampoco deja volver un material borrado", () => {
    const conMaterial = { ...crearEspacio(), catalogo: [material({ id: "m1" })] };
    const borrado = marcarBorrado(conMaterial, "materiales", "m1");
    expect(combinarEspacios(borrado, conMaterial).catalogo).toEqual([]);
    expect(combinarEspacios(conMaterial, borrado).catalogo).toEqual([]);
  });

  it("borrar no toca lo demás", () => {
    const base = {
      ...crearEspacio(),
      catalogo: [material({ id: "m1" }), material({ id: "m2" })],
      estudios: [estudio({ id: "e1" })],
    };
    const r = marcarBorrado(base, "materiales", "m1");
    expect(r.catalogo.map((m) => m.id)).toEqual(["m2"]);
    expect(r.estudios.map((e) => e.id)).toEqual(["e1"]);
    expect(r.borrados.materiales.m1).toBeTruthy();
  });

  it("las marcas de borrado sobreviven a la fusión", () => {
    const conMarca = marcarBorrado(crearEspacio(), "estudios", "e9");
    const r = combinarEspacios(crearEspacio(), conMarca);
    expect(Object.keys(r.borrados.estudios)).toContain("e9");
  });
});

describe("unidades propias del equipo", () => {
  it("un espacio viejo, sin unidades propias, sigue leyéndose", () => {
    // Un respaldo o un espacio guardado antes de que existieran las unidades
    // propias no puede romper la carga: se lee sin ninguna y con todas las
    // universales disponibles.
    const viejo = { version: 3, catalogo: [], estudios: [{ nombre: "X" }] };
    expect(normalizarEspacio(viejo).unidades).toEqual([]);
    expect(normalizarEspacio(viejo).unidadesOcultas).toEqual({});
    expect(normalizarEspacio(viejo).borrados.unidades).toEqual({});
  });

  it("sanea el nombre y descarta lo que no sirve", () => {
    const leidas = normalizarUnidades([
      { id: "u1", nombre: "  rollo   de 100 m  " },
      { id: "u2", nombre: "   " },
      "basura",
      { id: "u3", nombre: "tramo de 5 m", updatedAt: antes },
    ]);
    expect(leidas.map((u) => u.nombre)).toEqual(["rollo de 100 m", "tramo de 5 m"]);
    expect(leidas[1].updatedAt).toBe(antes);
  });

  it("no deja una unidad sin nombre ni dos veces la misma", () => {
    const conRepetida = normalizarUnidades([
      { id: "u1", nombre: "Rollo de 100 m" },
      { id: "u2", nombre: "rollo de 100 m" },
      { id: "u3", nombre: "  " },
    ]);
    expect(conRepetida).toHaveLength(2);
    // Nombres distintos pero la misma unidad: se muestra una sola vez.
    expect(nombresDeUnidades(conRepetida)).toEqual(["Rollo de 100 m"]);
  });

  it("reconoce las universales sin distinguir mayúsculas ni espacios", () => {
    expect(esUnidadUniversal(" m ")).toBe(true);
    expect(esUnidadUniversal("PIEZA")).toBe(true);
    // Una que ya no está en la lista del equipo deja de ser universal: si hace
    // falta, se suma como propia y queda para todos.
    expect(esUnidadUniversal("caja")).toBe(false);
    expect(esUnidadUniversal("rollo de 100 m")).toBe(false);
    expect(esUnidadUniversal("   ")).toBe(false);
    // Una universal no se guarda como propia: ya está en el desplegable.
    expect(nombresDeUnidades([unidad({ nombre: "m" })])).toEqual([]);
  });

  it("agregar ignora lo repetido, lo universal y lo vacío", () => {
    const conUna = agregarUnidad(crearEspacio(), "rollo de 100 m");
    expect(conUna.unidades.map((u) => u.nombre)).toEqual(["rollo de 100 m"]);
    expect(agregarUnidad(conUna, "Rollo de 100 m").unidades).toHaveLength(1);
    expect(agregarUnidad(conUna, "m").unidades).toHaveLength(1);
    expect(agregarUnidad(conUna, "   ").unidades).toHaveLength(1);
  });

  it("se busca sin distinguir mayúsculas", () => {
    const unidades = [unidad({ id: "u1", nombre: "Rollo de 100 m" })];
    expect(unidadPorNombre(unidades, "rollo DE 100 m")?.id).toBe("u1");
    expect(unidadPorNombre(unidades, "otra")).toBeNull();
  });

  it("una unidad quitada no vuelve desde la copia de la otra persona", () => {
    const conUnidad: Espacio = { ...crearEspacio(), unidades: [unidad({ id: "u1" })] };
    const quitada = marcarBorrado(conUnidad, "unidades", "u1");
    expect(quitada.unidades).toEqual([]);
    expect(combinarEspacios(quitada, conUnidad).unidades).toEqual([]);
    expect(combinarEspacios(conUnidad, quitada).unidades).toEqual([]);
  });

  it("volver a agregarla después de quitarla sí la trae de vuelta", () => {
    // Se identifica por id justamente para esto: la marca vieja es de otra
    // unidad, así que no puede ganarle a la nueva.
    const conUnidad: Espacio = { ...crearEspacio(), unidades: [unidad({ id: "u1" })] };
    const quitada = marcarBorrado(conUnidad, "unidades", "u1");
    const deNuevo = agregarUnidad(quitada, "rollo de 100 m");
    expect(deNuevo.unidades).toHaveLength(1);
    expect(combinarEspacios(deNuevo, quitada).unidades).toHaveLength(1);
  });

  it("las dos computadoras suman sus unidades", () => {
    const local = { ...crearEspacio(), unidades: [unidad({ id: "u1", nombre: "rollo de 100 m" })] };
    const remoto = { ...crearEspacio(), unidades: [unidad({ id: "u2", nombre: "caja de 12" })] };
    const r = combinarEspacios(local, remoto);
    expect(nombresDeUnidades(r.unidades)).toEqual(["rollo de 100 m", "caja de 12"]);
  });

  it("con el mismo id gana la edición más reciente", () => {
    const locales = [unidad({ id: "u1", nombre: "Vieja", updatedAt: antes })];
    const entrantes = [unidad({ id: "u1", nombre: "Nueva", updatedAt: despues })];
    expect(fusionarUnidades(locales, entrantes)[0].nombre).toBe("Nueva");
  });

  it("ida y vuelta por JSON: las unidades propias sobreviven", () => {
    const original = agregarUnidad(crearEspacio(), "rollo de 100 m");
    const vuelta = normalizarEspacio(JSON.parse(JSON.stringify(original)));
    expect(nombresDeUnidades(vuelta.unidades)).toEqual(["rollo de 100 m"]);
  });
});

describe("unidades universales que el equipo no usa", () => {
  it("se ocultan por su nombre tal como figura en la aplicación", () => {
    // Escrito distinto —mayúsculas, espacios— se guarda con la forma oficial,
    // que es la única clave posible: así no hay dos ajustes para la misma.
    const conUna = ocultarUnidad(crearEspacio(), "  LANCE ");
    expect(nombresOcultos(conUna.unidadesOcultas)).toEqual(["lance"]);
    expect(Object.keys(conUna.unidadesOcultas)).toEqual(["lance"]);
  });

  it("una que no es universal no se toca", () => {
    expect(ocultarUnidad(crearEspacio(), "rollo de 100 m").unidadesOcultas).toEqual({});
  });

  it("ocultar y volver a mostrar dejan su fecha, para poder decidir al sincronizar", () => {
    const oculta = ocultarUnidad(crearEspacio(), "lance");
    expect(oculta.unidadesOcultas.lance.oculta).toBe(true);
    expect(oculta.unidadesOcultas.lance.updatedAt).toBeTruthy();

    const vuelta = mostrarUnidad(oculta, "lance");
    expect(vuelta.unidadesOcultas.lance.oculta).toBe(false);
    expect(nombresOcultos(vuelta.unidadesOcultas)).toEqual([]);
  });

  it("los grupos del desplegable dejan afuera lo que no se usa", () => {
    const conOcultas = ocultarUnidad(ocultarUnidad(crearEspacio(), "lance"), "pie");
    const grupos = gruposDeUnidades(conOcultas.unidadesOcultas);
    expect(grupos.flatMap((g) => g.unidades)).not.toContain("lance");
    expect(grupos.flatMap((g) => g.unidades)).not.toContain("pie");
    // El resto sigue ofreciéndose tal como viene.
    expect(grupos.flatMap((g) => g.unidades)).toContain("m");
    expect(grupos.map((g) => g.grupo)).toContain("Longitud");
  });

  it("un grupo que se queda sin nada no aparece", () => {
    let espacio = crearEspacio();
    for (const u of ["m", "pie"]) espacio = ocultarUnidad(espacio, u);
    expect(gruposDeUnidades(espacio.unidadesOcultas).map((g) => g.grupo)).not.toContain("Longitud");
  });

  it("lo guardado que no es una unidad se descarta", () => {
    const leidas = normalizarOcultas({ pie: { oculta: true, updatedAt: antes }, inventada: { oculta: true } });
    expect(Object.keys(leidas)).toEqual(["pie"]);
    // Y una que estuvo y ya no: su ajuste viejo se ignora, no queda de fantasma.
    expect(normalizarOcultas({ yarda: { oculta: true, updatedAt: antes } })).toEqual({});
  });

  it("al combinar gana la última decisión, en los dos sentidos", () => {
    const ocultaVieja: Record<string, AjusteUnidad> = { pie: { oculta: true, updatedAt: antes } };
    const mostradaNueva: Record<string, AjusteUnidad> = {
      pie: { oculta: false, updatedAt: despues },
    };
    expect(nombresOcultos(fusionarOcultas(ocultaVieja, mostradaNueva))).toEqual([]);
    expect(nombresOcultos(fusionarOcultas(mostradaNueva, ocultaVieja))).toEqual([]);

    const ocultaNueva: Record<string, AjusteUnidad> = { pie: { oculta: true, updatedAt: despues } };
    expect(nombresOcultos(fusionarOcultas(ocultaVieja, ocultaNueva))).toEqual(["pie"]);
    expect(nombresOcultos(fusionarOcultas(ocultaNueva, ocultaVieja))).toEqual(["pie"]);
  });

  it("con la misma fecha queda a la vista, y da igual el orden", () => {
    // Dos computadoras decidiendo en el mismo milisegundo no pueden quedar cada
    // una con lo suyo: el desempate no depende de quién llegó primero.
    const conLaMismaFecha: Record<string, AjusteUnidad> = {
      pie: { oculta: true, updatedAt: despues },
    };
    const mostrada: Record<string, AjusteUnidad> = { pie: { oculta: false, updatedAt: despues } };
    expect(nombresOcultos(fusionarOcultas(conLaMismaFecha, mostrada))).toEqual([]);
    expect(nombresOcultos(fusionarOcultas(mostrada, conLaMismaFecha))).toEqual([]);
  });

  it("ocultar en una computadora y volver a mostrar en la otra terminan de acuerdo", () => {
    const ocultado = ocultarUnidad(crearEspacio(), "pie");
    const mostrado = mostrarUnidad(crearEspacio(), "pie");

    // Las dos decisiones son las mismas en las dos computadoras; lo que cambia
    // es cuándo se tomaron, y eso se fija acá para no depender del reloj.
    const conFecha = (e: Espacio, updatedAt: string): Espacio => ({
      ...e,
      unidadesOcultas: { pie: { oculta: e.unidadesOcultas.pie.oculta, updatedAt } },
    });

    // Decididas en el mismo momento: gana «se usa», sin importar el orden.
    const enElMismoMomento = [conFecha(ocultado, antes), conFecha(mostrado, antes)];
    expect(nombresOcultos(combinarEspacios(enElMismoMomento[0], enElMismoMomento[1]).unidadesOcultas)).toEqual([]);
    expect(nombresOcultos(combinarEspacios(enElMismoMomento[1], enElMismoMomento[0]).unidadesOcultas)).toEqual([]);

    // Y mostrarla después de ocultarla también vale en las dos.
    expect(
      nombresOcultos(combinarEspacios(conFecha(ocultado, antes), conFecha(mostrado, despues)).unidadesOcultas),
    ).toEqual([]);
    expect(
      nombresOcultos(combinarEspacios(conFecha(mostrado, despues), conFecha(ocultado, antes)).unidadesOcultas),
    ).toEqual([]);
  });

  it("ida y vuelta por JSON: lo oculto sigue oculto", () => {
    const original = ocultarUnidad(agregarUnidad(crearEspacio(), "rollo de 100 m"), "pie");
    const vuelta = normalizarEspacio(JSON.parse(JSON.stringify(original)));
    expect(nombresOcultos(vuelta.unidadesOcultas)).toEqual(["pie"]);
    expect(nombresDeUnidades(vuelta.unidades)).toEqual(["rollo de 100 m"]);
  });
});

describe("usosDeMaterial", () => {
  it("cuenta en cuántos estudios se usa un material", () => {
    const m1 = material({ id: "m1" });
    const a = estudio({ id: "a", items: [nuevoItem(m1.id, 2)] });
    const b = estudio({ id: "b", items: [nuevoItem(m1.id, 1), nuevoItem("m2", 5)] });
    const c = estudio({ id: "c" });
    expect(usosDeMaterial([a, b, c], "m1")).toBe(2);
    expect(usosDeMaterial([a, b, c], "m2")).toBe(1);
    expect(usosDeMaterial([a, b, c], "m9")).toBe(0);
  });
});

describe("usosDeUniversales", () => {
  const metro = material({ id: "m1", nombre: "Cable THHN", unidad: "m" });
  const porPie = material({ id: "m2", nombre: "Cable TSJ", unidad: "pie" });
  const suelta = material({ id: "m3", nombre: "Tornillo", unidad: "pieza" });
  const catalogo = [metro, porPie, suelta];

  it("cuenta los materiales del catálogo que la tienen y las líneas que la usan", () => {
    const a = estudio({ id: "a", items: [nuevoItem(suelta.id, 4), nuevoItem(metro.id, 2)] });
    const b = estudio({ id: "b", items: [nuevoItem(metro.id, 1, "m")] });

    expect(usosDeUniversales(catalogo, [a, b], ["m", "lance"])).toEqual({
      m: { materiales: 1, lineas: 2 },
      lance: { materiales: 0, lineas: 0 },
    });
  });

  it("una línea sin unidad propia cuenta con la del material", () => {
    const a = estudio({ id: "a", items: [nuevoItem(suelta.id, 4)] });
    expect(usosDeUniversales(catalogo, [a], ["pieza"]).pieza.lineas).toBe(1);
  });

  it("no se le escapa una unidad escrita con otras mayúsculas o de más", () => {
    const raro = material({ id: "m4", nombre: "Cable", unidad: "  PIE " });
    const usos = usosDeUniversales([raro], [], ["pie"]);
    expect(usos.pie.materiales).toBe(1);
  });

  it("una unidad propia no se confunde con una universal", () => {
    const a = estudio({ id: "a", items: [nuevoItem(metro.id, 2, "rollo de 100 m")] });
    expect(usosDeUniversales(catalogo, [a], ["m"]).m.lineas).toBe(0);
  });
});

describe("la lista de unidades del equipo", () => {
  it("es la que el equipo necesita, ni una más", () => {
    expect(UNIDADES_SUGERIDAS).toEqual(["m", "pie", "pieza", "lance"]);
    expect(gruposDeUnidades({})).toEqual([
      { grupo: "Longitud", unidades: ["m", "pie"] },
      { grupo: "Cantidad", unidades: ["pieza"] },
      { grupo: "Trabajo", unidades: ["lance"] },
    ]);
  });

  it("una unidad que ya no está en la lista se sigue leyendo donde está escrita", () => {
    // Sacarla de la lista no puede cambiar lo que dice una lista de materiales.
    const a = estudio({ id: "a", items: [nuevoItem("m1", 3, "caja")] });
    const vuelta = normalizarEspacio(
      JSON.parse(JSON.stringify({ ...crearEspacio(), estudios: [a] })),
    );
    expect(unidadDe(vuelta.estudios[0].items[0])).toBe("caja");
  });

  it("lo guardado con la unidad vieja «u» pasa a llamarse «pieza»", () => {
    const bruto = {
      version: 5,
      catalogo: [
        { id: "m1", nombre: "Tornillo", unidad: "u" },
        { id: "m2", nombre: "Cable THHN", unidad: "m" },
      ],
      estudios: [
        {
          id: "e1",
          nombre: "Sede",
          items: [{ id: "i1", materialId: "m1", cantidad: 2, unidad: "U" }],
        },
      ],
    };

    const e = normalizarEspacio(bruto);

    expect(e.catalogo.map((m) => m.unidad)).toEqual(["pieza", "m"]);
    expect(e.estudios[0].items[0].unidad).toBe("pieza");
  });
});

describe("ida y vuelta por JSON", () => {
  it("conserva estudios y catálogo", () => {
    const m = material({ id: "m1", nombre: "Cable UTP", unidad: "caja" });
    const original = {
      version: 2,
      catalogo: [m],
      estudios: [estudio({ id: "e1", nombre: "Sede", items: [nuevoItem(m.id, 4)] })],
    };
    const vuelta = normalizarEspacio(JSON.parse(JSON.stringify(original)));
    expect(vuelta.estudios[0].items[0]).toEqual(original.estudios[0].items[0]);
    expect(vuelta.catalogo).toEqual([m]);
  });

  it("conserva la unidad elegida en la línea", () => {
    const m = material({ id: "m1", nombre: "Cable UTP", unidad: "caja" });
    const conUnidad = { ...estudio({ id: "e1" }), items: [nuevoItem(m.id, 4, "rollo")] };
    const vuelta = normalizarEspacio(
      JSON.parse(JSON.stringify({ ...crearEspacio(), catalogo: [m], estudios: [conUnidad] })),
    );
    expect(vuelta.estudios[0].items[0].unidad).toBe("rollo");
    expect(unidadDe(vuelta.estudios[0].items[0], m)).toBe("rollo");
  });

  it("a un estudio viejo, sin unidad en la línea, no le inventa ninguna", () => {
    const bruto = {
      version: 2,
      catalogo: [{ id: "m1", nombre: "Cable UTP", unidad: "caja" }],
      estudios: [{ id: "e1", nombre: "Viejo", items: [{ id: "i1", materialId: "m1", cantidad: 3 }] }],
    };
    const vuelta = normalizarEspacio(bruto);
    expect(vuelta.estudios[0].items[0].unidad).toBe("");
  });
});

describe("unidadDe", () => {
  const cable = material({ id: "m1", nombre: "Cable UTP", unidad: "caja" });

  it("sin unidad propia usa la del catálogo", () => {
    expect(unidadDe(nuevoItem(cable.id, 1), cable)).toBe("caja");
  });

  it("la unidad elegida manda sobre la del catálogo", () => {
    expect(unidadDe(nuevoItem(cable.id, 1, "rollo"), cable)).toBe("rollo");
  });

  it("sin catálogo ni unidad propia no queda vacío", () => {
    expect(unidadDe(nuevoItem("m9", 1))).toBe("pieza");
  });

  it("una unidad en blanco se toma como «la del catálogo»", () => {
    expect(unidadDe(nuevoItem(cable.id, 1, "   "), cable)).toBe("caja");
  });
});

describe("totalPorUnidad", () => {
  const cable = material({ id: "m1", nombre: "Cable UTP", unidad: "caja" });
  const fuente = material({ id: "m2", nombre: "Fuente", unidad: "u" });
  const porId = new Map([cable, fuente].map((m) => [m.id, m] as const));

  it("no mezcla cantidades de unidades distintas", () => {
    const items = [nuevoItem(cable.id, 4), nuevoItem(fuente.id, 250), nuevoItem(cable.id, 2)];
    expect(totalPorUnidad(items, porId)).toEqual([
      { unidad: "u", total: 250 },
      { unidad: "caja", total: 6 },
    ]);
  });

  it("suma las líneas que comparten unidad, aunque una la elija a mano", () => {
    const items = [nuevoItem(cable.id, 4), nuevoItem(fuente.id, 1, "caja")];
    expect(totalPorUnidad(items, porId)).toEqual([{ unidad: "caja", total: 5 }]);
  });

  it("una lista vacía no da totales", () => {
    expect(totalPorUnidad([], porId)).toEqual([]);
  });
});
