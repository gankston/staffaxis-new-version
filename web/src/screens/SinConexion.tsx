/**
 * La app vive en el servidor, asi que sin señal no hay pantalla que mostrar.
 * Se acordó no armar sincronizacion offline: los supervisores siempre tarjan al
 * final de la jornada, ya con internet.
 */
import { IconoSinConexion } from '../components/iconos';

export function SinConexion({ onReintentar }: { onReintentar: () => void }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 32,
        textAlign: 'center',
        background: 'var(--dark-background)',
      }}
    >
      <div style={{ color: 'var(--texto-apagado)', display: 'flex' }}><IconoSinConexion size={56} /></div>
      <div className="title-large" style={{ fontWeight: 700 }}>
        Sin conexión
      </div>
      <div style={{ color: 'var(--texto-tenue)', maxWidth: 320 }}>
        Necesitás señal o wifi para usar StaffAxis. Buscá conexión y volvé a intentar.
      </div>
      <button
        onClick={onReintentar}
        style={{
          marginTop: 8,
          padding: '14px 32px',
          borderRadius: 28,
          border: 'none',
          color: 'white',
          fontWeight: 700,
          fontSize: 16,
          background: 'linear-gradient(90deg, var(--gradient-start), var(--gradient-middle), var(--gradient-end))',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
