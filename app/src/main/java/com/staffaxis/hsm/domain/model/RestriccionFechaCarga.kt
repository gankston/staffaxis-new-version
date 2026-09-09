package com.staffaxis.hsm.domain.model

import java.time.LocalDate

/**
 * Solo se puede tarjar (cargar horas nuevas) para hoy o ayer. Ya se habia implementado
 * esta restriccion en algun momento y se saco; vuelve a pedido de Gaston con la
 * actualizacion 4.0.0. No afecta editar los valores de un registro YA cargado (esa
 * pantalla no tiene selector de fecha), solo que fecha se puede elegir al cargar uno
 * nuevo.
 */
fun esFechaCargable(fecha: LocalDate, hoy: LocalDate = LocalDate.now()): Boolean =
    !fecha.isAfter(hoy) && !fecha.isBefore(hoy.minusDays(1))
