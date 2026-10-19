import { useState } from "react";
import { Entrada, Selector } from "./ui";

/** Valor de la opción que abre el alta de una unidad nueva. */
const AGREGAR = "__nueva-unidad-del-equipo__";

/** Valor de la opción que abre el sacado de una universal del desplegable. */
const OCULTAR = "__ocultar-del-desplegable__";

/**
 * Lista desplegable de unidades para una línea de la lista de materiales.
 *
 * La primera opción es «la del catálogo»: deja la línea como estaba, siguiendo
 * al material. Así se puede volver atrás después de cambiarla, en vez de quedar
 * con una unidad suelta que ya no se sabe de dónde salió.
 *
 * Después van las universales que el equipo usa —las que no usa quedan ocultas—
 * agrupadas por lo que miden, las propias del equipo y, al final, la opción de
 * sumar una nueva sin salir de acá: la unidad se agrega para todo el equipo y
 * queda elegida en esta línea, que es lo que se está haciendo en ese momento.
 *
 * Una unidad que la línea ya tiene y que no está en ninguna de esas listas —una
 * escrita a mano en el catálogo, o una universal que el equipo ocultó después—
 * se muestra igual, marcada como actual: la línea no puede perder lo que dice.
 *
 * La última opción saca una universal del desplegable sin salir de la línea: es
 * ahí donde se nota que molesta, y sale del desplegable de todo el equipo, que
 * es lo que significa dejar de usarla. La unidad no se borra: esta línea y
 * cualquier otra que ya la tuvieran siguen diciéndolo igual.
 */
export function SelectorUnidad({
  valor,
  unidadDelCatalogo,
  propias,
  grupos,
  onChange,
  onAgregarUnidad,
  onQuitarUniversal,
  soloLectura,
  etiqueta,
}: {
  /** Lo elegido en la línea. Vacío = la del catálogo. */
  valor: string;
  unidadDelCatalogo: string;
  /** Nombres de las unidades propias del equipo, ya sin repetir. */
  propias: string[];
  /** Las universales que el equipo usa, agrupadas como van en el desplegable. */
  grupos: { grupo: string; unidades: string[] }[];
  onChange: (unidad: string) => void;
  onAgregarUnidad: (nombre: string) => void;
  /** Saca una universal del desplegable de todo el equipo. */
  onQuitarUniversal: (nombre: string) => void;
  soloLectura: boolean;
  etiqueta: string;
}) {
  const [pidiendo, setPidiendo] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [quitando, setQuitando] = useState(false);
  const [aQuitar, setAQuitar] = useState("");

  const universales = grupos.flatMap((g) => g.unidades);
  const suelta = valor !== "" && !universales.includes(valor) && !propias.includes(valor);

  const elegir = (elegido: string) => {
    if (elegido === AGREGAR) {
      setBorrador("");
      setPidiendo(true);
      return;
    }
    if (elegido === OCULTAR) {
      // Se arranca por la unidad de esta línea cuando es una universal: lo más
      // probable es que la que sobra sea justo la que se está mirando.
      setAQuitar(universales.includes(valor) ? valor : (universales[0] ?? ""));
      setQuitando(true);
      return;
    }
    onChange(elegido);
  };

  const confirmarQuitar = () => {
    if (!aQuitar) return;
    onQuitarUniversal(aQuitar);
    setQuitando(false);
  };

  const confirmar = () => {
    const limpio = borrador
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    if (!limpio) return;
    onAgregarUnidad(limpio);
    setPidiendo(false);
    setBorrador("");
  };

  if (quitando) {
    return (
      <span className="alta-unidad">
        <Selector
          className="alta-unidad__entrada"
          value={aQuitar}
          autoFocus
          aria-label={`Unidad que se oculta en ${etiqueta}`}
          onChange={(e) => setAQuitar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmarQuitar();
            if (e.key === "Escape") setQuitando(false);
          }}
        >
          {grupos.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.unidades.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </optgroup>
          ))}
        </Selector>
        <button
          type="button"
          className="btn btn--mini btn--primario"
          aria-label={`Ocultar la unidad elegida en ${etiqueta}`}
          onClick={confirmarQuitar}
        >
          Ocultar
        </button>
        <button
          type="button"
          className="btn btn--mini"
          onClick={() => {
            setQuitando(false);
            setAQuitar("");
          }}
        >
          Cancelar
        </button>
      </span>
    );
  }

  if (pidiendo) {
    return (
      <span className="alta-unidad">
        <Entrada
          className="alta-unidad__entrada"
          value={borrador}
          autoFocus
          maxLength={40}
          placeholder="Ej: rollo de 100 m"
          aria-label={`Nueva unidad del equipo para ${etiqueta}`}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmar();
            if (e.key === "Escape") setPidiendo(false);
          }}
        />
        <button type="button" className="btn btn--mini btn--primario" onClick={confirmar}>
          Agregar
        </button>
        <button
          type="button"
          className="btn btn--mini"
          onClick={() => {
            setPidiendo(false);
            setBorrador("");
          }}
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <Selector
      className="selector-unidad"
      value={valor}
      aria-label={etiqueta}
      disabled={soloLectura}
      onChange={(e) => elegir(e.target.value)}
    >
      <option value="">La del catálogo ({unidadDelCatalogo})</option>
      {suelta ? <option value={valor}>{valor} (actual)</option> : null}
      {grupos.map((g) => (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.unidades.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </optgroup>
      ))}
      {propias.length > 0 ? (
        <optgroup label="Del equipo">
          {propias.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </optgroup>
      ) : null}
      <option value={AGREGAR}>+ Agregar una unidad del equipo…</option>
      {universales.length > 0 ? (
        <option value={OCULTAR}>− Ocultar una unidad del desplegable…</option>
      ) : null}
    </Selector>
  );
}
