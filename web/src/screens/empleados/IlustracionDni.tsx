/**
 * Dibujo del DORSO del DNI marcando donde esta el codigo de barras. Es lo
 * primero que ve el que da de alta: la confusion tipica es escanear el frente,
 * que no tiene codigo.
 */
export function IlustracionDni({ ancho = 260 }: { ancho?: number }) {
  const alto = Math.round((ancho * 54) / 86); // proporcion real de la tarjeta
  return (
    <svg
      width={ancho}
      height={alto}
      viewBox="0 0 86 54"
      role="img"
      aria-label="Dorso del DNI con el código de barras abajo"
      style={{ display: 'block' }}
    >
      {/* Tarjeta */}
      <rect x="0.75" y="0.75" width="84.5" height="52.5" rx="4" fill="#2a2a3e" stroke="#6b6b8a" strokeWidth="1.2" />

      {/* Renglones de datos, apenas insinuados */}
      <rect x="6" y="7" width="30" height="2.4" rx="1.2" fill="#555a75" />
      <rect x="6" y="12" width="42" height="2.4" rx="1.2" fill="#454a63" />
      <rect x="6" y="17" width="36" height="2.4" rx="1.2" fill="#454a63" />
      <rect x="56" y="7" width="24" height="14" rx="1.5" fill="#3a3f57" />

      {/* Zona del PDF417, resaltada */}
      <rect x="4" y="27" width="78" height="22" rx="2.5" fill="rgba(38,198,218,0.12)" stroke="#26c6da" strokeWidth="1.3" />
      {Array.from({ length: 46 }).map((_, i) => (
        <rect
          key={i}
          x={7 + i * 1.62}
          y={31}
          width={i % 3 === 0 ? 1.05 : i % 2 === 0 ? 0.55 : 0.8}
          height={14}
          fill="#d8f6fa"
        />
      ))}
      <text x="43" y="52.2" textAnchor="middle" fill="#26c6da" fontSize="4" fontWeight="700">
        CÓDIGO DE BARRAS
      </text>
    </svg>
  );
}
