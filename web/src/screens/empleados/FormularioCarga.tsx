/**
 * El formulario de tipos de carga — lo comparten el diálogo de "cargar horas" y
 * el de "editar registro", igual que en EmpleadosScreen.kt. Cada bloque aparece
 * solo si el sector tiene ese tipo habilitado (uiState.tiposCarga).
 */
import type { ReactNode } from 'react';
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
    const cosecha = [
      v.cosechaCanadasCheck && v.cosechaCanadasValor.trim() ? `Cañadas ${v.cosechaCanadasValor.trim()}` : '',
      v.cosechaInvCheck && v.cosechaInvValor.trim() ? `Raigón/Inv ${v.cosechaInvValor.trim()}` : '',
      v.cosechaBananasCheck && v.cosechaBananasValor.trim() ? `Bananas ${v.cosechaBananasValor.trim()}` : '',
      !v.cosechaCanadasCheck && !v.cosechaInvCheck && !v.cosechaBananasCheck && v.cachosLegacy.trim() ? v.cachosLegacy.trim() : '',
    ].filter(Boolean).join(', ');
    out += cosecha ? ` + Cosecha (${cosecha})` : ' + Cosecha';
  }
  if (v.porTantero) {
    const tantero = [
      v.tanteroInvCheck && v.tanteroInvValor.trim() ? `Inv ${v.tanteroInvValor.trim()}` : '',
      v.tanteroCampoCheck && v.tanteroCampoValor.trim() ? `Campo ${v.tanteroCampoValor.trim()}` : '',
    ].filter(Boolean).join(', ');
    out += tantero ? ` + Tantero (${tantero})` : ' + Tantero';
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

/** Etiquetado: se tilda una vez y se abre una cantidad por tamaño de lata. */
function CargaPorLata({
  checked,
  onCheck,
  valores,
  onValor,
}: {
  checked: boolean;
  onCheck: (v: boolean) => void;
  valores: { l185: string; l750: string; l2500: string; l8kg: string };
  onValor: (campo: 'l185' | 'l750' | 'l2500' | 'l8kg', v: string) => void;
}) {
  const vacio = !valores.l185.trim() && !valores.l750.trim() && !valores.l2500.trim() && !valores.l8kg.trim();
  const latas = [
    ['l185', 'Lata 185 grs'],
    ['l750', 'Lata 750 grs'],
    ['l2500', 'Lata 2500 grs'],
    ['l8kg', 'Lata 8 kgs'],
  ] as const;
  return (
    <div>
      <Check label="Etiquetado" checked={checked} onChange={onCheck} negrita />
      {checked && (
        <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {latas.map(([campo, etiqueta]) => (
            <TextField
              key={campo}
              value={valores[campo]}
              onChange={(v) => onValor(campo, v)}
              label={etiqueta}
              soloNumeros
            />
          ))}
          {vacio && <div style={{ fontSize: 12, color: 'var(--error)' }}>Cargá al menos una lata</div>}
        </div>
      )}
    </div>
  );
}

/** Un origen dentro de un tipo de carga: se tilda y pide su cantidad. */
interface Subtipo {
  label: string;
  etiquetaCampo: string;
  check: boolean;
  onCheck: (v: boolean) => void;
  valor: string;
  onValor: (v: string) => void;
}

/**
 * Tipo de carga que se abre en varios origenes: se tilda el tipo, se eligen los
 * que correspondan, y cada uno tildado pide su numero. Lo usan Descarga y Carga
 * (jaula/camion), Cosecha (Cañadas / Raigon-Inv / Bananas) y Tantero.
 */
function CargaSubtipos({
  label,
  checked,
  onCheck,
  subtipos,
  extra,
}: {
  label: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  subtipos: Subtipo[];
  extra?: ReactNode;
}) {
  const faltaOpcion = !subtipos.some((s) => s.check) && !extra;
  return (
    <div>
      <Check label={label} checked={checked} onChange={onCheck} negrita />
      {checked && (
        <div style={{ paddingLeft: 16 }}>
          {extra}
          {subtipos.map((sub) => (
            <div key={sub.label}>
              <Check label={sub.label} checked={sub.check} onChange={sub.onCheck} />
              {sub.check && (
                <div style={{ paddingLeft: 16 }}>
                  <TextField
                    value={sub.valor}
                    onChange={sub.onValor}
                    label={sub.etiquetaCampo}
                    soloNumeros
                    error={!sub.valor.trim()}
                  />
                </div>
              )}
            </div>
          ))}
          {faltaOpcion && <div style={{ fontSize: 12, color: 'var(--error)' }}>Marcá al menos una opción</div>}
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
        {/* Extremos del rango, igual que el Slider de la app */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="label-small" style={{ color: 'var(--texto-tenue)' }}>0h</span>
          <span className="label-small" style={{ color: 'var(--texto-tenue)' }}>16h</span>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: 0 }} />

      {tiposCarga.includes('cosecha') && (
        <CargaSubtipos
          label="Cosecha"
          checked={valores.porCosecha}
          onCheck={(v) =>
            set(
              v
                ? { porCosecha: true }
                : {
                    porCosecha: false,
                    cosechaCanadasCheck: false,
                    cosechaCanadasValor: '',
                    cosechaInvCheck: false,
                    cosechaInvValor: '',
                    cosechaBananasCheck: false,
                    cosechaBananasValor: '',
                    cachosLegacy: '',
                  },
            )
          }
          // Una tarja vieja se cargo con un solo numero, sin decir de donde
          // salio. Se muestra para poder corregirla sin inventarle un origen.
          extra={
            valores.cachosLegacy.trim() ? (
              <div style={{ paddingBottom: 8 }}>
                <TextField
                  value={valores.cachosLegacy}
                  onChange={(v) => set({ cachosLegacy: v })}
                  label="Cantidad (carga vieja, sin origen)"
                  soloNumeros
                />
              </div>
            ) : undefined
          }
          subtipos={[
            {
              label: 'Cañadas',
              etiquetaCampo: 'Cantidad',
              check: valores.cosechaCanadasCheck,
              onCheck: (v) => set({ cosechaCanadasCheck: v, cosechaCanadasValor: v ? valores.cosechaCanadasValor : '' }),
              valor: valores.cosechaCanadasValor,
              onValor: (v) => set({ cosechaCanadasValor: v }),
            },
            {
              label: 'Raigón / Inv',
              etiquetaCampo: 'Cantidad',
              check: valores.cosechaInvCheck,
              onCheck: (v) => set({ cosechaInvCheck: v, cosechaInvValor: v ? valores.cosechaInvValor : '' }),
              valor: valores.cosechaInvValor,
              onValor: (v) => set({ cosechaInvValor: v }),
            },
            {
              label: 'Bananas',
              etiquetaCampo: 'Cantidad',
              check: valores.cosechaBananasCheck,
              onCheck: (v) => set({ cosechaBananasCheck: v, cosechaBananasValor: v ? valores.cosechaBananasValor : '' }),
              valor: valores.cosechaBananasValor,
              onValor: (v) => set({ cosechaBananasValor: v }),
            },
          ]}
        />
      )}

      {tiposCarga.includes('tantero') && (
        <CargaSubtipos
          label="Tantero"
          checked={valores.porTantero}
          onCheck={(v) =>
            set(
              v
                ? { porTantero: true }
                : {
                    porTantero: false,
                    tanteroInvCheck: false,
                    tanteroInvValor: '',
                    tanteroCampoCheck: false,
                    tanteroCampoValor: '',
                  },
            )
          }
          subtipos={[
            {
              label: 'Invernadero',
              etiquetaCampo: 'Cantidad',
              check: valores.tanteroInvCheck,
              onCheck: (v) => set({ tanteroInvCheck: v, tanteroInvValor: v ? valores.tanteroInvValor : '' }),
              valor: valores.tanteroInvValor,
              onValor: (v) => set({ tanteroInvValor: v }),
            },
            {
              label: 'Campo',
              etiquetaCampo: 'Cantidad',
              check: valores.tanteroCampoCheck,
              onCheck: (v) => set({ tanteroCampoCheck: v, tanteroCampoValor: v ? valores.tanteroCampoValor : '' }),
              valor: valores.tanteroCampoValor,
              onValor: (v) => set({ tanteroCampoValor: v }),
            },
          ]}
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
        <CargaPorLata
          checked={valores.porEtiquetado}
          onCheck={(v) =>
            set(
              v
                ? { porEtiquetado: true }
                : {
                    porEtiquetado: false,
                    etiquetadoLata185: '',
                    etiquetadoLata750: '',
                    etiquetadoLata2500: '',
                    etiquetadoLata8kg: '',
                  },
            )
          }
          valores={{
            l185: valores.etiquetadoLata185,
            l750: valores.etiquetadoLata750,
            l2500: valores.etiquetadoLata2500,
            l8kg: valores.etiquetadoLata8kg,
          }}
          onValor={(campo, v) =>
            set(
              campo === 'l185' ? { etiquetadoLata185: v }
              : campo === 'l750' ? { etiquetadoLata750: v }
              : campo === 'l2500' ? { etiquetadoLata2500: v }
              : { etiquetadoLata8kg: v },
            )
          }
        />
      )}

      {tiposCarga.includes('descarga') && (
        <CargaSubtipos
          label="Descarga"
          checked={valores.porDescarga}
          onCheck={(v) =>
            set(
              v
                ? { porDescarga: true }
                : { porDescarga: false, descargaJaulaCheck: false, descargaJaulaValor: '', descargaCamionCheck: false, descargaCamionValor: '' },
            )
          }
          subtipos={[
            {
              label: 'Jaula',
              etiquetaCampo: 'Cantidad de jaulas',
              check: valores.descargaJaulaCheck,
              onCheck: (v) => set({ descargaJaulaCheck: v, descargaJaulaValor: v ? valores.descargaJaulaValor : '' }),
              valor: valores.descargaJaulaValor,
              onValor: (v) => set({ descargaJaulaValor: v }),
            },
            {
              label: 'Camión',
              etiquetaCampo: 'Cantidad de camiones',
              check: valores.descargaCamionCheck,
              onCheck: (v) => set({ descargaCamionCheck: v, descargaCamionValor: v ? valores.descargaCamionValor : '' }),
              valor: valores.descargaCamionValor,
              onValor: (v) => set({ descargaCamionValor: v }),
            },
          ]}
        />
      )}

      {tiposCarga.includes('carga') && (
        <CargaSubtipos
          label="Carga"
          checked={valores.porCarga}
          onCheck={(v) =>
            set(
              v
                ? { porCarga: true }
                : { porCarga: false, cargaJaulaCheck: false, cargaJaulaValor: '', cargaCamionCheck: false, cargaCamionValor: '' },
            )
          }
          subtipos={[
            {
              label: 'Jaula',
              etiquetaCampo: 'Cantidad de jaulas',
              check: valores.cargaJaulaCheck,
              onCheck: (v) => set({ cargaJaulaCheck: v, cargaJaulaValor: v ? valores.cargaJaulaValor : '' }),
              valor: valores.cargaJaulaValor,
              onValor: (v) => set({ cargaJaulaValor: v }),
            },
            {
              label: 'Camión',
              etiquetaCampo: 'Cantidad de camiones',
              check: valores.cargaCamionCheck,
              onCheck: (v) => set({ cargaCamionCheck: v, cargaCamionValor: v ? valores.cargaCamionValor : '' }),
              valor: valores.cargaCamionValor,
              onValor: (v) => set({ cargaCamionValor: v }),
            },
          ]}
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
