// Preferencias de la persona (tema, menú recogido) guardadas en el navegador
export const preferencias = {
  leer(clave) {
    try { return localStorage.getItem(clave); } catch { return null; }
  },
  guardar(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
  },
};
