import { useMemo, useState } from "react";
import { numero } from "../lib/format";
import {
  formaUniversal,
  gruposDeUnidades,
  limpiarUnidad,
  nombresDeUnidades,
  nuevoItem,
  totalPorUnidad,
  unidadDe,
  unidadPorNombre,
} from "../lib/storage";
import type { Estudio, Material } from "../types";
import { InformePDF } from "./InformePDF";
import { SelectorUnidad } from "./SelectorUnidad";
import { Entrada, Numero, Vacio } from "./ui";
import { sacarUniversal, type ApiUnidades } from "./unidades";

export function ListaTab({
  estudio,
  catalogo,
  unidades,
  actualizar,
  avisar,
  soloLectura,
}: {
  estudio: Estudio;
  catalogo: Material[];
  /** Las unidades del equipo y lo que se puede hacer con ellas. */
  unidades: ApiUnidades;
  actualizar: (fn: (e: Estudio) => Estudio) => void;
  avisar: (mensaje: string) => void;
  soloLectura: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");

  const porId = useMemo(() => new Map(catalogo.map((m) => [m.id, m] as const)), [catalogo]);
  const enLista = useMemo(
    () => new Set(estudio.items.map((it) => it.materialId)),
    [estudio.items],
  );

  const filtro = busqueda.trim().toLowerCase();
  const disponibles = filtro
    ? catalogo.filter((m) => m.nombre.toLowerCase().includes(filtro))
    : catalogo;

  const agregar = (materialId: string) => {
    actualizar((e) => {
      const existente = e.items.find((it) => it.materialId === materialId);
      if (existente) {
        return {
          ...e,
          items: e.items.map((it) =>
            it.materialId === materialId ? { ...it, cantidad: it.cantidad + 1 } : it,
          ),
        };
      }
      return { ...e, items: [...e.items, nuevoItem(materialId, 1)] };
    });
  };

  const cambiarCantidad = (id: string, cantidad: number) =>
    actualizar((e) => ({
      ...e,
      items: e.items.map((it) => (it.id === id ? { ...it, cantidad } : it)),
    }));

  /** Vacío quiere decir «volver a la unidad del catálogo». */
  const cambiarUnidad = (id: string, unidad: string) =>
    actualizar((e) => ({
      ...e,
      items: e.items.map((it) => (it.id === id ? { ...it, unidad } : it)),
    }));

  /**
   * Alta de una unidad del equipo desde el desplegable de una línea.
   *
   * La unidad se suma al espacio —y por lo tanto al equipo— y queda elegida en
   * esta línea. Si ya existía, no se duplica: se avisa y se la usa, que es lo
   * que la persona estaba buscando.
   */
  const agregarUnidadPropia = (id: string, nombre: string) => {
    const limpio = limpiarUnidad(nombre);
    if (!limpio) return;

    const universal = formaUniversal(limpio);
    if (universal) {
      // Se guarda tal como está en el catálogo de unidades, no como se escribió:
      // «CAJA» y «caja» son la misma y el total no puede partirse por eso.
      avisar(`«${universal}» ya está entre las unidades universales: elegila del desplegable.`);
      cambiarUnidad(id, universal);
      return;
    }

    const existente = unidadPorNombre(unidades.propias, limpio);
    if (existente) {
      cambiarUnidad(id, existente.nombre);
      avisar(`«${existente.nombre}» ya estaba en las unidades del equipo.`);
      return;
    }

    unidades.agregar(limpio);
    cambiarUnidad(id, limpio);
    avisar(`Se agregó «${limpio}» a las unidades del equipo.`);
  };

  const quitar = (id: string) =>
    actualizar((e) => ({ ...e, items: e.items.filter((it) => it.id !== id) }));

  const totales = totalPorUnidad(estudio.items, porId);

  // El desplegable ofrece las universales que el equipo usa y las propias; lo
  // que se calcula acá una vez y se pasa ya listo para dibujar.
  const propias = nombresDeUnidades(unidades.propias);
  const grupos = gruposDeUnidades(unidades.ocultas);

  return (
    <div className="panel">
      <section className="seccion">
        <h3 className="seccion__titulo">
          Lista de materiales ({numero(estudio.items.length)}{" "}
          {estudio.items.length === 1 ? "material" : "materiales"})
        </h3>

        {estudio.items.length === 0 ? (
          <Vacio>
            La lista está vacía. Busca abajo en el catálogo y agrega los materiales que necesites.
          </Vacio>
        ) : (
          <>
            <div className="lista-items">
              {estudio.items.map((it) => {
                const material = porId.get(it.materialId);
                return (
                  <div className="item-lista" key={it.id}>
                    <div className="item-lista__nombre">
                      <strong>{material?.nombre ?? "(material ya no está en el catálogo)"}</strong>
                    </div>
                    <SelectorUnidad
                      valor={it.unidad ?? ""}
                      unidadDelCatalogo={material?.unidad ?? "pieza"}
                      propias={propias}
                      grupos={grupos}
                      etiqueta={`Unidad de ${material?.nombre ?? "este material"}`}
                      soloLectura={soloLectura}
                      onChange={(u) => cambiarUnidad(it.id, u)}
                      onAgregarUnidad={(nombre) => agregarUnidadPropia(it.id, nombre)}
                      onQuitarUniversal={(nombre) => sacarUniversal(unidades, avisar, nombre)}
                    />
                    <Numero
                      value={it.cantidad}
                      soloLectura={soloLectura}
                      onChange={(n) => cambiarCantidad(it.id, n)}
                    />
                    <button
                      type="button"
                      className="btn btn--mini btn--peligro"
                      disabled={soloLectura}
                      onClick={() => quitar(it.id)}
                    >
                      Quitar
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="nota">
              {numero(estudio.items.length)} materiales ·{" "}
              {totales.length === 0
                ? "sin cantidades"
                : totales
                    .map((t) => `${numero(t.total, t.total % 1 === 0 ? 0 : 2)} ${t.unidad}`)
                    .join(" · ")}
            </p>
            {totales.length > 1 ? (
              <p className="nota">
                El total va separado por unidad: no significa lo mismo una caja que un metro, así
                que no se suman entre sí.
              </p>
            ) : null}
          </>
        )}
      </section>

      <hr className="separador" />

      <section className="seccion">
        <h3 className="seccion__titulo">Agregar desde el catálogo</h3>

        {catalogo.length === 0 ? (
          <Vacio>
            El catálogo todavía no tiene materiales. Ve a la pestaña «Catálogo» y agrega los que
            uses.
          </Vacio>
        ) : (
          <>
            <Entrada
              type="search"
              placeholder="Buscar material en el catálogo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            {disponibles.length === 0 ? (
              <p className="vacio">Ningún material del catálogo coincide con «{busqueda}».</p>
            ) : (
              <div className="lista-picker">
                {disponibles.map((m) => {
                  const yaEsta = enLista.has(m.id);
                  const enListaItem = estudio.items.find((it) => it.materialId === m.id);
                  return (
                    <div className="picker-fila" key={m.id}>
                      <div className="picker-fila__nombre">
                        <strong>{m.nombre}</strong>
                        <span className="unidad">
                          {enListaItem
                            ? `en la lista como ${unidadDe(enListaItem, m)}`
                            : m.unidad}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`btn btn--mini${yaEsta ? "" : " btn--primario"}`}
                        disabled={soloLectura}
                        onClick={() => agregar(m.id)}
                      >
                        {yaEsta ? "+1" : "Agregar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <hr className="separador" />

      <section className="seccion">
        <h3 className="seccion__titulo">Informe</h3>
        <InformePDF estudio={estudio} catalogo={catalogo} />
      </section>
    </div>
  );
}
