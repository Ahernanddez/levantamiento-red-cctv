import { useState } from "react";
import { SignInWithFreebuff, SignOutButton, type FreebuffUser } from "@freebuff/auth/react";
import type { EstadoCompartido, Miembro } from "../hooks/useEspacioCompartido";
import { fechaCorta } from "../lib/format";
import { nombreDeRol, puedeEditar, puedeInvitar, type Rol } from "../lib/permisos";
import { Entrada } from "./ui";

/** Enlace que hay que pasarle a otra persona para que entre al espacio. */
export function enlaceDeInvitacion(codigo: string): string {
  try {
    return `${location.origin}/?invitacion=${encodeURIComponent(codigo)}`;
  } catch {
    return `/?invitacion=${codigo}`;
  }
}

function comoSeLlama(m: { nombre: string | null; correo: string | null }, indice: number): string {
  if (m.nombre) return m.nombre;
  if (m.correo) return m.correo;
  return `Persona ${indice + 1}`;
}

function Insignia({ rol }: { rol: Rol }) {
  const clase = rol === "dueno" ? "dueno" : rol === "editor" ? "editor" : "lectura";
  return <span className={`insignia insignia--${clase}`}>{nombreDeRol(rol)}</span>;
}

export function EquipoPanel({
  usuario,
  cargando,
  compartido,
}: {
  usuario: FreebuffUser | null;
  cargando: boolean;
  compartido: EstadoCompartido;
}) {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [copiado, setCopiado] = useState(false);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copia este enlace y mándalo:", texto);
    }
  };

  // Llegó un enlace de invitación y todavía no hay sesión: primero entrar.
  if (!usuario && compartido.invitacionPendiente) {
    return (
      <section className="equipo equipo--invitacion">
        <div className="equipo__barra">
          <span className="equipo__estado">
            <i className="punto punto--aviso" />
            Te invitaron a un espacio compartido
          </span>
          <SignInWithFreebuff
            className="btn btn--primario btn--mini"
            returnTo={`/?invitacion=${encodeURIComponent(compartido.invitacionPendiente)}`}
          >
            Iniciar sesión para entrar
          </SignInWithFreebuff>
          <button type="button" className="btn btn--mini" onClick={compartido.descartarInvitacion}>
            Ahora no
          </button>
        </div>
        <p className="equipo__mensaje">
          Al entrar verás el catálogo y los estudios del equipo, y lo que tengas en este equipo se
          suma a lo que ya haya.
        </p>
      </section>
    );
  }

  if (!usuario) {
    return (
      <section className="equipo equipo--sin-sesion">
        <div className="equipo__barra">
          <span className="equipo__estado">
            <i className="punto punto--off" />
            {cargando ? "Comprobando la sesión…" : "Sin sesión: todo queda solo en este equipo"}
          </span>
          <div className="acciones">
            <SignInWithFreebuff className="btn btn--primario btn--mini">
              Iniciar sesión con Freebuff
            </SignInWithFreebuff>
            <button type="button" className="btn btn--mini" onClick={() => setAbierto((v) => !v)}>
              {abierto ? "Ocultar" : "Tengo un código"}
            </button>
          </div>
        </div>

        <p className="equipo__mensaje">
          Inicia sesión para trabajar sobre el mismo catálogo y los mismos estudios que tus
          compañeros. Sin sesión, la aplicación funciona igual pero cada quien ve lo suyo.
        </p>

        {abierto ? (
          <div className="equipo__codigo">
            <Entrada
              value={codigo}
              placeholder="Código de invitación (por ejemplo K7Q2M9XT)"
              aria-label="Código de invitación"
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn btn--mini"
              disabled={!codigo.trim()}
              onClick={() => {
                // Sin sesión no se puede entrar: se vuelve a la misma dirección
                // con el código, que ya muestra el paso de iniciar sesión.
                window.location.href = `/?invitacion=${encodeURIComponent(codigo.trim())}`;
              }}
            >
              Entrar
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const etiqueta =
    compartido.fase === "cargando"
      ? "Leyendo el espacio del equipo…"
      : compartido.fase === "guardando"
        ? "Guardando para todo el equipo…"
        : compartido.fase === "error"
          ? "Sin conexión con el espacio del equipo"
          : compartido.fase === "sin-sesion"
            ? "La sesión venció"
            : "Compartido con el equipo";

  const miembros: Miembro[] = compartido.equipo?.miembros ?? [];
  const soyDueno = puedeInvitar(compartido.rol);
  const puedoEditar = puedeEditar(compartido.rol);

  return (
    <section className={`equipo equipo--${compartido.fase}`}>
      <div className="equipo__barra">
        <span className="equipo__estado">
          <i
            className={`punto punto--${
              compartido.fase === "listo" || compartido.fase === "guardando"
                ? "ok"
                : compartido.fase === "error" || compartido.fase === "sin-sesion"
                  ? "error"
                  : "off"
            }`}
          />
          {etiqueta}
          <small className="equipo__hora">
            {usuario.name || usuario.email || "sesión iniciada"}
            {miembros.length > 0
              ? ` · ${miembros.length} ${miembros.length === 1 ? "persona" : "personas"}`
              : ""}
          </small>
          {compartido.rol ? <Insignia rol={compartido.rol} /> : null}
        </span>

        <div className="acciones">
          <button
            type="button"
            className="btn btn--mini"
            disabled={compartido.ocupado}
            onClick={() => void compartido.traerAhora()}
          >
            Traer ahora
          </button>
          <button type="button" className="btn btn--mini" onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Ocultar" : "Equipo y acceso"}
          </button>
          <SignOutButton className="btn btn--mini" returnTo="/">
            Cerrar sesión
          </SignOutButton>
        </div>
      </div>

      {compartido.mensaje ? <p className="equipo__mensaje">{compartido.mensaje}</p> : null}

      {compartido.soloLectura ? (
        <p className="equipo__mensaje equipo__mensaje--aviso">
          Estás en <strong>solo lectura</strong>: ves y exportás lo del equipo, pero los cambios los
          hace quien creó el espacio o quien tenga permiso de edición.
        </p>
      ) : null}

      {abierto ? (
        <div className="equipo__config">
          <div className="equipo__bloque">
            <span className="campo__label">Quiénes tienen acceso</span>
            {miembros.length === 0 ? (
              <p className="campo__hint">Todavía no hay nadie más en este espacio.</p>
            ) : (
              <ul className="equipo__miembros">
                {miembros.map((m, i) => (
                  <li key={`${m.nombre ?? m.correo ?? i}`}>
                    <span>{comoSeLlama(m, i)}</span>
                    {m.soyYo ? <span className="etiqueta">vos</span> : null}
                    <Insignia rol={m.rol} />
                  </li>
                ))}
              </ul>
            )}
            <p className="campo__hint">
              {soyDueno
                ? "Vos creaste este espacio: elegís qué permiso dar a cada persona, y podés darlo de nuevo para corregirlo."
                : "Quien creó el espacio decide los permisos. Los cambios se ven al instante en todas las computadoras."}
            </p>
          </div>

          {soyDueno ? (
            <div className="equipo__bloque">
              <span className="campo__label">Invitar a alguien</span>
              <div className="acciones">
                <button
                  type="button"
                  className="btn btn--primario btn--mini"
                  onClick={() => void compartido.generarInvitacion("editor")}
                >
                  Enlace para editar
                </button>
                <button
                  type="button"
                  className="btn btn--mini"
                  onClick={() => void compartido.generarInvitacion("lectura")}
                >
                  Enlace para solo lectura
                </button>
              </div>

              {compartido.invitacion ? (
                <>
                  <div className="equipo__enlace">
                    <code>{enlaceDeInvitacion(compartido.invitacion.codigo)}</code>
                    <button
                      type="button"
                      className="btn btn--mini"
                      onClick={() => void copiar(enlaceDeInvitacion(compartido.invitacion!.codigo))}
                    >
                      {copiado ? "Copiado ✓" : "Copiar"}
                    </button>
                  </div>
                  <p className="campo__hint">
                    Este enlace da <strong>{nombreDeRol(compartido.invitacion.rol).toLowerCase()}</strong>{" "}
                    y vence el {fechaCorta(compartido.invitacion.expira.slice(0, 10))}. Si generás
                    otro, este deja de funcionar. Quien ya esté adentro puede abrirlo para
                    corregirle el permiso.
                  </p>
                </>
              ) : (
                <p className="campo__hint">
                  Elegí qué permiso querés dar: quien abra el enlace e inicie sesión entra al
                  espacio con ese permiso.
                </p>
              )}
            </div>
          ) : null}

          <div className="equipo__bloque">
            <span className="campo__label">Entrar con un código</span>
            <div className="equipo__codigo">
              <Entrada
                value={codigo}
                placeholder="Código de invitación"
                aria-label="Código de invitación"
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              />
              <button
                type="button"
                className="btn btn--mini"
                disabled={!codigo.trim()}
                onClick={() => {
                  const c = codigo.trim();
                  setCodigo("");
                  void compartido.entrarCon(c);
                }}
              >
                Entrar
              </button>
            </div>
            <p className="campo__hint">
              Al entrar en otro espacio, lo que tenías se suma a ese y tu espacio anterior deja de
              mostrarse.
            </p>
          </div>
        </div>
      ) : null}

      {puedoEditar ? null : (
        <p className="campo__hint equipo__pie">
          Para editar el espacio, pedile a quien lo creó un enlace de edición.
        </p>
      )}
    </section>
  );
}
