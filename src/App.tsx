import { useEffect, useState } from "react";
import { useFreebuffUser } from "@freebuff/auth/react";
import { BarraSuperior } from "./components/BarraSuperior";
import { DrivePanel } from "./components/DrivePanel";
import { EquipoPanel } from "./components/EquipoPanel";
import { EstudioEditor } from "./components/EstudioEditor";
import { EstudioList } from "./components/EstudioList";
import { useDriveSync } from "./hooks/useDriveSync";
import { useEspacioCompartido } from "./hooks/useEspacioCompartido";
import { useInstalable } from "./hooks/useInstalable";
import { nombreArchivo } from "./lib/format";
import { aplicarTema, guardarTema, leerTema, type Tema } from "./lib/tema";
import {
  agregarUnidad,
  cargarEspacio,
  combinarEspacios,
  crearEspacio,
  crearEstudio,
  descargarJSON,
  fusionarCatalogo,
  fusionarEstudios,
  fusionarOcultas,
  fusionarUnidades,
  guardarEspacio,
  leerRespaldo,
  marcarBorrado,
  mostrarUnidad,
  newId,
  ocultarUnidad,
} from "./lib/storage";
import { VERSION_ESPACIO, type Espacio, type Estudio } from "./types";
import type { ApiUnidades } from "./components/unidades";

