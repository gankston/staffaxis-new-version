package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.AllowedSectorsResponseDto
import com.staffaxis.hsm.data.remote.dto.RegisterDeviceRequestDto
import com.staffaxis.hsm.data.remote.dto.RegisterDeviceResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApiService {
    @POST("api/auth/device/register")
    suspend fun registerDevice(@Body request: RegisterDeviceRequestDto): Response<RegisterDeviceResponseDto>

    @GET("api/auth/device/allowed-sectors")
    suspend fun getAllowedSectors(): Response<AllowedSectorsResponseDto>
}
