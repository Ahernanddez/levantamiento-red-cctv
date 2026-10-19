import { fechaCorta, hoyISO } from "../lib/format";
import type { Estudio } from "../types";
import { Area, Campo, Entrada } from "./ui";

export function DatosTab({
  estudio,
  actualizar,
  soloLectura,
}: {
  estudio: Estudio;
  actualizar: (fn: (e: Estudio) => Estudio) => void;
  soloLectura: boolean;
}) {
  const cambiar = (campos: Partial<Estudio>) => actualizar((e) => ({ ...e, ...campos }));

  return (
    <div className="panel">
      <section className="seccion">
        <h3 className="seccion__titulo">Datos del cliente</h3>
        <div className="rejilla">
          <Campo label="Cliente" ancho>
            <Entrada
              value={estudio.cliente}
              placeholder="Empresa o persona que encarga el estudio"
              readOnly={soloLectura}
              onChange={(e) => cambiar({ cliente: e.target.value })}
            />
          </Campo>

          <Campo label="Sitio" ancho>
            <Entrada
              value={estudio.sitio}
              placeholder="Dirección o nombre del lugar donde se hace el estudio"
              readOnly={soloLectura}
              onChange={(e) => cambiar({ sitio: e.target.value })}
            />
          </Campo>

          <Campo label="Ciudad">
            <Entrada
              value={estudio.ciudad}
              readOnly={soloLectura}
              onChange={(e) => cambiar({ ciudad: e.target.value })}
            />
          </Campo>

          <Campo label="Fecha del estudio">
            {/* En un campo de fecha el atributo de solo lectura no hace nada:
                el navegador lo ignora y la persona podría cambiarlo igual. */}
            <Entrada
              type="date"
              value={estudio.fecha}
              max={hoyISO()}
              disabled={soloLectura}
              onChange={(e) => cambiar({ fecha: e.target.value })}
            />
          </Campo>
        </div>
      </section>

      <hr className="separador" />

      <section className="seccion">
        <h3 className="seccion__titulo">Quien realiza el estudio</h3>
        <div className="rejilla">
          <Campo label="Nombre del responsable" ancho>
            <Entrada
              value={estudio.realizo}
              placeholder="Quién hizo el levantamiento en sitio"
              readOnly={soloLectura}
              onChange={(e) => cambiar({ realizo: e.target.value })}
            />
          </Campo>

          <Campo label="Nombre del estudio" ancho hint="Aparece en el informe y en la lista de estudios.">
            <Entrada
              value={estudio.nombre}
              placeholder="Ej: Materiales para cableado sede norte"
              readOnly={soloLectura}
              onChange={(e) => cambiar({ nombre: e.target.value })}
            />
          </Campo>

          <Campo label="Observaciones" ancho hint="Condiciones del sitio, acuerdos, pendientes.">
            <Area
              rows={5}
              value={estudio.notas}
              placeholder="Ej: Se deja pendiente confirmar el tendido del segundo piso."
              readOnly={soloLectura}
              onChange={(e) => cambiar({ notas: e.target.value })}
            />
          </Campo>
        </div>

        <p className="nota">
          Creado el {fechaCorta(estudio.createdAt.slice(0, 10))} · Última edición{" "}
          {fechaCorta(estudio.updatedAt.slice(0, 10))}
        </p>
      </section>
    </div>
  );
}
