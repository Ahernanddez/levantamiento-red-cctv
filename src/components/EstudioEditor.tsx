import { useState } from "react";
import type { Estudio, Material } from "../types";
import type { ApiUnidades } from "./unidades";
import { CatalogoTab } from "./CatalogoTab";
import { DatosTab } from "./DatosTab";
import { FotosTab } from "./FotosTab";
import { Informe } from "./Informe";
import { ListaTab } from "./ListaTab";
import { Entrada } from "./ui";

type Pestana = "datos" | "lista" | "fotos" | "catalogo";

export function EstudioEditor({
  estudio,
  catalogo,
  estudios,
  soloLectura,
  actualizarEstudio,
  actualizarCatalogo,
  unidades,
  borrarMaterial,
  avisar,
  onVolver,
  onEliminar,
  onDuplicar,
  onExportar,
}: {
  estudio: Estudio;
  catalogo: Material[];
  estudios: Estudio[];
  /** Las unidades del equipo y lo que se puede hacer con ellas. */
  unidades: ApiUnidades;
  /** Con permiso de solo lectura los campos se leen pero no se escriben. */
  soloLectura: boolean;
  actualizarEstudio: (fn: (e: Estudio) => Estudio) => void;
  actualizarCatalogo: (fn: (c: Material[]) => Material[]) => void;
  /** Deja marca de borrado, para que el material no vuelva desde otra copia. */
  borrarMaterial: (id: string) => void;
  avisar: (mensaje: string) => void;
  onVolver: () => void;
  onEliminar: () => void;
  onDuplicar: () => void;
  onExportar: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("datos");

  const tabs: { id: Pestana; label: string }[] = [
    { id: "datos", label: "Datos" },
    { id: "lista", label: "Lista" },
    { id: "fotos", label: "Fotos" },
    { id: "catalogo", label: "Catálogo" },
  ];

  return (
    <div className="editor">
      <header className="editor__barra">
        <button type="button" className="btn" onClick={onVolver}>
          ← Estudios
        </button>
        <Entrada
          className="editor__titulo"
          value={estudio.nombre}
          aria-label="Nombre del estudio"
          readOnly={soloLectura}
          onChange={(e) => actualizarEstudio((es) => ({ ...es, nombre: e.target.value }))}
        />
        <div className="acciones">
          <button type="button" className="btn" onClick={onExportar}>
            Exportar JSON
          </button>
          <button type="button" className="btn" disabled={soloLectura} onClick={onDuplicar}>
            Duplicar
          </button>
          <button
            type="button"
            className="btn btn--peligro"
            disabled={soloLectura}
            onClick={onEliminar}
          >
            Eliminar
          </button>
        </div>
      </header>

      {soloLectura ? (
        <p className="nota nota--aviso editor__aviso">
          Estás viendo este estudio en solo lectura: podés exportarlo o generar el informe, pero
          cambiarlo le toca a quien tenga permiso de edición.
        </p>
      ) : null}

      <nav className="pestanas" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={pestana === t.id}
            className={`pestana${pestana === t.id ? " pestana--activa" : ""}`}
            onClick={() => setPestana(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="editor__cuerpo">
        {pestana === "datos" ? (
          <DatosTab estudio={estudio} actualizar={actualizarEstudio} soloLectura={soloLectura} />
        ) : null}
        {pestana === "lista" ? (
          <ListaTab
            estudio={estudio}
            catalogo={catalogo}
            unidades={unidades}
            actualizar={actualizarEstudio}
            avisar={avisar}
            soloLectura={soloLectura}
          />
        ) : null}
        {pestana === "fotos" ? (
          <FotosTab
            estudio={estudio}
            catalogo={catalogo}
            actualizar={actualizarEstudio}
            avisar={avisar}
            soloLectura={soloLectura}
          />
        ) : null}
        {pestana === "catalogo" ? (
          <CatalogoTab
            catalogo={catalogo}
            estudios={estudios}
            actualizarCatalogo={actualizarCatalogo}
            unidades={unidades}
            borrarMaterial={borrarMaterial}
            avisar={avisar}
            soloLectura={soloLectura}
          />
        ) : null}
      </div>

      {/* Oculto en pantalla; se imprime desde el botón de la pestaña Lista. */}
      <Informe estudio={estudio} catalogo={catalogo} />
    </div>
  );
}
