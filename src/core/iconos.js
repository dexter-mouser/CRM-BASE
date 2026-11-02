// Los iconos son trazos SVG; esta función los envuelve en un <svg> de 20 px
export const icono = (trazos, clase = '') =>
  `<svg class="${clase}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none">${trazos}</svg>`;

export const ICONO_HAMBURGUESA = '<path d="M4 6h16M4 12h16M4 18h16"/>';
export const ICONO_SALIR = '<path d="M9 4H5v16h4"/><path d="M16 8l4 4-4 4M20 12H9"/>';
export const ICONO_SOL = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
export const ICONO_LUNA = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
export const ICONO_OJO = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
export const ICONO_OJO_TACHADO = '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.7A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
export const ICONO_CAMPANA = '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>';
export const ICONO_LUPA = '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>';
export const ICONO_MAS = '<path d="M12 5v14M5 12h14"/>';
export const ICONO_PAPELERA = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
