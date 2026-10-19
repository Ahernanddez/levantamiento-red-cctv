// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AjusteUnidad, Estudio, Material, Unidad } from "../types";
import { crearEstudio, nuevaUnidad, nuevoItem, nuevoMaterial } from "../lib/espacio";
import { ListaTab } from "./ListaTab";

/**
 * Elegir la unidad se prueba como lo hace una persona: montando la lista y
 * cambiando el desplegable. Lo que importa es que el cambio llegue al estudio
 * como unidad de esa línea y no como otra cosa.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cable: Material = { ...nuevoMaterial("Cable UTP Cat6", "caja"), id: "m-cable" };
const tornillo: Material = { ...nuevoMaterial("Tornillo autoperforante", "u"), id: "m-tornillo" };
const catalogo = [cable, tornillo];

const estudio: Estudio = {
  ...crearEstudio("Materiales sede norte"),
  id: "e1",
  items: [nuevoItem(cable.id, 4), nuevoItem(tornillo.id, 250)],
};

let contenedor: HTMLDivElement | null = null;
let raiz: Root | null = null;

/**
 * Monta la lista con lo mínimo que necesita y devuelve los espías de lo que
 * puede pedirle al espacio del equipo.
 */
function montarLista(
  props: {
    estudio?: Estudio;
    unidades?: Unidad[];
    ocultas?: Record<string, AjusteUnidad>;
    soloLectura?: boolean;
  } = {},
) {
  const actualizar = vi.fn();
  const agregar = vi.fn();
  const quitar = vi.fn();
  const ocultar = vi.fn();
  const mostrar = vi.fn();
  const avisar = vi.fn();
  montar(
    <ListaTab
      estudio={props.estudio ?? estudio}
      catalogo={catalogo}
      unidades={{
        propias: props.unidades ?? [],
        ocultas: props.ocultas ?? {},
        agregar,
        quitar,
        ocultar,
        mostrar,
      }}
      actualizar={actualizar}
      avisar={avisar}
      soloLectura={props.soloLectura ?? false}
    />,
  );
  return { actualizar, agregar, quitar, ocultar, mostrar, avisar };
}

function montar(elemento: ReactElement): void {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  act(() => {
    raiz?.render(elemento);
  });
}

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  contenedor?.remove();
  contenedor = null;
  raiz = null;
});

