package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.dao.AbsenceDao
import com.staffaxis.hsm.data.local.entity.AbsenceEntity
import com.staffaxis.hsm.data.remote.api.AbsenceApiService
import com.staffaxis.hsm.data.remote.dto.CreateAbsenceRequestDto
import com.staffaxis.hsm.domain.model.Absence
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.repository.AbsenceRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject

class AbsenceRepositoryImpl @Inject constructor(
    private val dao: AbsenceDao,
    private val api: AbsenceApiService
) : AbsenceRepository {

    override fun getAllAbsences(): Flow<List<Absence>> =
        dao.getAll().map { list -> list.mapNotNull { it.toDomain() } }

    override suspend fun removeDuplicates() = dao.removeDuplicates()

    override suspend fun createAbsence(
        employeeId: String,
        employeeName: String,
        fechaInicio: String,
        fechaFin: String,
        certificadoMedico: Boolean,
        observaciones: String?
    ): AppResult<Unit> {
        dao.deleteByEmployee(employeeId)
        val entity = AbsenceEntity(
            id = UUID.randomUUID().toString(),
            employeeId = employeeId,
            employeeName = employeeName,
            fechaInicio = fechaInicio,
            fechaFin = fechaFin,
            certificadoMedico = certificadoMedico,
            observaciones = observaciones
        )
        dao.insert(entity)
        return try {
            val response = api.createAbsence(
                CreateAbsenceRequestDto(
                    employeeId = employeeId,
                    startDate = fechaInicio,
                    endDate = fechaFin,
                    isJustified = certificadoMedico,
                    observations = observaciones
                )
            )
            if (response.isSuccessful) dao.markSynced(entity.id)
            AppResult.Success(Unit)
        } catch (e: Exception) {
            AppResult.Success(Unit)
        }
    }

    override suspend fun syncPendingAbsences(): AppResult<Int> {
        val pending = dao.getPending()
        var synced = 0
        for (absence in pending) {
            try {
                val response = api.createAbsence(
                    CreateAbsenceRequestDto(
                        employeeId = absence.employeeId,
                        startDate = absence.fechaInicio,
                        endDate = absence.fechaFin,
                        isJustified = absence.certificadoMedico,
                        observations = absence.observaciones
                    )
                )
                if (response.isSuccessful) { dao.markSynced(absence.id); synced++ }
                else dao.markError(absence.id, "HTTP ${response.code()}")
            } catch (e: Exception) {
                dao.markError(absence.id, e.message ?: "unknown")
            }
        }
        return AppResult.Success(synced)
    }

    override suspend fun getAbsencesByEmployee(employeeId: String): List<Absence> =
        dao.getByEmployee(employeeId).mapNotNull { it.toDomain() }

    private fun AbsenceEntity.toDomain(): Absence? {
        return try {
            Absence(id, employeeId, employeeName, LocalDate.parse(fechaInicio), LocalDate.parse(fechaFin), certificadoMedico, observaciones, syncStatus)
        } catch (e: Exception) { null }
    }
}
