/**
 * Movimiento de empleados: buscar una persona por DNI en TODOS los sectores y
 * traerla al propio.
 *
 * Es el caso del tipo que se presenta a trabajar y ya figura en otro lado. Sin
 * esta pantalla el encargado no tenia forma de saberlo y lo daba de alta de
 * nuevo, que es de donde salen las fichas duplicadas.
 *
 * El traslado va contra la ficha que se ve en pantalla, por id: asi no se puede
 * terminar creando una ficha nueva por error.
 */
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Spinner, TextField } from '../../components/ui';
import { IconoAlerta, IconoBuscar, IconoCambiarSector, IconoCheckCirculo } from '../../components/iconos';
import { api, type EmpleadoEncontradoDto } from '../../lib/api';

type Paso = 'buscar' | 'buscando' | 'resultado' | 'confirmar' | 'moviendo';

export function DialogoMovimiento({
  sectorName,
  onCerrar,
  onMovido,
  onMensaje,
}: {
  sectorName: string;
  onCerrar: () => void;
  onMovido: () => void;
  onMensaje: (texto: string, esError: boolean) => void;
}) {
  const [paso, setPaso] = useState<Paso>('buscar');
  const [dni, setDni] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [encontrados, setEncontrados] = useState<EmpleadoEncontradoDto[]>([]);
  const [elegido, setElegido] = useState<EmpleadoEncontradoDto | null>(null);

  const buscar = async () => {
    const limpio = dni.replace(/[^0-9]/g, '');
    if (limpio.length < 7) {
      setError('El DNI tiene que tener al menos 7 dígitos');
      return;
    }
    setError(null);
    setPaso('buscando');
    try {
      const r = await api.buscarPorDni(limpio);
      setEncontrados(r.rows ?? []);
      setPaso('resultado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar');
      setPaso('buscar');
    }
  };

  const mover = async () => {
    if (!elegido) return;
    setPaso('moviendo');
    try {
      await api.moverEmpleado(elegido.id);
      onMensaje(`${elegido.last_name} ${elegido.first_name} ahora está en ${sectorName}`, false);
      onMovido();
      onCerrar();
    } catch (e) {
      onMensaje(e instanceof Error ? e.message : 'No se pudo mover el empleado', true);
      setPaso('resultado');
    }
  };

  // ── Esperas ────────────────────────────────────────────────────────────────
  if (paso === 'buscando' || paso === 'moviendo') {
    return (
      <Modal titulo="Movimiento de empleados" onCerrar={onCerrar} acciones={[]}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0' }}>
          <Spinner />
          <div style={{ color: 'var(--texto-tenue)', fontSize: 14 }}>
            {paso === 'buscando' ? 'Buscando el DNI...' : 'Trayendo al empleado...'}
          </div>
        </div>
      </Modal>
    );
  }

  // ── Confirmacion ───────────────────────────────────────────────────────────
  if (paso === 'confirmar' && elegido) {
    return (
      <Modal
        titulo="¿Traer a este empleado?"
        onCerrar={() => setPaso('resultado')}
        acciones={[
          { texto: 'Cancelar', onClick: () => setPaso('resultado'), tipo: 'texto' },
          { texto: 'Sí, traerlo', onClick: mover, icono: <IconoCambiarSector size={20} /> },
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>
            {elegido.last_name} {elegido.first_name}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              padding: '14px 12px',
              fontSize: 14,
            }}
          >
            <span style={{ color: 'var(--texto-tenue)' }}>{elegido.sector_name ?? 'sin sector'}</span>
            <span style={{ color: 'var(--teal)', display: 'flex' }}>
              <IconoCambiarSector size={22} />
            </span>
            <strong style={{ color: 'var(--teal)' }}>{sectorName}</strong>
          </div>
          <div style={{ fontSize: 13, color: 'var(--texto-tenue)', lineHeight: 1.5 }}>
            Deja de figurar en {elegido.sector_name ?? 'su sector'} y pasa a la lista de {sectorName}. Las horas que
            ya tenga cargadas no se tocan: quedan donde están.
            {!elegido.is_active && ' Además vuelve a estar activo.'}
          </div>
        </div>
      </Modal>
    );
  }

  // ── Resultado de la busqueda ───────────────────────────────────────────────
  if (paso === 'resultado') {
    return (
      <Modal
        titulo="Movimiento de empleados"
        onCerrar={onCerrar}
        acciones={[
          { texto: 'Buscar otro', onClick: () => setPaso('buscar'), tipo: 'texto' },
          { texto: 'Cerrar', onClick: onCerrar, tipo: 'texto' },
        ]}
      >
        {encontrados.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              textAlign: 'center',
              padding: '12px 0',
            }}
          >
            <span style={{ color: 'var(--texto-apagado)', display: 'flex' }}>
              <IconoBuscar size={30} />
            </span>
            <div style={{ fontWeight: 700, fontSize: 15 }}>No existe ningún empleado con ese DNI</div>
            <div style={{ fontSize: 13, color: 'var(--texto-tenue)', lineHeight: 1.45 }}>
              No está en ningún sector. Si va a trabajar con vos, hay que darlo de alta con el botón +.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {encontrados.map((e) => (
              <div
                key={e.id}
                style={{
                  border: `1px solid ${e.es_de_mi_sector ? '#4caf50' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16, color: 'white' }}>
                  {e.last_name} {e.first_name}
                </div>
                <div style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>DNI: {e.dni}</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--texto-tenue)' }}>Está en:</span>
                  <strong style={{ color: e.es_de_mi_sector ? '#66bb6a' : 'var(--teal)' }}>
                    {e.sector_name ?? 'sin sector'}
                  </strong>
                  {!e.is_active && (
                    <span style={{ color: 'var(--warning)', fontSize: 12 }}>· dado de baja</span>
                  )}
                </div>

                {e.es_de_mi_sector && e.is_active ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#66bb6a', fontSize: 13 }}>
                    <IconoCheckCirculo size={18} />
                    Ya está en tu sector, no hay nada que mover.
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setElegido(e);
                      setPaso('confirmar');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: 12,
                      marginTop: 2,
                      borderRadius: 12,
                      border: 'none',
                      background: 'linear-gradient(90deg, #9c27b0, #26c6da)',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    <IconoCambiarSector size={20} />
                    Traer a {sectorName}
                  </button>
                )}
              </div>
            ))}
            {encontrados.length > 1 && (
              <div style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.45 }}>
                Hay más de una ficha con este DNI. Traé la que corresponda y avisá para unificarlas.
              </div>
            )}
          </div>
        )}
      </Modal>
    );
  }

  // ── Buscador ───────────────────────────────────────────────────────────────
  return (
    <Modal
      titulo="Movimiento de empleados"
      onCerrar={onCerrar}
      acciones={[
        { texto: 'Cancelar', onClick: onCerrar, tipo: 'texto' },
        { texto: 'Buscar', onClick: buscar, habilitado: dni.replace(/[^0-9]/g, '').length >= 7, icono: <IconoBuscar size={20} /> },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--texto-tenue)', lineHeight: 1.5 }}>
          Poné el DNI del empleado. Se busca en <strong style={{ color: 'white' }}>todos los sectores</strong>, no
          solo en {sectorName}, así podés traerlo sin darlo de alta de nuevo.
        </div>

        <TextField
          value={dni}
          onChange={(v) => {
            setDni(v);
            if (error) setError(null);
          }}
          label="DNI"
          soloNumeros
          error={!!error}
        />

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,82,82,0.12)',
              border: '1px solid var(--error)',
              borderRadius: 12,
              padding: '12px 14px',
              color: 'var(--error)',
              fontSize: 13,
            }}
          >
            <IconoAlerta size={20} />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
