// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FreebuffUser } from "@freebuff/auth/react";
import type { EstadoCompartido } from "../hooks/useEspacioCompartido";
import { EquipoPanel } from "./EquipoPanel";

/**
 * El panel es lo que la persona ve y toca, así que se prueba como se usa: se
 * monta de verdad y se hace clic. Sin esto, lo único comprobado sería que la
 * API rechaza lo que no corresponde, pero no que la pantalla ofrezca lo que sí.
 */
const YO: FreebuffUser = { sub: "u-yo", name: "Ana" };

let contenedor: HTMLDivElement | null = null;
let raiz: Root | null = null;

// React avisa por consola si actualiza sin este aviso puesto.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function texto(): string {
  return contenedor?.textContent ?? "";
}

function boton(etiqueta: string): HTMLButtonElement {
  const encontrado = [...(contenedor?.querySelectorAll("button") ?? [])].find(
    (b) => (b.textContent ?? "").trim() === etiqueta,
  );
  if (!encontrado) throw new Error(`No hay ningún botón «${etiqueta}» en el panel.`);
  return encontrado as HTMLButtonElement;
}

function hay(etiqueta: string): boolean {
  return [...(contenedor?.querySelectorAll("button") ?? [])].some(
    (b) => (b.textContent ?? "").trim() === etiqueta,
  );
}

function pulsar(etiqueta: string): void {
  const b = boton(etiqueta);
  act(() => {
    b.click();
  });
}

function compartido(extra: Partial<EstadoCompartido> = {}): EstadoCompartido {
  return {
    fase: "listo",
    mensaje: "",
    conectado: true,
    ocupado: false,
    rol: "dueno",
    soloLectura: false,
    equipo: {
      nombre: "Espacio del equipo",
      miembros: [
        { id: "u-ana", nombre: "Ana", correo: null, soyYo: true, rol: "dueno" },
        { id: "u-beto", nombre: "Beto", correo: null, soyYo: false, rol: "editor" },
        { id: "u-carla", nombre: "Carla", correo: null, soyYo: false, rol: "lectura" },
      ],
    },
    invitacion: null,
    invitacionPendiente: "",
    guardadoEn: "",
    generarInvitacion: () => Promise.resolve(),
    cambiarRol: () => Promise.resolve(),
    quitarMiembro: () => Promise.resolve(),
    entrarCon: () => Promise.resolve(true),
    descartarInvitacion: () => {},
    traerAhora: () => Promise.resolve(),
    subirAhora: () => Promise.resolve(),
    ...extra,
  };
}

function abrirPanel(estado: EstadoCompartido, usuario: FreebuffUser = YO): void {
  montar(<EquipoPanel usuario={usuario} cargando={false} compartido={estado} />);
  pulsar("Equipo y acceso");
}

describe("panel del equipo: quien creó el espacio", () => {
  it("muestra el permiso de cada persona", () => {
    abrirPanel(compartido());
    expect(texto()).toContain("Ana");
    expect(texto()).toContain("Beto");
    expect(texto()).toContain("Carla");
    expect(texto()).toContain("Creador");
    expect(texto()).toContain("Puede editar");
    expect(texto()).toContain("Solo lectura");
  });

  it("ofrece los dos permisos al invitar, no uno solo", () => {
    abrirPanel(compartido());
    expect(hay("Enlace para editar")).toBe(true);
    expect(hay("Enlace para solo lectura")).toBe(true);
  });

  it("al pedir el enlace de edición lo genera con permiso de edición", () => {
    const generarInvitacion = vi.fn(() => Promise.resolve());
    abrirPanel(compartido({ generarInvitacion }));
    pulsar("Enlace para editar");
    expect(generarInvitacion).toHaveBeenCalledWith("editor");
  });

  it("al pedir el enlace de solo lectura lo genera con ese permiso", () => {
    const generarInvitacion = vi.fn(() => Promise.resolve());
    abrirPanel(compartido({ generarInvitacion }));
    pulsar("Enlace para solo lectura");
    expect(generarInvitacion).toHaveBeenCalledWith("lectura");
  });

  it("cada miembro gestionable trae su desplegable de permiso y su Quitar", () => {
    abrirPanel(compartido());
    // Beto y Carla se gestionan; Ana es la creadora y queda fija.
    expect(contenedor?.querySelector('select[aria-label="Permiso de Beto"]')).not.toBeNull();
    expect(contenedor?.querySelector('select[aria-label="Permiso de Carla"]')).not.toBeNull();
    expect(contenedor?.querySelector('select[aria-label="Permiso de Ana"]')).toBeNull();
    expect(hay("Quitar")).toBe(true);
  });

  it("cambiar el desplegable pide ese permiso para esa persona", () => {
    const cambiarRol = vi.fn(() => Promise.resolve());
    abrirPanel(compartido({ cambiarRol }));

    const desplegable = contenedor?.querySelector<HTMLSelectElement>(
      'select[aria-label="Permiso de Beto"]',
    );
    if (!desplegable) throw new Error("Falta el desplegable de Beto.");
    act(() => {
      desplegable.value = "lectura";
      desplegable.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(cambiarRol).toHaveBeenCalledWith("u-beto", "lectura");
  });

  it("Quitar pide confirmación y saca a esa persona", () => {
    const quitarMiembro = vi.fn(() => Promise.resolve());
    abrirPanel(compartido({ quitarMiembro }));
    try {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      pulsar("Quitar");
      expect(quitarMiembro).toHaveBeenCalledWith("u-beto");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sin confirmación no se quita a nadie", () => {
    const quitarMiembro = vi.fn(() => Promise.resolve());
    abrirPanel(compartido({ quitarMiembro }));
    try {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => false),
      );
      pulsar("Quitar");
      expect(quitarMiembro).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("dice qué permiso da el enlace que ya existe", () => {
    abrirPanel(
      compartido({
        invitacion: { codigo: "K7Q2M9XT", expira: "2026-12-01T00:00:00.000Z", rol: "lectura" },
      }),
    );
    expect(texto()).toContain("K7Q2M9XT");
    expect(texto()).toContain("solo lectura");
  });
});

describe("panel del equipo: quien entra con otro permiso", () => {
  it("el editor no recibe la opción de dar acceso", () => {
    abrirPanel(
      compartido({
        rol: "editor",
        equipo: {
          nombre: "Espacio del equipo",
          miembros: [
            { id: "u-ana", nombre: "Ana", correo: null, soyYo: false, rol: "dueno" },
            { id: "u-beto", nombre: "Beto", correo: null, soyYo: true, rol: "editor" },
          ],
        },
      }),
      { sub: "u-beto", name: "Beto" },
    );

    expect(hay("Enlace para editar")).toBe(false);
    expect(hay("Enlace para solo lectura")).toBe(false);
    expect(texto()).toContain("Quien creó el espacio decide los permisos");
  });

  it("quien solo lee ve el aviso y ninguna opción de invitar", () => {
    abrirPanel(
      compartido({ rol: "lectura", soloLectura: true }),
      { sub: "u-carla", name: "Carla" },
    );

    expect(texto()).toContain("Estás en solo lectura");
    expect(texto()).toContain("ves y exportás lo del equipo");
    expect(texto()).toContain("Solo lectura");
    expect(hay("Enlace para editar")).toBe(false);
    expect(hay("Enlace para solo lectura")).toBe(false);
  });
});
