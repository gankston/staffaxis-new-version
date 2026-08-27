package com.staffaxis.hsm.data.remote.dto

import com.google.gson.annotations.SerializedName

data class AdminReportResponseDto(
    @SerializedName("rows") val rows: List<AdminReportRowDto> = emptyList()
)

data class AdminReportRowDto(
    @SerializedName("submission_id") val submissionId: String,
    @SerializedName("employee_id") val employeeId: String,
    @SerializedName("first_name") val firstName: String?,
    @SerializedName("last_name") val lastName: String?,
    @SerializedName("dni") val dni: String?,
    @SerializedName("date") val date: String,
    @SerializedName("minutes_worked") val minutesWorked: String?,
    @SerializedName("notes") val notes: String?,
    @SerializedName("status") val status: String? = null,
    @SerializedName("horas") val horas: Float? = null,
    @SerializedName("cosecha") val cosecha: Float? = null,
    @SerializedName("cajas") val cajas: Int? = null,
    @SerializedName("cajones") val cajones: Int? = null,
    @SerializedName("importe") val importe: Float? = null,
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
