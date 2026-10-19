import { describe, expect, it } from "vitest";
import { normalizarEspacio, normalizarEstudio, normalizarFoto } from "./espacio";

const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("fotos del estudio", () => {
  it("una foto vale con su imagen, aunque no tenga comentario", () => {
    expect(normalizarFoto({ id: "f1", imagen: jpeg, comentario: "Tablero" })).toMatchObject({
      id: "f1",
      imagen: jpeg,
      comentario: "Tablero",
    });
  });

  it("la foto guarda a qué renglón va ligada, o queda suelta", () => {
    expect(normalizarFoto({ id: "f1", imagen: jpeg, materialId: "r1" })?.materialId).toBe("r1");
    expect(normalizarFoto({ id: "f1", imagen: jpeg })?.materialId).toBe("");
  });

  it("sin imagen JPEG no hay foto", () => {
    expect(normalizarFoto({ id: "f1", imagen: "", comentario: "x" })).toBeNull();
    expect(normalizarFoto({ id: "f1", imagen: "data:image/png;base64,xx" })).toBeNull();
    expect(normalizarFoto(null)).toBeNull();
  });

  it("el estudio conserva sus fotos en orden", () => {
    const e = normalizarEstudio({
      id: "e1",
      nombre: "Sede",
      fotos: [
        { id: "f1", imagen: jpeg, comentario: "Una" },
        { id: "f2", imagen: "rota", comentario: "Dos" },
        { id: "f3", imagen: jpeg, comentario: "" },
      ],
    });
    expect(e?.fotos.map((f) => f.id)).toEqual(["f1", "f3"]);
  });

  it("un estudio viejo sin fotos sigue valiendo, con la lista vacía", () => {
    expect(normalizarEstudio({ id: "e1", nombre: "Viejo" })?.fotos).toEqual([]);
  });

  it("las fotos viajan en el espacio que se guarda y se sincroniza", () => {
    const e = normalizarEspacio({
      catalogo: [],
      estudios: [{ id: "e1", nombre: "Sede", fotos: [{ id: "f1", imagen: jpeg }] }],
    });
    expect(e.estudios[0].fotos.map((f) => f.id)).toEqual(["f1"]);
  });
});
