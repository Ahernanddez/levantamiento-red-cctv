import { useState } from "react";
import { numero } from "../lib/format";
import {
  esUnidadUniversal,
  gruposDeUnidades,
  limpiarUnidad,
  nombresDeUnidades,
  nombresOcultos,
  nuevoMaterial,
  unidadPorNombre,
  usosDeMaterial,
  usosDeUniversales,
  type UsosDeUniversal,
} from "../lib/storage";
import { UNIDADES_SUGERIDAS, type Estudio, type Material } from "../types";
import { devolverUniversal, sacarUniversal, type ApiUnidades } from "./unidades";
import { Campo, Entrada, Vacio } from "./ui";

export function CatalogoTab({
  catalogo,
  estudios,
  actualizarCatalogo,
  unidades,
  borrarMaterial,
  avisar,
  soloLectura,
}: {
  catalogo: Material[];
  estudios: Estudio[];
  actualizarCatalogo: (fn: (c: Material[]) => Material[]) => void;
  /** Las unidades del equipo y lo que se puede hacer con ellas. */
  unidades: ApiUnidades;
  borrarMaterial: (id: string) => void;
  avisar: (mensaje: string) => void;
  soloLectura: boolean;
}) {
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState("pieza");
  const [busqueda, setBusqueda] = useState("");
  const [unidadNueva, setUnidadNueva] = useState("");

  /** Las propias del equipo ya limpias y sin repetir, tal como se muestran. */
  const propias = nombresDeUnidades(unidades.propias);
  /** Las universales que el equipo usa, por grupo, y las que dejó de usar. */
  const enUso = gruposDeUnidades(unidades.ocultas);
  const ocultas = nombresOcultos(unidades.ocultas);
  /** Al escribir una unidad se sugiere lo mismo que se ofrece: sin las ocultas. */
  const sugeridas = [...UNIDADES_SUGERIDAS, ...propias].filter((u) => !ocultas.includes(u));
  /** Dónde se siguen usando las ocultas: lo que hay que decir antes de seguir. */
  const usos = usosDeUniversales(catalogo, estudios, ocultas);
  const ocultasEnUso = ocultas.filter((u) => usos[u].materiales + usos[u].lineas > 0);

  /** Cómo se sigue usando una oculta, dicho como se dice: «2 materiales y 1 línea». */
  const detalleDeUso = (uso: UsosDeUniversal): string => {
    const partes: string[] = [];
    if (uso.materiales > 0) {
      partes.push(
        `${numero(uso.materiales)} ${uso.materiales === 1 ? "material del catálogo" : "materiales del catálogo"}`,
      );
    }
    if (uso.lineas > 0) {
      partes.push(`${numero(uso.lineas)} ${uso.lineas === 1 ? "línea" : "líneas"}`);
    }
    return partes.join(" y ");
  };

  const alternarUniversal = (nombre: string, oculta: boolean) => {
    if (oculta) devolverUniversal(unidades, avisar, nombre);
    else sacarUniversal(unidades, avisar, nombre);
  };

  const sumarUnidad = () => {
    const limpio = limpiarUnidad(unidadNueva);
    if (!limpio) {
      avisar("Escribe el nombre de la unidad antes de agregarla.");
      return;
    }
    if (esUnidadUniversal(limpio)) {
      avisar(`«${limpio}» ya está entre las unidades universales: no hace falta agregarla.`);
      return;
    }
    if (unidadPorNombre(unidades.propias, limpio)) {
      avisar(`«${limpio}» ya está en las unidades del equipo.`);
      return;
    }
    unidades.agregar(limpio);
    setUnidadNueva("");
    avisar(`Se agregó «${limpio}» a las unidades del equipo.`);
  };

  const sacarUnidad = (nombre: string) => {
    const encontrada = unidadPorNombre(unidades.propias, nombre);
    if (!encontrada) return;
    // Se quita del equipo, pero las líneas que ya la usan conservan su unidad:
    // cambiar una lista a espaldas de quien la armó sería peor que la molestia.
    unidades.quitar(encontrada.id);
    avisar(`Se quitó «${encontrada.nombre}» de las unidades del equipo.`);
  };

  const filtro = busqueda.trim().toLowerCase();
  const visibles = filtro
    ? catalogo.filter((m) => m.nombre.toLowerCase().includes(filtro))
    : catalogo;

  const agregar = () => {
    const limpio = nombre.trim();
    if (!limpio) {
      avisar("Escribe el nombre del material antes de agregarlo.");
      return;
    }
    const repetido = catalogo.find(
      (m) => m.nombre.trim().toLowerCase() === limpio.toLowerCase(),
    );
    if (repetido) {
      avisar(`«${repetido.nombre}» ya está en el catálogo.`);
      return;
    }
    actualizarCatalogo((c) => [...c, nuevoMaterial(limpio, unidad.trim() || "pieza")]);
    setNombre("");
    setUnidad("pieza");
    avisar(`Se agregó «${limpio}» al catálogo.`);
  };

  // Cada edición lleva su marca de tiempo: al combinar con otra copia gana la
  // más reciente en vez de quedar siempre la que llegó primero.
  const cambiar = (id: string, campos: Partial<Material>) =>
    actualizarCatalogo((c) =>
      c.map((m) => (m.id === id ? { ...m, ...campos, updatedAt: new Date().toISOString() } : m)),
    );

  const quitar = (material: Material) => {
    const usos = usosDeMaterial(estudios, material.id);
    if (usos > 0) {
      avisar(
        `«${material.nombre}» está en ${usos} ${usos === 1 ? "estudio" : "estudios"}. Quítalo de esas listas antes de borrarlo del catálogo.`,
      );
      return;
    }
    borrarMaterial(material.id);
    avisar(`Se quitó «${material.nombre}» del catálogo.`);
  };

  return (
    <div className="panel">
      <section className="seccion">
        <h3 className="seccion__titulo">Agregar un material nuevo</h3>
        <div className="rejilla">
          <Campo label="Nombre del material" ancho>
            <Entrada
              value={nombre}
              placeholder="Ej: Cable UTP Cat6"
              readOnly={soloLectura}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") agregar();
              }}
            />
          </Campo>
          <Campo label="Unidad" hint="Cómo se cuenta y se compra">
            <Entrada
              value={unidad}
              list="unidades-sugeridas"
              readOnly={soloLectura}
              onChange={(e) => setUnidad(e.target.value)}
            />
            <datalist id="unidades-sugeridas">
              {sugeridas.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Campo>
        </div>
        <button
          type="button"
          className="btn btn--primario btn--ancho"
          disabled={soloLectura}
          onClick={agregar}
        >
          + Agregar al catálogo
        </button>
      </section>

      <hr className="separador" />

      <section className="seccion">
        <h3 className="seccion__titulo">Unidades de medida</h3>
        <p className="nota">
          Las universales vienen con la aplicación y las propias las carga el equipo. El desplegable
          de cada línea muestra las dos cosas, y se puede dejar fuera lo que no se usa.
        </p>

        <h4 className="seccion__subtitulo">Universales que usa el equipo</h4>
        <p className="nota">Tocá una unidad para sacarla del desplegable de todas las líneas.</p>
        {enUso.map((g) => (
          <div key={g.grupo} className="grupo-unidades">
            <span className="grupo-unidades__nombre">{g.grupo}</span>
            <ul className="chips-unidades">
              {g.unidades.map((u) => (
                <li key={u}>
                  <button
                    type="button"
                    className="chip-unidad"
                    disabled={soloLectura}
                    title={`Ocultar «${u}» del desplegable`}
                    aria-label={`Ocultar la unidad ${u}`}
                    onClick={() => alternarUniversal(u, false)}
                  >
                    {u}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {ocultas.length > 0 ? (
          <>
            <h4 className="seccion__subtitulo">Ocultas ({numero(ocultas.length)})</h4>
            <p className="nota">
              No se ofrecen en el desplegable ni se sugieren al escribir una unidad, pero una lista
              que ya las use sigue diciendo lo mismo. Tocá una para volver a mostrarla.
            </p>
            {ocultasEnUso.length > 0 ? (
              <p className="nota revision-unidades">
                {ocultasEnUso.length === 1
                  ? "Una de las ocultas se sigue usando: "
                  : `${numero(ocultasEnUso.length)} de las ocultas se siguen usando: `}
                {ocultasEnUso.map((u) => `«${u}» (${detalleDeUso(usos[u])})`).join(", ")}. Dejalas así
                si el equipo ya no las quiere, o volvé a mostrarlas para que se puedan elegir otra
                vez.
              </p>
            ) : null}
            <ul className="chips-unidades">
              {ocultas.map((u) => {
                const enUso = usos[u].materiales + usos[u].lineas > 0;
                return (
                  <li key={u}>
                    <button
                      type="button"
                      className={`chip-unidad chip-unidad--oculta${
                        enUso ? " chip-unidad--aviso" : ""
                      }`}
                      disabled={soloLectura}
                      title={
                        enUso
                          ? `Se sigue usando: ${detalleDeUso(usos[u])}. Volver a mostrar «${u}»`
                          : `Volver a mostrar «${u}»`
                      }
                      aria-label={`Mostrar la unidad ${u}`}
                      onClick={() => alternarUniversal(u, true)}
                    >
                      ↩ {u}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        <h4 className="seccion__subtitulo">Propias del equipo</h4>
        <p className="nota">
          Aparecen en el desplegable de cada línea y también se sugieren al cargar un material.
        </p>

        <div className="rejilla">
          <Campo label="Unidad nueva" hint="Por ejemplo: rollo de 100 m, tramo de 5 m, viaje">
            <Entrada
              value={unidadNueva}
              placeholder="Ej: rollo de 100 m"
              maxLength={40}
              readOnly={soloLectura}
              onChange={(e) => setUnidadNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sumarUnidad();
              }}
            />
          </Campo>
        </div>
        <button
          type="button"
          className="btn btn--primario btn--ancho"
          disabled={soloLectura}
          onClick={sumarUnidad}
        >
          + Agregar unidad
        </button>

        {propias.length === 0 ? (
          <p className="nota">
            Todavía no hay unidades propias: se usan solo las universales que trae la aplicación.
          </p>
        ) : (
          <ul className="unidades-equipo">
            {propias.map((u) => (
              <li key={u} className="etiqueta-unidad">
                <span className="etiqueta-unidad__nombre">{u}</span>
                <button
                  type="button"
                  className="btn btn--mini btn--peligro"
                  disabled={soloLectura}
                  aria-label={`Quitar la unidad ${u}`}
                  onClick={() => sacarUnidad(u)}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="separador" />

      <section className="seccion">
        <h3 className="seccion__titulo">
          Catálogo ({numero(catalogo.length)}{" "}
          {catalogo.length === 1 ? "material" : "materiales"})
        </h3>
        <p className="nota">
          Este catálogo es compartido: el mismo material está disponible en todos tus estudios.
        </p>

        {catalogo.length === 0 ? (
          <Vacio>El catálogo está vacío. Agrega arriba el primer material.</Vacio>
        ) : (
          <>
            {catalogo.length > 6 ? (
              <Entrada
                type="search"
                placeholder="Buscar en el catálogo…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            ) : null}

            {visibles.length === 0 ? (
              <p className="vacio">Ningún material coincide con «{busqueda}».</p>
            ) : (
              <div className="lista-items">
                {visibles.map((m) => {
                  const usos = usosDeMaterial(estudios, m.id);
                  return (
                    <div className="item-catalogo" key={m.id}>
                      <Entrada
                        value={m.nombre}
                        aria-label="Nombre del material"
                        readOnly={soloLectura}
                        onChange={(e) => cambiar(m.id, { nombre: e.target.value })}
                      />
                      <Entrada
                        className="item-catalogo__unidad"
                        value={m.unidad}
                        list="unidades-sugeridas"
                        aria-label="Unidad"
                        readOnly={soloLectura}
                        onChange={(e) => cambiar(m.id, { unidad: e.target.value })}
                      />
                      <div className="item-catalogo__acciones">
                        <span className="etiqueta">
                          {usos === 0
                            ? "sin usar"
                            : `en ${usos} ${usos === 1 ? "estudio" : "estudios"}`}
                        </span>
                        <button
                          type="button"
                          className="btn btn--mini btn--peligro"
                          disabled={soloLectura}
                          onClick={() => quitar(m)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
