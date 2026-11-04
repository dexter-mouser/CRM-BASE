// Preferencias de la persona (tema, menú recogido) guardadas en el navegador

// Sin almacenamiento (bloqueado o lleno) la app sigue funcionando: el detalle queda en la consola, nunca en pantalla
export function registrarFallaDeAlmacenamiento(error) {
  console.error('No se pudo usar el almacenamiento del navegador', error);
}

export const preferencias = {
  leer(clave) {
    try {
      return localStorage.getItem(clave);
    } catch (error) {
      registrarFallaDeAlmacenamiento(error);
      return null;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, valor);
    } catch (error) {
      registrarFallaDeAlmacenamiento(error);
    }
  },
};
