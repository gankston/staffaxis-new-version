/**
 * Solapa "Autorizante" del telefono de encargado, solo para los jefes de la
 * cadena de la planilla de Hortalizas y Banana (Carlos Orellana, Fabian
 * Marce, ...). Ahi aprueban el "Incumplimiento de carga" de sus sectores; con
 * su OK pasa al jefe de zona (Javier Poelstra), que da el OK final.
 */
import { PanelAutorizar } from '../components/PanelAutorizar';
import { api } from '../lib/api';

export function AutorizanteCadena({ onCantidad }: { onCantidad: (n: number) => void }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--dark-background)' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>Autorizante</div>
          <div style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: 4, lineHeight: 1.4 }}>
            Tarjas fuera de término por incumplimiento de carga de los sectores a tu cargo.
          </div>
        </div>

        <PanelAutorizar
          cargar={api.cadena.pedidos}
          aprobar={api.cadena.aprobar}
          rechazar={api.cadena.rechazar}
          textoAprobada="Aprobada."
          textoRechazoVacio="No autorizada"
          onCantidad={onCantidad}
        />
      </div>
    </div>
  );
}
