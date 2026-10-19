import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const contenedor = document.getElementById("root");
if (!contenedor) throw new Error("Falta el contenedor #root en index.html");

/**
 * El service worker solo se registra en el sitio publicado. En desarrollo
 * guardaría los archivos de Vite y estorbaría a la recarga en caliente.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /*
       * Si el navegador lo bloquea (por ejemplo en modo privado) la app
       * funciona igual: simplemente no queda disponible sin conexión.
       */
    });
  });
}

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
