package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.SectorsListResponseDto
import retrofit2.Response
import retrofit2.http.GET

interface SectorsApiService {
    @GET("api/sectors")
    suspend fun getSectors(): Response<SectorsListResponseDto>
}
