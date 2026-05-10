package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.dao.OutboxSubmissionDao
import com.staffaxis.hsm.data.local.entity.OutboxSubmissionEntity
import com.staffaxis.hsm.data.remote.api.SubmissionApiService
import com.staffaxis.hsm.data.remote.dto.CreateSubmissionRequestDto
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.OutboxSubmission
import com.staffaxis.hsm.domain.repository.SubmissionRepository
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject

class SubmissionRepositoryImpl @Inject constructor(
    private val dao: OutboxSubmissionDao,
    private val api: SubmissionApiService
) : SubmissionRepository {

    override suspend fun saveHoras(
        employeeId: String,
        sectorId: String,
        date: String,
        minutesWorked: String?,
        notes: String?
    ): AppResult<Unit> {
        return try {
            val entity = OutboxSubmissionEntity(
                id = UUID.randomUUID().toString(),
                dedupKey = "$sectorId:$employeeId:$date",
                employeeId = employeeId,
                sectorId = sectorId,
                date = date,
                minutesWorked = minutesWorked,
                notes = notes,
                createdAt = System.currentTimeMillis()
            )
            val inserted = dao.insert(entity)
            if (inserted == -1L) {
                AppResult.Error("Ya existe un registro para esta fecha")
            } else {
                AppResult.Success(Unit)
            }
        } catch (e: Exception) {
            AppResult.Error("Error al guardar", e)
        }
    }

    override suspend fun updateHoras(submissionId: String, minutesWorked: String?, notes: String?): AppResult<Unit> {
        return AppResult.Success(Unit)
    }

    private fun toApiMinutes(minutesWorked: String?): String? {
        if (minutesWorked == null || minutesWorked == "C" || minutesWorked.startsWith("$")) return minutesWorked
        val num = minutesWorked.toIntOrNull() ?: return minutesWorked
        return if (num <= 16) (num * 60).toString() else minutesWorked
    }

    override suspend fun pushPendingToServer(): AppResult<Int> {
        val pending = dao.getPending(500)
        if (pending.isEmpty()) return AppResult.Success(0)
        var sent = 0
        for (submission in pending) {
            try {
                val response = api.createSubmission(
                    CreateSubmissionRequestDto(
                        employeeId = submission.employeeId,
                        date = submission.date,
                        minutesWorked = toApiMinutes(submission.minutesWorked),
                        notes = submission.notes
                    )
                )
                when {
                    response.isSuccessful -> { dao.markSent(submission.id); sent++ }
                    response.code() in 400..499 -> dao.markFailed(submission.id, "HTTP ${response.code()}")
                    else -> dao.incrementAttempt(submission.id, "HTTP ${response.code()}")
                }
            } catch (e: Exception) {
                dao.incrementAttempt(submission.id, e.message ?: "unknown")
            }
        }
        return AppResult.Success(sent)
    }

    override suspend fun getSubmissionsForDate(date: String, sectorId: String): List<OutboxSubmission> =
        dao.getSentForDate(date, sectorId).map {
            OutboxSubmission(it.id, it.employeeId, it.sectorId, it.date, it.minutesWorked, it.notes, it.status)
        }

    override suspend fun getAllActiveForDate(date: String, sectorId: String): List<OutboxSubmission> =
        dao.getAllActiveForDate(date, sectorId).map {
            OutboxSubmission(it.id, it.employeeId, it.sectorId, it.date, it.minutesWorked, it.notes, it.status)
        }

    override suspend fun migrateMinutesToHours() = dao.migrateMinutesToHours()

    override fun countPending(): Flow<Int> = dao.countPendingFlow()
}
