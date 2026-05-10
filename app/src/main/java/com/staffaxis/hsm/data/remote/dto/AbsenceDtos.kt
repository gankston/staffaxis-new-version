package com.staffaxis.hsm.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CreateAbsenceRequestDto(
    @SerializedName("employee_id") val employeeId: String,
    @SerializedName("start_date") val startDate: String,
    @SerializedName("end_date") val endDate: String,
    @SerializedName("is_justified") val isJustified: Boolean = false,
    @SerializedName("observations") val observations: String? = null
)

data class AbsenceResponseDto(
    @SerializedName("id") val id: String,
    @SerializedName("employee_id") val employeeId: String,
    @SerializedName("start_date") val startDate: String,
    @SerializedName("end_date") val endDate: String,
    @SerializedName("is_justified") val isJustified: Int = 0,
    @SerializedName("observations") val observations: String? = null
)

data class AbsencesListResponseDto(
    @SerializedName("absences") val absences: List<AbsenceResponseDto> = emptyList()
)
