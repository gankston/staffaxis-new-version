// Normaliza un DNI a solo digitos (sin puntos, espacios, saltos de linea, etc).
// Pedido de IT Salvita: la busqueda y el guardado tienen que comparar/guardar
// siempre el mismo formato, si no un DNI cargado como "42.286.713" nunca
// encuentra a la persona que ya existe como "42286713" y se duplica la ficha.
export function normalizarDni(raw) {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits || null;
}

// 7 a 9 digitos (rango real de DNI argentino), rechaza todos los digitos
// iguales ("999999999") y secuencias obvias ascendentes/descendentes
// ("1234567", "987654321") — son los "numeros de orden" que cada sector se
// inventaba en vez de dejar el campo vacio.
export function formatoDniValido(dniDigits) {
  if (!/^\d{7,9}$/.test(dniDigits)) return false;
  if (/^(\d)\1+$/.test(dniDigits)) return false;

  let ascendente = true;
  let descendente = true;
  for (let i = 1; i < dniDigits.length; i++) {
    const prev = Number(dniDigits[i - 1]);
    const cur = Number(dniDigits[i]);
    if (cur !== (prev + 1) % 10) ascendente = false;
    if (cur !== (prev + 9) % 10) descendente = false;
  }
  if (ascendente || descendente) return false;

  return true;
}
