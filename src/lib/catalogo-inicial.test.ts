import { afterEach, describe, expect, it, vi } from "vitest";
import crudo from "../datos/catalogo-inicial.json";
import {
  cargarEspacio,
  crearEspacio,
  crearEstudio,
  fusionarCatalogo,
  guardarEspacio,
  normalizarEspacio,
  nuevoMaterial,
  sembrarCatalogoInicial,
} from "./storage";

/**
 * El catálogo que se entrega con la aplicación (src/datos/catalogo-inicial.json)
 * se genera desde datos/lista-materiales.txt ejecutando
 * «node scripts/generar-catalogo.mjs».
 *
 * Estas pruebas usan el archivo real, no uno de ejemplo: la garantía que
 * importa es que ninguna entrada se pierda al cargarla, porque una pérdida
 * silenciosa solo se notaría cuando alguien busque un material y no esté.
 */
const cargado = normalizarEspacio(crudo).catalogo;

describe("catálogo inicial entregado", () => {
  it("declara la versión que entiende la aplicación y no trae estudios", () => {
    expect(crudo.version).toBe(2);
    expect(Array.isArray(crudo.catalogo)).toBe(true);
    expect(crudo.estudios).toEqual([]);
  });

  it("trae el listado completo", () => {
    expect(crudo.catalogo.length).toBeGreaterThan(490);
  });

  it("lo carga sin perder ni una entrada", () => {
    expect(cargado).toHaveLength(crudo.catalogo.length);
    expect(cargado.map((m) => m.nombre)).toEqual(crudo.catalogo.map((m) => m.nombre));
    expect(cargado.map((m) => m.id)).toEqual(crudo.catalogo.map((m) => m.id));
    // La unidad «u» del archivo se lee con el nombre que el equipo usa hoy.
    expect(cargado.some((m) => m.unidad === "pieza")).toBe(true);
    expect(cargado.some((m) => m.unidad === "u")).toBe(false);
  });

  it("no repite identificadores ni deja nombres vacíos", () => {
    const ids = new Set(cargado.map((m) => m.id));
    expect(ids.size).toBe(cargado.length);
    expect(cargado.every((m) => m.id.trim() !== "" && m.nombre.trim() !== "")).toBe(true);
  });

  it("usa solo las unidades previstas", () => {
    const permitidas = new Set(["pieza", "m", "pie", "lance"]);
    expect(cargado.filter((m) => !permitidas.has(m.unidad)).map((m) => m.nombre)).toEqual([]);
  });

  it("marca por longitud solo lo que se cobra por metro o por pie", () => {
    const porLongitud = cargado.filter((m) => m.unidad !== "pieza");
    expect(porLongitud.length).toBeGreaterThan(0);
    expect(porLongitud.every((m) => /metro|\(ML\)|pie/i.test(m.nombre))).toBe(true);
    const unidad = (nombre: string) => cargado.find((m) => m.nombre === nombre)?.unidad;
    expect(unidad("Instalacion de FO (X metro)")).toBe("m");
    expect(unidad("Ranura y resane de aceras de concreto (ML)")).toBe("m");
    expect(unidad("Tuberia BX con forro de 3/4 x PIE")).toBe("pie");
    // Un equipo completo se cuenta por pieza aunque su línea traiga una medida.
    expect(cargado.find((m) => m.nombre.includes("TL-SG1008MP"))?.unidad).toBe("pieza");
  });

  it("conserva el modelo en el nombre, para poder buscarlo", () => {
    for (const modelo of ["GAFO-0068", "DS-2CD1023G0E-I", "F22/ID/ADMS", "TL-SG1008MP", "GAC2570"]) {
      expect(cargado.some((m) => m.nombre.includes(modelo))).toBe(true);
    }
  });

  it("se puede importar a mano dos veces sin duplicar el catálogo", () => {
    const primera = fusionarCatalogo([], cargado);
    expect(fusionarCatalogo(primera, cargado)).toHaveLength(primera.length);
  });
});

describe("sembrarCatalogoInicial", () => {
  it("carga el catálogo la primera vez", () => {
    const espacio = sembrarCatalogoInicial(crearEspacio(), cargado, false);
    expect(espacio.catalogo).toHaveLength(cargado.length);
    expect(espacio.estudios).toEqual([]);
  });

  it("no vuelve a sembrar si ya se hizo, para que borrar sea definitivo", () => {
    const espacio = sembrarCatalogoInicial(crearEspacio(), cargado, true);
    expect(espacio.catalogo).toEqual([]);
  });

  it("respeta lo que la persona ya tenía cargado", () => {
    const mio = nuevoMaterial("Mi material", "pieza");
    const espacio = sembrarCatalogoInicial({ ...crearEspacio(), catalogo: [mio] }, cargado, false);
    expect(espacio.catalogo).toHaveLength(cargado.length + 1);
    expect(espacio.catalogo).toContainEqual(mio);
  });

  it("no toca los estudios", () => {
    const estudio = crearEstudio("Sede norte");
    const espacio = sembrarCatalogoInicial({ ...crearEspacio(), estudios: [estudio] }, cargado, false);
    expect(espacio.estudios).toEqual([estudio]);
  });
});

function almacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
    clear: () => datos.clear(),
    key: (i) => [...datos.keys()][i] ?? null,
    get length() {
      return datos.size;
    },
  } as Storage;
}

describe("primera carga de la aplicación", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("siembra el catálogo al abrir por primera vez", () => {
    vi.stubGlobal("localStorage", almacenFalso());
    const espacio = cargarEspacio();
    expect(espacio.catalogo).toHaveLength(cargado.length);
    expect(espacio.estudios).toEqual([]);
  });

  it("no revive un material que la persona borró y volvió a guardar", () => {
    vi.stubGlobal("localStorage", almacenFalso());
    const primera = cargarEspacio();
    guardarEspacio(primera);

    const sinUno = {
      ...primera,
      catalogo: primera.catalogo.filter((m) => m.id !== primera.catalogo[0].id),
    };
    guardarEspacio(sinUno);

    expect(cargarEspacio().catalogo).toHaveLength(cargado.length - 1);
  });

  it("recuerda los estudios entre recargas", () => {
    vi.stubGlobal("localStorage", almacenFalso());
    const espacio = cargarEspacio();
    const estudio = crearEstudio("Sede norte");
    guardarEspacio({ ...espacio, estudios: [estudio] });
    expect(cargarEspacio().estudios.map((e) => e.nombre)).toEqual(["Sede norte"]);
  });
});
