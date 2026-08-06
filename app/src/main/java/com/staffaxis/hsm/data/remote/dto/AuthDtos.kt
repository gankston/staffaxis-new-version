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
