package com.staffaxis.hsm.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CreateSubmissionRequestDto(
    @SerializedName("employee_id") val employeeId: String,
    @SerializedName("date") val date: String,
    @SerializedName("minutes_worked") val minutesWorked: String? = null,
    @SerializedName("notes") val notes: String? = null
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
