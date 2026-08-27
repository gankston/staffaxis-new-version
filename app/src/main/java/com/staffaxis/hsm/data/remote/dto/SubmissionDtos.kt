package com.staffaxis.hsm.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CreateSubmissionRequestDto(
    @SerializedName("employee_id") val employeeId: String,
    @SerializedName("date") val date: String,
    @SerializedName("minutes_worked") val minutesWorked: String? = null,
    @SerializedName("notes") val notes: String? = null,
    @SerializedName("latitude") val latitude: Double? = null,
    @SerializedName("longitude") val longitude: Double? = null,
    // Los mismos valores que ya arma minutes_worked, pero mandados aparte y tipados —
    // asi el servidor no tiene que volver a parsear el texto compuesto.
    @SerializedName("horas") val horas: Float? = null,
    @SerializedName("cosecha") val cosecha: Float? = null,
    @SerializedName("cajas") val cajas: Int? = null,
    @SerializedName("cajones") val cajones: Int? = null,
    @SerializedName("importe") val importe: Float? = null,
    // Tipos de carga nuevos — cada uno con su columna propia en el servidor.
    // 50kg/25kg son booleanos (el dato ES el peso, no una cantidad).
    @SerializedName("km_viajes") val kmViajes: Float? = null,
    @SerializedName("has_fumigadas") val hasFumigadas: Float? = null,
    @SerializedName("siembra_trilla") val siembraTrilla: Float? = null,
    @SerializedName("bolseros") val bolseros: Float? = null,
    @SerializedName("etiquetado") val etiquetado: Float? = null,
    @SerializedName("carga_camion_kg50") val cargaCamionKg50: Boolean? = null,
    @SerializedName("carga_camion_kg25") val cargaCamionKg25: Boolean? = null,
    @SerializedName("carga_camion_otro") val cargaCamionOtro: String? = null,
    @SerializedName("movimiento_estiba_kg50") val movimientoEstibaKg50: Boolean? = null,
    @SerializedName("movimiento_estiba_kg25") val movimientoEstibaKg25: Boolean? = null,
    @SerializedName("movimiento_estiba_otro") val movimientoEstibaOtro: String? = null
)

data class RechazadaItemDto(
    @SerializedName("id") val id: String,
    @SerializedName("empleado") val empleado: String,
    @SerializedName("date") val date: String,
    @SerializedName("minutesWorked") val minutesWorked: String?,
    @SerializedName("motivo") val motivo: String?,
    @SerializedName("rechazadaPor") val rechazadaPor: String?
)

data class RechazadasResponseDto(
    @SerializedName("items") val items: List<RechazadaItemDto> = emptyList()
)

data class SubmissionResponseDto(
    @SerializedName("id") val id: String,
    @SerializedName("status") val status: String
)

data class ApprovedResponseDto(
    @SerializedName("items") val items: List<ApprovedItemDto>,
    @SerializedName("hasMore") val hasMore: Boolean = false,
    @SerializedName("lastId") val lastId: String? = null
)

data class ApprovedItemDto(
    @SerializedName("id") val id: String,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("sectorId") val sectorId: String,
    @SerializedName("date") val date: String,
    @SerializedName("minutesWorked") val minutesWorked: String?,
    @SerializedName("notes") val notes: String?,
    @SerializedName("updatedAt") val updatedAt: Long,
    @SerializedName("isDeleted") val isDeleted: Boolean = false
)
