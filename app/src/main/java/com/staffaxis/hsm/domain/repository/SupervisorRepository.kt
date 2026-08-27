package com.staffaxis.hsm.domain.repository

import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.SupervisorAccessResult
import com.staffaxis.hsm.domain.model.SupervisorAccessStatus
import com.staffaxis.hsm.domain.model.SupervisorInfo
import com.staffaxis.hsm.domain.model.SupervisorMe
import com.staffaxis.hsm.domain.model.SupervisorPendingItem
import com.staffaxis.hsm.domain.model.SupervisorResumenRow
import kotlinx.coroutines.flow.Flow

interface SupervisorRepository {
    fun isSupervisorLoggedIn(): Flow<Boolean>
    fun supervisorName(): Flow<String?>

    suspend fun listSupervisors(): AppResult<List<SupervisorInfo>>

    suspend fun requestAccess(
        deviceId: String, supervisorId: String,
        phoneModel: String?, latitude: Double?, longitude: Double?
    ): AppResult<SupervisorAccessResult>

    suspend fun checkAccessStatus(requestId: String, supervisorId: String, fullName: String): AppResult<SupervisorAccessStatus>

    suspend fun me(): AppResult<SupervisorMe>
    suspend fun pending(): AppResult<List<SupervisorPendingItem>>
    suspend fun approve(submissionIds: List<String>): AppResult<Int>
    suspend fun reject(submissionIds: List<String>, motivo: String? = null): AppResult<Int>
    suspend fun resumen(fechaDesde: String, fechaHasta: String): AppResult<List<SupervisorResumenRow>>

    suspend fun cerrarSesion()
}
