/**
 * Dibujo del FRENTE del DNI marcando donde esta el codigo. Es lo primero que
 * ve el que da de alta, porque la confusion tipica es darlo vuelta y buscarlo
 * en el dorso: el dorso solo tiene la huella y el domicilio.
 *
 * Verificado contra fotos reales de la base: el PDF417 esta en el frente,
 * arriba a la derecha, al lado de la firma.
 */
export function IlustracionDni({ ancho = 260 }: { ancho?: number }) {
  const alto = Math.round((ancho * 54) / 86); // proporcion real de la tarjeta
  return (
    <svg
      width={ancho}
      height={alto}
      viewBox="0 0 86 54"
      role="img"
      aria-label="Frente del DNI con el código al lado de la firma"
      style={{ display: 'block' }}
    >
      {/* Tarjeta */}
      <rect x="0.75" y="0.75" width="84.5" height="52.5" rx="4" fill="#2a2a3e" stroke="#6b6b8a" strokeWidth="1.2" />

      {/* Encabezado */}
      <rect x="5" y="4.5" width="26" height="1.8" rx="0.9" fill="#555a75" />

      {/* Foto del titular */}
      <rect x="5" y="9.5" width="18" height="24" rx="1.5" fill="#3a3f57" />
      <circle cx="14" cy="18" r="4.2" fill="#565c7d" />
      <path d="M6.8 33.5c0-4.6 3.2-8 7.2-8s7.2 3.4 7.2 8z" fill="#565c7d" />

      {/* Numero de documento, abajo a la izquierda */}
      <rect x="5" y="38" width="22" height="4" rx="1" fill="#555a75" />

      {/* Renglones de datos, apenas insinuados */}
      <rect x="27" y="10" width="9" height="1.3" rx="0.65" fill="#454a63" />
      <rect x="27" y="13" width="19" height="2.2" rx="1.1" fill="#555a75" />
      <rect x="27" y="18.5" width="8" height="1.3" rx="0.65" fill="#454a63" />
      <rect x="27" y="21.5" width="23" height="2.2" rx="1.1" fill="#555a75" />
      <rect x="27" y="27" width="9" height="1.3" rx="0.65" fill="#454a63" />
      <rect x="27" y="30" width="15" height="2.2" rx="1.1" fill="#555a75" />

      {/* Zona del codigo, resaltada */}
      <rect
        x="55"
        y="6.5"
        width="26.5"
        height="22"
        rx="2"
        fill="rgba(38,198,218,0.12)"
        stroke="#26c6da"
        strokeWidth="1.3"
      />
      {[0, 1, 2, 3].map((fila) =>
        Array.from({ length: 13 }).map((_, i) => (
          <rect
            key={`${fila}-${i}`}
            x={57.6 + i * 1.66}
            y={9.6 + fila * 4.3}
            width={(fila + i) % 3 === 0 ? 1.1 : (fila + i) % 2 === 0 ? 0.55 : 0.85}
            height={3.3}
            fill="#d8f6fa"
          />
        )),
      )}
      <text x="68.2" y="33.4" textAnchor="middle" fill="#26c6da" fontSize="4" fontWeight="700">
        CÓDIGO
      </text>

      {/* Firma del titular, justo abajo del codigo */}
      <path
        d="M57 42c2.4-3.4 3.6-3 4.4-.6.7 2.2 1.8 2.6 3-.4 1-2.4 2.2-2.2 3.2.2.9 2.1 2 2.2 3.2-.2 1-2 2.2-1.8 3.1.3.5 1.2 1.4 1.5 2.6.5"
        fill="none"
        stroke="#6b6b8a"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <rect x="57" y="46.5" width="20" height="1.2" rx="0.6" fill="#454a63" />
    </svg>
  );
}
