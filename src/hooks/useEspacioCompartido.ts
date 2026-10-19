import { useCallback, useEffect, useRef, useState } from "react";
import type { FreebuffUser } from "@freebuff/auth/react";
import type { Espacio } from "../types";
import { combinarEspacios } from "../lib/storage";
import { puedeEditar, rolValido, type Rol } from "../lib/permisos";

export type FaseCompartida = "sin-sesion" | "cargando" | "listo" | "guardando" | "error";

export interface Miembro {
  nombre: string | null;
  correo: string | null;
  soyYo: boolean;
  rol: Rol;
}

export interface Invitacion {
  codigo: string;
  expira: string;
  rol: Rol;
}

export interface EstadoCompartido {
  fase: FaseCompartida;
  mensaje: string;
  conectado: boolean;
  ocupado: boolean;
  /** El permiso propio dentro del espacio del equipo. */
  rol: Rol | null;
  /** Hay sesión y el permiso es de solo lectura: el servidor no aceptaría un guardado. */
  soloLectura: boolean;
  equipo: { nombre: string; miembros: Miembro[] } | null;
  invitacion: Invitacion | null;
  /** Código que llegó en la dirección, antes de entrar. */
  invitacionPendiente: string;
  guardadoEn: string;
  generarInvitacion: (rol: Rol) => Promise<void>;
  entrarCon: (codigo: string) => Promise<boolean>;
  descartarInvitacion: () => void;
  traerAhora: () => Promise<void>;
  subirAhora: () => Promise<void>;
}

/** Espera antes de subir, para no mandar el espacio entero en cada tecla. */
const RETARDO_MS = 2000;

const PARAMETRO_INVITACION = "invitacion";

function serializar(espacio: Espacio): string {
  return JSON.stringify(espacio);
}

