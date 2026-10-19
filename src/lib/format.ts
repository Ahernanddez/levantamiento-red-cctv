/** Utilidades de formato para mostrar numeros y fechas en espanol. */

export function numero(n: number, decimales = 0): string {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(v);
}

/** Fecha de hoy en horario local, formato YYYY-MM-DD. */
export function hoyISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Convierte "2026-04-08" a "08/04/2026" sin desfase de zona horaria. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso || "—";
}

/** Nombre de archivo seguro para descargas. */
export function nombreArchivo(base: string, extension: string): string {
  const limpio = (base || "proyecto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${limpio || "proyecto"}.${extension}`;
}
