import { useRef, useState } from "react";
import { fechaCorta, numero } from "../lib/format";
import type { Espacio } from "../types";

export function EstudioList({
  espacio,
  soloLectura,
  onAbrir,
  onNuevo,
  onDuplicar,
  onEliminar,
  onExportarTodo,
  onImportar,
  onVaciar,
}: {
  espacio: Espacio;
  /** Con permiso de solo lectura no se ofrece nada que el servidor vaya a rechazar. */
  soloLectura: boolean;
  onAbrir: (id: string) => void;
  onNuevo: () => void;
  onDuplicar: (id: string) => void;
  onEliminar: (id: string) => void;
  onExportarTodo: () => void;
  onImportar: (files: FileList) => void;
  onVaciar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const inputArchivo = useRef<HTMLInputElement>(null);

  const { estudios, catalogo } = espacio;
  const filtro = busqueda.trim().toLowerCase();
  const visibles = filtro
    ? estudios.filter((e) =>
        [e.nombre, e.cliente, e.sitio, e.ciudad, e.realizo].join(" ").toLowerCase().includes(filtro),
      )
    : estudios;

  return (
    <div className="portada">
      <header className="portada__cabecera">
        <div>
          <h1>Estudios de materiales</h1>
          <p className="nota">
            Red estructurada y CCTV. Datos del cliente, catálogo de materiales compartido y lista con
            cantidades.
          </p>
          {soloLectura ? (
            <p className="nota nota--aviso">
              Estás viendo el espacio del equipo en solo lectura. Podés exportar y respaldar todo,
              pero para agregar o cambiar algo necesitás permiso de edición.
            </p>
          ) : null}
        </div>
        <div className="acciones">
          <button
            type="button"
            className="btn btn--primario"
            disabled={soloLectura}
            title={soloLectura ? "Necesitás permiso de edición en el espacio" : undefined}
            onClick={onNuevo}
          >
            + Nuevo estudio
          </button>
          <button
            type="button"
            className="btn"
            disabled={soloLectura}
            onClick={() => inputArchivo.current?.click()}
          >
            Importar JSON
          </button>
          <button
            type="button"
            className="btn"
            disabled={estudios.length === 0 && catalogo.length === 0}
            onClick={onExportarTodo}
          >
            Respaldar todo
          </button>
          <input
            ref={inputArchivo}
            type="file"
            accept="application/json,.json"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) onImportar(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="portada__resumen">
        <span>
          <strong>{numero(estudios.length)}</strong> {estudios.length === 1 ? "estudio" : "estudios"}
        </span>
        <span>
          <strong>{numero(catalogo.length)}</strong> materiales en el catálogo
        </span>
        <span>
          <strong>{numero(estudios.reduce((s, e) => s + e.items.length, 0))}</strong> materiales
          listados
        </span>
      </div>

      {estudios.length > 0 ? (
        <input
          className="entrada buscador"
          type="search"
          placeholder="Buscar por nombre, cliente, sitio o responsable…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      ) : null}

      {estudios.length === 0 ? (
        <div className="vacio vacio--grande">
          <p>Todavía no tienes estudios.</p>
          <p>
            Crea uno nuevo para cargar los datos del cliente y armar la lista de materiales. El
            catálogo se administra dentro del estudio, en la pestaña «Catálogo».
          </p>
        </div>
      ) : null}

      {estudios.length > 0 && visibles.length === 0 ? (
        <p className="vacio">Ningún estudio coincide con «{busqueda}».</p>
      ) : null}

      <div className="tarjetas">
        {visibles.map((estudio) => (
          <article className="tarjeta" key={estudio.id}>
            <button
              type="button"
              className="tarjeta__abrir"
              onClick={() => onAbrir(estudio.id)}
              aria-label={`Abrir ${estudio.nombre}`}
            >
              <h2>{estudio.nombre || "Estudio sin nombre"}</h2>
              <p className="tarjeta__cliente">
                {estudio.cliente || "Sin cliente"} · {fechaCorta(estudio.fecha)}
              </p>
              <dl className="tarjeta__datos">
                <div>
                  <dt>Materiales</dt>
                  <dd>{numero(estudio.items.length)}</dd>
                </div>
                <div>
                  <dt>Realizó</dt>
                  <dd className="tarjeta__texto">{estudio.realizo || "—"}</dd>
                </div>
                <div>
                  <dt>Sitio</dt>
                  <dd className="tarjeta__texto">{estudio.sitio || "—"}</dd>
                </div>
              </dl>
            </button>
            <div className="acciones acciones--tarjeta">
              <button
                type="button"
                className="btn btn--mini"
                disabled={soloLectura}
                onClick={() => onDuplicar(estudio.id)}
              >
                Duplicar
              </button>
              <button
                type="button"
                className="btn btn--mini btn--peligro"
                disabled={soloLectura}
                onClick={() => onEliminar(estudio.id)}
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>

      {estudios.length > 0 || catalogo.length > 0 ? (
        <section className="seccion">
          <h3 className="seccion__titulo">Zona delicada</h3>
          <p className="nota">
            Borra todos los estudios y el catálogo de este dispositivo. Si tienes Drive conectado o un
            respaldo exportado, podrás recuperarlos.
          </p>
          <button
            type="button"
            className="btn btn--peligro"
            disabled={soloLectura}
            onClick={onVaciar}
          >
            Borrar todo el contenido
          </button>
        </section>
      ) : null}
    </div>
  );
}
