// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { borrarSesion, guardarSesion, leerSesion } from "./drive";

afterEach(() => {
  localStorage.clear();
});

describe("sesión de Drive guardada", () => {
  it("se reutiliza al recargar mientras siga vigente", () => {
    guardarSesion({ accessToken: "tok-1", expiraEn: Date.now() + 3600_000 });
    expect(leerSesion()).toEqual({ accessToken: "tok-1", expiraEn: expect.any(Number) });
  });

  it("vencida no se reutiliza y se limpia", () => {
    guardarSesion({ accessToken: "tok-viejo", expiraEn: Date.now() - 1000 });
    expect(leerSesion()).toBeNull();
    expect(localStorage.getItem("levantamiento-red-cctv:google-sesion")).toBeNull();
  });

  it("a punto de vencer tampoco: mejor pedir un token nuevo", () => {
    guardarSesion({ accessToken: "tok-casi", expiraEn: Date.now() + 60_000 });
    expect(leerSesion()).toBeNull();
  });

  it("una guarda corrupta no rompe el arranque", () => {
    localStorage.setItem("levantamiento-red-cctv:google-sesion", "{no-json");
    expect(leerSesion()).toBeNull();
  });

  it("desconectar olvida la sesión", () => {
    guardarSesion({ accessToken: "tok-1", expiraEn: Date.now() + 3600_000 });
    borrarSesion();
    expect(leerSesion()).toBeNull();
  });
});
