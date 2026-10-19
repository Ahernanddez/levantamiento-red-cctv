/**
 * Persistencia local del espacio de datos.
 *
 * Las reglas de qué es un espacio válido y cómo se combinan dos copias viven en
 * ./espacio, porque el Worker necesita exactamente las mismas. Aquí queda solo
 * lo que tiene sentido en el navegador: guardar, leer, sembrar el catálogo de
 * arranque y exportar o importar archivos.
 */
import catalogoInicial from "../datos/catalogo-inicial.json";
import type { Espacio, Material } from "../types";
import {
  crearEspacio,
  normalizarCatalogo,
  normalizarEspacio,
  sembrarCatalogoInicial,
} from "./espacio";

const CLAVE_LOCAL = "levantamiento-red-cctv:espacio";
const CLAVE_SEMBRADO = "levantamiento-red-cctv:catalogo-inicial";

export {
  agregarUnidad,
  claveDeUnidad,
  combinarEspacios,
  crearEspacio,
  crearEstudio,
  esUnidadUniversal,
  formaUniversal,
  fusionarBorrados,
  fusionarCatalogo,
  fusionarEstudios,
  fusionarOcultas,
  fusionarUnidades,
  gruposDeUnidades,
  limpiarUnidad,
  marcarBorrado,
  mostrarUnidad,
  newId,
  nombresDeUnidades,
  nombresOcultos,
  normalizarOcultas,
  ocultarUnidad,
  normalizarBorrados,
  normalizarCatalogo,
  normalizarEspacio,
  normalizarEstudio,
  normalizarMaterial,
  normalizarUnidad,
  normalizarUnidades,
  nuevaUnidad,
  nuevoItem,
  nuevoMaterial,
  sembrarCatalogoInicial,
  totalPorUnidad,
  unidadDe,
  unidadPorNombre,
  usosDeMaterial,
  usosDeUniversales,
  type ClaseDeContenido,
  type ResultadoFusion,
  type UsosDeUniversal,
} from "./espacio";

/** Materiales que viajan con la aplicación, generados desde el listado real. */
const CATALOGO_ENTREGADO: Material[] = normalizarCatalogo(catalogoInicial.catalogo);

// --- Persistencia local -----------------------------------------------------

export function cargarEspacio(): Espacio {
  try {
    const bruto = localStorage.getItem(CLAVE_LOCAL);
    const yaSembrado = localStorage.getItem(CLAVE_SEMBRADO) === "1";
    if (!bruto) return sembrarCatalogoInicial(crearEspacio(), CATALOGO_ENTREGADO, yaSembrado);

    let guardado: Espacio;
    try {
      guardado = normalizarEspacio(JSON.parse(bruto));
    } catch {
      // Copia local ilegible: mejor arrancar en blanco que no arrancar.
      guardado = crearEspacio();
    }
    return sembrarCatalogoInicial(guardado, CATALOGO_ENTREGADO, yaSembrado);
  } catch {
    // Sin almacenamiento la aplicación no puede recordar nada, pero al menos
    // conviene mostrar el catálogo entregado.
    return sembrarCatalogoInicial(crearEspacio(), CATALOGO_ENTREGADO, false);
  }
}

export function guardarEspacio(espacio: Espacio): boolean {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(espacio));
    localStorage.setItem(CLAVE_SEMBRADO, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Sembrar es cosa de una sola vez por navegador: si la persona borra un
 * material, no debe reaparecer al recargar.
 */
export function catalogoYaSembrado(): boolean {
  try {
    return localStorage.getItem(CLAVE_SEMBRADO) === "1";
  } catch {
    return false;
  }
}

// --- Exportar / importar ----------------------------------------------------

/** Baja un archivo al disco. Lo usan el respaldo JSON y el PDF del informe. */
export function descargarArchivo(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function descargarJSON(nombre: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  descargarArchivo(nombre, blob);
}

export async function leerRespaldo(file: File): Promise<Espacio> {
  const texto = await file.text();
  return normalizarEspacio(JSON.parse(texto));
}
