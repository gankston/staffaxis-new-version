/**
 * Alta de empleado. Ya no se carga a mano: se escanea el codigo de barras del
 * FRENTE del DNI (al lado de la firma) y de ahi salen el numero, el apellido y
 * el nombre. El dorso NO tiene codigo: tiene la huella y el domicilio. Se lee de
 * una foto sacada con la camara (el PDF417 es denso y necesita foco y
 * resolucion: una foto entera lo lee mejor que un video en vivo).
 */
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Spinner, TextField } from '../../components/ui';
import { IlustracionDni } from './IlustracionDni';
import { elegirDeGaleria, tomarFoto } from '../../lib/bridge';
import {
  IconoAlerta,
  IconoBorrar,
  IconoCamara,
  IconoCambiarSector,
  IconoGaleria,
  IconoGuardar,
  IconoLista,
  IconoPersonaMas,
} from '../../components/iconos';
import { leerPdf417, parsearDni, type DatosDni } from '../../domain/dniBarcode';
import { leerTextoDeFoto, parsearConstancia } from '../../domain/constanciaOcr';
import { api } from '../../lib/api';
import { crearEmpleado, reactivarEmpleado, type Empleado } from '../../lib/empleados';

const dataUrlABlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

type Paso = 'instrucciones' | 'leyendo' | 'leyendoConstancia' | 'datos';

