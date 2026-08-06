package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.AccessStatusResponseDto
import com.staffaxis.hsm.data.remote.dto.AllowedSectorsResponseDto
import com.staffaxis.hsm.data.remote.dto.DeviceStatusResponseDto
import com.staffaxis.hsm.data.remote.dto.RegisterDeviceRequestDto
import com.staffaxis.hsm.data.remote.dto.RegisterDeviceResponseDto
import com.staffaxis.hsm.data.remote.dto.RequestAccessRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface AuthApiService {
    @POST("api/auth/device/register")
    suspend fun registerDevice(@Body request: RegisterDeviceRequestDto): Response<RegisterDeviceResponseDto>

    @GET("api/auth/device/allowed-sectors")
    suspend fun getAllowedSectors(): Response<AllowedSectorsResponseDto>

    @POST("api/auth/request-access")
    suspend fun requestAccess(@Body request: RequestAccessRequestDto): Response<AccessStatusResponseDto>

    @GET("api/auth/request-access/{id}")
    suspend fun checkAccessStatus(@Path("id") requestId: String): Response<AccessStatusResponseDto>

    // Heartbeat liviano: un 403 (revocado en caliente) lo maneja el revokedInterceptor
    // global; el cuerpo trae is_master para refrescar el flag sin re-autorizarse.
    @GET("api/auth/device/status")
    suspend fun deviceStatus(): Response<DeviceStatusResponseDto>
}
