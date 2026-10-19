import { useCallback, useEffect, useRef, useState } from "react";
import type { Espacio } from "../types";
import {
  SesionExpirada,
  actualizarArchivo,
  conectar,
  guardarClientId,
  leerArchivo,
  leerClientId,
  revocar,
  ubicarBaseDeDatos,
  type SesionDrive,
} from "../lib/drive";
import { combinarEspacios, normalizarEspacio } from "../lib/storage";

export { combinarEspacios };

export type FaseDrive =
  | "desconectado"
  | "conectando"
  | "cargando"
  | "conectado"
  | "guardando"
  | "error";

/** Espera antes de subir cambios, para no golpear la API en cada tecla. */
const RETARDO_GUARDADO_MS = 2500;

export interface EstadoDrive {
  fase: FaseDrive;
  mensaje: string;
  conectado: boolean;
  ocupado: boolean;
  ultimaSync: string;
  clientId: string;
  guardarClientId: (id: string) => void;
  conectarDrive: () => Promise<void>;
  desconectar: () => void;
  subirAhora: () => Promise<void>;
  bajarAhora: () => Promise<void>;
}

function serializar(espacio: Espacio): string {
  return JSON.stringify(espacio);
}

export function useDriveSync({
  espacio,
  setEspacio,
  avisar,
}: {
  espacio: Espacio;
  setEspacio: (fn: (prev: Espacio) => Espacio) => void;
  avisar: (mensaje: string) => void;
}): EstadoDrive {
  const [clientId, setClientId] = useState(leerClientId);
  const [sesion, setSesion] = useState<SesionDrive | null>(null);
  const [ubicacion, setUbicacion] = useState<{ carpetaId: string; archivoId: string } | null>(null);
  const [fase, setFase] = useState<FaseDrive>("desconectado");
  const [mensaje, setMensaje] = useState("");
  const [ultimaSync, setUltimaSync] = useState("");

  /** Estado tal como quedo en Drive la ultima vez. */
  const ultimoEnviado = useRef("");
  const espacioRef = useRef(espacio);

  useEffect(() => {
    espacioRef.current = espacio;
  }, [espacio]);

  const manejarError = useCallback((e: unknown) => {
    if (e instanceof SesionExpirada) {
      setSesion(null);
      setUbicacion(null);
      setFase("desconectado");
      setMensaje("La sesión de Google venció. Vuelve a conectar con Drive.");
      return;
    }
    setFase("error");
    setMensaje(e instanceof Error ? e.message : "Error inesperado al hablar con Google Drive.");
  }, []);

  const subirCon = useCallback(async (token: string, archivoId: string, contenido: Espacio) => {
    const cuerpo = JSON.stringify(
      { ...contenido, actualizado: new Date().toISOString() },
      null,
      2,
    );
    await actualizarArchivo(token, archivoId, cuerpo);
    ultimoEnviado.current = serializar(contenido);
    setUltimaSync(new Date().toISOString());
  }, []);

  const conectarDrive = useCallback(async () => {
    setFase("conectando");
    setMensaje("");
    try {
      const nueva = await conectar(clientId);
      setSesion(nueva);
      setFase("cargando");

      const destino = await ubicarBaseDeDatos(nueva.accessToken);
      setUbicacion(destino);

      const bruto = destino.existente
        ? await leerArchivo(nueva.accessToken, destino.archivoId)
        : null;
      const remoto = normalizarEspacio(bruto);
      const combinado = combinarEspacios(espacioRef.current, remoto);
      setEspacio(() => combinado);

      // Lo que hay en Drive deja de estar pendiente; si el resultado local es
      // distinto, se sube enseguida.
      const jsonRemoto = serializar(remoto);
      const jsonCombinado = serializar(combinado);
      ultimoEnviado.current = jsonRemoto;
      if (jsonCombinado !== jsonRemoto) {
        await subirCon(nueva.accessToken, destino.archivoId, combinado);
      }

      setFase("conectado");
      avisar(
        destino.existente
          ? "Conectado a Drive: se combinaron los materiales y los estudios con los de la nube."
          : "Conectado a Drive. Se creó la carpeta con tus datos.",
      );
    } catch (e) {
      manejarError(e);
    }
  }, [clientId, setEspacio, subirCon, manejarError, avisar]);

  const desconectar = useCallback(() => {
    if (sesion) revocar(sesion);
    setSesion(null);
    setUbicacion(null);
    setFase("desconectado");
    setMensaje("");
    setUltimaSync("");
    ultimoEnviado.current = "";
  }, [sesion]);

  const subirAhora = useCallback(async () => {
    if (!sesion || !ubicacion) return;
    const contenido = espacioRef.current;
    if (serializar(contenido) === ultimoEnviado.current) return;
    setFase("guardando");
    try {
      await subirCon(sesion.accessToken, ubicacion.archivoId, contenido);
      setFase("conectado");
      setMensaje("");
    } catch (e) {
      manejarError(e);
    }
  }, [sesion, ubicacion, subirCon, manejarError]);

  const bajarAhora = useCallback(async () => {
    if (!sesion || !ubicacion) return;
    setFase("cargando");
    setMensaje("");
    try {
      const bruto = await leerArchivo(sesion.accessToken, ubicacion.archivoId);
      const remoto = normalizarEspacio(bruto);
      setEspacio((prev) => combinarEspacios(prev, remoto));
      setFase("conectado");
      avisar("Se trajeron los materiales y estudios de Drive y se combinaron con los locales.");
    } catch (e) {
      manejarError(e);
    }
  }, [sesion, ubicacion, setEspacio, manejarError, avisar]);

  // Guardado automatico con retardo mientras haya sesion activa.
  useEffect(() => {
    if (!sesion || !ubicacion) return;
    if (serializar(espacio) === ultimoEnviado.current) return;
    const t = setTimeout(() => {
      void subirAhora();
    }, RETARDO_GUARDADO_MS);
    return () => clearTimeout(t);
  }, [espacio, sesion, ubicacion, subirAhora]);

  const cambiarClientId = useCallback((id: string) => {
    setClientId(id);
    guardarClientId(id);
  }, []);

  return {
    fase,
    mensaje,
    conectado: Boolean(sesion && ubicacion),
    ocupado: fase === "conectando" || fase === "cargando" || fase === "guardando",
    ultimaSync,
    clientId,
    guardarClientId: cambiarClientId,
    conectarDrive,
    desconectar,
    subirAhora,
    bajarAhora,
  };
}
