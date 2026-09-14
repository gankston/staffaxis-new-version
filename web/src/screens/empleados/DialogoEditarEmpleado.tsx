/** EditarEmpleadoDialog: datos, fotos de DNI, historial de horas y edición de un registro. */
import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Spinner, TextField } from '../../components/ui';
import { FormularioCarga } from './FormularioCarga';
import {
  buildMinutesWorked,
  buildTipados,
  buildTiposNuevos,
  formatMinutesWorkedDisplay,
  formatTiposNuevosRegistro,
  puedeGuardar,
  valoresDesdeRegistro,
  type ValoresCarga,
} from './logica';
import { api } from '../../lib/api';
import { elegirDeGaleria, tomarFoto } from '../../lib/bridge';
import {
  IconoBorrar,
  IconoCamara,
  IconoEditar,
  IconoGaleria,
  IconoGuardar,
  IconoOcultar,
  IconoVer,
} from '../../components/iconos';
import {
  actualizarEmpleado,
  listarRegistros,
  ocultarEmpleado,
  type Empleado,
  type Registro,
} from '../../lib/empleados';

const dataUrlABlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function FilaFoto({
  lado,
  tieneFoto,
  cargando,
  onSubir,
  onEliminar,
  onVer,
}: {
  lado: 'frente' | 'dorso';
  tieneFoto: boolean;
  cargando: boolean;
  onSubir: (blob: Blob) => void;
  onEliminar: () => void;
  onVer: () => void;
}) {
  const usar = async (obtener: () => Promise<string | null>) => {
    const dataUrl = await obtener();
    if (dataUrl) onSubir(await dataUrlABlob(dataUrl));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: tieneFoto ? '#4caf50' : 'var(--texto-apagado)',
          flexShrink: 0,
        }}
      />
      <span style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>{lado}</span>
      <span style={{ flex: 1, fontSize: 14, color: 'var(--texto-tenue)' }}>
        {tieneFoto ? 'Cargada' : 'Sin foto'}
      </span>

      {cargando ? (
        <Spinner size={18} grosor={2} />
      ) : (
        <>
          <button onClick={() => usar(tomarFoto)} title="Sacar foto" style={botonIcono('var(--purple80)')}>
            <IconoCamara size={22} />
          </button>
          <button onClick={() => usar(elegirDeGaleria)} title="Elegir de la galería" style={botonIcono('var(--teal)')}>
            <IconoGaleria size={22} />
          </button>
          {tieneFoto && (
            <>
              <button onClick={onVer} title="Ver" style={botonIcono('var(--teal)')}>
                <IconoVer size={20} />
              </button>
              <button onClick={onEliminar} title="Borrar" style={botonIcono('var(--error)')}>
                <IconoBorrar size={20} />
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

const botonIcono = (color: string) => ({
  background: 'none',
  border: 'none',
  padding: 4,
  display: 'flex',
  color,
  cursor: 'pointer' as const,
});


export function DialogoEditarEmpleado({
  empleado,
  tiposCarga,
  sectorId,
  onCerrar,
  onGuardado,
  onMensaje,
}: {
  empleado: Empleado;
  tiposCarga: string[];
  sectorId: string;
  onCerrar: () => void;
  onGuardado: (accion: 'editado' | 'oculto') => void;
  onMensaje: (texto: string, esError: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState(empleado.apellido);
  const [dni, setDni] = useState(empleado.dni ?? '');
  const [observacion, setObservacion] = useState(empleado.observacion ?? '');
  const [fotos, setFotos] = useState({ frente: empleado.tieneFotoFrente, dorso: empleado.tieneFotoDorso });
  const [cargandoFoto, setCargandoFoto] = useState<'frente' | 'dorso' | null>(null);
  const [verFoto, setVerFoto] = useState<string | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [expandido, setExpandido] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // En edicion: registroEnEdicion + sus valores.
  const [editando, setEditando] = useState<Registro | null>(null);
  const [valores, setValores] = useState<ValoresCarga | null>(null);

  useEffect(() => {
    // Mismo desarmado que abrirDialogoEditar(): nombre = nombre completo menos el apellido.
    const ap = empleado.apellido.trim();
    const nom = empleado.nombre.trim();
    setNombre(ap && nom.endsWith(ap) ? nom.slice(0, nom.length - ap.length).trim() : nom);
  }, [empleado]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await listarRegistros({ empleadoId: empleado.id });
        if (vivo) setRegistros(r.sort((a, b) => b.date.localeCompare(a.date)));
      } catch {
        /* sin conexion: la lista queda vacia, igual que si no hubiera registros */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [empleado.id]);

  const guardar = async () => {
    setGuardando(true);
    const r = await actualizarEmpleado(empleado.id, nombre, apellido, dni || null);
    setGuardando(false);
    if (r.tipo === 'ok') {
      onMensaje('Empleado actualizado', false);
      onGuardado('editado');
    } else if (r.tipo === 'existe_mismo_sector') {
      onMensaje('Ya hay otro empleado con ese DNI en este sector', true);
    } else if (r.tipo === 'existe_otro_sector') {
      onMensaje('Ese DNI ya pertenece a un empleado activo en otro sector', true);
    } else {
      onMensaje(r.mensaje, true);
    }
  };

  const subirFoto = async (lado: 'frente' | 'dorso', blob: Blob) => {
    setCargandoFoto(lado);
    try {
      await api.subirFoto(empleado.id, lado, blob);
      setFotos((f) => ({ ...f, [lado]: true }));
      onMensaje('Foto guardada', false);
    } catch {
      onMensaje('Error al subir la foto', true);
    }
    setCargandoFoto(null);
  };

  const eliminarFoto = async (lado: 'frente' | 'dorso') => {
    setCargandoFoto(lado);
    try {
      await api.borrarFoto(empleado.id, lado);
      setFotos((f) => ({ ...f, [lado]: false }));
      onMensaje('Foto eliminada', false);
    } catch {
      onMensaje('Error al eliminar la foto', true);
    }
    setCargandoFoto(null);
  };

  const abrirVerFoto = async (lado: 'frente' | 'dorso') => {
    try {
      const blob = await api.getFoto(empleado.id, lado);
      setVerFoto(URL.createObjectURL(blob));
    } catch {
      onMensaje('Error al cargar la foto', true);
    }
  };

  const guardarRegistro = async () => {
    if (!editando || !valores) return;
    const t = buildTiposNuevos(valores);
    const tip = buildTipados(valores);
    try {
      await api.crearSubmission({
        employee_id: editando.employeeId,
        date: editando.date,
        minutes_worked: buildMinutesWorked(valores),
        notes: editando.notes,
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
      setRegistros((await listarRegistros({ empleadoId: empleado.id })).sort((a, b) => b.date.localeCompare(a.date)));
      setEditando(null);
      setValores(null);
      onMensaje('Registro actualizado', false);
    } catch (e) {
      onMensaje(e instanceof Error ? e.message : 'Error', true);
    }
  };

  if (verFoto) {
    return (
      <Modal titulo="Foto del DNI" onCerrar={() => setVerFoto(null)} acciones={[{ texto: 'Cerrar', onClick: () => setVerFoto(null), tipo: 'texto' }]}>
        <img src={verFoto} alt="DNI" style={{ width: '100%', borderRadius: 12, background: '#000' }} />
      </Modal>
    );
  }

  if (editando && valores) {
    return (
      <Modal
        titulo={`Editar ${fmtFecha(editando.date)}`}
        onCerrar={() => { setEditando(null); setValores(null); }}
        acciones={[
          { texto: 'Cancelar', onClick: () => { setEditando(null); setValores(null); }, tipo: 'texto' },
          { texto: 'Guardar', onClick: guardarRegistro, habilitado: puedeGuardar(valores), icono: <IconoGuardar size={20} /> },
        ]}
      >
        <FormularioCarga
          valores={valores}
          set={(p) => setValores((v) => (v ? { ...v, ...p } : v))}
          tiposCarga={tiposCarga}
          sectorId={sectorId}
        />
      </Modal>
    );
  }

  if (confirmarQuitar) {
    return (
      <Modal
        titulo="¿Quitar de la lista?"
        onCerrar={() => setConfirmarQuitar(false)}
        acciones={[
          { texto: 'Cancelar', onClick: () => setConfirmarQuitar(false), tipo: 'texto' },
          {
            texto: 'Quitar',
            peligro: true,
            onClick: async () => {
              await ocultarEmpleado(empleado.id);
              onMensaje('Empleado eliminado de la lista', false);
              onGuardado('oculto');
            },
          },
        ]}
      >
        <div style={{ fontSize: 14, color: '#b0b0b0' }}>
          {empleado.nombre} deja de aparecer en la lista del sector. No se borra su historial.
        </div>
      </Modal>
    );
  }

  const visibles = expandido ? registros : registros.slice(0, 5);
  const hayMas = registros.length > 5;

  return (
    <Modal
      titulo="Editar Empleado"
      onCerrar={onCerrar}
      acciones={[
        { texto: 'Cancelar', onClick: onCerrar, tipo: 'texto' },
        {
          texto: 'Guardar',
          onClick: guardar,
          habilitado: !!nombre.trim() && !!apellido.trim(),
          cargando: guardando,
          icono: <IconoGuardar size={20} />,
        },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField value={nombre} onChange={setNombre} label="Nombre" />
        <TextField value={apellido} onChange={setApellido} label="Apellido" />
        <TextField value={dni} onChange={setDni} label="DNI" soloNumeros />
        <TextField value={observacion} onChange={setObservacion} label="Observación" multilinea />

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>Fotos del DNI</div>
        <FilaFoto
          lado="frente"
          tieneFoto={fotos.frente}
          cargando={cargandoFoto === 'frente'}
          onSubir={(b) => subirFoto('frente', b)}
          onEliminar={() => eliminarFoto('frente')}
          onVer={() => abrirVerFoto('frente')}
        />
        <FilaFoto
          lado="dorso"
          tieneFoto={fotos.dorso}
          cargando={cargandoFoto === 'dorso'}
          onSubir={(b) => subirFoto('dorso', b)}
          onEliminar={() => eliminarFoto('dorso')}
          onVer={() => abrirVerFoto('dorso')}
        />

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>Horas cargadas</div>

        {registros.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>No hay horas registradas</div>
        ) : (
          <>
            {visibles.map((r) => {
              const display = [formatMinutesWorkedDisplay(r.minutesWorked), formatTiposNuevosRegistro(r.tiposNuevos)]
                .filter((s) => s && s !== '?')
                .join(' + ');
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', padding: '2px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{fmtFecha(r.date)}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#4caf50' }}>{display}</div>
                  </div>
                  <button
                    onClick={() => {
                      setEditando(r);
                      setValores(valoresDesdeRegistro(r.minutesWorked, r.tiposNuevos));
                    }}
                    title="Editar registro"
                    style={{ background: 'none', border: 'none', color: 'var(--purple80)', padding: 8, display: 'flex' }}
                  >
                    <IconoEditar size={20} />
                  </button>
                </div>
              );
            })}
            {hayMas && (
              <button
                onClick={() => setExpandido((v) => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--purple80)', padding: 8, width: '100%' }}
              >
                {expandido ? 'Ver menos' : `Ver todas (${registros.length - 5} más)`}
              </button>
            )}
          </>
        )}

        <button
          onClick={() => setConfirmarQuitar(true)}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 20,
            border: 'none',
            background: 'var(--error)',
            color: 'white',
            fontWeight: 600,
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <IconoOcultar size={20} />
          Quitar de la lista
        </button>
      </div>
    </Modal>
  );
}
