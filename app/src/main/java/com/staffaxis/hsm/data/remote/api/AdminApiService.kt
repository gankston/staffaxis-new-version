package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.AdminReportResponseDto
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Query

interface AdminApiService {
    @GET("api/admin/report")
    suspend fun getReport(
        @Header("x-admin-token") adminToken: String,
        @Query("sector_id") sectorId: String,
        @Query("start_date") startDate: String,
        @Query("end_date") endDate: String
    ): Response<AdminReportResponseDto>
}
