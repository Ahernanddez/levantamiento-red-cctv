// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AjusteUnidad, Estudio, Material, Unidad } from "../types";
import { crearEstudio, nuevaUnidad, nuevoItem, nuevoMaterial } from "../lib/espacio";
import { CatalogoTab } from "./CatalogoTab";

const antes = new Date("2026-01-01T10:00:00.000Z").toISOString();

/**
 * Administrar las unidades del equipo se prueba como lo hace una persona:
 * montando la pestaña y usando el campo y los botones. Lo que importa es que lo
 * que se escribe llegue limpio y que una unidad que ya está no se duplique.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cable: Material = { ...nuevoMaterial("Cable UTP Cat6", "pieza"), id: "m-cable" };
const liston: Material = { ...nuevoMaterial("Listón de madera", "pie"), id: "m-liston" };
const propia: Unidad = { ...nuevaUnidad("rollo de 100 m"), id: "u-rollo" };

/** Una lista que usa el listón, que se cuenta con su unidad del catálogo («pie»). */
const listaConListon: Estudio = {
  ...crearEstudio("Sede norte"),
  id: "e1",
  items: [nuevoItem(liston.id, 4)],
};

let contenedor: HTMLDivElement | null = null;
let raiz: Root | null = null;

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

function click(elemento: Element): void {
  act(() => {
    elemento.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Cualquier control, por su etiqueta accesible. */
function etiqueta(texto: string): HTMLElement {
  const encontrado = contenedor?.querySelector<HTMLElement>(`[aria-label="${texto}"]`);
  if (!encontrado) throw new Error(`No hay ningún control «${texto}».`);
  return encontrado;
}

function boton(texto: string): HTMLElement {
  const encontrado = [...(contenedor?.querySelectorAll("button") ?? [])].find(
    (b) => (b.textContent ?? "").trim() === texto,
  );
  if (!encontrado) throw new Error(`No hay un botón «${texto}».`);
  return encontrado as HTMLElement;
}

/** El campo de «Unidad nueva», que es el que tiene el texto de ejemplo. */
function campoUnidadNueva(): HTMLInputElement {
  const encontrado = contenedor?.querySelector<HTMLInputElement>('input[placeholder="Ej: rollo de 100 m"]');
  if (!encontrado) throw new Error("No está el campo de unidad nueva.");
  return encontrado;
}

function montarCatalogo(
  datos: {
    propias?: Unidad[];
    ocultas?: Record<string, AjusteUnidad>;
    catalogo?: Material[];
    estudios?: Estudio[];
  } = {},
  soloLectura = false,
) {
  const agregar = vi.fn();
  const quitar = vi.fn();
  const ocultar = vi.fn();
  const mostrar = vi.fn();
  const avisar = vi.fn();
  montar(
    <CatalogoTab
      catalogo={datos.catalogo ?? [cable]}
      estudios={datos.estudios ?? []}
      actualizarCatalogo={vi.fn()}
      unidades={{
        propias: datos.propias ?? [],
        ocultas: datos.ocultas ?? {},
        agregar,
        quitar,
        ocultar,
        mostrar,
      }}
      borrarMaterial={vi.fn()}
      avisar={avisar}
      soloLectura={soloLectura}
    />,
  );
  return { agregar, quitar, ocultar, mostrar, avisar };
}

/** Una unidad universal que el equipo decidió no usar. */
const oculta = (nombre: string): Record<string, AjusteUnidad> => ({
  [nombre]: { oculta: true, updatedAt: antes },
});

describe("unidades del equipo en el catálogo", () => {
  it("agrega lo que se escribe, con el nombre limpio", () => {
    const { agregar, avisar } = montarCatalogo();

    escribir(campoUnidadNueva(), "  rollo   de  100 m ");
    click(boton("+ Agregar unidad"));

    expect(agregar).toHaveBeenCalledWith("rollo de 100 m");
    expect(avisar).toHaveBeenCalledWith("Se agregó «rollo de 100 m» a las unidades del equipo.");
  });

  it("también se agrega con Enter", () => {
    const { agregar } = montarCatalogo();

    const campo = campoUnidadNueva();
    escribir(campo, "caja de 12");
    pulsar(campo, "Enter");

    expect(agregar).toHaveBeenCalledWith("caja de 12");
  });

  it("no agrega una vacía y lo dice", () => {
    const { agregar, avisar } = montarCatalogo();

    escribir(campoUnidadNueva(), "   ");
    click(boton("+ Agregar unidad"));

    expect(agregar).not.toHaveBeenCalled();
    expect(String(avisar.mock.calls[0]?.[0])).toContain("Escribe el nombre");
  });

  it("no agrega una que ya es universal ni una que el equipo ya tiene", () => {
    const { agregar, avisar } = montarCatalogo({ propias: [propia] });

    escribir(campoUnidadNueva(), "m");
    click(boton("+ Agregar unidad"));
    expect(agregar).not.toHaveBeenCalled();
    expect(String(avisar.mock.calls[0]?.[0])).toContain("universales");

    avisar.mockClear();
    escribir(campoUnidadNueva(), "ROLLO DE 100 M");
    click(boton("+ Agregar unidad"));
    expect(agregar).not.toHaveBeenCalled();
    expect(String(avisar.mock.calls[0]?.[0])).toContain("ya está en las unidades del equipo");
  });

  it("quita la unidad que se pide, por su identificador", () => {
    const { quitar, avisar } = montarCatalogo({ propias: [propia] });

    click(boton("Quitar"));

    expect(quitar).toHaveBeenCalledWith("u-rollo");
    expect(avisar).toHaveBeenCalledWith("Se quitó «rollo de 100 m» de las unidades del equipo.");
  });

  it("en solo lectura no deja agregar, quitar ni ocultar", () => {
    montarCatalogo({ propias: [propia] }, true);

    expect(boton("+ Agregar unidad").hasAttribute("disabled")).toBe(true);
    expect(boton("Quitar").hasAttribute("disabled")).toBe(true);
    expect(campoUnidadNueva().hasAttribute("readonly")).toBe(true);
    expect(etiqueta("Ocultar la unidad pie").hasAttribute("disabled")).toBe(true);
  });

  it("una oculta no se sugiere al escribir la unidad de un material", () => {
    montarCatalogo({ propias: [propia], ocultas: oculta("pie") });

    const sugeridas = [...(contenedor?.querySelectorAll("#unidades-sugeridas option") ?? [])].map(
      (o) => o.getAttribute("value"),
    );
    expect(sugeridas).toContain("m");
    expect(sugeridas).toContain("rollo de 100 m");
    expect(sugeridas).not.toContain("pie");
  });

  it("avisa cuando una oculta se sigue usando, y ofrece volver a mostrarla", () => {
    montarCatalogo({ catalogo: [liston], ocultas: oculta("pie"), estudios: [listaConListon] });

    const aviso = contenedor?.querySelector(".revision-unidades")?.textContent ?? "";
    expect(aviso).toContain("«pie» (1 material del catálogo y 1 línea)");

    // Y la chip de la oculta queda marcada, explicando por qué.
    const chip = etiqueta("Mostrar la unidad pie");
    expect(chip.className).toContain("chip-unidad--aviso");
    expect(chip.getAttribute("title")).toContain("Se sigue usando: 1 material del catálogo y 1 línea");
  });

  it("nombra a cada oculta que se sigue usando", () => {
    montarCatalogo({
      catalogo: [cable, liston],
      ocultas: { ...oculta("pie"), ...oculta("pieza"), ...oculta("lance") },
      estudios: [listaConListon],
    });

    const aviso = contenedor?.querySelector(".revision-unidades")?.textContent ?? "";
    expect(aviso).toContain("2 de las ocultas se siguen usando");
    expect(aviso).toContain("«pie» (1 material del catálogo y 1 línea)");
    expect(aviso).toContain("«pieza» (1 material del catálogo)");
    expect(aviso).not.toContain("«lance»");
  });

  it("no avisa de una oculta que no se usa en ningún lado", () => {
    montarCatalogo({
      ocultas: { ...oculta("lance"), ...oculta("m") },
      estudios: [listaConListon],
    });

    expect(contenedor?.querySelector(".revision-unidades")).toBeNull();
    expect(etiqueta("Mostrar la unidad lance").className).not.toContain("chip-unidad--aviso");
  });

  it("saca del desplegable una universal que no se usa", () => {
    const { ocultar, avisar } = montarCatalogo();

    click(etiqueta("Ocultar la unidad lance"));

    expect(ocultar).toHaveBeenCalledWith("lance");
    expect(String(avisar.mock.calls[0]?.[0])).toContain("queda fuera del desplegable");
  });

  it("las ocultas se listan aparte y se pueden volver a mostrar", () => {
    const { mostrar, ocultar, avisar } = montarCatalogo({ ocultas: oculta("lance") });

    // No se ofrece entre las que usa el equipo…
    expect(contenedor?.querySelector('[aria-label="Ocultar la unidad lance"]')).toBeNull();
    // …y sí aparece en las ocultas, con su botón para volver.
    click(etiqueta("Mostrar la unidad lance"));
    expect(mostrar).toHaveBeenCalledWith("lance");
    expect(ocultar).not.toHaveBeenCalled();
    expect(String(avisar.mock.calls[0]?.[0])).toContain("vuelve a aparecer");
  });
});
