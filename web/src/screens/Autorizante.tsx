/**
 * Modo autorizante: el que verifica los cortes de luz e internet (Facundo
 * Zingone) confirma o no las Tarjas Fuera de Término de esos motivos. Si
 * confirma, pasan a RRHH en StaffAdmin; si no, al encargado le llega el aviso
 * "Tarja fuera de término no aprobada".
 *
 * No es la aprobacion de los supervisores: es otro circuito y otra sesion.
 */
import { PanelAutorizar } from '../components/PanelAutorizar';
import { api } from '../lib/api';
import { sesion } from '../lib/session';

export function Autorizante({ onVolver }: { onVolver: () => void }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--dark-background)' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>Modo autorizante</div>
            <div style={{ fontSize: 14, color: 'var(--teal)' }}>{sesion.getAutorizanteNombre() ?? ''}</div>
            <div style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: 4, lineHeight: 1.4 }}>
              Revisá y autorizá las tarjas cargadas fuera de término por cortes de luz o de internet.
            </div>
          </div>
          <button onClick={onVolver} style={{ background: 'none', border: '1px solid var(--purple80)', color: 'var(--purple80)', borderRadius: 10, padding: '6px 12px', fontSize: 13 }}>
            Volver
          </button>
        </div>

        <PanelAutorizar
          cargar={api.getPedidosAutorizante}
          aprobar={api.confirmarCorte}
          rechazar={api.rechazarCorte}
          textoAprobada="Autorizada. Ahora pasa a RRHH para el OK final."
          textoRechazoVacio="No se confirmó el corte"
        />
      </div>
    </div>
  );
}
