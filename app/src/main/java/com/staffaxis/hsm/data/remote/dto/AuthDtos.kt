package com.staffaxis.hsm.data.remote.dto

import com.google.gson.annotations.SerializedName

data class RegisterDeviceRequestDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("sector_id") val sectorId: String,
    @SerializedName("encargado_name") val encargadoName: String
)

data class RegisterDeviceResponseDto(
    @SerializedName("token") val token: String? = null,
    @SerializedName("pending") val pending: Boolean? = null
)

data class AllowedSectorsResponseDto(
    @SerializedName("ok") val ok: Boolean = false,
    @SerializedName("allowedSectors") val allowedSectors: List<SectorDto> = emptyList()
)

data class SectorsListResponseDto(
    @SerializedName("sectors") val sectors: List<SectorDto> = emptyList()
)

data class RequestAccessRequestDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("sector_id") val sectorId: String,
    @SerializedName("full_name") val fullName: String,
    @SerializedName("phone_model") val phoneModel: String?,
    @SerializedName("latitude") val latitude: Double?,
    @SerializedName("longitude") val longitude: Double?
)

data class DeviceStatusResponseDto(
    @SerializedName("ok") val ok: Boolean = false,
    @SerializedName("is_master") val isMaster: Boolean? = null
)

data class AccessStatusResponseDto(
    @SerializedName("status") val status: String, // pending | authorized | rejected
    @SerializedName("token") val token: String? = null,
    @SerializedName("is_master") val isMaster: Boolean? = null,
    @SerializedName("request_id") val requestId: String? = null
)

// ─────────────────────────────────────────────────────────────────────────
// Modo supervisor
// ─────────────────────────────────────────────────────────────────────────

data class SupervisorDto(
    @SerializedName("id") val id: String,
    @SerializedName("full_name") val fullName: String
)

data class SupervisorsListResponseDto(
    @SerializedName("supervisors") val supervisors: List<SupervisorDto> = emptyList()
)

data class RequestAccessSupervisorRequestDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("supervisor_id") val supervisorId: String,
    @SerializedName("phone_model") val phoneModel: String?,
    @SerializedName("latitude") val latitude: Double?,
    @SerializedName("longitude") val longitude: Double?
)

data class SupervisorSectorDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String
)

data class SupervisorMeResponseDto(
    @SerializedName("id") val id: String,
    @SerializedName("full_name") val fullName: String,
    @SerializedName("sectores") val sectores: List<SupervisorSectorDto> = emptyList()
)

data class SupervisorPendingItemDto(
    @SerializedName("id") val id: String,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("empleado") val empleado: String,
    @SerializedName("sector") val sector: String,
    @SerializedName("date") val date: String,
    @SerializedName("minutesWorked") val minutesWorked: String?,
    @SerializedName("notes") val notes: String?,
    @SerializedName("fueModificada") val fueModificada: Boolean = false,
    @SerializedName("kmViajes") val kmViajes: Float? = null,
    @SerializedName("hasFumigadas") val hasFumigadas: Float? = null,
    @SerializedName("siembraTrilla") val siembraTrilla: Float? = null,
    @SerializedName("bolseros") val bolseros: Float? = null,
    @SerializedName("etiquetado") val etiquetado: Float? = null,
    @SerializedName("cargaCamionKg50") val cargaCamionKg50: Boolean? = null,
    @SerializedName("cargaCamionKg25") val cargaCamionKg25: Boolean? = null,
    @SerializedName("cargaCamionOtro") val cargaCamionOtro: String? = null,
    @SerializedName("movimientoEstibaKg50") val movimientoEstibaKg50: Boolean? = null,
    @SerializedName("movimientoEstibaKg25") val movimientoEstibaKg25: Boolean? = null,
    @SerializedName("movimientoEstibaOtro") val movimientoEstibaOtro: String? = null
)

data class SupervisorPendingResponseDto(
    @SerializedName("items") val items: List<SupervisorPendingItemDto> = emptyList()
)

data class SupervisorApproveRejectRequestDto(
    @SerializedName("submission_ids") val submissionIds: List<String>,
    @SerializedName("motivo") val motivo: String? = null
)

data class SupervisorApproveRejectResponseDto(
    @SerializedName("ok") val ok: Boolean = false,
    @SerializedName("aprobadas") val aprobadas: Int? = null,
    @SerializedName("rechazadas") val rechazadas: Int? = null
)

data class SupervisorResumenRowDto(
    @SerializedName("submission_id") val submissionId: String,
    @SerializedName("employee_id") val employeeId: String,
    @SerializedName("first_name") val firstName: String,
    @SerializedName("last_name") val lastName: String,
    @SerializedName("sector_name") val sectorName: String,
    @SerializedName("date") val date: String,
    @SerializedName("minutes_worked") val minutesWorked: String?,
    @SerializedName("status") val status: String,
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

data class SupervisorResumenResponseDto(
    @SerializedName("rows") val rows: List<SupervisorResumenRowDto> = emptyList()
)