/** Cambia el valor de un <select> como si lo hubiera hecho alguien. */
function elegir(select: HTMLSelectElement, valor: string): void {
  const definicion = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  act(() => {
    definicion?.set?.call(select, valor);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Escribe en un campo de texto respetando el estado controlado de React. */
function escribir(entrada: HTMLInputElement, texto: string): void {
  const definicion = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  act(() => {
    definicion?.set?.call(entrada, texto);
    entrada.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pulsar(elemento: HTMLElement, tecla: string): void {
  act(() => {
    elemento.dispatchEvent(new KeyboardEvent("keydown", { key: tecla, bubbles: true }));
  });
}

function selects(): HTMLSelectElement[] {
  return [...(contenedor?.querySelectorAll("select") ?? [])] as HTMLSelectElement[];
}

function click(elemento: Element): void {
  act(() => {
    elemento.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Un botón por su texto, para no depender de la posición en la fila. */
function boton(texto: string): HTMLElement {
  const encontrado = [...(contenedor?.querySelectorAll("button") ?? [])].find(
    (b) => (b.textContent ?? "").trim() === texto,
  );
  if (!encontrado) throw new Error(`No hay un botón «${texto}».`);
  return encontrado as HTMLElement;
}

/** Aplica la función que el componente le pasó a «actualizar» sobre el estudio. */
function aplicar(fn: ReturnType<typeof vi.fn>, base: Estudio): Estudio {
  const actualizar = fn.mock.calls[0]?.[0] as ((e: Estudio) => Estudio) | undefined;
  if (!actualizar) throw new Error("La lista no pidió actualizar nada.");
  return actualizar(base);
}

describe("elegir la unidad en la lista", () => {
  it("hay un desplegable por material, con la unidad del catálogo elegida", () => {
    montarLista();
    const desplegables = selects();
    expect(desplegables).toHaveLength(2);
    // Sin unidad propia, la opción elegida es «la del catálogo».
    expect(desplegables[0].value).toBe("");
    expect(desplegables[0].options[0].textContent).toContain("caja");
  });

  it("elegir una unidad la guarda en esa línea y no toca las otras", () => {
    const { actualizar } = montarLista();

    elegir(selects()[0], "pie");

    const resultado = aplicar(actualizar, estudio);
    expect(resultado.items[0].unidad).toBe("pie");
    expect(resultado.items[1].unidad).toBe("");
    expect(resultado.items[0].cantidad).toBe(4);
  });

  it("volver a «la del catálogo» deja la línea como estaba", () => {
    const conUnidad: Estudio = {
      ...estudio,
      items: [{ ...estudio.items[0], unidad: "rollo" }, estudio.items[1]],
    };
    const { actualizar } = montarLista({ estudio: conUnidad });

    expect(selects()[0].value).toBe("rollo");
    elegir(selects()[0], "");

    expect(aplicar(actualizar, conUnidad).items[0].unidad).toBe("");
  });

  it("el total se muestra separado por unidad, sin mezclarlas", () => {
    const conUnidad: Estudio = {
      ...estudio,
      items: [{ ...estudio.items[0], unidad: "rollo" }, estudio.items[1]],
    };
    montarLista({ estudio: conUnidad });
    const texto = contenedor?.textContent ?? "";
    expect(texto).toContain("4 rollo");
    expect(texto).toContain("250 u");
    // Y avisa por qué no hay un único total.
    expect(texto).toContain("no se suman entre sí");
  });
});

describe("las unidades propias del equipo en la lista", () => {
  const propias = [nuevaUnidad("rollo de 100 m"), nuevaUnidad("caja de 12")];

  it("aparecen en su propio grupo del desplegable", () => {
    montarLista({ unidades: propias });
    const grupos = [...(selects()[0].querySelectorAll("optgroup") ?? [])].map(
      (g) => g.getAttribute("label"),
    );
    expect(grupos).toContain("Del equipo");
    expect([...selects()[0].options].some((o) => o.value === "rollo de 100 m")).toBe(true);
  });

  it("la misma unidad agregada por dos personas se ofrece una sola vez", () => {
    // Dos entradas con el mismo nombre y distinto identificador: es lo que queda
    // al fusionar lo que agregó cada uno, y no puede verse repetido.
    montarLista({
      unidades: [nuevaUnidad("rollo de 100 m"), nuevaUnidad("rollo de 100 m")],
    });
    const opciones = [...selects()[0].options].filter((o) => o.value === "rollo de 100 m");
    expect(opciones).toHaveLength(1);
  });

  it("elegir una del equipo la guarda como unidad de esa línea", () => {
    const { actualizar } = montarLista({ unidades: propias });

    elegir(selects()[0], "rollo de 100 m");

    expect(aplicar(actualizar, estudio).items[0].unidad).toBe("rollo de 100 m");
  });

  it("una unidad guardada que ya no está en la lista no se pierde de vista", () => {
    const conUnidad: Estudio = {
      ...estudio,
      items: [{ ...estudio.items[0], unidad: "caja de 12" }, estudio.items[1]],
    };
    montarLista({ estudio: conUnidad, unidades: [] });
    expect(selects()[0].value).toBe("caja de 12");
    expect(selects()[0].selectedOptions[0].textContent).toContain("actual");
  });

  it("una universal que el equipo ocultó sigue puesta donde ya se usaba", () => {
    const conUnidad: Estudio = {
      ...estudio,
      items: [{ ...estudio.items[0], unidad: "pie" }, estudio.items[1]],
    };
    montarLista({
      estudio: conUnidad,
      ocultas: { pie: { oculta: true, updatedAt: new Date(0).toISOString() } },
    });

    // La línea que la usa la conserva, marcada como actual…
    expect(selects()[0].value).toBe("pie");
    expect(selects()[0].selectedOptions[0].textContent).toContain("actual");
    // …y para las demás líneas ya no se ofrece.
    expect([...selects()[1].options].some((o) => o.value === "pie")).toBe(false);
  });

  it("saca del desplegable una universal que estorba, sin salir de la línea", () => {
    const conUnidad: Estudio = {
      ...estudio,
      items: [{ ...estudio.items[0], unidad: "lance" }, estudio.items[1]],
    };
    const { actualizar, ocultar, avisar } = montarLista({
      estudio: conUnidad,
      ocultas: { pie: { oculta: true, updatedAt: new Date(0).toISOString() } },
    });

    elegir(selects()[0], "__ocultar-del-desplegable__");

    // Se elige entre las universales que el equipo usa (no entre las ya ocultas)…
    const elegidor = contenedor?.querySelector<HTMLSelectElement>(
      '[aria-label^="Unidad que se oculta"]',
    );
    expect([...elegidor!.options].map((o) => o.value)).not.toContain("pie");
    // …y viene elegida la de esta línea, que es la que se está mirando.
    expect(elegidor!.value).toBe("lance");

    click(boton("Ocultar"));

    expect(ocultar).toHaveBeenCalledWith("lance");
    expect(String(avisar.mock.calls[0]?.[0])).toContain("queda fuera del desplegable");
    // La línea no cambia: solo deja de ofrecerse la unidad.
    expect(actualizar).not.toHaveBeenCalled();
    expect(selects()[0].value).toBe("lance");
  });

  it("cancelar el sacado deja el desplegable como estaba", () => {
    const { actualizar, ocultar } = montarLista();

    elegir(selects()[0], "__ocultar-del-desplegable__");
    click(boton("Cancelar"));

    expect(ocultar).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
    expect(selects()[0].value).toBe("");
  });

  it("agregar una unidad nueva la suma al equipo y la elige en esta línea", () => {
    const { actualizar, agregar, avisar } = montarLista({ unidades: [] });

    elegir(selects()[0], "__nueva-unidad-del-equipo__");

    const entrada = contenedor?.querySelector<HTMLInputElement>(".alta-unidad__entrada");
    if (!entrada) throw new Error("No se abrió el alta de la unidad.");
    escribir(entrada, "  rollo   de  100 m ");
    pulsar(entrada, "Enter");

    // Se agrega limpia al espacio del equipo…
    expect(agregar).toHaveBeenCalledWith("rollo de 100 m");
    // …y queda elegida en la línea, que es lo que se estaba haciendo.
    expect(aplicar(actualizar, estudio).items[0].unidad).toBe("rollo de 100 m");
    expect(avisar).toHaveBeenCalledWith("Se agregó «rollo de 100 m» a las unidades del equipo.");
  });

  it("una unidad que ya es universal no se duplica: se usa y se avisa", () => {
    const { actualizar, agregar, avisar } = montarLista({ unidades: [] });

    elegir(selects()[0], "__nueva-unidad-del-equipo__");
    const entrada = contenedor?.querySelector<HTMLInputElement>(".alta-unidad__entrada");
    if (!entrada) throw new Error("No se abrió el alta de la unidad.");
    escribir(entrada, " PIEZA ");
    pulsar(entrada, "Enter");

    expect(agregar).not.toHaveBeenCalled();
    expect(aplicar(actualizar, estudio).items[0].unidad).toBe("pieza");
    expect(String(avisar.mock.calls[0]?.[0])).toContain("universales");
  });

  it("una que ya tiene el equipo no se agrega de nuevo: se elige la que hay", () => {
    const { actualizar, agregar, avisar } = montarLista({ unidades: propias });

    elegir(selects()[0], "__nueva-unidad-del-equipo__");
    const entrada = contenedor?.querySelector<HTMLInputElement>(".alta-unidad__entrada");
    if (!entrada) throw new Error("No se abrió el alta de la unidad.");
    escribir(entrada, "ROLLO DE 100 M");
    pulsar(entrada, "Enter");

    expect(agregar).not.toHaveBeenCalled();
    expect(aplicar(actualizar, estudio).items[0].unidad).toBe("rollo de 100 m");
    expect(String(avisar.mock.calls[0]?.[0])).toContain("ya estaba");
  });
});

describe("las universales que el equipo no usa", () => {
  const guardada: Record<string, AjusteUnidad> = {
    lance: { oculta: true, updatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString() },
  };

  it("no se ofrecen, pero el resto sí", () => {
    montarLista({ ocultas: guardada });
    const valores = [...selects()[0].options].map((o) => o.value);
    expect(valores).not.toContain("lance");
    expect(valores).toContain("m");
    expect(valores).toContain("pie");
  });

  it("un grupo que se queda sin unidades no se muestra vacío", () => {
    montarLista({
      ocultas: {
        m: { oculta: true, updatedAt: "" },
        pie: { oculta: true, updatedAt: "" },
      },
    });
    const grupos = [...(selects()[0].querySelectorAll("optgroup") ?? [])].map((g) =>
      g.getAttribute("label"),
    );
    expect(grupos).not.toContain("Longitud");
  });

  it("una línea que ya la usa la sigue mostrando, marcada como actual", () => {
    // Ocultar una unidad no puede cambiar una lista hecha: la línea conserva su
    // unidad y queda disponible para volver a elegirla.
    const conLance: Estudio = {
      ...estudio,
      items: [{ ...estudio.items[0], unidad: "lance" }, estudio.items[1]],
    };
    montarLista({ estudio: conLance, ocultas: guardada });

    expect(selects()[0].value).toBe("lance");
    expect(selects()[0].selectedOptions[0].textContent).toContain("actual");
    expect(contenedor?.textContent).toContain("4 lance");
  });
});
