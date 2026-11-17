import { describe, expect, it } from 'vitest';
import { lecturaValida, parsearDni } from './dniBarcode';

// Datos inventados. El formato es el de los DNI reales que no se podian escanear.
const FIRMA = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpZF90cmFtaXRlIjoiNzEyMzQ1Njc4In0.aB_c-D9xYz_0Q-wErT';
const QR_NUEVO = `00712345678@GOMEZ@JUAN CARLOS@30123456@C@05/07/87@24/09/26@${FIRMA}`;
const PDF417 = '00123456789@PEREZ@ANA MARIA@F@28123456@A@01/01/1980@01/01/2016@123';

describe('QR de la parte de atrás del DNI nuevo', () => {
  it('saca el DNI, el apellido y el nombre', () => {
    const d = parsearDni(QR_NUEVO);
    expect(d).toMatchObject({ dni: '30123456', apellido: 'GOMEZ', nombre: 'JUAN CARLOS', sexo: null });
  });

  it('marca la foto como dorso', () => {
    expect(parsearDni(QR_NUEVO)?.lado).toBe('dorso');
  });

  it('pasa el año del nacimiento a cuatro cifras', () => {
    expect(parsearDni(QR_NUEVO)?.fechaNacimiento).toBe('05/07/1987');
    const joven = QR_NUEVO.replace('05/07/87', '29/06/04');
    expect(parsearDni(joven)?.fechaNacimiento).toBe('29/06/2004');
  });

  it('acepta la lectura aunque la firma traiga guiones bajos', () => {
    expect(lecturaValida(QR_NUEVO)).toBe(QR_NUEVO);
  });

  it('acepta apellidos con Ñ', () => {
    const conEnie = QR_NUEVO.replace('GOMEZ', 'MUÑOZ');
    expect(parsearDni(conEnie)?.apellido).toBe('MUÑOZ');
    expect(lecturaValida(conEnie)).toBe(conEnie);
  });

  it('rechaza una lectura con caracteres raros en los datos', () => {
    expect(lecturaValida(QR_NUEVO.replace('GOMEZ', 'GO$EZ'))).toBeNull();
  });

  it('rechaza un QR cualquiera que no es de un DNI', () => {
    expect(lecturaValida('https://www.argentina.gob.ar/')).toBeNull();
  });
});

describe('código de barras del frente del DNI de siempre (no cambia)', () => {
  it('se sigue leyendo igual', () => {
    expect(parsearDni(PDF417)).toMatchObject({
      dni: '28123456',
      apellido: 'PEREZ',
      nombre: 'ANA MARIA',
      sexo: 'F',
      fechaNacimiento: '01/01/1980',
      lado: 'frente',
    });
    expect(lecturaValida(PDF417)).toBe(PDF417);
  });

  it('sigue rechazando lecturas rotas', () => {
    expect(lecturaValida('0070437834‹üTORRES—b>ÞOS FABIANG(Q4910)')).toBeNull();
  });
});
