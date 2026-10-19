/**
 * Tema visual de la aplicación.
 *
 * «sistema» sigue la preferencia del equipo; «claro» y «oscuro» la ignoran.
 * El valor se guarda en el navegador y se aplica como atributo en <html>,
 * porque el CSS necesita saberlo antes del primer pintado: si se decidiera
 * dentro de React, la pantalla aparecería primero en el tema equivocado.
 *
 * OJO: la clave y los valores están repetidos en el script incrustado de
 * index.html, que es lo que evita ese parpadeo. Si cambian aquí, cambian allí.
 */

export type Tema = "claro" | "oscuro" | "sistema";

export const TEMA_POR_DEFECTO: Tema = "sistema";

const CLAVE = "levantamiento-red-cctv:tema";

/** Color de la barra del sistema del teléfono para cada tema resuelto. */
const COLOR_BARRA: Record<"claro" | "oscuro", string> = {
  claro: "#f2f5fb",
  oscuro: "#0a1020",
};

function esTema(valor: unknown): valor is Tema {
  return valor === "claro" || valor === "oscuro" || valor === "sistema";
}

export function leerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE);
    return esTema(guardado) ? guardado : TEMA_POR_DEFECTO;
  } catch {
    return TEMA_POR_DEFECTO;
  }
}

export function guardarTema(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento el tema se pierde al recargar; no es motivo de error.
  }
}

/** Tema que se está viendo de verdad, una vez resuelto «sistema». */
export function temaEfectivo(tema: Tema, equipoPrefiereOscuro: boolean): "claro" | "oscuro" {
  if (tema === "sistema") return equipoPrefiereOscuro ? "oscuro" : "claro";
  return tema;
}

/** Marca el tema en <html> y acomoda la barra del sistema. */
export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema;
  const prefiereOscuro =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", COLOR_BARRA[temaEfectivo(tema, prefiereOscuro)]);
}
