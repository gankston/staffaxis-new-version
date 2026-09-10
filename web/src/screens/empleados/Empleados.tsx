/** Clon de EmpleadosScreen.kt + su ViewModel: lista, búsqueda, cambio de sector y los 3 diálogos. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmpleadoCard } from './EmpleadoCard';
import { DialogoHoras } from './DialogoHoras';
import { DialogoEditarEmpleado } from './DialogoEditarEmpleado';
import { DialogoNuevoEmpleado } from './DialogoNuevoEmpleado';
import { Modal } from '../../components/Modal';
import { Spinner, TextField } from '../../components/ui';
import { Toast } from '../../components/Toast';
import { IconoBuscar, IconoCambiarSector, IconoCheck, IconoDesplegar, IconoMas } from '../../components/iconos';
import {
  buildMinutesWorked,
  buildTipados,
  buildTiposNuevos,
  filtrarEmpleados,
  VALORES_CARGA_INICIAL,
  type ValoresCarga,
} from './logica';
import { api } from '../../lib/api';
import { getUbicacion } from '../../lib/bridge';
import { listarEmpleadosCrudos, listarRegistros, type Empleado } from '../../lib/empleados';
import { fetchSectoresPublicos, getSectoresPermitidos, guardarSectorActivo, solicitarAcceso, type Sector } from '../../lib/auth';
import { sesion } from '../../lib/session';
import { hoyISO } from '../../domain/fechaCarga';

export function Empleados({
  onCambiarSector,
  onRecargarMain,
}: {
  onCambiarSector: () => void;
  onRecargarMain: () => void;
}) {
  const sector = sesion.getSectorActivo();
  const [cargando, setCargando] = useState(true);
  const [todos, setTodos] = useState<Empleado[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [conHorasHoy, setConHorasHoy] = useState<Set<string>>(new Set());
  const [ausentesHoy, setAusentesHoy] = useState<Set<string>>(new Set());
  const [tiposCarga, setTiposCarga] = useState<string[]>(sector?.tiposCarga ?? []);
  const [sectoresPermitidos, setSectoresPermitidos] = useState<Sector[]>([]);
  const [verSectores, setVerSectores] = useState(false);
  const [sectorParaCambiar, setSectorParaCambiar] = useState<Sector | 'navegar' | null>(null);

  const [paraHoras, setParaHoras] = useState<Empleado | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [valores, setValores] = useState<ValoresCarga>(VALORES_CARGA_INICIAL);
  const [observaciones, setObservaciones] = useState('');
  const [guardandoHoras, setGuardandoHoras] = useState(false);

  const [paraEditar, setParaEditar] = useState<Empleado | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  const avisar = useCallback((texto: string, esError: boolean) => setMensaje({ texto, esError }), []);

  const activos = useMemo(() => todos.filter((e) => e.activo), [todos]);
  const filtrados = useMemo(() => filtrarEmpleados(activos, busqueda), [activos, busqueda]);

  const cargar = useCallback(async () => {
    if (!sector) return;
    setCargando(true);
    try {
      // Los tipos de carga se refrescan contra el servidor en cada carga: una
      // sesion vieja podia quedar sin los tipos nuevos para siempre.
      try {
        const publicos = await fetchSectoresPublicos();
        const actual = publicos.find((s) => s.id === sector.id);
        if (actual) {
          setTiposCarga(actual.tiposCarga);
          guardarSectorActivo(actual);
        }
      } catch {
        /* sin conexion: sigue con lo cacheado */
      }

      const lista = await listarEmpleadosCrudos(sector.id, sector.name);
      lista.sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
      setTodos(lista);

      const hoy = hoyISO();
      const [registrosHoy, ausencias] = await Promise.all([
        listarRegistros({ desde: hoy, hasta: hoy }).catch(() => []),
        api.getAusencias(hoy, hoy).catch(() => ({ absences: [] })),
      ]);
      setConHorasHoy(new Set(registrosHoy.map((r) => r.employeeId)));
      // Solo cuentan como ausentes las justificadas que cubren el dia de hoy.
      setAusentesHoy(
        new Set(
          (ausencias.absences ?? [])
            .filter((a) => a.is_justified && a.start_date.slice(0, 10) <= hoy && a.end_date.slice(0, 10) >= hoy)
            .map((a) => a.employee_id),
        ),
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Error al cargar', true);
    }
    setCargando(false);
  }, [sector, avisar]);

  useEffect(() => {
    cargar();
    getSectoresPermitidos().then(setSectoresPermitidos).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirHoras = (e: Empleado) => {
    setParaHoras(e);
    setFecha(hoyISO());
    setValores({ ...VALORES_CARGA_INICIAL, porCosecha: sector?.tipoCarga === 'cosecha' });
    setObservaciones('');
  };

  const guardarHoras = async () => {
    if (!paraHoras) return;
    setGuardandoHoras(true);
    const t = buildTiposNuevos(valores);
    const tip = buildTipados(valores);
    const ubicacion = await getUbicacion();
    try {
      await api.crearSubmission({
        employee_id: paraHoras.id,
        date: fecha,
        minutes_worked: buildMinutesWorked(valores),
        notes: observaciones.trim() || null,
        latitude: ubicacion?.latitude ?? null,
        longitude: ubicacion?.longitude ?? null,
        horas: valores.horas,
        cosecha: tip.cosecha,
        cajas: tip.cajas,
        cajones: tip.cajones,
        importe: tip.importe,
        km_viajes: t.kmViajes,
        has_fumigadas: t.hasFumigadas,
        siembra_trilla: t.siembraTrilla,
        bolseros: t.bolseros,
        etiquetado: t.etiquetado,
        carga_camion_kg50: t.cargaCamionKg50,
        carga_camion_kg25: t.cargaCamionKg25,
        carga_camion_otro: t.cargaCamionOtro,
        movimiento_estiba_kg50: t.movimientoEstibaKg50,
        movimiento_estiba_kg25: t.movimientoEstibaKg25,
        movimiento_estiba_otro: t.movimientoEstibaOtro,
      });
      setConHorasHoy((s) => (fecha === hoyISO() ? new Set([...s, paraHoras.id]) : s));
      setParaHoras(null);
      avisar('Horas guardadas correctamente', false);
    } catch (e) {
      setParaHoras(null);
      avisar(e instanceof Error ? e.message : 'Error', true);
    }
    setGuardandoHoras(false);
  };

  const cambiarASector = async (s: Sector) => {
    setCargando(true);
    try {
      // requestAccess (no el registro viejo): actualiza el sector del token en el servidor.
      await solicitarAcceso(s, sesion.getFullName() ?? sector?.encargado ?? sector?.name ?? '');
      guardarSectorActivo(s);
      onRecargarMain();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Error al cambiar de sector', true);
      setCargando(false);
    }
  };

  if (!sector) return null;

  return (
    <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
      <div style={{ padding: '16px 16px 120px' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => sectoresPermitidos.length > 1 && setVerSectores((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'white',
              fontSize: 28,
              fontWeight: 700,
              cursor: sectoresPermitidos.length > 1 ? 'pointer' : 'default',
            }}
          >
            {sector.name || 'Empleados'}
            {sectoresPermitidos.length > 1 && (
              <span style={{ color: 'var(--teal)', display: 'flex' }}>
                <IconoDesplegar size={28} />
              </span>
            )}
          </button>

          {verSectores && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: 'var(--card-background)',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 20,
                minWidth: 240,
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {sectoresPermitidos.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setVerSectores(false);
                    setSectorParaCambiar(s);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 16px',
                    background: 'transparent',
                    border: 'none',
                    color: s.id === sector.id ? 'var(--teal)' : 'white',
                    fontSize: 15,
                  }}
                >
                  {s.id === sector.id && <IconoCheck size={14} />}
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 8 }} />
        <TextField
          value={busqueda}
          onChange={setBusqueda}
          label="Buscar empleado"
          fondoEtiqueta="var(--dark-background)"
          iconoIzq={<span style={{ color: 'var(--texto-tenue)', display: 'flex' }}><IconoBuscar size={20} /></span>}
        />
        <div style={{ height: 8 }} />
        <div style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>{filtrados.length} empleados</div>
        <div style={{ height: 4 }} />

        {cargando && todos.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner />
          </div>
        ) : (
          filtrados.map((e) => (
            <EmpleadoCard
              key={e.id}
              empleado={e}
              tieneHorasHoy={conHorasHoy.has(e.id)}
              estaAusenteHoy={ausentesHoy.has(e.id)}
              onRelojClick={() => abrirHoras(e)}
              onEditarClick={() => setParaEditar(e)}
            />
          ))
        )}
      </div>

      <button
        onClick={() => setNuevoAbierto(true)}
        title="Agregar empleado"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 96,
          width: 56,
          height: 56,
          borderRadius: 16,
          border: 'none',
          background: 'var(--purple80)',
          color: 'white',
          fontSize: 28,
          lineHeight: 1,
          boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconoMas size={28} />
      </button>

      {sectorParaCambiar && (
        <Modal
          titulo="¿Cambiar de sector?"
          icono={<span style={{ color: 'var(--teal)', display: 'flex', justifyContent: 'center' }}><IconoCambiarSector size={28} /></span>}
          onCerrar={() => setSectorParaCambiar(null)}
          acciones={[
            { texto: 'Cancelar', onClick: () => setSectorParaCambiar(null), tipo: 'texto' },
            {
              texto: 'Cambiar',
              onClick: () => {
                const s = sectorParaCambiar;
                setSectorParaCambiar(null);
                if (s === 'navegar') onCambiarSector();
                else cambiarASector(s);
              },
            },
          ]}
        >
          <div style={{ fontSize: 14 }}>
            {sectorParaCambiar === 'navegar'
              ? 'Vas a ir al selector de sectores. Los datos locales no se borran.'
              : `Vas a pasar al sector ${sectorParaCambiar.name}. La app va a recargar los datos.`}
          </div>
        </Modal>
      )}

      {paraHoras && (
        <DialogoHoras
          empleado={paraHoras}
          fecha={fecha}
          onFecha={setFecha}
          valores={valores}
          set={(p) => setValores((v) => ({ ...v, ...p }))}
          observaciones={observaciones}
          onObservaciones={setObservaciones}
          tiposCarga={tiposCarga}
          sectorId={sector.id}
          guardando={guardandoHoras}
          onCerrar={() => setParaHoras(null)}
          onGuardar={guardarHoras}
        />
      )}

      {paraEditar && (
        <DialogoEditarEmpleado
          empleado={paraEditar}
          tiposCarga={tiposCarga}
          sectorId={sector.id}
          onCerrar={() => setParaEditar(null)}
          onGuardado={() => {
            setParaEditar(null);
            cargar();
          }}
          onMensaje={avisar}
        />
      )}

      {nuevoAbierto && (
        <DialogoNuevoEmpleado
          sectorId={sector.id}
          sectorName={sector.name}
          enElSector={todos}
          onCerrar={() => setNuevoAbierto(false)}
          onCreado={() => {
            setNuevoAbierto(false);
            cargar();
          }}
          onMensaje={avisar}
        />
      )}

      {mensaje && <Toast texto={mensaje.texto} esError={mensaje.esError} onCerrar={() => setMensaje(null)} />}
    </div>
  );
}
