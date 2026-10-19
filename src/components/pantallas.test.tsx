import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Espacio, Estudio, Material } from "../types";
import { crearEspacio, crearEstudio, nuevaUnidad, nuevoItem, nuevoMaterial } from "../lib/storage";
import type { ApiUnidades } from "./unidades";
import { CatalogoTab } from "./CatalogoTab";
import { DatosTab } from "./DatosTab";
import { EstudioEditor } from "./EstudioEditor";
import { EstudioList } from "./EstudioList";
import { Informe } from "./Informe";
import { ListaTab } from "./ListaTab";

const nada = () => {};

/** Las unidades del equipo con los manejadores apagados, para renderizar. */
const apiUnidades = (over: Partial<ApiUnidades> = {}): ApiUnidades => ({
  propias: [],
  ocultas: {},
  agregar: nada,
  quitar: nada,
  ocultar: nada,
  mostrar: nada,
  ...over,
});

const cable: Material = { ...nuevoMaterial("Cable UTP Cat6", "caja"), id: "m-cable" };
// Un material puede seguir contando con una unidad que el equipo ya no ofrece:
// lo que está escrito se respeta (por eso «caja» acá), solo deja de sugerirse.
const tornillo: Material = { ...nuevoMaterial("Tornillo autoperforante", "u"), id: "m-tornillo" };
const catalogo = [cable, tornillo];

function estudioBase(): Estudio {
  return {
    ...crearEstudio("Materiales sede norte"),
    id: "e1",
    cliente: "Ferretería El Tornillo",
    sitio: "Av. Los Álamos 1450",
    ciudad: "Santiago",
    realizo: "J. Ramírez",
    notas: "Falta confirmar el tendido del segundo piso.",
    items: [nuevoItem(cable.id, 4), { id: "i2", materialId: tornillo.id, cantidad: 250 }],
  };
}

function espacioBase(): Espacio {
  return { ...crearEspacio(), catalogo, estudios: [estudioBase()] };
}

const unidades = [
  nuevaUnidad("rollo de 100 m"),
  { ...nuevaUnidad("Rollo de 100 m"), id: "u-repetida" },
  nuevaUnidad("caja de 12"),
];

function etiquetasDePestana(html: string): string[] {
  return [...html.matchAll(/class="pestana(?: pestana--activa)?"[^>]*>([^<]*)</g)].map((m) => m[1]);
}

describe("pestañas del estudio", () => {
  const html = renderToStaticMarkup(
    <EstudioEditor
      estudio={estudioBase()}
      catalogo={catalogo}
      estudios={[estudioBase()]}
      unidades={apiUnidades({ propias: unidades })}
      soloLectura={false}
      actualizarEstudio={nada}
      actualizarCatalogo={nada}
      borrarMaterial={nada}
      avisar={nada}
      onVolver={nada}
      onEliminar={nada}
      onDuplicar={nada}
      onExportar={nada}
    />,
  );

  it("son exactamente Datos, Lista, Fotos y Catálogo", () => {
    expect(etiquetasDePestana(html)).toEqual(["Datos", "Lista", "Fotos", "Catálogo"]);
  });

  it("ya no quedan pestañas de Red, CCTV ni Informe", () => {
    expect(html).not.toContain(">Red<");
    expect(html).not.toContain(">CCTV<");
    expect(html).not.toContain("Red (");
    expect(html).not.toContain("CCTV (");
    expect(etiquetasDePestana(html)).not.toContain("Informe");
  });

  it("abre en Datos con el cliente y quien realizó el estudio", () => {
    expect(html).toContain("Datos del cliente");
    expect(html).toContain("Quien realiza el estudio");
    expect(html).toContain("Ferretería El Tornillo");
    expect(html).toContain("J. Ramírez");
  });

  it("lleva el informe en el documento, aunque no tenga pestaña", () => {
    // El informe va oculto en pantalla y se muestra al imprimir.
    expect(html).toContain('id="informe"');
    expect(html).toContain("Lista de materiales");
  });
});

