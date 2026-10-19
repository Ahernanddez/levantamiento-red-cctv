import { useRef } from "react";
import { archivoAFoto, MAX_FOTOS, motivoFoto } from "../lib/foto";
import { newId, unidadDe } from "../lib/storage";
import type { Estudio, Material } from "../types";
import { Area, Selector, Vacio } from "./ui";

export function FotosTab({
  estudio,
  catalogo,
  actualizar,
  avisar,
  soloLectura,
}: {
  estudio: Estudio;
  /** Para nombrar los renglones a los que se puede ligar cada foto. */
  catalogo: Material[];
  actualizar: (fn: (e: Estudio) => Estudio) => void;
  avisar: (mensaje: string) => void;
  soloLectura: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const fotos = estudio.fotos ?? [];
  const quedan = MAX_FOTOS - fotos.length;

  const agregar = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return;
    if (quedan <= 0) {
      avisar(`Ya hay ${MAX_FOTOS} fotografías, que es el máximo por estudio.`);
      return;
    }
    const elegidos = [...archivos].slice(0, quedan);
    let agregadas = 0;
    for (const archivo of elegidos) {
      try {
        const imagen = await archivoAFoto(archivo);
        const marca = new Date().toISOString();
        actualizar((e) => ({
          ...e,
          fotos: [
            ...(e.fotos ?? []),
            { id: newId(), imagen, comentario: "", materialId: "", updatedAt: marca },
          ].slice(0, MAX_FOTOS),
        }));
        agregadas += 1;
      } catch (motivo) {
        avisar(`${archivo.name || "Esa imagen"}: ${motivoFoto(motivo)}`);
      }
    }
    if (agregadas > 0) avisar(`Se agregó ${agregadas === 1 ? "1 fotografía" : `${agregadas} fotografías`}.`);
    // Permite volver a elegir el mismo archivo si se quiere reintentar.
    if (entrada.current) entrada.current.value = "";
  };

  const comentar = (id: string, comentario: string) => {
    actualizar((e) => ({
      ...e,
      fotos: (e.fotos ?? []).map((f) => (f.id === id ? { ...f, comentario } : f)),
    }));
  };

  const quitar = (id: string) => {
    actualizar((e) => ({ ...e, fotos: (e.fotos ?? []).filter((f) => f.id !== id) }));
  };

  /** Liga la foto a un renglón de la lista (o la deja suelta, al final). */
  const ligar = (id: string, materialId: string) => {
    actualizar((e) => ({
      ...e,
      fotos: (e.fotos ?? []).map((f) => (f.id === id ? { ...f, materialId } : f)),
    }));
  };

  const porId = new Map(catalogo.map((m) => [m.id, m] as const));
  /** Cómo se nombra cada renglón en el desplegable: «1. Cable UTP × 4 rollo». */
  const renglon = (i: number): string => {
    const it = estudio.items[i];
    const material = porId.get(it?.materialId ?? "");
    const nombre = material?.nombre ?? "(material no disponible)";
    const cantidad = it ? `${it.cantidad} ${unidadDe(it, material)}` : "";
    return `${i + 1}. ${nombre}${cantidad ? ` × ${cantidad}` : ""}`;
  };

  return (
    <div className="panel">
      <section className="seccion">
        <h3 className="seccion__titulo">Fotografías del sitio</h3>
        <p className="nota">
          Se guardan reducidas con el estudio y salen en el PDF con su comentario. Máximo{" "}
          {MAX_FOTOS} por estudio.
        </p>

        <input
          ref={entrada}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={soloLectura}
          aria-label="Agregar fotografías"
          onChange={(e) => void agregar(e.target.files)}
        />
        <button
          type="button"
          className="btn btn--primario"
          disabled={soloLectura || quedan <= 0}
          onClick={() => entrada.current?.click()}
        >
          + Agregar fotografías
        </button>

        {fotos.length === 0 ? (
          <Vacio>Todavía no hay fotografías en este estudio.</Vacio>
        ) : (
          <ul className="fotos">
            {fotos.map((f, i) => (
              <li key={f.id} className="foto">
                <img
                  className="foto__imagen"
                  src={f.imagen}
                  alt={f.comentario || `Fotografía ${i + 1} del sitio`}
                />
                <div className="foto__liga">
                  <Selector
                    aria-label={`Renglón de la fotografía ${i + 1}`}
                    disabled={soloLectura || estudio.items.length === 0}
                    value={f.materialId ?? ""}
                    onChange={(e) => ligar(f.id, e.target.value)}
                  >
                    <option value="">Suelta (al final del informe)</option>
                    {estudio.items.map((it, j) => (
                      <option key={it.id} value={it.id}>
                        Al renglón {renglon(j)}
                      </option>
                    ))}
                  </Selector>
                </div>
                <div className="foto__pie">
                  <Area
                    rows={2}
                    value={f.comentario}
                    placeholder={`Comentario de la fotografía ${i + 1}`}
                    aria-label={`Comentario de la fotografía ${i + 1}`}
                    readOnly={soloLectura}
                    onChange={(e) => comentar(f.id, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--mini btn--peligro"
                    disabled={soloLectura}
                    aria-label={`Quitar la fotografía ${i + 1}`}
                    onClick={() => quitar(f.id)}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
