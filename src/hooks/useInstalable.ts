import { useCallback, useEffect, useState } from "react";

/**
 * Evento no estándar que Chrome y Edge emiten cuando la app cumple los
 * requisitos para instalarse. No está en lib.dom, así que se declara aquí.
 */
interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Ofrece instalar la app cuando el navegador lo permite.
 *
 * Safari en iOS no emite este evento: allí la instalación se hace desde
 * «Compartir → Añadir a pantalla de inicio», y por eso `disponible` queda en
 * falso en lugar de mostrar un botón que no haría nada.
 */
export function useInstalable() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacion);
    };
    const alInstalar = () => {
      setEvento(null);
      setInstalada(true);
    };
    window.addEventListener("beforeinstallprompt", alOfrecer);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alOfrecer);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return false;
    await evento.prompt();
    const eleccion = await evento.userChoice;
    setEvento(null);
    return eleccion.outcome === "accepted";
  }, [evento]);

  return { disponible: evento !== null, instalada, instalar };
}
