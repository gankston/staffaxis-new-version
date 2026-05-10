package com.staffaxis.hsm.data.remote.dto

import com.google.gson.annotations.SerializedName

data class SectorDto(
    @SerializedName("id") val id: String = "",
    @SerializedName("name") val name: String = "",
    @SerializedName("encargado") val encargado: String? = null,
    @SerializedName("tipoCarga") val tipoCarga: String? = null
)
