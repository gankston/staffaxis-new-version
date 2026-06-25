package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.CreateEmployeeRequestDto
import com.staffaxis.hsm.data.remote.dto.EmployeeDto
import com.staffaxis.hsm.data.remote.dto.EmployeesResponseDto
import com.staffaxis.hsm.data.remote.dto.UpdateEmployeeRequestDto
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface EmployeeApiService {
    @GET("api/employees")
    suspend fun getEmployees(@Query("sector_id") sectorId: String): Response<EmployeesResponseDto>

    @POST("api/employees")
    suspend fun createEmployee(@Body request: CreateEmployeeRequestDto): Response<EmployeeDto>

    @PUT("api/employees/{id}")
    suspend fun updateEmployee(
        @Path("id") id: String,
        @Body request: UpdateEmployeeRequestDto
    ): Response<EmployeeDto>

    @Multipart
    @POST("api/employees/{id}/foto/{lado}")
    suspend fun uploadFoto(
        @Path("id") id: String,
        @Path("lado") lado: String,
        @Part foto: MultipartBody.Part
    ): Response<ResponseBody>

    @DELETE("api/employees/{id}/foto/{lado}")
    suspend fun deleteFoto(
        @Path("id") id: String,
        @Path("lado") lado: String
    ): Response<ResponseBody>

    @GET("api/employees/{id}/foto/{lado}")
    suspend fun getFoto(
        @Path("id") id: String,
        @Path("lado") lado: String
    ): Response<ResponseBody>
}
