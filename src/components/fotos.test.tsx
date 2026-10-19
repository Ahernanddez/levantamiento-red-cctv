// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearEstudio, nuevoItem, nuevoMaterial } from "../lib/espacio";
import type { Estudio, Material } from "../types";
import { FotosTab } from "./FotosTab";

// React avisa por consola si actualiza sin este aviso puesto.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const cable: Material = { ...nuevoMaterial("Cable UTP Cat6", "caja"), id: "m1" };
const catalogo = [cable];

function estudio(): Estudio {
  return {
    ...crearEstudio("Sede norte"),
    id: "e1",
    items: [nuevoItem(cable.id, 4)],
    fotos: [
      { id: "f1", imagen: jpeg, comentario: "Tablero principal", updatedAt: "" },
      { id: "f2", imagen: jpeg, comentario: "", updatedAt: "" },
    ],
  };
}

let contenedor: HTMLDivElement | null = null;
let raiz: Root | null = null;
let actual: Estudio;

function montar(soloLectura = false) {
  actual = estudio();
  const actualizar = vi.fn((fn: (e: Estudio) => Estudio) => {
    actual = fn(actual);
  });
  const avisar = vi.fn();
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  act(() => {
    raiz?.render(
      <FotosTab
        estudio={actual}
        catalogo={catalogo}
        actualizar={actualizar}
        avisar={avisar}
        soloLectura={soloLectura}
      />,
    );
  });
  return { actualizar, avisar };
}

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  contenedor?.remove();
  contenedor = null;
  raiz = null;
});

describe("pestaña Fotos", () => {
  it("muestra cada foto con su comentario", () => {
    montar();
    const imagenes = contenedor?.querySelectorAll(".foto__imagen") ?? [];
    expect(imagenes).toHaveLength(2);
    expect(contenedor?.textContent).toContain("Tablero principal");
  });

  it("editar el comentario lo guarda en esa foto", () => {
    const { actualizar } = montar();
    const campo = contenedor?.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Comentario de la fotografía 2"]',
    );
    if (!campo) throw new Error("Falta el comentario de la segunda foto.");
    // Se escribe con el asignador nativo: si no, React no se entera del cambio.
    const definicion = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    act(() => {
      definicion?.set?.call(campo, "Caja de paso");
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(actualizar).toHaveBeenCalled();
    expect(actual.fotos.find((f) => f.id === "f2")?.comentario).toBe("Caja de paso");
    expect(actual.fotos.find((f) => f.id === "f1")?.comentario).toBe("Tablero principal");
  });

  it("quitar saca esa foto y deja la otra", () => {
    const { actualizar } = montar();
    const boton = contenedor?.querySelector<HTMLButtonElement>(
      'button[aria-label="Quitar la fotografía 1"]',
    );
    if (!boton) throw new Error("Falta el botón de quitar.");
    act(() => {
      boton.click();
    });

    expect(actualizar).toHaveBeenCalled();
    expect(actual.fotos.map((f) => f.id)).toEqual(["f2"]);
  });

  it("ligar la foto a un renglón lo guarda en esa foto", () => {
    const { actualizar } = montar();
    const lista = contenedor?.querySelector<HTMLSelectElement>(
      'select[aria-label="Renglón de la fotografía 1"]',
    );
    if (!lista) throw new Error("Falta el desplegable del renglón.");
    expect(lista.textContent).toContain("Suelta (al final del informe)");
    expect(lista.textContent).toContain("Cable UTP Cat6");
    act(() => {
      lista.value = actual.items[0].id;
      lista.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(actualizar).toHaveBeenCalled();
    expect(actual.fotos.find((f) => f.id === "f1")?.materialId).toBe(actual.items[0].id);
    expect(actual.fotos.find((f) => f.id === "f2")?.materialId ?? "").toBe("");
  });

  it("en solo lectura se mira pero no se toca", () => {
    montar(true);
    expect(contenedor?.querySelectorAll(".foto__imagen")).toHaveLength(2);
    expect(contenedor?.querySelector("textarea")?.hasAttribute("readonly")).toBe(true);
    expect(contenedor?.querySelector("button")?.hasAttribute("disabled")).toBe(true);
  });
});
