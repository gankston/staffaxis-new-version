package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.entity.OutboxSubmissionEntity
import com.staffaxis.hsm.data.remote.dto.CreateSubmissionRequestDto

/**
 * Unico lugar donde se arma el pedido que se manda al servidor.
 *
 * Habia dos caminos de envio duplicados (SubmissionRepositoryImpl.pushPendingToServer
 * y TarjaRepositoryImpl.sendParallel, este ultimo el que corre al cerrar/reenviar la
 * tarja) y cada vez que se agregaba un campo se actualizaba solo uno: primero se
 * perdieron las coordenadas GPS, despues los tipos de carga nuevos. Con esta funcion
 * compartida los dos mandan siempre exactamente lo mismo.
 */
fun OutboxSubmissionEntity.toCreateRequest(): CreateSubmissionRequestDto =
    CreateSubmissionRequestDto(
        employeeId = employeeId,
        date = date,
        minutesWorked = toApiMinutes(minutesWorked),
        notes = notes,
        latitude = latitude,
        longitude = longitude,
        horas = horas,
        cosecha = cosecha,
        cajas = cajas,
        cajones = cajones,
        importe = importe,
        kmViajes = kmViajes,
        hasFumigadas = hasFumigadas,
        siembraTrilla = siembraTrilla,
        bolseros = bolseros,
        etiquetado = etiquetado,
        cargaCamionKg50 = cargaCamionKg50,
        cargaCamionKg25 = cargaCamionKg25,
        cargaCamionOtro = cargaCamionOtro,
        movimientoEstibaKg50 = movimientoEstibaKg50,
        movimientoEstibaKg25 = movimientoEstibaKg25,
        movimientoEstibaOtro = movimientoEstibaOtro
    )

/** Convierte horas (<=16) a minutos para la API. "C" e importes ("$xxx") se dejan tal cual. */
private fun toApiMinutes(minutesWorked: String?): String? {
    if (minutesWorked == null || minutesWorked == "C" || minutesWorked.startsWith("$")) return minutesWorked
    val num = minutesWorked.toIntOrNull() ?: return minutesWorked
    return if (num <= 16) (num * 60).toString() else minutesWorked
}
