/**
 * Arma la fila de `submissions` a partir del mismo cuerpo que manda la app en
 * POST /api/submissions. Lo usa la Tarja Fuera de Término: el encargado carga
 * con el formulario de siempre, se guarda el cuerpo tal cual y, cuando RRHH
 * autoriza, se convierte en tarja con esto.
 *
 * Es la misma cuenta que hace POST /api/submissions (separador decimal, columnas
 * tipadas completadas desde el texto, cosecha = suma de los subtipos). Ese POST
 * no se toco para no arriesgar la carga de todos los dias.
 */
import { normalizarSeparadorDecimal, completarTipados } from './tarjaValores.js';

const COLUMNAS_DIRECTAS = [
  'km_viajes', 'has_fumigadas', 'siembra_trilla', 'bolseros', 'etiquetado',
  'carga_camion_kg50', 'carga_camion_kg25', 'carga_camion_otro',
  'movimiento_estiba_kg50', 'movimiento_estiba_kg25', 'movimiento_estiba_otro',
  'etiquetado_lata_185', 'etiquetado_lata_750', 'etiquetado_lata_2500', 'etiquetado_lata_8kg',
  'descarga_jaula', 'descarga_camion', 'carga_jaula', 'carga_camion_cantidad',
  'cosecha_canadas', 'cosecha_inv', 'cosecha_bananas', 'tantero_invernadero', 'tantero_campo',
  'carga_camion_bolsas_50', 'carga_camion_bolsas_25', 'carga_camion_bolsas_otro',
  'movimiento_estiba_bolsas_50', 'movimiento_estiba_bolsas_25', 'movimiento_estiba_bolsas_otro',
  'bolsas_25', 'bolsas_50', 'cambio_bolsa',
];

/** Lo que se acepta del cuerpo (y nada mas) para guardarlo en el pedido. */
export function limpiarCuerpo(body = {}) {
  const out = {};
  for (const k of ['minutes_worked', 'notes', 'latitude', 'longitude', 'horas', 'cosecha', 'cajas', 'cajones', 'abonada', 'importe', ...COLUMNAS_DIRECTAS]) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

/** Columnas y valores para el INSERT en submissions. */
export function filaDeTarja(cuerpo) {
  const mw = normalizarSeparadorDecimal(cuerpo.minutes_worked ?? null);
  const tipados = completarTipados(mw, {
    horas: cuerpo.horas, cosecha: cuerpo.cosecha, cajas: cuerpo.cajas, cajones: cuerpo.cajones,
    abonada: cuerpo.abonada ?? cuerpo.importe,
  });
  const subtipos = [cuerpo.cosecha_canadas, cuerpo.cosecha_inv, cuerpo.cosecha_bananas].filter((v) => v !== undefined && v !== null);
  if (subtipos.length) tipados.cosecha = subtipos.reduce((a, b) => Number(a) + Number(b), 0);

  const cols = ['minutes_worked', 'notes', 'latitude', 'longitude', 'horas', 'cosecha', 'cajas', 'cajones', 'importe', ...COLUMNAS_DIRECTAS];
  const vals = [
    mw, cuerpo.notes ?? null, cuerpo.latitude ?? null, cuerpo.longitude ?? null,
    tipados.horas, tipados.cosecha, tipados.cajas, tipados.cajones, tipados.abonada,
    ...COLUMNAS_DIRECTAS.map((c) => cuerpo[c] ?? null),
  ];
  return { cols, vals };
}
