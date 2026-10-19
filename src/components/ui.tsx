import { useEffect, useState, type ReactNode } from "react";

export function Campo({
  label,
  hint,
  children,
  ancho,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  ancho?: boolean;
}) {
  return (
    <label className={`campo${ancho ? " campo--ancho" : ""}`}>
      <span className="campo__label">{label}</span>
      {children}
      {hint ? <span className="campo__hint">{hint}</span> : null}
    </label>
  );
}

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`entrada ${props.className ?? ""}`} />;
}

export function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`entrada area ${props.className ?? ""}`} />;
}

/** Lista desplegable, con el mismo aspecto que los campos de escritura. */
export function Selector({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`entrada selector ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

function aTexto(v: number): string {
  return Number.isFinite(v) ? String(v) : "0";
}

/**
 * Entrada numerica que deja escribir decimales sin pelear con el estado
 * controlado: guarda el texto crudo mientras el campo esta enfocado.
 */
export function Numero({
  value,
  onChange,
  min = 0,
  sufijo,
  soloLectura,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  sufijo?: string;
  soloLectura?: boolean;
}) {
  const [texto, setTexto] = useState(() => aTexto(value));
  const [enfocado, setEnfocado] = useState(false);

  useEffect(() => {
    if (!enfocado) setTexto(aTexto(value));
  }, [value, enfocado]);

  const escribir = (t: string) => {
    setTexto(t);
    if (t.trim() === "") {
      onChange(min);
      return;
    }
    const n = Number(t.replace(",", "."));
    if (Number.isFinite(n)) onChange(Math.max(min, n));
  };

  return (
    <span className="numero">
      <input
        className="entrada"
        type="text"
        inputMode="decimal"
        value={texto}
        readOnly={soloLectura}
        onFocus={() => setEnfocado(true)}
        onBlur={() => {
          setEnfocado(false);
          setTexto(aTexto(value));
        }}
        onChange={(e) => escribir(e.target.value)}
      />
      {sufijo ? <span className="numero__sufijo">{sufijo}</span> : null}
    </span>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="vacio">{children}</p>;
}
