/**
 * Iconos SVG (los mismos de Material que usa la app Android). Nada de emojis:
 * se ven distinto en cada telefono y no respetan el color del tema.
 */
type P = { size?: number; color?: string };

const svg = (d: string) => ({ size = 24, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden focusable="false">
    <path d={d} />
  </svg>
);

// Material: CalendarMonth
export const IconoCalendario = svg('M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7z');
// Material: Save
export const IconoGuardar = svg('M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z');
// Material: PhotoCamera
export const IconoCamara = svg('M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2 7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z');
// Material: PhotoLibrary
export const IconoGaleria = svg('M22 16V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2zm-11-4 2.03 2.71L16 11l4 5H8l3-4zM2 6v14a2 2 0 0 0 2 2h14v-2H4V6H2z');
// Material: Edit
export const IconoEditar = svg('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z');
// Material: Group
export const IconoGrupo = svg('M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z');
// Material: NoMeetingRoom
export const IconoAusencias = svg('M14 6v3.4l2 2V6h2v7.4l2 2V6c0-1.1-.9-2-2-2h-4c0-1.1-.9-2-2-2H8.6l2 2H12c1.1 0 2 .9 2 2zM2.4 1.7 1.1 3l3 3H4v13H2v2h13.1l4.6 4.6 1.3-1.3L2.4 1.7zM6 19V8l7.1 7.1V19H6z');
// Material: List
export const IconoLista = svg('M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z');
// Material: CheckCircle
export const IconoCheckCirculo = svg('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z');
// Material: Check
export const IconoCheck = svg('M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z');
// Material: SwapHoriz
export const IconoCambiarSector = svg('M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z');
// Material: Logout
export const IconoSalir = svg('M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z');
// Material: Warning
export const IconoAlerta = svg('M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z');
// Material: Search
export const IconoBuscar = svg('M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
// Material: Business
export const IconoSector = svg('M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z');
// Material: Add
export const IconoMas = svg('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z');
// Material: Close
export const IconoCerrar = svg('M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
// Material: Delete
export const IconoBorrar = svg('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z');
// Material: VisibilityOff
export const IconoOcultar = svg('M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z');
// Material: BarChart
export const IconoGrafico = svg('M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z');
// Material: Schedule (reloj)
export const IconoReloj = svg('M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z');
// Material: PersonAddAlt
export const IconoPersonaMas = svg('M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 8c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm-6-3H6V8H4v3H1v2h3v3h2v-3h3v-2z');
// Material: WifiOff
export const IconoSinConexion = svg('M22.99 9C19.15 5.16 13.8 3.76 8.84 4.78l2.52 2.52c3.47-.17 6.99 1.05 9.63 3.7l2-2zM2.1 4.1 1 5.2l2.98 2.98A15.9 15.9 0 0 0 1 9l2 2a13 13 0 0 1 3.8-2.4l2.4 2.4A9.9 9.9 0 0 0 5 13l2 2a7 7 0 0 1 4.5-2l7.3 7.3 1.1-1.1L2.1 4.1zM9 17l3 3 3-3a4.2 4.2 0 0 0-6 0z');

// Flechas del selector de periodo
export const IconoAnterior = svg('M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z');
export const IconoSiguiente = svg('M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z');
// Material: ArrowDropDown
export const IconoDesplegar = svg('M7 10l5 5 5-5z');
