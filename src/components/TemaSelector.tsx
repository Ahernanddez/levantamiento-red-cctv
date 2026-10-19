import type { Tema } from "../lib/tema";

const trazo = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icono({ tema }: { tema: Tema }) {
  if (tema === "claro") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...trazo}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    );
  }
  if (tema === "oscuro") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...trazo}>
        <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...trazo}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 20.5h7M12 17v3.5" />
    </svg>
  );
}

const OPCIONES: { valor: Tema; etiqueta: string; titulo: string }[] = [
  { valor: "claro", etiqueta: "Claro", titulo: "Fondo claro, como una hoja impresa" },
  { valor: "oscuro", etiqueta: "Oscuro", titulo: "Fondo oscuro, más cómodo de noche" },
  { valor: "sistema", etiqueta: "Sistema", titulo: "Usa lo que tenga configurado tu equipo" },
];

/** Selector de tema. Es un grupo de botones, no un desplegable: se ve de un toque. */
export function TemaSelector({
  tema,
  onCambiar,
}: {
  tema: Tema;
  onCambiar: (tema: Tema) => void;
}) {
  return (
    <div className="tema" role="group" aria-label="Tema de la interfaz">
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          className={`tema__opcion${tema === o.valor ? " tema__opcion--activa" : ""}`}
          aria-pressed={tema === o.valor}
          title={o.titulo}
          onClick={() => onCambiar(o.valor)}
        >
          <Icono tema={o.valor} />
          <span className="tema__texto">{o.etiqueta}</span>
        </button>
      ))}
    </div>
  );
}