describe("pestaña Lista", () => {
  const html = renderToStaticMarkup(
    <ListaTab
      estudio={estudioBase()}
      catalogo={catalogo}
      unidades={apiUnidades({ propias: unidades })}
      actualizar={nada}
      avisar={nada}
      soloLectura={false}
    />,
  );

  it("muestra cada material con su cantidad y unidad", () => {
    expect(html).toContain("Cable UTP Cat6");
    expect(html).toContain("Tornillo autoperforante");
    expect(html).toContain('value="4"');
    expect(html).toContain('value="250"');
  });

  it("ofrece el catálogo para agregar más", () => {
    expect(html).toContain("Agregar desde el catálogo");
    // Los ya listados se marcan para sumar de a uno
    expect(html).toContain("+1");
  });

  it("no muestra importes", () => {
    expect(html).not.toContain("$");
    expect(html).not.toContain("Subtotal");
    expect(html).not.toContain("P. unit");
  });
});

describe("pestaña Catálogo", () => {
  it("lista los materiales existentes y permite agregar", () => {
    const html = renderToStaticMarkup(
      <CatalogoTab
        catalogo={catalogo}
        estudios={[estudioBase()]}
        actualizarCatalogo={nada}
        unidades={apiUnidades({ propias: unidades })}
        borrarMaterial={nada}
        avisar={nada}
        soloLectura={false}
      />,
    );
    expect(html).toContain("Agregar un material nuevo");
    expect(html).toContain("Cable UTP Cat6");
    expect(html).toContain("Tornillo autoperforante");
    expect(html).toContain("+ Agregar al catálogo");
    expect(html).toContain('id="unidades-sugeridas"');
  });

  it("avisa en cuántos estudios se usa cada material", () => {
    const html = renderToStaticMarkup(
      <CatalogoTab
        catalogo={catalogo}
        estudios={[estudioBase()]}
        actualizarCatalogo={nada}
        unidades={apiUnidades({ propias: unidades })}
        borrarMaterial={nada}
        avisar={nada}
        soloLectura={false}
      />,
    );
    expect(html).toContain("en 1 estudio");
  });

  it("explica cuando el catálogo está vacío", () => {
    const html = renderToStaticMarkup(
      <CatalogoTab
        catalogo={[]}
        estudios={[]}
        actualizarCatalogo={nada}
        unidades={apiUnidades()}
        borrarMaterial={nada}
        avisar={nada}
        soloLectura={false}
      />,
    );
    expect(html).toContain("El catálogo está vacío");
  });

  it("deja administrar las unidades propias del equipo", () => {
    const html = renderToStaticMarkup(
      <CatalogoTab
        catalogo={catalogo}
        estudios={[]}
        actualizarCatalogo={nada}
        unidades={apiUnidades({ propias: unidades })}
        borrarMaterial={nada}
        avisar={nada}
        soloLectura={false}
      />,
    );
    expect(html).toContain("Unidades de medida");
    expect(html).toContain("Universales que usa el equipo");
    expect(html).toContain("Propias del equipo");
    expect(html).toContain("+ Agregar unidad");
    // Las dos entradas guardadas con el mismo nombre y distinto identificador se
    // muestran como una sola: una etiqueta y un botón de quitar, no dos.
    expect(html.match(/class="etiqueta-unidad__nombre">[^<]*<\/span>/g)).toHaveLength(2);
    expect(html.match(/aria-label="Quitar la unidad rollo de 100 m"/g)).toHaveLength(1);
    expect(html).toContain("caja de 12");
    // Y quedan sugeridas al escribir la unidad de un material.
    expect(html).toMatch(/<datalist id="unidades-sugeridas"[\s\S]*caja de 12/);
  });

  it("sin unidades propias lo dice, en vez de dejar el bloque vacío", () => {
    const html = renderToStaticMarkup(
      <CatalogoTab
        catalogo={catalogo}
        estudios={[]}
        actualizarCatalogo={nada}
        unidades={apiUnidades()}
        borrarMaterial={nada}
        avisar={nada}
        soloLectura={false}
      />,
    );
    expect(html).toContain("Todavía no hay unidades propias");
  });
});

