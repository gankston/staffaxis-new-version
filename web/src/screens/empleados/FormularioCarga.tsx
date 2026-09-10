/**
 * El formulario de tipos de carga — lo comparten el diálogo de "cargar horas" y
 * el de "editar registro", igual que en EmpleadosScreen.kt. Cada bloque aparece
 * solo si el sector tiene ese tipo habilitado (uiState.tiposCarga).
 */
import { TextField } from '../../components/ui';
import type { ValoresCarga } from './logica';

// Sectores donde el slider va de a media hora (SECTORES_MEDIAS_HORAS).
const SECTORES_MEDIAS_HORAS = new Set([
  '612deb14-b814-49dc-95d1-d413a61abdf6', // OTITO
  '51c0cfaa-3f96-45e7-9081-99735d7f44f3', // PAMPA BLANCA
]);

export const formatHorasSlider = (h: number) => (h % 1 === 0 ? `${Math.trunc(h)}h` : `${h}h`);

export function lineaResumen(v: ValoresCarga): string {
  let out = formatHorasSlider(v.horas);
  if (v.porCosecha) {
    out += ' + Cosecha';
    if (v.cachosCount.trim()) out += ` (${v.cachosCount})`;
  }
  if (v.porAbonada) out += ' + Abonada';
  if (v.porCajas) out += ` + Cajas ${v.cajasCount}`;
  if (v.porCajones) out += ` + Cajones ${v.cajonesCount}`;
  return out;
}

function Check({
  label,
  checked,
  onChange,
  negrita = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  negrita?: boolean;
}) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 0', cursor: 'pointer' }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, accentColor: 'var(--purple80)' }}
      />
      <span style={{ fontWeight: negrita ? 600 : 400 }}>{label}</span>
    </label>
  );
}

function CargaSimple({
  label,
  checked,
  valor,
  onCheck,
  onValor,
  placeholder,
}: {
  label: string;
  checked: boolean;
  valor: string;
  onCheck: (v: boolean) => void;
  onValor: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <Check label={label} checked={checked} onChange={onCheck} negrita />
      {checked && (
        <div style={{ paddingLeft: 16 }}>
          <TextField value={valor} onChange={onValor} label={placeholder} soloNumeros error={!valor.trim()} />
        </div>
      )}
    </div>
  );
}

function CargaTriple({
  label,
  checked,
  onCheck,
  check50,
  onCheck50,
  check25,
  onCheck25,
  checkOtro,
  onCheckOtro,
  valorOtro,
  onValorOtro,
}: {
  label: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  check50: boolean;
  onCheck50: (v: boolean) => void;
  check25: boolean;
  onCheck25: (v: boolean) => void;
  checkOtro: boolean;
  onCheckOtro: (v: boolean) => void;
  valorOtro: string;
  onValorOtro: (v: string) => void;
}) {
  const faltaOpcion = !check50 && !check25 && !(checkOtro && valorOtro.trim());
  return (
    <div>
      <Check label={label} checked={checked} onChange={onCheck} negrita />
      {checked && (
        <div style={{ paddingLeft: 16 }}>
          <Check label="50 kg" checked={check50} onChange={onCheck50} />
          <Check label="25 kg" checked={check25} onChange={onCheck25} />
          <Check label="Otro" checked={checkOtro} onChange={onCheckOtro} />
          {checkOtro && (
            <div style={{ paddingLeft: 16 }}>
              <TextField
                value={valorOtro}
                onChange={onValorOtro}
                label="Detalle (obligatorio)"
                error={!valorOtro.trim()}
              />
            </div>
          )}
          {faltaOpcion && (
            <div style={{ fontSize: 12, color: 'var(--error)' }}>Marcá al menos una opción</div>
          )}
        </div>
      )}
    </div>
  );
}

