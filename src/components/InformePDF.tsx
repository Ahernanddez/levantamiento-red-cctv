import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nombreArchivo } from "../lib/format";
import { archivoAFoto } from "../lib/foto";
import { MEDIDAS_HOJA, informePDF, paginasDelInforme, type HojaPDF } from "../lib/pdf";
import { descargarArchivo, unidadDe } from "../lib/storage";
import type { Estudio, Material } from "../types";

/** Un punto son 1/72 de pulgada y un píxel 1/96: de ahí la conversión. */
const PX_POR_PUNTO = 96 / 72;
const ANCHO_PX = MEDIDAS_HOJA.ancho * PX_POR_PUNTO;
const ALTO_PX = MEDIDAS_HOJA.alto * PX_POR_PUNTO;
const SEPARACION = 14;

/**
 * Las páginas del informe, dibujadas en pantalla.
 *
 * No se usa el visor de PDF del navegador a propósito: en algunos entornos —el
 * panel de la aplicación de escritorio, por ejemplo— no existe, y la vista
 * previa quedaría en blanco. Acá se dibujan las mismas líneas, en las mismas
 * posiciones y con las mismas medidas, sacadas del mismo código que arma el
 * archivo; por eso lo que se ve no puede separarse de lo que se baja.
 */
function Hojas({ paginas }: { paginas: HojaPDF[] }) {
  const marco = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const medir = () => {
      const ancho = marco.current?.clientWidth ?? 0;
      if (ancho > 0) setEscala(Math.min(1, ancho / ANCHO_PX));
    };
    medir();
    const observador =
      typeof ResizeObserver === "function" && marco.current ? new ResizeObserver(medir) : null;
    if (observador && marco.current) observador.observe(marco.current);
    window.addEventListener("resize", medir);
    return () => {
      observador?.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  return (
    <div className="vista-pdf">
      <div
        className="vista-pdf__marco"
        ref={marco}
        style={{ height: (paginas.length * ALTO_PX + (paginas.length - 1) * SEPARACION) * escala }}
      >
        <div className="vista-pdf__hojas" style={{ transform: `scale(${escala})` }}>
          {paginas.map((hoja, i) => (
            <div
              className="hoja"
              key={i}
              style={{ width: `${MEDIDAS_HOJA.ancho}pt`, height: `${MEDIDAS_HOJA.alto}pt` }}
            >
              {(hoja.rects ?? []).map((r, j) => (
                <span
                  className="hoja__fondo"
                  key={`fondo-${j}`}
                  style={{
                    left: `${r.x}pt`,
                    top: `${MEDIDAS_HOJA.alto - r.y}pt`,
                    width: `${r.ancho}pt`,
                    height: `${r.alto}pt`,
                    background: `rgb(${Math.round(r.color[0] * 255)},${Math.round(r.color[1] * 255)},${Math.round(r.color[2] * 255)})`,
                  }}
                />
              ))}
              {hoja.lineas.map((linea, j) => (
                <span
                  className="hoja__linea"
                  key={j}
                  style={{
                    left: `${linea.x}pt`,
                    // En el PDF el origen está abajo; acá arriba. Se descuenta
                    // la altura de la letra para que el renglón caiga igual.
                    top: `${MEDIDAS_HOJA.alto - linea.y - linea.tamano * 0.8}pt`,
                    fontFamily:
                      linea.fuente === "F3"
                        ? "Helvetica, Arial, sans-serif"
                        : '"Courier New", Courier, monospace',
                    fontWeight: linea.fuente === "F1" ? 400 : 700,
                    fontSize: `${linea.tamano}pt`,
                    color: linea.color
                      ? `rgb(${Math.round(linea.color[0] * 255)},${Math.round(linea.color[1] * 255)},${Math.round(linea.color[2] * 255)})`
                      : undefined,
                  }}
                >
                  {linea.texto}
                </span>
              ))}
              {hoja.imagenes.map((img, j) => (
                <img
                  className="hoja__imagen"
                  key={`img-${j}`}
                  src={img.url}
                  alt=""
                  style={{
                    left: `${img.x}pt`,
                    top: `${MEDIDAS_HOJA.alto - img.y}pt`,
                    width: `${img.ancho}pt`,
                    height: `${img.alto}pt`,
                  }}
                />
              ))}
              {hoja.logo ? (
                <img
                  className="hoja__imagen"
                  key="logo"
                  src={hoja.logo.url}
                  alt="Logo"
                  style={{
                    left: `${hoja.logo.x}pt`,
                    top: `${MEDIDAS_HOJA.alto - hoja.logo.y}pt`,
                    width: `${hoja.logo.ancho}pt`,
                    height: `${hoja.logo.alto}pt`,
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * El informe en PDF: botones y vista previa.
 *
 * «Generar» y «Guardar» van separados a propósito. Generar arma el archivo;
 * guardar lo baja al equipo. Antes era un solo botón que abría el diálogo de
 * impresión, así que para ver el resultado había que pasar por ese diálogo y
 * elegir «Guardar como PDF».
 */
export function InformePDF({ estudio, catalogo }: { estudio: Estudio; catalogo: Material[] }) {
  const [enVista, setEnVista] = useState(false);
  const [firmaDelPDF, setFirmaDelPDF] = useState("");
  /** El logo en JPEG, listo para el informe (null mientras carga o si falla). */
  const [logo, setLogo] = useState<string | null>(null);

  // El logo vive con la app y se reduce a JPEG una sola vez: el informe sale
  // igual con y sin él, así que si no carga no rompe nada.
  useEffect(() => {
    let vivo = true;
    fetch(`${import.meta.env.BASE_URL}logo-telesis.png`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("sin logo"))))
      .then((b) => archivoAFoto(new File([b], "logo-telesis.png", { type: b.type || "image/png" })))
      .then((jpeg) => {
        if (vivo) setLogo(jpeg);
      })
      .catch(() => {
        if (vivo) setLogo(null);
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** El último archivo generado, para no rehacerlo si nada cambió. */
  const archivo = useRef<Blob | null>(null);

  /** Lo que la vista previa dibuja: las mismas hojas que van al archivo. */
  const paginas = useMemo(
    () => paginasDelInforme(estudio, catalogo, logo ?? undefined),
    [catalogo, estudio, logo],
  );

  /**
   * Todo lo que el PDF lleva adentro. Si cambia algo, el archivo generado antes
   * ya no representa lo que se ve en pantalla y hay que avisarlo.
   */
  const firma = useMemo(() => {
    const porId = new Map(catalogo.map((m) => [m.id, m] as const));
    return JSON.stringify([
      estudio.nombre,
      estudio.cliente,
      estudio.sitio,
      estudio.ciudad,
      estudio.fecha,
      estudio.realizo,
      estudio.notas,
      estudio.items.map((it) => [
        it.cantidad,
        unidadDe(it, porId.get(it.materialId)),
        porId.get(it.materialId)?.nombre ?? "",
      ]),
      (estudio.fotos ?? []).map((f) => [f.id, f.comentario, f.imagen.length]),
      logo === null ? "sin-logo" : "con-logo",
    ]);
  }, [estudio, catalogo, logo]);

  const alDia = firmaDelPDF === firma && archivo.current !== null;

  const generar = useCallback((): Blob => {
    const nuevo = informePDF(estudio, catalogo, logo ?? undefined);
    archivo.current = nuevo;
    setFirmaDelPDF(firma);
    return nuevo;
  }, [catalogo, estudio, firma, logo]);

  const hayMateriales = estudio.items.length > 0;

  /**
   * Lo que conviene revisar antes de entregar el PDF al cliente. Son avisos,
   * no bloqueos: el archivo se genera igual, pero sin huecos si se atienden.
   */
  const avisos = useMemo(() => {
    const lista: string[] = [];
    if (!estudio.cliente.trim()) lista.push("Falta el cliente.");
    if (!estudio.sitio.trim()) lista.push("Falta el sitio.");
    if (!estudio.realizo.trim()) lista.push("Falta quién realizó el estudio.");
    if (estudio.items.some((it) => it.cantidad <= 0))
      lista.push("Hay materiales con cantidad 0.");
    const sinComentario = (estudio.fotos ?? []).filter((f) => !f.comentario.trim()).length;
    if (sinComentario > 0)
      lista.push(
        sinComentario === 1 ? "1 fotografía sin comentario." : `${sinComentario} fotografías sin comentario.`,
      );
    return lista;
  }, [estudio]);

  const alternarVistaPrevia = () => setEnVista((v) => !v);

  const generarAhora = () => {
    generar();
    setEnVista(true);
  };

  const guardar = () => {
    const listo = alDia && archivo.current ? archivo.current : generar();
    descargarArchivo(nombreArchivo(`lista-${estudio.nombre}`, "pdf"), listo);
  };

  return (
    <div className="informe-pdf">
      <div className="acciones-informe">
        <button
          type="button"
          className="btn btn--primario"
          disabled={!hayMateriales}
          onClick={alternarVistaPrevia}
        >
          {enVista ? "Ocultar vista previa" : "Vista previa del PDF"}
        </button>
        <button type="button" className="btn" disabled={!hayMateriales} onClick={generarAhora}>
          Generar PDF
        </button>
        <button type="button" className="btn" disabled={!hayMateriales} onClick={guardar}>
          Guardar PDF
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hayMateriales}
          onClick={() => window.print()}
        >
          Imprimir el informe
        </button>
      </div>

      <p className="nota">
        {!hayMateriales
          ? "Agrega materiales para poder generar el informe."
          : !alDia && firmaDelPDF !== ""
            ? "Cambiaste el estudio desde la última vez: el PDF generado quedó viejo. Volvé a generarlo."
            : alDia && firmaDelPDF !== ""
              ? "PDF generado, listo para bajarlo con «Guardar»."
              : "«Vista previa» muestra las páginas tal como salen; «Generar» arma el archivo y «Guardar» lo baja a tu equipo."}
      </p>

      {hayMateriales && avisos.length > 0 ? (
        <div className="aviso">
          <strong>Revisá antes de entregar:</strong>
          <ul>
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {enVista ? (
        <>
          <Hojas paginas={paginas} />
          <p className="nota">
            Estas son las mismas páginas del archivo: mismo texto, mismas columnas, mismas medidas.
          </p>
        </>
      ) : null}
    </div>
  );
}
