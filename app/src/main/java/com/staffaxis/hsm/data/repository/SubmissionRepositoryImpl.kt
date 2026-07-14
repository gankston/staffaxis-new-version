package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.dao.OutboxSubmissionDao
import com.staffaxis.hsm.data.local.entity.OutboxSubmissionEntity
import com.staffaxis.hsm.data.remote.api.AdminApiService
import com.staffaxis.hsm.data.remote.api.SubmissionApiService
import com.staffaxis.hsm.data.remote.dto.CreateSubmissionRequestDto
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.OutboxSubmission
import com.staffaxis.hsm.domain.repository.SubmissionRepository
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject

private const val ADMIN_TOKEN = "staffaxis_admin_token_2024_prod"

class SubmissionRepositoryImpl @Inject constructor(
    private val dao: OutboxSubmissionDao,
    private val api: SubmissionApiService,
    private val adminApi: AdminApiService
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

    override suspend fun updateHoras(submissionId: String, minutesWorked: String?): AppResult<Unit> {
        return try {
            dao.updateMinutesWorked(submissionId, minutesWorked)
            AppResult.Success(Unit)
        } catch (e: Exception) {
            AppResult.Error("Error al actualizar", e)
        }
    }

    override suspend fun getSubmissionsForEmployee(employeeId: String): List<OutboxSubmission> =
        dao.getByEmployee(employeeId).map {
            OutboxSubmission(it.id, it.employeeId, it.sectorId, it.date, it.minutesWorked, it.notes, it.status)
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

    override suspend fun getSubmissionsForSectorPeriod(sectorId: String, startDate: String, endDate: String): List<OutboxSubmission> =
        dao.getForSectorBetween(sectorId, startDate, endDate).map {
            OutboxSubmission(it.id, it.employeeId, it.sectorId, it.date, it.minutesWorked, it.notes, it.status)
        }

    override suspend fun fetchReport(sectorId: String, startDate: String, endDate: String): List<OutboxSubmission> {
        val response = adminApi.getReport(
            adminToken = ADMIN_TOKEN,
            sectorId = sectorId,
            startDate = startDate,
            endDate = endDate
        )
        if (!response.isSuccessful) throw Exception("HTTP ${response.code()} al traer reporte del servidor")
        val body = response.body() ?: throw Exception("Respuesta vacía del servidor")
        return body.rows.map { row ->
            val mw = row.minutesWorked?.let { raw ->
                if (raw == "C" || raw.startsWith("$")) raw
                else {
                    val n = raw.toLongOrNull()
                    when {
                        n == null -> raw
                        n > 16 && n % 60 == 0L -> (n / 60).toString()
                        n > 16 -> (n / 60f).let { h ->
                            if (h % 1f == 0f) h.toInt().toString() else h.toString()
                        }
                        else -> raw
                    }
                }
            }
            // La fecha viene como "2026-07-13T03:00:00.000Z" — tomamos solo los primeros 10 chars
            val dateStr = row.date.take(10)
            OutboxSubmission(row.submissionId, row.employeeId, sectorId, dateStr, mw, row.notes, "sent")
        }
    }
}