export function FormularioCarga({
  valores,
  set,
  tiposCarga,
  sectorId,
}: {
  valores: ValoresCarga;
  set: (parcial: Partial<ValoresCarga>) => void;
  tiposCarga: string[];
  sectorId: string;
}) {
  const usarMediasHoras = SECTORES_MEDIAS_HORAS.has(sectorId);
  const paso = usarMediasHoras ? 0.5 : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div
          style={{
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 16,
            color: 'var(--purple80)',
          }}
        >
          {lineaResumen(valores)}
        </div>
        <input
          type="range"
          min={0}
          max={16}
          step={paso}
          value={valores.horas}
          onChange={(e) => set({ horas: Math.min(16, Math.max(0, parseFloat(e.target.value))) })}
          style={{ width: '100%', accentColor: 'var(--purple80)' }}
        />
      </div>

      {tiposCarga.includes('cosecha') && (
        <CargaSimple
          label="Cosecha"
          checked={valores.porCosecha}
          valor={valores.cachosCount}
          onCheck={(v) => set({ porCosecha: v, cachosCount: v ? valores.cachosCount : '' })}
          onValor={(v) => set({ cachosCount: v })}
          placeholder="Cantidad de cachos (obligatorio)"
        />
      )}

      {tiposCarga.includes('abonada') && (
        <CargaSimple
          label="Abonada"
          checked={valores.porAbonada}
          valor={valores.abonadaValor}
          onCheck={(v) => set({ porAbonada: v, abonadaValor: v ? valores.abonadaValor : '' })}
          onValor={(v) => set({ abonadaValor: v })}
          placeholder="Valor (obligatorio)"
        />
      )}

      {tiposCarga.includes('cajas_cajones') && (
        <>
          <CargaSimple
            label="Cajas"
            checked={valores.porCajas}
            valor={valores.cajasCount}
            onCheck={(v) => set({ porCajas: v, cajasCount: v ? valores.cajasCount : '' })}
            onValor={(v) => set({ cajasCount: v })}
            placeholder="Cantidad de cajas (obligatorio)"
          />
          <CargaSimple
            label="Cajones"
            checked={valores.porCajones}
            valor={valores.cajonesCount}
            onCheck={(v) => set({ porCajones: v, cajonesCount: v ? valores.cajonesCount : '' })}
            onValor={(v) => set({ cajonesCount: v })}
            placeholder="Cantidad de cajones (obligatorio)"
          />
        </>
      )}

      {tiposCarga.length > 0 && <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: 0 }} />}

      {tiposCarga.includes('km_viajes') && (
        <CargaSimple
          label="Km / Viajes"
          checked={valores.porKm}
          valor={valores.kmValor}
          onCheck={(v) => set({ porKm: v, kmValor: v ? valores.kmValor : '' })}
          onValor={(v) => set({ kmValor: v })}
          placeholder="Cantidad (obligatorio)"
        />
      )}
      {tiposCarga.includes('has_fumigadas') && (
        <CargaSimple
          label="Hectáreas fumigadas"
          checked={valores.porHasFumigadas}
          valor={valores.hasFumigadasValor}
          onCheck={(v) => set({ porHasFumigadas: v, hasFumigadasValor: v ? valores.hasFumigadasValor : '' })}
          onValor={(v) => set({ hasFumigadasValor: v })}
          placeholder="Hectáreas (obligatorio)"
        />
      )}
      {tiposCarga.includes('siembra_trilla') && (
        <CargaSimple
          label="Siembra / Trilla"
          checked={valores.porSiembraTrilla}
          valor={valores.siembraTrillaValor}
          onCheck={(v) => set({ porSiembraTrilla: v, siembraTrillaValor: v ? valores.siembraTrillaValor : '' })}
          onValor={(v) => set({ siembraTrillaValor: v })}
          placeholder="Cantidad (obligatorio)"
        />
      )}
      {tiposCarga.includes('bolseros') && (
        <CargaSimple
          label="Bolseros"
          checked={valores.porBolseros}
          valor={valores.bolserosValor}
          onCheck={(v) => set({ porBolseros: v, bolserosValor: v ? valores.bolserosValor : '' })}
          onValor={(v) => set({ bolserosValor: v })}
          placeholder="Cantidad (obligatorio)"
        />
      )}
      {tiposCarga.includes('etiquetado') && (
        <CargaSimple
          label="Etiquetado"
          checked={valores.porEtiquetado}
          valor={valores.etiquetadoValor}
          onCheck={(v) => set({ porEtiquetado: v, etiquetadoValor: v ? valores.etiquetadoValor : '' })}
          onValor={(v) => set({ etiquetadoValor: v })}
          placeholder="Cantidad (obligatorio)"
        />
      )}
      {tiposCarga.includes('carga_camion') && (
        <CargaTriple
          label="Carga de Camión"
          checked={valores.porCargaCamion}
          onCheck={(v) =>
            set({
              porCargaCamion: v,
              cargaCamion50: false,
              cargaCamion25: false,
              cargaCamionOtroCheck: false,
              cargaCamionOtro: '',
            })
          }
          check50={valores.cargaCamion50}
          onCheck50={(v) => set({ cargaCamion50: v })}
          check25={valores.cargaCamion25}
          onCheck25={(v) => set({ cargaCamion25: v })}
          checkOtro={valores.cargaCamionOtroCheck}
          onCheckOtro={(v) => set({ cargaCamionOtroCheck: v, cargaCamionOtro: v ? valores.cargaCamionOtro : '' })}
          valorOtro={valores.cargaCamionOtro}
          onValorOtro={(v) => set({ cargaCamionOtro: v })}
        />
      )}
      {tiposCarga.includes('movimiento_estiba') && (
        <CargaTriple
          label="Movimiento de Estiba"
          checked={valores.porMovimientoEstiba}
          onCheck={(v) =>
            set({
              porMovimientoEstiba: v,
              movimientoEstiba50: false,
              movimientoEstiba25: false,
              movimientoEstibaOtroCheck: false,
              movimientoEstibaOtro: '',
            })
          }
          check50={valores.movimientoEstiba50}
          onCheck50={(v) => set({ movimientoEstiba50: v })}
          check25={valores.movimientoEstiba25}
          onCheck25={(v) => set({ movimientoEstiba25: v })}
          checkOtro={valores.movimientoEstibaOtroCheck}
          onCheckOtro={(v) =>
            set({ movimientoEstibaOtroCheck: v, movimientoEstibaOtro: v ? valores.movimientoEstibaOtro : '' })
          }
          valorOtro={valores.movimientoEstibaOtro}
          onValorOtro={(v) => set({ movimientoEstibaOtro: v })}
        />
      )}
    </div>
  );
}
