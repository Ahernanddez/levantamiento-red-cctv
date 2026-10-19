// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Estudio, Material } from "../types";
import { crearEstudio, nuevoItem, nuevoMaterial } from "../lib/espacio";
import { paginasDelInforme } from "../lib/pdf";
import { InformePDF } from "./InformePDF";

/**
 * La vista previa se prueba comparándola con el informe real: lo que importa no
 * es que haya algo en pantalla, sino que sean las mismas líneas que van al
 * archivo. Si alguien cambia el dibujo de un lado y no del otro, acá salta.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cable: Material = { ...nuevoMaterial("Cable UTP Cat6", "caja"), id: "m-cable" };
const fuente: Material = { ...nuevoMaterial("Fuente 12V 1A", "u"), id: "m-fuente" };
const catalogo = [cable, fuente];

const estudio: Estudio = {
  ...crearEstudio("Materiales sede norte"),
  id: "e1",
  cliente: "Ferretería El Tornillo",
  items: [nuevoItem(cable.id, 4, "rollo"), nuevoItem(fuente.id, 250)],
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

function boton(texto: string): HTMLButtonElement {
  const encontrado = [...(contenedor?.querySelectorAll("button") ?? [])].find(
    (b) => (b.textContent ?? "").trim() === texto,
  );
  if (!encontrado) throw new Error(`No hay un botón «${texto}».`);
  return encontrado as HTMLButtonElement;
}

function click(b: HTMLButtonElement): void {
  act(() => {
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Las líneas dibujadas en la vista previa, en orden. */
function lineasEnPantalla(): string[] {
  const nodos = contenedor?.querySelectorAll(".hoja__linea") ?? [];
  return [...nodos].map((n) => n.textContent ?? "");
}

describe("informe en PDF", () => {
  it("«Generar» y «Guardar» son botones distintos, y hay vista previa aparte", () => {
    montar(<InformePDF estudio={estudio} catalogo={catalogo} />);
    expect(boton("Vista previa del PDF")).toBeTruthy();
    expect(boton("Generar PDF")).toBeTruthy();
    expect(boton("Guardar PDF")).toBeTruthy();
    // Sin pedirla, la vista previa no ocupa lugar.
    expect(lineasEnPantalla()).toHaveLength(0);
  });

  it("la vista previa dibuja exactamente las líneas del archivo", () => {
    montar(<InformePDF estudio={estudio} catalogo={catalogo} />);
    click(boton("Vista previa del PDF"));

    const esperadas = paginasDelInforme(estudio, catalogo).flatMap((hoja) =>
      hoja.lineas.map((l) => l.texto),
    );
    expect(lineasEnPantalla()).toEqual(esperadas);
    // Y hay una hoja por página, con la medida de A4.
    expect(contenedor?.querySelectorAll(".hoja")).toHaveLength(
      paginasDelInforme(estudio, catalogo).length,
    );
  });

  it("la unidad elegida en la lista aparece en lo que se ve", () => {
    montar(<InformePDF estudio={estudio} catalogo={catalogo} />);
    click(boton("Vista previa del PDF"));

    const filaL = lineasEnPantalla().map((l) => l.trim());
    expect(filaL.some((l) => /^1\s+Cable UTP Cat6\s+rollo\s+4$/.test(l))).toBe(true);
    // La línea sin unidad propia sigue a su material del catálogo.
    expect(filaL.some((l) => /^2\s+Fuente 12V 1A\s+u\s+250$/.test(l))).toBe(true);
  });

  it("«Generar» confirma que el archivo quedó listo, aunque la vista ya esté abierta", () => {
    montar(<InformePDF estudio={estudio} catalogo={catalogo} />);
    // La vista ya estaba abierta: antes «Generar» no mostraba nada nuevo y
    // parecía no funcionar, porque solo volvía a mostrar lo mismo.
    click(boton("Vista previa del PDF"));
    expect(contenedor?.textContent).not.toContain("listo para bajarlo");
    click(boton("Generar PDF"));
    expect(contenedor?.textContent).toContain("PDF generado, listo para bajarlo");
    expect(lineasEnPantalla().length).toBeGreaterThan(0);
  });

  it("«Generar» arma el archivo y muestra las páginas", () => {
    montar(<InformePDF estudio={estudio} catalogo={catalogo} />);
    const crear = vi.spyOn(URL, "createObjectURL");
    click(boton("Generar PDF"));
    expect(lineasEnPantalla().length).toBeGreaterThan(0);
    expect(crear).not.toHaveBeenCalled();
    crear.mockRestore();
  });

  it("«Guardar» baja el archivo con la extensión correcta", () => {
    montar(<InformePDF estudio={estudio} catalogo={catalogo} />);
    const clics: string[] = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clics.push(this.download);
    };
    try {
      click(boton("Guardar PDF"));
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
    expect(clics).toEqual(["lista-Materiales-sede-norte.pdf"]);
  });

  it("avisa cuando la lista todavía no tiene materiales", () => {
    montar(
      <InformePDF estudio={{ ...estudio, items: [] }} catalogo={catalogo} />,
    );
    expect(boton("Generar PDF").disabled).toBe(true);
    expect(boton("Guardar PDF").disabled).toBe(true);
    expect(contenedor?.textContent).toContain("Agrega materiales");
  });

  it("avisa lo que conviene completar antes de entregar", () => {
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    montar(
      <InformePDF
        estudio={{
          ...estudio,
          cliente: "",
          sitio: "",
          realizo: "",
          items: [nuevoItem(cable.id, 0)],
          fotos: [{ id: "f1", imagen: jpeg, comentario: "", updatedAt: "" }],
        }}
        catalogo={catalogo}
      />,
    );
    const texto = contenedor?.textContent ?? "";
    expect(texto).toContain("Revisá antes de entregar");
    expect(texto).toContain("Falta el cliente.");
    expect(texto).toContain("Falta el sitio.");
    expect(texto).toContain("Falta quién realizó el estudio.");
    expect(texto).toContain("Hay materiales con cantidad 0.");
    expect(texto).toContain("1 fotografía sin comentario.");
  });

  it("sin huecos no muestra avisos", () => {
    montar(
      <InformePDF
        estudio={{ ...estudio, sitio: "Av. Los Álamos 1450", realizo: "J. Ramírez" }}
        catalogo={catalogo}
      />,
    );
    expect(contenedor?.textContent).not.toContain("Revisá antes de entregar");
  });

  it("avisa cuando el estudio cambió después de generar", () => {
    montar(<InformePDF estudio={estudio} catalogo={catalogo} />);
    click(boton("Generar PDF"));
    act(() => {
      raiz?.render(
        <InformePDF estudio={{ ...estudio, cliente: "Otro cliente" }} catalogo={catalogo} />,
      );
    });
    expect(contenedor?.textContent).toContain("quedó viejo");
  });
});