describe("pantalla de estudios", () => {
  it("resume estudios y materiales del catálogo", () => {
    const html = renderToStaticMarkup(
      <EstudioList
        espacio={espacioBase()}
        soloLectura={false}
        onAbrir={nada}
        onNuevo={nada}
        onDuplicar={nada}
        onEliminar={nada}
        onExportarTodo={nada}
        onImportar={nada}
        onVaciar={nada}
      />,
    );
    expect(html).toContain("Materiales sede norte");
    expect(html).toContain("Ferretería El Tornillo");
    expect(html).toContain("materiales en el catálogo");
  });

  it("invita a crear el primero cuando no hay nada", () => {
    const html = renderToStaticMarkup(
      <EstudioList
        espacio={crearEspacio()}
        soloLectura={false}
        onAbrir={nada}
        onNuevo={nada}
        onDuplicar={nada}
        onEliminar={nada}
        onExportarTodo={nada}
        onImportar={nada}
        onVaciar={nada}
      />,
    );
    expect(html).toContain("Todavía no tienes estudios");
  });
});

describe("pestaña Datos por separado", () => {
  it("renderiza los campos del cliente y del responsable", () => {
    const html = renderToStaticMarkup(
      <DatosTab estudio={estudioBase()} actualizar={nada} soloLectura={false} />,
    );
    expect(html).toContain("Sitio");
    expect(html).toContain("Av. Los Álamos 1450");
    expect(html).toContain("Observaciones");
    expect(html).toContain("Falta confirmar el tendido del segundo piso.");
  });
});

// Con permiso de solo lectura la interfaz no puede ofrecer nada que el servidor
// vaya a rechazar. El servidor es el que manda; esto es la cortesía.
describe("estudio en solo lectura", () => {
  const html = renderToStaticMarkup(
    <EstudioEditor
      estudio={estudioBase()}
      catalogo={catalogo}
      estudios={[estudioBase()]}
      unidades={apiUnidades({ propias: unidades })}
      soloLectura
      actualizarEstudio={nada}
      actualizarCatalogo={nada}
      borrarMaterial={nada}
      avisar={nada}
      onVolver={nada}
      onEliminar={nada}
      onDuplicar={nada}
      onExportar={nada}
    />,
  );

  it("los campos se leen pero no se escriben", () => {
    expect(html).toContain("Ferretería El Tornillo");
    expect(html).toContain("readonly");
  });

  it("la fecha queda desactivada, porque en un campo de fecha readonly no sirve", () => {
    expect(html).toMatch(/type="date"[^>]*disabled/);
  });

  it("no ofrece duplicar ni eliminar el estudio", () => {
    expect(html).toMatch(/disabled[^>]*>Duplicar/);
    expect(html).toMatch(/disabled[^>]*>Eliminar/);
  });

  it("sí deja exportar, que es solo leer", () => {
    expect(html).toMatch(/Exportar JSON/);
    expect(html).not.toMatch(/disabled[^>]*>Exportar JSON/);
  });
});

describe("pantalla de estudios en solo lectura", () => {
  const html = renderToStaticMarkup(
    <EstudioList
      espacio={espacioBase()}
      soloLectura
      onAbrir={nada}
      onNuevo={nada}
      onDuplicar={nada}
      onEliminar={nada}
      onExportarTodo={nada}
      onImportar={nada}
      onVaciar={nada}
    />,
  );

  it("avisa del permiso", () => {
    expect(html).toContain("solo lectura");
  });

  it("desactiva lo que cambia datos", () => {
    expect(html).toMatch(/disabled[^>]*>\+ Nuevo estudio/);
    expect(html).toMatch(/disabled[^>]*>Duplicar/);
    expect(html).toMatch(/disabled[^>]*>Eliminar/);
    expect(html).toMatch(/disabled[^>]*>Borrar todo el contenido/);
  });

  it("deja respaldar todo, que también es solo leer", () => {
    expect(html).not.toMatch(/disabled[^>]*>Respaldar todo/);
  });
});

