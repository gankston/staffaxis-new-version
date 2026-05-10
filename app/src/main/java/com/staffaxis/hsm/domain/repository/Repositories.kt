package com.staffaxis.hsm.domain.repository

import com.staffaxis.hsm.domain.model.*
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
    suspend fun fetchPublicSectors(): AppResult<List<Sector>>
    suspend fun registerDevice(deviceId: String, sectorId: String, encargadoName: String): AppResult<Unit>
    suspend fun getAllowedSectors(): AppResult<List<Sector>>
    fun getDeviceToken(): Flow<String?>
    fun getDeviceId(): Flow<String?>
}

interface SectorRepository {
    fun getSectorsFromCache(): Flow<List<Sector>>
    suspend fun syncSectors(sectors: List<Sector>)
}

interface EmployeeRepository {
    fun getEmployeesForSector(sectorId: String): Flow<List<Employee>>
    suspend fun syncEmployeesFromApi(sectorId: String, sectorName: String = ""): AppResult<List<Employee>>
    suspend fun createEmployee(nombre: String, dni: String, sectorId: String, sectorName: String = "", forceTransfer: Boolean = false): AppResult<Employee>
    suspend fun hideEmployee(id: String): AppResult<Unit>
    suspend fun updateEmployee(id: String, nombre: String, dni: String?, observacion: String?): AppResult<Unit>
    fun getTransfersForDate(sectorId: String, date: String): Flow<List<EmployeeTransfer>>
}

interface SubmissionRepository {
    suspend fun saveHoras(
        employeeId: String,
        sectorId: String,
        date: String,
        minutesWorked: String?,
        notes: String?
    ): AppResult<Unit>
    suspend fun updateHoras(submissionId: String, minutesWorked: String?, notes: String?): AppResult<Unit>
    suspend fun pushPendingToServer(): AppResult<Int>
    suspend fun getSubmissionsForDate(date: String, sectorId: String): List<OutboxSubmission>
    suspend fun getAllActiveForDate(date: String, sectorId: String): List<OutboxSubmission>
    suspend fun migrateMinutesToHours()
    fun countPending(): Flow<Int>
}

interface AbsenceRepository {
    fun getAllAbsences(): Flow<List<Absence>>
    suspend fun removeDuplicates()
    suspend fun createAbsence(
        employeeId: String,
        employeeName: String,
        fechaInicio: String,
        fechaFin: String,
        certificadoMedico: Boolean,
        observaciones: String?
    ): AppResult<Unit>
    suspend fun syncPendingAbsences(): AppResult<Int>
    suspend fun getAbsencesByEmployee(employeeId: String): List<Absence>
}

interface TarjaRepository {
    fun getTarjaStatus(date: String, sectorId: String): Flow<TarjaStatus?>
    suspend fun cerrarTarja(sectorId: String, date: String): AppResult<TarjaStatus>
}