export default function App() {
  const [espacio, setEspacio] = useState<Espacio>(() => cargarEspacio());
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [tema, setTema] = useState<Tema>(leerTema);
  const instalable = useInstalable();

  const cambiarTema = (nuevo: Tema) => {
    setTema(nuevo);
    guardarTema(nuevo);
  };

  useEffect(() => {
    aplicarTema(tema);
    // Con «sistema», si el equipo cambia de tema mientras la app está abierta
    // hay que seguirlo; con un tema elegido a mano, no.
    if (tema !== "sistema" || typeof window.matchMedia !== "function") return;
    const medio = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => aplicarTema("sistema");
    medio.addEventListener("change", alCambiar);
    return () => medio.removeEventListener("change", alCambiar);
  }, [tema]);

  // Copia local siempre; Google Drive es la copia compartida entre equipos.
  useEffect(() => {
    if (!guardarEspacio(espacio)) {
      setAviso(
        "No se pudo guardar la copia local (almacenamiento lleno o navegación privada). Conecta Drive o exporta un respaldo JSON.",
      );
    }
  }, [espacio]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  const drive = useDriveSync({ espacio, setEspacio, avisar: setAviso });

  // Sesión y espacio compartido del equipo. Sin sesión, la aplicación sigue
  // funcionando: el servidor es un extra, no un requisito.
  // En GitHub Pages no hay servidor (se compila con VITE_SIN_EQUIPO=1): se
  // fuerza sin sesión y no se muestra el panel del equipo, cuyo inicio no
  // podría funcionar ahí. Se lee en cada dibujo para poder probarlo.
  const sinEquipo = import.meta.env.VITE_SIN_EQUIPO === "1";
  const sesion = useFreebuffUser();
  const usuario = sinEquipo ? null : sesion.user;
  const cargandoSesion = sinEquipo ? false : sesion.isLoading;
  const compartido = useEspacioCompartido({
    usuario,
    espacio,
    setEspacio,
    avisar: setAviso,
  });

  const abierto = espacio.estudios.find((e) => e.id === abiertoId) ?? null;

  /** Las unidades del equipo, con todo lo que se puede hacer con ellas. */
  const unidades: ApiUnidades = {
    propias: espacio.unidades,
    ocultas: espacio.unidadesOcultas,
    agregar: (nombre) => setEspacio((prev) => agregarUnidad(prev, nombre)),
    quitar: (id) => setEspacio((prev) => marcarBorrado(prev, "unidades", id)),
    ocultar: (nombre) => setEspacio((prev) => ocultarUnidad(prev, nombre)),
    mostrar: (nombre) => setEspacio((prev) => mostrarUnidad(prev, nombre)),
  };

  const actualizarEstudio = (fn: (e: Estudio) => Estudio) => {
    if (!abiertoId) return;
    setEspacio((prev) => ({
      ...prev,
      estudios: prev.estudios.map((e) =>
        e.id === abiertoId ? { ...fn(e), updatedAt: new Date().toISOString() } : e,
      ),
    }));
  };

  const nuevoEstudio = () => {
    const estudio = crearEstudio();
    setEspacio((prev) => ({ ...prev, estudios: [estudio, ...prev.estudios] }));
    setAbiertoId(estudio.id);
  };

  const duplicarEstudio = (id: string) => {
    setEspacio((prev) => {
      const original = prev.estudios.find((e) => e.id === id);
      if (!original) return prev;
      const ahora = new Date().toISOString();
      const copia: Estudio = {
        ...structuredClone(original),
        id: newId(),
        nombre: `${original.nombre} (copia)`,
        items: original.items.map((it) => ({ ...it, id: newId() })),
        createdAt: ahora,
        updatedAt: ahora,
      };
      const pos = prev.estudios.findIndex((e) => e.id === id);
      const siguientes = [...prev.estudios];
      siguientes.splice(pos + 1, 0, copia);
      return { ...prev, estudios: siguientes };
    });
    setAviso("Estudio duplicado.");
  };

  const eliminarEstudio = (id: string) => {
    const estudio = espacio.estudios.find((e) => e.id === id);
    if (!estudio) return;
    if (!confirm(`¿Eliminar «${estudio.nombre}»? Esta acción no se puede deshacer.`)) return;
    // Se deja la marca de borrado para que no vuelva desde el servidor ni
    // desde la copia que todavía tenga otra persona.
    setEspacio((prev) => marcarBorrado(prev, "estudios", id));
    if (abiertoId === id) setAbiertoId(null);
  };

  const exportarEstudio = (estudio: Estudio) => {
    descargarJSON(nombreArchivo(`estudio-${estudio.nombre}`, "json"), estudio);
  };

  const exportarTodo = () => {
    descargarJSON(nombreArchivo("respaldo-estudios", "json"), {
      ...espacio,
      exportado: new Date().toISOString(),
    });
  };

  const importar = async (files: FileList) => {
    const leidos: Espacio[] = [];
    const fallidos: string[] = [];
    for (const file of Array.from(files)) {
      try {
        leidos.push(await leerRespaldo(file));
      } catch {
        fallidos.push(file.name);
      }
    }

    const estudios = leidos.flatMap((e) => e.estudios);
    const catalogo = leidos.flatMap((e) => e.catalogo);
    const unidades = leidos.flatMap((e) => e.unidades);
    // Qué universales usa el equipo también viaja en el respaldo: si el archivo
    // viene de otra computadora, trae su lista recortada.
    const unidadesOcultas = leidos.reduce(
      (acc, e) => fusionarOcultas(acc, e.unidadesOcultas),
      {} as Espacio["unidadesOcultas"],
    );

    if (estudios.length === 0 && catalogo.length === 0 && unidades.length === 0) {
      setAviso(`No se encontró nada que importar. Revisa: ${fallidos.join(", ") || "los archivos"}`);
      return;
    }

    const resumen = fusionarEstudios(espacio.estudios, estudios);
    const catalogoFusionado = fusionarCatalogo(espacio.catalogo, catalogo);
    const unidadesFusionadas = fusionarUnidades(espacio.unidades, unidades);
    setEspacio((prev) =>
      combinarEspacios(prev, {
        version: VERSION_ESPACIO,
        catalogo,
        estudios,
        unidades,
        unidadesOcultas,
        borrados: prev.borrados,
      }),
    );

    const materialesNuevos = catalogoFusionado.length - espacio.catalogo.length;
    const unidadesNuevas = unidadesFusionadas.length - espacio.unidades.length;
    setAviso(
      `Importado: ${resumen.nuevos} estudio(s) nuevo(s), ${resumen.actualizados} actualizado(s), ${materialesNuevos} material(es) nuevos en el catálogo` +
        (unidadesNuevas > 0 ? ` y ${unidadesNuevas} unidad(es) del equipo.` : ".") +
        (fallidos.length ? ` No se pudieron leer: ${fallidos.join(", ")}` : ""),
    );
  };

  const vaciarTodo = () => {
    if (!confirm("¿Borrar todos los estudios y el catálogo de este dispositivo? No se puede deshacer.")) return;
    setEspacio(crearEspacio());
    setAbiertoId(null);
    setAviso("Se borró todo el contenido local.");
  };

  return (
    <>
      <BarraSuperior
        tema={tema}
        onTema={cambiarTema}
        instalable={instalable.disponible}
        onInstalar={() => void instalable.instalar()}
      />        <div className="app">
          {sinEquipo ? null : (
            <EquipoPanel usuario={usuario} cargando={cargandoSesion} compartido={compartido} />
          )}
          <DrivePanel drive={drive} />
          {aviso ? <div className="aviso">{aviso}</div> : null}

        {abierto ? (
          <EstudioEditor
            estudio={abierto}
            catalogo={espacio.catalogo}
            estudios={espacio.estudios}
            soloLectura={compartido.soloLectura}
            actualizarEstudio={actualizarEstudio}
            actualizarCatalogo={(fn) =>
              setEspacio((prev) => ({ ...prev, catalogo: fn(prev.catalogo) }))
            }
            unidades={unidades}
            borrarMaterial={(id) => setEspacio((prev) => marcarBorrado(prev, "materiales", id))}
            avisar={setAviso}
            onVolver={() => setAbiertoId(null)}
            onEliminar={() => eliminarEstudio(abierto.id)}
            onDuplicar={() => duplicarEstudio(abierto.id)}
            onExportar={() => exportarEstudio(abierto)}
          />
        ) : (
          <EstudioList
            espacio={espacio}
            soloLectura={compartido.soloLectura}
            onAbrir={setAbiertoId}
            onNuevo={nuevoEstudio}
            onDuplicar={duplicarEstudio}
            onEliminar={eliminarEstudio}
            onExportarTodo={exportarTodo}
            onImportar={importar}
            onVaciar={vaciarTodo}
          />
        )}
      </div>
    </>
  );
}
