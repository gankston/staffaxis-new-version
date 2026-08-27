package com.staffaxis.hsm.domain.model

import java.time.LocalDate

data class Sector(
    val id: String,
    val name: String,
    val tipoCarga: String = "importe",
    val encargado: String? = null,
    // Tipos de carga adicionales configurados para este sector (cosecha, km_viajes,
    // bolseros, etc. — ver sector_tipos_carga en la base). "Horas" es implicito, no esta aca.
    val tiposCarga: List<String> = emptyList()
)

// Resultado de pedir autorización — puede quedar pendiente (a la espera de que
// alguien en StaffAdmin lo apruebe) o quedar autorizada al toque (dispositivo maestro).
sealed class AccessRequestResult {
    data class Authorized(val token: String, val isMaster: Boolean) : AccessRequestResult()
    data class Pending(val requestId: String) : AccessRequestResult()
}

sealed class AccessStatus {
    object Pending : AccessStatus()
    data class Authorized(val token: String, val isMaster: Boolean) : AccessStatus()
    object Rejected : AccessStatus()
}

data class Employee(
    val id: String,
    val nombre: String,
    val apellido: String = "",
    val dni: String?,
    val sectorId: String,
    val sectorName: String,
    val activo: Boolean = true,
    val observacion: String? = null,
    val fechaIngreso: String = "",
    val tieneFotoFrente: Boolean = false,
    val tieneFotoDorso: Boolean = false,
)

data class OutboxSubmission(
    val id: String,
    val employeeId: String,
    val sectorId: String,
    val date: String,
    val minutesWorked: String?,
    val notes: String?,
    val status: String,
    // Solo vienen cargados cuando el registro sale de fetchReport() (server) —
    // el resto de las lecturas (outbox local) no los necesita todavia.
    val tiposNuevos: TiposCargaNuevos = TiposCargaNuevos()
)

// Tipos de carga nuevos (km_viajes, bolseros, carga_camion, etc.) — cada uno con
// columna propia en el servidor, igual que horas/cosecha/cajas/cajones/importe.
// 50kg/25kg son checks: el dato ES el peso, no una cantidad a ingresar.
data class TiposCargaNuevos(
    val kmViajes: Float? = null,
    val hasFumigadas: Float? = null,
    val siembraTrilla: Float? = null,
    val bolseros: Float? = null,
    val etiquetado: Float? = null,
    val cargaCamionKg50: Boolean? = null,
    val cargaCamionKg25: Boolean? = null,
    val cargaCamionOtro: String? = null,
    val movimientoEstibaKg50: Boolean? = null,
    val movimientoEstibaKg25: Boolean? = null,
    val movimientoEstibaOtro: String? = null
) {
    val estaVacio: Boolean get() =
        kmViajes == null && hasFumigadas == null && siembraTrilla == null && bolseros == null && etiquetado == null &&
        cargaCamionKg50 == null && cargaCamionKg25 == null && cargaCamionOtro == null &&
        movimientoEstibaKg50 == null && movimientoEstibaKg25 == null && movimientoEstibaOtro == null

    // Para totales de período: los numéricos se suman, los checks de camion/estiba
    // quedan en true si aparecieron cualquier día, "otro" se queda con el primero.
    operator fun plus(otro: TiposCargaNuevos): TiposCargaNuevos {
        fun sumar(a: Float?, b: Float?): Float? = if (a == null && b == null) null else (a ?: 0f) + (b ?: 0f)
        fun oCualquiera(a: Boolean?, b: Boolean?): Boolean? = if (a == true || b == true) true else null
        return TiposCargaNuevos(
            kmViajes = sumar(kmViajes, otro.kmViajes),
            hasFumigadas = sumar(hasFumigadas, otro.hasFumigadas),
            siembraTrilla = sumar(siembraTrilla, otro.siembraTrilla),
            bolseros = sumar(bolseros, otro.bolseros),
            etiquetado = sumar(etiquetado, otro.etiquetado),
            cargaCamionKg50 = oCualquiera(cargaCamionKg50, otro.cargaCamionKg50),
            cargaCamionKg25 = oCualquiera(cargaCamionKg25, otro.cargaCamionKg25),
            cargaCamionOtro = cargaCamionOtro ?: otro.cargaCamionOtro,
            movimientoEstibaKg50 = oCualquiera(movimientoEstibaKg50, otro.movimientoEstibaKg50),
            movimientoEstibaKg25 = oCualquiera(movimientoEstibaKg25, otro.movimientoEstibaKg25),
            movimientoEstibaOtro = movimientoEstibaOtro ?: otro.movimientoEstibaOtro
        )
    }

    companion object {
        fun sumar(lista: List<TiposCargaNuevos>): TiposCargaNuevos = lista.fold(TiposCargaNuevos()) { acc, t -> acc + t }
    }
}

// Tarja que el supervisor rechazo: se le muestra al que la cargo para que la corrija.
data class TarjaRechazada(
    val id: String,
    val empleado: String,
    val date: String,
    val minutesWorked: String?,
    val motivo: String?,
    val rechazadaPor: String?
)

data class Absence(
    val id: String,
    val employeeId: String,
    val employeeName: String,
    val fechaInicio: LocalDate,
    val fechaFin: LocalDate,
    val certificadoMedico: Boolean,
    val observaciones: String?,
    val syncStatus: String
)

data class TarjaStatus(
    val date: String,
    val sectorId: String,
    val enviada: Boolean,
    val horaEnvio: Long?,
    val empleadosTarjados: Int,
    val horasTarjadas: Float,
    val jornalesTotales: Int
)

data class EmployeeTransfer(
    val employeeName: String,
    val fromSectorName: String,
    val toSectorName: String
)

sealed class AppResult<out T> {
    data class Success<T>(val data: T) : AppResult<T>()
    data class Error(val message: String, val cause: Exception? = null) : AppResult<Nothing>()
}
