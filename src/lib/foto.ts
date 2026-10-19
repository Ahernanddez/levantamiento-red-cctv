/**
 * Fotografías del estudio.
 *
 * Se guardan reducidas a JPEG dentro del propio estudio: así salen en el PDF
 * sin pedir nada más, y entran en el guardado local y en la sincronización.
 * Una foto de cámara tal cual viene (varios MB en base64) rompería el
 * almacenamiento del navegador al segundo o tercer estudio.
 */

/** Lado mayor con el que se guarda cada foto, en píxeles. */
export const LADO_FOTO = 1280;
/** Calidad del JPEG reducido: se lee bien y pesa poco. */
export const CALIDAD_FOTO = 0.82;
/** Tope de fotos por estudio, para no romper el guardado ni el PDF. */
export const MAX_FOTOS = 10;

/**
 * Reduce un archivo de imagen a JPEG listo para guardar en el estudio.
 *
 * Rechaza lo que no es imagen o no se puede leer, con un motivo corto para
 * mostrar: "no-imagen", "no-legible" o "no-reducible".
 */
export function archivoAFoto(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!archivo.type.startsWith("image/")) {
      reject(new Error("no-imagen"));
      return;
    }
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      try {
        const escala = Math.min(1, LADO_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
        const dibujo = document.createElement("canvas");
        dibujo.width = Math.max(1, Math.round(img.naturalWidth * escala));
        dibujo.height = Math.max(1, Math.round(img.naturalHeight * escala));
        const ctx = dibujo.getContext("2d");
        if (!ctx) throw new Error("no-reducible");
        // El JPEG no guarda transparencias: fondo blanco para PNG con alfa.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, dibujo.width, dibujo.height);
        ctx.drawImage(img, 0, 0, dibujo.width, dibujo.height);
        resolve(dibujo.toDataURL("image/jpeg", CALIDAD_FOTO));
      } catch {
        reject(new Error("no-reducible"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("no-legible"));
    };
    img.src = url;
  });
}

/** Explica el rechazo en palabras para avisar en pantalla. */
export function motivoFoto(motivo: unknown): string {
  const codigo = motivo instanceof Error ? motivo.message : "";
  if (codigo === "no-imagen") return "Ese archivo no es una imagen.";
  if (codigo === "no-legible") return "No se pudo leer esa imagen.";
  return "No se pudo reducir esa imagen para guardarla.";
}