describe("unidad de medida en la lista", () => {
  const estudio = {
    ...estudioBase(),
    items: [
      { id: "i1", materialId: cable.id, cantidad: 4, unidad: "rollo" },
      { id: "i2", materialId: tornillo.id, cantidad: 250 },
    ],
  };
  const html = renderToStaticMarkup(
    <ListaTab
      estudio={estudio}
      catalogo={catalogo}
      unidades={apiUnidades({ propias: unidades })}
      actualizar={nada}
      avisar={nada}
      soloLectura={false}
    />,
  );

  it("ofrece las unidades del equipo, agrupadas por lo que miden", () => {
    expect(html).toContain('label="Longitud"');
    expect(html).toContain('label="Cantidad"');
    expect(html).toContain('label="Trabajo"');
    for (const u of ["m", "pie", "pieza", "lance"]) {
      expect(html).toContain(`value="${u}"`);
    }
    // Y ninguna que el equipo haya dejado afuera (la línea que ya usa «rollo»
    // lo sigue mostrando, pero no como opción para elegir).
    for (const u of ["caja", "kg", "global"]) {
      expect(html).not.toContain(`value="${u}"`);
    }
  });

  it("muestra elegida la unidad que se eligió en la línea", () => {
    expect(html).toMatch(/value="rollo"[^>]*selected|selected[^>]*value="rollo"/);
  });

  it("deja volver a la unidad del catálogo", () => {
    expect(html).toContain("La del catálogo (caja)");
  });

  it("suma las unidades del equipo en su propio grupo, sin repetirlas", () => {
    expect(html).toContain('label="Del equipo"');
    expect(html).toContain("rollo de 100 m");
    expect(html).toContain("caja de 12");
    // Una opción por desplegable (el estudio tiene dos materiales), no una por
    // cada entrada guardada: las dos que repiten el nombre dan la misma opción.
    expect(html.match(/<option value="rollo de 100 m"/g)).toHaveLength(2);
  });

  it("ofrece agregar una unidad nueva desde el desplegable", () => {
    expect(html).toContain("+ Agregar una unidad del equipo…");
  });

  it("el informe que se imprime usa la unidad elegida", () => {
    const informe = renderToStaticMarkup(<Informe estudio={estudio} catalogo={catalogo} />);
    expect(informe).toMatch(/<td>rollo<\/td>/);
  });

  it("y si la línea no eligió nada, usa la del catálogo", () => {
    const informe = renderToStaticMarkup(
      <Informe estudio={estudioBase()} catalogo={catalogo} />,
    );
    expect(informe).toMatch(/<td>caja<\/td>/);
    expect(informe).toMatch(/<td>u<\/td>/);
  });
});

describe("lista en solo lectura", () => {
  const html = renderToStaticMarkup(
    <ListaTab
      estudio={estudioBase()}
      catalogo={catalogo}
      unidades={apiUnidades({ propias: unidades })}
      actualizar={nada}
      avisar={nada}
      soloLectura
    />,
  );

  it("las cantidades se leen pero no se cambian", () => {
    expect(html).toContain('value="250"');
    expect(html).toContain("readonly");
    expect(html).toMatch(/disabled[^>]*>Quitar/);
    expect(html).toMatch(/disabled[^>]*>\+1/);
  });

  it("la unidad se lee pero no se cambia", () => {
    expect(html).toMatch(/<select[^>]*disabled/);
  });

  it("el informe se puede seguir generando, que es solo leer", () => {
    for (const boton of ["Vista previa del PDF", "Generar PDF", "Guardar PDF", "Imprimir el informe"]) {
      expect(html).toContain(`>${boton}</button>`);
      expect(html).not.toMatch(new RegExp(`disabled[^>]*>${boton}`));
    }
  });
});
