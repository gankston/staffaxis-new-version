package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.AbsenceResponseDto
import com.staffaxis.hsm.data.remote.dto.AbsencesListResponseDto
import com.staffaxis.hsm.data.remote.dto.CreateAbsenceRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface AbsenceApiService {
    @POST("api/absences")
    suspend fun createAbsence(@Body request: CreateAbsenceRequestDto): Response<AbsenceResponseDto>

    @GET("api/absences")
    suspend fun getAbsences(
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null
    ): Response<AbsencesListResponseDto>
}
