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
    @SerializedName("notes") val notes: String?
)