async function pedir(
  ruta: string,
  cuerpo?: unknown,
): Promise<{ ok: boolean; estado: number; datos: Record<string, unknown> | null }> {
  try {
    const respuesta = await fetch(ruta, {
      method: cuerpo === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: cuerpo === undefined ? undefined : { "content-type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: respuesta.ok, estado: respuesta.status, datos };
  } catch {
    return { ok: false, estado: 0, datos: null };
  }
}

/** Código de invitación que llegó en la dirección, si hay alguno. */
export function codigoDeLaDireccion(): string {
  try {
    return (new URLSearchParams(location.search).get(PARAMETRO_INVITACION) ?? "").trim();
  } catch {
    return "";
  }
}

/** Saca el código de la dirección para que recargar no vuelva a entrar. */
function limpiarDireccion(): void {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has(PARAMETRO_INVITACION)) return;
    url.searchParams.delete(PARAMETRO_INVITACION);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    // Si el navegador lo impide, el código queda en la barra y no pasa nada.
  }
}

/**
 * Mantiene sincronizado el espacio con el servidor del equipo.
 *
 * Sin sesión no hace nada: la aplicación sigue funcionando con los datos en el
 * navegador. Al entrar, trae lo del equipo y lo combina con lo local; quién gana
 * en cada choque lo deciden las mismas reglas que usa el navegador, en
 * ../lib/espacio.ts.
 */
export function useEspacioCompartido({
  usuario,
  espacio,
  setEspacio,
  avisar,
}: {
  usuario: FreebuffUser | null;
  espacio: Espacio;
  setEspacio: (fn: (prev: Espacio) => Espacio) => void;
  avisar: (mensaje: string) => void;
}): EstadoCompartido {
  const [fase, setFase] = useState<FaseCompartida>("sin-sesion");
  const [mensaje, setMensaje] = useState("");
  const [equipo, setEquipo] = useState<EstadoCompartido["equipo"]>(null);
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [invitacionPendiente, setInvitacionPendiente] = useState(codigoDeLaDireccion);
  const [guardadoEn, setGuardadoEn] = useState("");
  const [rol, setRol] = useState<Rol | null>(null);

  /** Lo último que confirmó el servidor, para no subir lo mismo dos veces. */
  const ultimoEnviado = useRef("");
  const espacioRef = useRef(espacio);
  /** El permiso, para poder consultarlo sin volver a crear las funciones. */
  const rolRef = useRef<Rol | null>(null);
  /** Evita que dos sincronizaciones se pisen entre sí. */
  const enCurso = useRef(false);

  useEffect(() => {
    espacioRef.current = espacio;
  }, [espacio]);

  const anotar = useCallback((datos: Record<string, unknown> | null) => {
    if (!datos) return;
    if (typeof datos.equipo === "object" && datos.equipo !== null) {
      setEquipo(datos.equipo as EstadoCompartido["equipo"]);
    }
    // Solo se pisa lo que la respuesta trae: guardar no devuelve el enlace, y
    // borrarlo de la pantalla por eso sería una molestia sin motivo.
    if ("invitacion" in datos) setInvitacion((datos.invitacion as Invitacion | null) ?? null);
    if (datos.rol !== undefined) {
      const nuevo = rolValido(datos.rol);
      rolRef.current = nuevo;
      setRol(nuevo);
    }
  }, []);

  /** Guarda lo local en el servidor y adopta lo que devuelva. */
  const subir = useCallback(async () => {
    if (enCurso.current) return;
    // En solo lectura no se manda nada: el servidor lo rechazaría igual, y no
    // tiene sentido mostrar un error por algo que la interfaz ya sabe.
    if (!puedeEditar(rolRef.current)) return;
    const contenido = espacioRef.current;
    if (serializar(contenido) === ultimoEnviado.current) return;

    enCurso.current = true;
    setFase("guardando");
    try {
      const { ok, estado, datos } = await pedir("/api/espacio", { espacio: contenido });
      if (!ok || !datos?.espacio) {
        const texto =
          typeof datos?.error === "string" && estado === 403
            ? datos.error
            : "No se pudo guardar en el espacio del equipo; quedó guardado en este equipo.";
        setFase(estado === 401 ? "sin-sesion" : estado === 403 ? "listo" : "error");
        setMensaje(estado === 401 ? "La sesión venció. Vuelve a iniciar sesión para seguir compartiendo." : texto);
        return;
      }
      const final = datos.espacio as Espacio;
      ultimoEnviado.current = serializar(final);
      // Puede traer cambios que otras personas hicieron mientras tanto.
      setEspacio(() => final);
      anotar(datos);
      setFase("listo");
      setMensaje("");
      setGuardadoEn(new Date().toISOString());
    } finally {
      enCurso.current = false;
    }
  }, [anotar, setEspacio]);

  /** Trae el espacio del equipo y lo combina con lo local. */
  const traer = useCallback(
    async (motivo: "entrada" | "manual") => {
      if (enCurso.current) return;
      enCurso.current = true;
      setFase("cargando");
      try {
        const { ok, estado, datos } = await pedir("/api/espacio");
        if (!ok || !datos?.espacio) {
          if (estado === 401) {
            setFase("sin-sesion");
            setMensaje("La sesión venció. Vuelve a iniciar sesión para compartir.");
            return;
          }
          setFase("error");
          setMensaje("No se pudo leer el espacio del equipo.");
          return;
        }

        const remoto = datos.espacio as Espacio;
        const combinado = combinarEspacios(espacioRef.current, remoto);
        const jsonRemoto = serializar(remoto);

        ultimoEnviado.current = jsonRemoto;
        setEspacio(() => combinado);
        anotar(datos);
        setFase("listo");
        setMensaje("");
        setGuardadoEn(new Date().toISOString());

        // Si lo local aporta algo que el servidor no tenía, se manda enseguida.
        // Salvo en solo lectura, donde ni se intenta.
        if (serializar(combinado) !== jsonRemoto && puedeEditar(rolValido(datos.rol))) {
          const subida = await pedir("/api/espacio", { espacio: combinado });
          if (subida.ok && subida.datos?.espacio) {
            const final = subida.datos.espacio as Espacio;
            ultimoEnviado.current = serializar(final);
            setEspacio(() => final);
          }
        }

        if (motivo === "manual") avisar("Se trajo lo último del espacio del equipo.");
      } finally {
        enCurso.current = false;
      }
    },
    [anotar, avisar, setEspacio],
  );

  const entrarCon = useCallback(
    async (codigo: string): Promise<boolean> => {
      const limpio = codigo.trim();
      if (!limpio) return false;

      const { ok, datos } = await pedir("/api/invitaciones/aceptar", { codigo: limpio });
      if (!ok) {
        const texto = typeof datos?.error === "string" ? datos.error : "No se pudo entrar.";
        setMensaje(texto);
        avisar(texto);
        return false;
      }

      await traer("entrada");
      avisar("Ya estás en el espacio compartido: ahora ves el catálogo y los estudios del equipo.");
      return true;
    },
    [avisar, traer],
  );

  const generarInvitacion = useCallback(
    async (paraRol: Rol) => {
      const { ok, datos } = await pedir("/api/invitaciones", { rol: paraRol });
      if (ok && datos?.invitacion) {
        setInvitacion(datos.invitacion as Invitacion);
        avisar(
          paraRol === "lectura"
            ? "Enlace listo: quien lo abra verá el espacio pero no podrá cambiarlo."
            : "Listo: comparte el enlace con quien deba tener acceso.",
        );
      } else {
        avisar(
          typeof datos?.error === "string" ? datos.error : "No se pudo generar la invitación.",
        );
      }
    },
    [avisar],
  );

  const descartarInvitacion = useCallback(() => {
    limpiarDireccion();
    setInvitacionPendiente("");
  }, []);

  // Al iniciar sesión (o cambiar de persona) se trae el espacio del equipo.
  const identificador = usuario?.sub ?? "";
  useEffect(() => {
    if (!identificador) {
      setFase("sin-sesion");
      setEquipo(null);
      setInvitacion(null);
      setRol(null);
      rolRef.current = null;
      ultimoEnviado.current = "";
      return;
    }
    void traer("entrada");
  }, [identificador, traer]);

  // Guardado con retardo mientras haya sesión, permiso de edición y cambios.
  useEffect(() => {
    if (!identificador || fase === "cargando" || fase === "sin-sesion") return;
    if (!puedeEditar(rol)) return;
    if (serializar(espacio) === ultimoEnviado.current) return;
    const t = setTimeout(() => void subir(), RETARDO_MS);
    return () => clearTimeout(t);
  }, [espacio, identificador, fase, rol, subir]);

  // Un código de invitación que llegó en la dirección entra apenas hay sesión.
  useEffect(() => {
    if (!invitacionPendiente || !identificador) return;
    void (async () => {
      const entrado = await entrarCon(invitacionPendiente);
      if (entrado) descartarInvitacion();
    })();
  }, [invitacionPendiente, identificador, entrarCon, descartarInvitacion]);

  return {
    fase,
    mensaje,
    conectado: Boolean(identificador) && fase !== "sin-sesion",
    ocupado: fase === "cargando" || fase === "guardando",
    rol,
    soloLectura: Boolean(identificador) && !puedeEditar(rol),
    equipo,
    invitacion,
    invitacionPendiente,
    guardadoEn,
    generarInvitacion,
    entrarCon,
    descartarInvitacion,
    traerAhora: () => traer("manual"),
    subirAhora: subir,
  };
}
