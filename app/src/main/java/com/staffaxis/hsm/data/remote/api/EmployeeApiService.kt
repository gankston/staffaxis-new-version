package com.staffaxis.hsm.data.remote.api

import com.staffaxis.hsm.data.remote.dto.CreateEmployeeRequestDto
import com.staffaxis.hsm.data.remote.dto.EmployeeDto
import com.staffaxis.hsm.data.remote.dto.EmployeesResponseDto
import com.staffaxis.hsm.data.remote.dto.UpdateEmployeeRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

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
}
