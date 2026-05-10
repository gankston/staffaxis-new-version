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
