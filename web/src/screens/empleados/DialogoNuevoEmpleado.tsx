/** DialogoNuevoEmpleado: alta + fotos, con los pasos de transferencia y reactivación. */
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/ui';
import { tomarFoto } from '../../lib/bridge';
import { api } from '../../lib/api';
import { crearEmpleado, reactivarEmpleado, type Empleado } from '../../lib/empleados';

const dataUrlABlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

export function DialogoNuevoEmpleado({
  sectorId,
  sectorName,
  enElSector,
  onCerrar,
  onCreado,
  onMensaje,
}: {
  sectorId: string;
  sectorName: string;
  enElSector: Empleado[];
  onCerrar: () => void;
  onCreado: () => void;
  onMensaje: (texto: string, esError: boolean) => void;
}) {
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [frente, setFrente] = useState<string | null>(null);
  const [dorso, setDorso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [pedirTransferencia, setPedirTransferencia] = useState(false);
  const [inactivo, setInactivo] = useState<{ id: string; nombre: string } | null>(null);

  const subirFotos = async (empId: string) => {
    if (frente) await api.subirFoto(empId, 'frente', await dataUrlABlob(frente)).catch(() => {});
    if (dorso) await api.subirFoto(empId, 'dorso', await dataUrlABlob(dorso)).catch(() => {});
  };

  const crear = async (forceTransfer: boolean) => {
    setCargando(true);
    const r = await crearEmpleado(nombre, apellido, dni, sectorId, sectorName, enElSector, forceTransfer);
    if (r.tipo === 'ok') {
      await subirFotos(r.empleado.id);
      setCargando(false);
      onMensaje(forceTransfer ? `Empleado transferido: ${r.empleado.nombre}` : `Empleado creado: ${r.empleado.nombre}`, false);
      onCreado();
      return;
    }
    setCargando(false);
    if (r.tipo === 'existe_mismo_sector') {
      onMensaje('El empleado ya existe en tu sector', true);
      onCerrar();
    } else if (r.tipo === 'existe_otro_sector') {
      setPedirTransferencia(true);
    } else if (r.tipo === 'existe_inactivo') {
      setInactivo({ id: r.id, nombre: r.nombre });
    } else {
      onMensaje(r.mensaje, true);
      onCerrar();
    }
  };

  if (pedirTransferencia) {
    const nombreCompleto = `${nombre.trim()} ${apellido.trim()}`.trim();
    return (
      <Modal
        titulo="Empleado en otro sector"
        icono={<span style={{ fontSize: 28, color: 'var(--purple80)' }}>⇄</span>}
        onCerrar={() => setPedirTransferencia(false)}
        acciones={[
          { texto: 'Cancelar', onClick: () => setPedirTransferencia(false), tipo: 'texto' },
          { texto: 'Sí, transferir', onClick: () => { setPedirTransferencia(false); crear(true); }, cargando },
        ]}
      >
        <div style={{ fontSize: 14 }}>
          {nombreCompleto} (DNI {dni}) ya está registrado en otro sector. ¿Querés transferirlo a {sectorName}?
        </div>
      </Modal>
    );
  }

  if (inactivo) {
    return (
      <Modal
        titulo="Empleado oculto"
        icono={<span style={{ fontSize: 28, color: 'var(--teal)' }}>👤</span>}
        onCerrar={() => setInactivo(null)}
        acciones={[
          { texto: 'Cancelar', onClick: () => setInactivo(null), tipo: 'texto' },
          {
            texto: 'Sí, volver a listar',
            cargando,
            onClick: async () => {
              setCargando(true);
              try {
                await reactivarEmpleado(inactivo.id);
                onMensaje(`${inactivo.nombre} vuelve a estar en la lista`, false);
                onCreado();
              } catch {
                onMensaje('No se pudo reactivar el empleado', true);
                onCerrar();
              }
              setCargando(false);
            },
          },
        ]}
      >
        <div style={{ fontSize: 14 }}>
          {inactivo.nombre} ya estaba en la lista pero fue quitado. ¿Querés volver a listarlo?
        </div>
      </Modal>
    );
  }

  const habilitado = !!dni.trim() && !!nombre.trim() && !!apellido.trim() && !cargando;

  return (
    <Modal
      titulo="Nuevo empleado"
      onCerrar={onCerrar}
      acciones={[
        { texto: 'Cancelar', onClick: onCerrar, tipo: 'texto' },
        { texto: 'Crear', onClick: () => crear(false), habilitado, cargando },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField value={dni} onChange={setDni} label="DNI *" soloNumeros error={!dni.trim()} />
        <TextField value={nombre} onChange={(v) => setNombre(v.replace(/\n/g, ''))} label="Nombre *" error={!nombre.trim()} />
        <TextField value={apellido} onChange={(v) => setApellido(v.replace(/\n/g, ''))} label="Apellido *" error={!apellido.trim()} />
        <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>Sector: {sectorName}</div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>Fotos del DNI (opcional)</div>
        {(['frente', 'dorso'] as const).map((lado) => {
          const valor = lado === 'frente' ? frente : dorso;
          const setter = lado === 'frente' ? setFrente : setDorso;
          return (
            <div key={lado} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 14, textTransform: 'capitalize' }}>{lado}</span>
              {valor && <img src={valor} alt={lado} style={{ height: 40, borderRadius: 6 }} />}
              <button
                onClick={async () => {
                  const d = await tomarFoto();
                  if (d) setter(d);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 14,
                  border: '1px solid var(--teal)',
                  background: 'transparent',
                  color: 'var(--teal)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {valor ? 'Reemplazar' : 'Sacar foto'}
              </button>
              {valor && (
                <button
                  onClick={() => setter(null)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 14,
                    border: '1px solid var(--error)',
                    background: 'transparent',
                    color: 'var(--error)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Borrar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
