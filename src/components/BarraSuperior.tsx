import type { ReactNode } from "react";
import type { Tema } from "../lib/tema";
import { TemaSelector } from "./TemaSelector";

/**
 * Barra superior fija: identifica la app, ofrece instalarla y deja cambiar el
 * tema. En pantallas angostas el nombre se acorta y el selector se queda con
 * los iconos, para no robar altura al contenido.
 */
export function BarraSuperior({
  tema,
  onTema,
  instalable,
  onInstalar,
  children,
}: {
  tema: Tema;
  onTema: (tema: Tema) => void;
  instalable: boolean;
  onInstalar: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="superior">
      <div className="superior__marca">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="superior__logo">
          <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" />
          <path
            d="M7 8.2h7M7 12h10M7 15.8h5"
            stroke="var(--superficie)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <span className="superior__nombre">
          <span className="superior__nombre-largo">Lista de </span>Materiales
        </span>
      </div>

      <div className="superior__acciones">
        {children}
        {instalable ? (
          <button
            type="button"
            className="btn btn--mini btn--instalar"
            onClick={onInstalar}
            title="Instalar la aplicación en este equipo"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 19h16" />
            </svg>
            <span>Instalar</span>
          </button>
        ) : null}
        <TemaSelector tema={tema} onCambiar={onTema} />
      </div>
    </header>
  );
}
