/**
 * Qué puede hacer cada persona dentro de un espacio compartido.
 *
 * Lo usan los dos lados a propósito:
 *  - el servidor, para decidir si acepta un guardado o una invitación nueva;
 *  - el navegador, para no ofrecer botones que igual van a ser rechazados.
 *
 * La autoridad es siempre el servidor: esconder un botón no es un permiso. Tener
 * las reglas en un solo lugar es lo que evita que la interfaz y la API se
 * contradigan con el tiempo.
 */

/** Los permisos que existen, de mayor a menor. */
export type Rol = "dueno" | "editor" | "lectura";

/** Los que se pueden entregar con un enlace de invitación. */
export const ROLES_INVITABLES: Rol[] = ["editor", "lectura"];

export function esRol(valor: unknown): valor is Rol {
  return valor === "dueno" || valor === "editor" || valor === "lectura";
}

/**
 * Une lo que venga de afuera a un rol conocido.
 *
 * Sin valor reconocible devuelve el más bajo: si la base trajera un rol que no
 * entendemos, es mejor dejar a la persona leyendo que darle permiso de escritura
 * por accidente.
 */
export function rolValido(valor: unknown, porDefecto: Rol = "lectura"): Rol {
  return esRol(valor) ? valor : porDefecto;
}

/**
 * Rol que entrega una invitación. La propiedad del espacio no se reparte por un
 * enlace: quien creó el espacio sigue siendo el único que puede dar acceso.
 */
export function rolInvitado(valor: unknown): Rol {
  return valor === "lectura" ? "lectura" : "editor";
}

export function puedeEditar(rol: Rol | null | undefined): boolean {
  return rol === "dueno" || rol === "editor";
}

export function puedeInvitar(rol: Rol | null | undefined): boolean {
  return rol === "dueno";
}

/** Cómo se muestra un permiso en pantalla. */
export function nombreDeRol(rol: Rol): string {
  if (rol === "dueno") return "Creador";
  if (rol === "editor") return "Puede editar";
  return "Solo lectura";
}

/** La misma idea, en una frase, para el enlace de invitación. */
export function enlaceSegunRol(rol: Rol): string {
  return rol === "lectura" ? "solo lectura" : "puede editar";
}
