package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.AccessStatusResponseDto
import com.staffaxis.hsm.data.remote.dto.RequestAccessSupervisorRequestDto
import com.staffaxis.hsm.data.remote.dto.SupervisorApproveRejectRequestDto
import com.staffaxis.hsm.data.remote.dto.SupervisorApproveRejectResponseDto
import com.staffaxis.hsm.data.remote.dto.SupervisorMeResponseDto
import com.staffaxis.hsm.data.remote.dto.SupervisorPendingResponseDto
import com.staffaxis.hsm.data.remote.dto.SupervisorResumenResponseDto
import com.staffaxis.hsm.data.remote.dto.SupervisorsListResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface SupervisorApiService {

    // Lista cerrada de supervisores para el dropdown — no es texto libre.
    @GET("api/auth/supervisors")
    suspend fun listSupervisors(): Response<SupervisorsListResponseDto>

    @POST("api/auth/request-access-supervisor")
    suspend fun requestAccess(@Body request: RequestAccessSupervisorRequestDto): Response<AccessStatusResponseDto>

    @GET("api/auth/request-access-supervisor/{id}")
    suspend fun checkAccessStatus(@Path("id") requestId: String): Response<AccessStatusResponseDto>

    @GET("api/supervisor/me")
    suspend fun me(): Response<SupervisorMeResponseDto>

    @GET("api/supervisor/pending")
    suspend fun pending(): Response<SupervisorPendingResponseDto>

    @POST("api/supervisor/approve")
    suspend fun approve(@Body body: SupervisorApproveRejectRequestDto): Response<SupervisorApproveRejectResponseDto>

    @POST("api/supervisor/reject")
    suspend fun reject(@Body body: SupervisorApproveRejectRequestDto): Response<SupervisorApproveRejectResponseDto>

    @GET("api/supervisor/resumen")
    suspend fun resumen(
        @Query("fecha_desde") fechaDesde: String,
        @Query("fecha_hasta") fechaHasta: String
    ): Response<SupervisorResumenResponseDto>
}
