package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.ApprovedResponseDto
import com.staffaxis.hsm.data.remote.dto.CreateSubmissionRequestDto
import com.staffaxis.hsm.data.remote.dto.SubmissionResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface SubmissionApiService {
    @POST("api/submissions")
    suspend fun createSubmission(@Body request: CreateSubmissionRequestDto): Response<SubmissionResponseDto>

    @GET("api/approved")
    suspend fun getApproved(
        @Query("since") since: Long,
        @Query("since_id") sinceId: String? = null,
        @Query("limit") limit: Int = 500
    ): Response<ApprovedResponseDto>
}
