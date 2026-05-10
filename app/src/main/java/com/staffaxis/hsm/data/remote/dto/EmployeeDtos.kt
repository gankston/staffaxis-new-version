package com.staffaxis.hsm.data.remote.dto

import com.google.gson.annotations.SerializedName

data class EmployeeDto(
    @SerializedName("id") val id: String,
    @SerializedName("sector_id") val sectorId: String,
    @SerializedName("first_name") val firstName: String,
    @SerializedName("last_name") val lastName: String = "",
    @SerializedName("dni") val dni: String? = null,
    @SerializedName("is_active") val isActive: Boolean = true
)

data class EmployeesResponseDto(
    @SerializedName("employees") val employees: List<EmployeeDto> = emptyList()
)

data class CreateEmployeeRequestDto(
    @SerializedName("first_name") val firstName: String,
    @SerializedName("last_name") val lastName: String,
    @SerializedName("dni") val dni: String?,
    @SerializedName("sector_id") val sectorId: String,
    @SerializedName("force_transfer") val forceTransfer: Boolean = false
)

data class UpdateEmployeeRequestDto(
    @SerializedName("first_name") val firstName: String? = null,
    @SerializedName("last_name") val lastName: String? = null,
    @SerializedName("dni") val dni: String? = null,
    @SerializedName("is_active") val isActive: Boolean? = null
)
