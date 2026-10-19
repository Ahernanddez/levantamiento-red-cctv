import { useState } from "react";
import type { EstadoDrive } from "../hooks/useDriveSync";
import { NOMBRE_ARCHIVO, NOMBRE_CARPETA } from "../lib/drive";
import { fechaCorta } from "../lib/format";
import { Campo, Entrada } from "./ui";

export function DrivePanel({ drive }: { drive: EstadoDrive }) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState(drive.clientId);
  const [copiado, setCopiado] = useState(false);

  /** El origen exacto que Google debe tener registrado para aceptar la app. */
  const copiarOrigen = async () => {
    const origen = location.origin;
    try {
      await navigator.clipboard.writeText(origen);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Si el portapapeles esta bloqueado, al menos dejamos el texto seleccionable
      window.prompt("Copia este origen y agrégalo en Google Cloud:", origen);
    }
  };

  const etiqueta = drive.conectado
    ? drive.fase === "guardando"
      ? "Guardando en Drive…"
      : drive.fase === "cargando"
        ? "Leyendo de Drive…"
        : "Sincronizado con Drive"
    : drive.fase === "conectando"
      ? "Conectando con Google…"
      : "Sin conectar a Drive";

  return (
    <section className={`drive drive--${drive.fase}`}>
      <div className="drive__barra">
        <span className="drive__estado">
          <i className={`punto punto--${drive.conectado ? "ok" : drive.fase === "error" ? "error" : "off"}`} />
          {etiqueta}
          {drive.ultimaSync ? (
            <small className="drive__hora">
              último guardado {new Date(drive.ultimaSync).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
            </small>
          ) : null}
        </span>

        <div className="acciones">
          {drive.conectado ? (
            <>
              <button
                type="button"
                className="btn btn--mini"
                disabled={drive.ocupado}
                onClick={() => void drive.subirAhora()}
              >
                Guardar ahora
              </button>
              <button
                type="button"
                className="btn btn--mini"
                disabled={drive.ocupado}
                onClick={() => void drive.bajarAhora()}
              >
                Traer de Drive
              </button>
              <button type="button" className="btn btn--mini btn--peligro" onClick={drive.desconectar}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--mini"
                onClick={() => setAbierto((v) => !v)}
              >
                {abierto ? "Ocultar ajustes" : "Ajustes de Drive"}
              </button>
              <button
                type="button"
                className="btn btn--primario btn--mini"
                disabled={drive.fase === "conectando" || !drive.clientId}
                onClick={() => void drive.conectarDrive()}
              >
                Conectar con Google Drive
              </button>
            </>
          )}
        </div>
      </div>

      {drive.mensaje ? <p className="drive__mensaje">{drive.mensaje}</p> : null}

      {!drive.conectado && abierto ? (
        <div className="drive__config">
          <Campo
            label="Identificador de cliente OAuth (Client ID)"
            ancho
            hint="Se crea en Google Cloud Console como cliente de tipo «Aplicación web». No es un secreto: puede vivir aquí."
          >
            <Entrada
              value={borrador}
              placeholder="1234567890-abcdef.apps.googleusercontent.com"
              onChange={(e) => setBorrador(e.target.value)}
              onBlur={() => drive.guardarClientId(borrador)}
            />
          </Campo>
          <div className="acciones">
            <button
              type="button"
              className="btn btn--mini"
              onClick={() => drive.guardarClientId(borrador)}
            >
              Guardar identificador
            </button>
          </div>

          <div className="drive__origen">
            <span className="campo__label">Origen de esta app (debe estar autorizado en Google)</span>
            <div className="drive__origen-fila">
              <code>{location.origin}</code>
              <button type="button" className="btn btn--mini" onClick={() => void copiarOrigen()}>
                {copiado ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
            <span className="campo__hint">
              Tal cual, sin barra final. Si falta, Google bloquea el acceso con «no registered origin
              (Error 401: invalid_client)» y la ventana se cierra sola.
            </span>
          </div>

          <details className="drive__ayuda">
            <summary>Cómo obtener el Client ID (una sola vez)</summary>
            <ol>
              <li>
                Crea un proyecto en <em>console.cloud.google.com</em> y habilita la{" "}
                <strong>Google Drive API</strong>.
              </li>
              <li>
                Configura la pantalla de consentimiento OAuth y agrega tu correo como usuario de
                prueba.
              </li>
              <li>
                En <strong>Credenciales</strong>, crea un cliente OAuth de tipo{" "}
                <strong>Aplicación web</strong>.
              </li>
              <li>
                En «Orígenes de JavaScript autorizados» agrega <strong>todos</strong> los orígenes
                desde los que abres la app: el publicado con HTTPS y los locales de desarrollo. Se
                agregan uno por uno.
              </li>
              <li>Copia el Client ID aquí.</li>
            </ol>
            <p className="nota">
              La app pide únicamente el permiso <code>drive.file</code>: solo puede ver el archivo{" "}
              <strong>{NOMBRE_ARCHIVO}</strong> que ella misma crea dentro de la carpeta{" "}
              <strong>{NOMBRE_CARPETA}</strong>. Nunca accede al resto de tu Drive. Mientras la app de
              Google esté en modo «Prueba», la autorización caduca cada 7 días y deberás reconectar.
            </p>
          </details>
        </div>
      ) : null}

      {drive.conectado ? (
        <p className="drive__pie">
          Guardado en tu Google Drive · carpeta «{NOMBRE_CARPETA}» · archivo {NOMBRE_ARCHIVO}
          {drive.ultimaSync ? ` · ${fechaCorta(drive.ultimaSync.slice(0, 10))}` : ""}
        </p>
      ) : null}
    </section>
  );
}
