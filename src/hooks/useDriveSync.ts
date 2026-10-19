import { useCallback, useEffect, useRef, useState } from "react";
import type { Espacio } from "../types";
import {
  SesionExpirada,
  actualizarArchivo,
  borrarSesion,
  conectar,
  guardarClientId,
  guardarSesion,
  leerArchivo,
  leerClientId,
  leerSesion,
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
  // La sesión guardada se retoma al arrancar sin la ventana de Google.
  const inicial = useRef<SesionDrive | null | undefined>(undefined);
  if (inicial.current === undefined) inicial.current = leerSesion();
  const [sesion, setSesion] = useState<SesionDrive | null>(inicial.current);
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
      borrarSesion();
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

  /** Entra con un token ya conseguido: ubica, combina y deja sincronizando. */
  const entrarCon = useCallback(
    async (token: string, avisa: boolean) => {
      setFase("cargando");
      setMensaje("");
      try {
        const destino = await ubicarBaseDeDatos(token);
        setUbicacion(destino);

        const bruto = destino.existente ? await leerArchivo(token, destino.archivoId) : null;
        const remoto = normalizarEspacio(bruto);
        const combinado = combinarEspacios(espacioRef.current, remoto);
        setEspacio(() => combinado);

        // Lo que hay en Drive deja de estar pendiente; si el resultado local es
        // distinto, se sube enseguida.
        const jsonRemoto = serializar(remoto);
        const jsonCombinado = serializar(combinado);
        ultimoEnviado.current = jsonRemoto;
        if (jsonCombinado !== jsonRemoto) {
          await subirCon(token, destino.archivoId, combinado);
        }

        setFase("conectado");
        if (avisa) {
          avisar(
            destino.existente
              ? "Conectado a Drive: se combinaron los materiales y los estudios con los de la nube."
              : "Conectado a Drive. Se creó la carpeta con tus datos.",
          );
        }
      } catch (e) {
        manejarError(e);
      }
    },
    [setEspacio, subirCon, manejarError, avisar],
  );

  const conectarDrive = useCallback(async () => {
    setFase("conectando");
    setMensaje("");
    try {
      const nueva = await conectar(clientId);
      guardarSesion(nueva);
      setSesion(nueva);
      await entrarCon(nueva.accessToken, true);
    } catch (e) {
      manejarError(e);
    }
  }, [clientId, entrarCon, manejarError]);

  // Al arrancar con sesión guardada se retoma sola, sin la ventana de Google.
  // Si el token ya no sirve, manejarError la olvida y avisa que reconecten.
  useEffect(() => {
    if (inicial.current) {
      const token = inicial.current.accessToken;
      inicial.current = null;
      void entrarCon(token, false);
    }
  }, [entrarCon]);

  const desconectar = useCallback(() => {
    if (sesion) revocar(sesion);
    borrarSesion();
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