/** De donde salieron los datos. Define si se pueden editar o no. */
type Origen = 'escaneo' | 'constancia' | 'manual';

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
  const [paso, setPaso] = useState<Paso>('instrucciones');
  const [errorLectura, setErrorLectura] = useState<string | null>(null);

  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [leido, setLeido] = useState<DatosDni | null>(null);
  const [origen, setOrigen] = useState<Origen>('manual');
  const [idTramite, setIdTramite] = useState<string | null>(null);

  const [frente, setFrente] = useState<string | null>(null);
  const [dorso, setDorso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [pedirTransferencia, setPedirTransferencia] = useState(false);
  const [inactivo, setInactivo] = useState<{ id: string; nombre: string } | null>(null);
  const [errorDni, setErrorDni] = useState<string | null>(null);

  /** Saca (o elige) la foto del frente, la decodifica y completa los datos. */
  const escanear = async (obtener: () => Promise<string | null>) => {
    setErrorLectura(null);
    const foto = await obtener();
    if (!foto) return;

    setPaso('leyendo');
    const crudo = await leerPdf417(foto);
    const datos = crudo ? parsearDni(crudo) : null;

    if (!datos) {
      setPaso('instrucciones');
      setErrorLectura(
        crudo
          ? 'Se leyó el código pero no tiene el formato del DNI. Probá con otro ejemplar.'
          : 'No se pudo leer el código. Asegurate de enfocar el FRENTE del DNI, con buena luz y que el código entre completo.',
      );
      return;
    }

    // La foto del frente ya la sacamos: se aprovecha para la ficha.
    setFrente(foto);
    setLeido(datos);
    setOrigen('escaneo');
    setDni(datos.dni);
    setApellido(datos.apellido);
    setNombre(datos.nombre);
    setPaso('datos');
  };

  /**
   * Alta con la constancia de tramite: el que tiene el DNI en tramite no tiene
   * tarjeta para escanear. La hoja no trae ningun codigo con los datos (el de
   * barras es el numero de boleta y el QR un link de seguimiento), asi que el
   * apellido, el nombre y el DNI salen del texto impreso — y por eso quedan
   * editables, al reves que los del codigo.
   */
  const leerConstancia = async (obtener: () => Promise<string | null>) => {
    setErrorLectura(null);
    const foto = await obtener();
    if (!foto) return;

    setPaso('leyendoConstancia');
    const texto = await leerTextoDeFoto(foto);
    const datos = texto ? parsearConstancia(texto) : null;

    if (!datos) {
      setPaso('instrucciones');
      setErrorLectura(
        'No se pudo leer la constancia. Sacá la foto de frente, con la hoja plana y que entre entera.',
      );
      return;
    }

    setFrente(foto);
    setLeido(null);
    setOrigen('constancia');
    setIdTramite(datos.idTramite);
    setDni(datos.dni);
    setApellido(datos.apellido);
    setNombre(datos.nombre);
    setPaso('datos');
  };

  const subirFotos = async (empId: string) => {
    if (frente) await api.subirFoto(empId, 'frente', await dataUrlABlob(frente)).catch(() => {});
    if (dorso) await api.subirFoto(empId, 'dorso', await dataUrlABlob(dorso)).catch(() => {});
  };

  const crear = async (forceTransfer: boolean) => {
    setCargando(true);
    setErrorDni(null);
    const r = await crearEmpleado(nombre, apellido, dni, sectorId, sectorName, enElSector, forceTransfer);
    if (r.tipo === 'ok') {
      await subirFotos(r.empleado.id);
      setCargando(false);
      onMensaje(
        forceTransfer ? `Empleado transferido: ${r.empleado.nombre}` : `Empleado creado: ${r.empleado.nombre}`,
        false,
      );
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
      setErrorDni(r.mensaje);
    }
  };

  // ── Confirmaciones que ya existian ────────────────────────────────────────

  if (pedirTransferencia) {
    const nombreCompleto = `${nombre.trim()} ${apellido.trim()}`.trim();
    return (
      <Modal
        titulo="Empleado en otro sector"
        icono={
          <span style={{ color: 'var(--purple80)', display: 'flex', justifyContent: 'center' }}>
            <IconoCambiarSector size={28} />
          </span>
        }
        onCerrar={() => setPedirTransferencia(false)}
        acciones={[
          { texto: 'Cancelar', onClick: () => setPedirTransferencia(false), tipo: 'texto' },
          {
            texto: 'Sí, transferir',
            onClick: () => {
              setPedirTransferencia(false);
              crear(true);
            },
            cargando,
          },
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
        icono={
          <span style={{ color: 'var(--teal)', display: 'flex', justifyContent: 'center' }}>
            <IconoPersonaMas size={28} />
          </span>
        }
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

  // ── Paso 2: decodificando ─────────────────────────────────────────────────

  if (paso === 'leyendoConstancia') {
    return (
      <Modal titulo="Leyendo la constancia" onCerrar={onCerrar} acciones={[]}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
          <Spinner />
          <div style={{ color: 'var(--texto-tenue)', fontSize: 14, textAlign: 'center' }}>
            Buscando el nombre y el DNI en la hoja...
            <div style={{ fontSize: 12, marginTop: 6 }}>La primera vez puede tardar un poco más.</div>
          </div>
        </div>
      </Modal>
    );
  }

  if (paso === 'leyendo') {
    return (
      <Modal titulo="Leyendo el código">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0' }}>
          <Spinner />
          <div style={{ color: 'var(--texto-tenue)', fontSize: 14 }}>Buscando el código en la foto...</div>
        </div>
      </Modal>
    );
  }

  // ── Paso 1: instrucciones + escanear ──────────────────────────────────────

  if (paso === 'instrucciones') {
    return (
      <Modal titulo="Nuevo empleado" onCerrar={onCerrar} acciones={[{ texto: 'Cancelar', onClick: onCerrar, tipo: 'texto' }]}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white', textAlign: 'center' }}>
            Escaneá el código del DNI
          </div>

          <IlustracionDni />

          <div style={{ fontSize: 14, color: '#b0b0b0', textAlign: 'center', lineHeight: 1.5 }}>
            Es el código cuadrado que está <strong style={{ color: 'white' }}>en el frente</strong> del DNI, al lado
            de la firma. El dorso no tiene código: tiene la huella y el domicilio.
          </div>

          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: 'var(--texto-tenue)',
              lineHeight: 1.7,
              alignSelf: 'stretch',
            }}
          >
            <li>Apoyá el DNI sobre una superficie plana, del lado de la foto.</li>
            <li>Que el código entre completo y derecho en la foto.</li>
            <li>Buena luz y sin reflejos ni sombras encima.</li>
          </ul>

          {errorLectura && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                textAlign: 'center',
                background: 'rgba(255,82,82,0.12)',
                border: '1px solid var(--error)',
                borderRadius: 12,
                padding: 14,
                alignSelf: 'stretch',
              }}
            >
              <div style={{ color: 'var(--error)', display: 'flex' }}>
                <IconoAlerta size={26} />
              </div>
              <div style={{ color: 'var(--error)', fontWeight: 700, fontSize: 14 }}>No se pudo leer</div>
              <div style={{ color: 'var(--error)', fontSize: 13 }}>{errorLectura}</div>
            </div>
          )}

          <button
            onClick={() => escanear(tomarFoto)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              height: 56,
              border: 'none',
              borderRadius: 16,
              background: 'linear-gradient(90deg, #9c27b0, #26c6da)',
              color: 'white',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            <IconoCamara size={24} />
            Escanear código
          </button>

          <button
            onClick={() => escanear(elegirDeGaleria)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: 12,
              borderRadius: 12,
              border: '1px solid var(--teal)',
              background: 'transparent',
              color: 'var(--teal)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <IconoGaleria size={20} />
            Usar una foto de la galería
          </button>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '4px 0', alignSelf: 'stretch' }} />

          {/* Para el que todavia no tiene la tarjeta: se le saca la foto a la
              constancia del RENAPER y de ahi salen el nombre y el DNI. */}
          <button
            onClick={() => leerConstancia(tomarFoto)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: 14,
              borderRadius: 12,
              border: '1px solid var(--warning)',
              background: 'rgba(255,152,0,0.10)',
              color: 'var(--warning)',
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1.3,
            }}
          >
            <IconoLista size={20} />
            Alta con constancia de DNI en trámite
          </button>

          <button
            onClick={() => leerConstancia(elegirDeGaleria)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: 10,
              borderRadius: 12,
              border: 'none',
              background: 'none',
              color: 'var(--warning)',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <IconoGaleria size={18} />
            Usar una foto de la galería
          </button>

          {/* Salida de emergencia: si un DNI no se deja leer, el alta no puede
              quedar bloqueada en el campo. Va discreta y a proposito. */}
          <button
            onClick={() => {
              setLeido(null);
              setOrigen('manual');
              setPaso('datos');
            }}
            style={{ background: 'none', border: 'none', color: 'var(--texto-apagado)', fontSize: 13, marginTop: 4 }}
          >
            El código no se lee — cargar a mano
          </button>
        </div>
      </Modal>
    );
  }

  // ── Paso 3: datos leidos, confirmar y crear ───────────────────────────────

  // Lo que sale del codigo del DNI no se toca: es el dato del documento y
  // viene exacto. Lo leido de la constancia y lo cargado a mano si se edita.
  const bloqueado = origen === 'escaneo';
  const habilitado = !!dni.trim() && !!nombre.trim() && !!apellido.trim() && !cargando;

  return (
    <Modal
      titulo={origen === 'manual' ? 'Nuevo empleado' : 'Confirmá los datos'}
      onCerrar={onCerrar}
      acciones={[
        { texto: 'Volver', onClick: () => setPaso('instrucciones'), tipo: 'texto' },
        { texto: 'Crear', onClick: () => crear(false), habilitado, cargando, icono: <IconoGuardar size={20} /> },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {origen === 'escaneo' ? (
          <div
            style={{
              background: 'rgba(76,175,80,0.12)',
              border: '1px solid #4caf50',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              color: '#a5d6a7',
            }}
          >
            Código leído correctamente. Los datos salen del DNI, no se editan.
          </div>
        ) : origen === 'constancia' ? (
          <div
            style={{
              background: 'rgba(255,152,0,0.12)',
              border: '1px solid var(--warning)',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--warning)',
            }}
          >
            <strong>Constancia de DNI en trámite.</strong> Estos datos se leyeron de la hoja impresa, así que
            pueden tener errores: revisalos contra el papel antes de crear.
            {idTramite && <div style={{ marginTop: 4, fontSize: 12 }}>Trámite {idTramite}</div>}
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(255,152,0,0.12)',
              border: '1px solid var(--warning)',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--warning)',
            }}
          >
            Carga manual, sin escanear. Revisá bien el DNI antes de crear.
          </div>
        )}

        <TextField
          value={dni}
          onChange={(v) => {
            setDni(v);
            if (errorDni) setErrorDni(null);
          }}
          label="DNI *"
          soloNumeros
          disabled={bloqueado}
          error={!dni.trim() || !!errorDni}
        />

        {errorDni && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              textAlign: 'center',
              background: 'rgba(255,82,82,0.12)',
              border: '1px solid var(--error)',
              borderRadius: 12,
              padding: '16px 14px',
            }}
          >
            <div style={{ color: 'var(--error)', display: 'flex' }}>
              <IconoAlerta size={28} />
            </div>
            <div style={{ color: 'var(--error)', fontWeight: 700, fontSize: 15 }}>DNI inválido</div>
            <div style={{ color: 'var(--error)', fontSize: 13 }}>{errorDni}</div>
          </div>
        )}

        <TextField
          value={apellido}
          onChange={(v) => setApellido(v.replace(/\n/g, ''))}
          label="Apellido *"
          disabled={bloqueado}
          error={!apellido.trim()}
        />
        <TextField
          value={nombre}
          onChange={(v) => setNombre(v.replace(/\n/g, ''))}
          label="Nombre *"
          disabled={bloqueado}
          error={!nombre.trim()}
        />

        {leido?.fechaNacimiento && (
          <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>
            Nacimiento: {leido.fechaNacimiento}
            {leido.sexo ? ` · Sexo: ${leido.sexo}` : ''}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>Sector: {sectorName}</div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>Fotos del DNI</div>

        {/* El momento de sacar el dorso es ahora, con el DNI todavia en la mano:
            si se salta este paso, despues hay que ir a buscar al empleado. */}
        {origen === 'escaneo' && !dorso && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(38,198,218,0.12)',
              border: '1px solid var(--teal)',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <span style={{ color: 'var(--teal)', display: 'flex', flexShrink: 0 }}>
              <IconoCambiarSector size={24} />
            </span>
            <div style={{ fontSize: 13, color: '#a7e6ee', lineHeight: 1.45 }}>
              <strong style={{ color: 'white' }}>No te olvides del dorso.</strong> Ya que tenés el DNI en la mano,
              dalo vuelta y sacale la foto ahora.
            </div>
          </div>
        )}
        {(['frente', 'dorso'] as const).map((lado) => {
          const valor = lado === 'frente' ? frente : dorso;
          const setter = lado === 'frente' ? setFrente : setDorso;
          return (
            <div key={lado} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: valor ? '#4caf50' : 'var(--texto-apagado)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>{lado}</span>
              {valor ? (
                <img src={valor} alt={lado} style={{ height: 34, borderRadius: 6, marginLeft: 4 }} />
              ) : (
                <span style={{ flex: 1, fontSize: 14, color: 'var(--texto-tenue)' }}>Sin foto</span>
              )}
              {valor && <span style={{ flex: 1 }} />}

              <button
                onClick={async () => {
                  const d = await tomarFoto();
                  if (d) setter(d);
                }}
                title="Sacar foto"
                style={botonIcono('var(--purple80)')}
              >
                <IconoCamara size={22} />
              </button>
              <button
                onClick={async () => {
                  const d = await elegirDeGaleria();
                  if (d) setter(d);
                }}
                title="Elegir de la galería"
                style={botonIcono('var(--teal)')}
              >
                <IconoGaleria size={22} />
              </button>
              {valor && (
                <button onClick={() => setter(null)} title="Borrar" style={botonIcono('var(--error)')}>
                  <IconoBorrar size={20} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
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
