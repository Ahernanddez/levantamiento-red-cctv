import { fechaCorta, numero } from "../lib/format";
import { totalPorUnidad, unidadDe } from "../lib/storage";
import type { Estudio, Material } from "../types";

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="informe__dato">
      <span>{label}</span>
      <strong>{valor || "—"}</strong>
    </div>
  );
}

/**
 * Documento que se imprime. En pantalla permanece oculto: se muestra solo al
 * imprimir, y el boton «Guardar PDF» vive en la pestana Lista.
 */
export function Informe({ estudio, catalogo }: { estudio: Estudio; catalogo: Material[] }) {
  const porId = new Map(catalogo.map((m) => [m.id, m] as const));
  const totales = totalPorUnidad(estudio.items, porId);
  const textoTotal = totales
    .map((t) => `${numero(t.total, t.total % 1 === 0 ? 0 : 2)} ${t.unidad}`)
    .join(" · ");

  return (
    <article className="informe" id="informe">
      <header className="informe__encabezado">
        <div>
          <h1>{estudio.nombre || "Estudio sin nombre"}</h1>
          <p className="informe__subtitulo">
            Lista de materiales · Instalaciones de red y sistemas de CCTV
          </p>
        </div>
        <div className="informe__fecha">Fecha: {fechaCorta(estudio.fecha)}</div>
      </header>

      <section className="informe__seccion">
        <h2>1. Datos generales</h2>
        <div className="informe__datos">
          <Dato label="Cliente" valor={estudio.cliente} />
          <Dato label="Sitio" valor={estudio.sitio} />
          <Dato label="Ciudad" valor={estudio.ciudad} />
          <Dato label="Fecha del estudio" valor={fechaCorta(estudio.fecha)} />
          <Dato label="Estudio realizado por" valor={estudio.realizo} />
          <Dato
            label="Materiales listados"
            valor={`${numero(estudio.items.length)}${textoTotal ? ` (${textoTotal})` : ""}`}
          />
        </div>
      </section>

      <section className="informe__seccion">
        <h2>2. Lista de materiales</h2>
        {estudio.items.length === 0 ? (
          <p className="informe__vacio">Todavía no se agregaron materiales.</p>
        ) : (
          <table className="informe__tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Material</th>
                <th className="der">Cantidad</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {estudio.items.map((it, i) => {
                const material = porId.get(it.materialId);
                return (
                  <tr key={it.id}>
                    <td>{i + 1}</td>
                    <td>{material?.nombre ?? "(material no disponible)"}</td>
                    <td className="der">{numero(it.cantidad, it.cantidad % 1 === 0 ? 0 : 2)}</td>
                    {/* La unidad de la línea si se eligió, y si no la del catálogo. */}
                    <td>{unidadDe(it, material)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {estudio.notas.trim() ? (
        <section className="informe__seccion">
          <h2>3. Observaciones</h2>
          <p className="informe__notas">{estudio.notas}</p>
        </section>
      ) : null}

      <footer className="informe__firmas">
        <div>
          <span>Estudio realizado por</span>
          <div className="linea-firma" />
          {estudio.realizo || ""}
        </div>
        <div>
          <span>Cliente / conformidad</span>
          <div className="linea-firma" />
          {estudio.cliente || ""}
        </div>
      </footer>

      <p className="informe__pie">
        Documento generado el {fechaCorta(estudio.fecha)}. Las cantidades son las definidas en el
        estudio y deben confirmarse contra el recorrido real antes de comprar.
      </p>
    </article>
  );
}
