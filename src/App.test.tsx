// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// React avisa por consola si actualiza sin este aviso puesto.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let contenedor: HTMLDivElement | null = null;
let raiz: Root | null = null;

function montar(): void {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  act(() => {
    raiz?.render(<App />);
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  if (raiz) act(() => raiz?.unmount());
  contenedor?.remove();
  contenedor = null;
  raiz = null;
  localStorage.clear();
});

describe("panel del equipo", () => {
  it("en la compilación normal ofrece iniciar sesión", () => {
    montar();
    expect(contenedor?.textContent).toContain("Iniciar sesión con Freebuff");
  });

  it("en GitHub Pages (VITE_SIN_EQUIPO=1) no aparece ni el inicio ni el aviso", () => {
    vi.stubEnv("VITE_SIN_EQUIPO", "1");
    montar();
    const texto = contenedor?.textContent ?? "";
    expect(texto).not.toContain("Iniciar sesión con Freebuff");
    expect(texto).not.toContain("Tengo un código");
    expect(texto).not.toContain("Sin sesión");
    // La app sigue sirviendo: estudios y catálogo locales más Drive.
    expect(texto).toContain("Estudios de materiales");
  });
});
