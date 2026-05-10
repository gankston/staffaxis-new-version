package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.dao.OutboxSubmissionDao
import com.staffaxis.hsm.data.local.dao.TarjaStatusDao
import com.staffaxis.hsm.data.local.entity.TarjaStatusEntity
import com.staffaxis.hsm.data.remote.api.SubmissionApiService
import com.staffaxis.hsm.data.remote.dto.CreateSubmissionRequestDto
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.TarjaStatus
import com.staffaxis.hsm.domain.repository.TarjaRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject

class TarjaRepositoryImpl @Inject constructor(
    private val tarjaStatusDao: TarjaStatusDao,
    private val outboxDao: OutboxSubmissionDao,
    private val api: SubmissionApiService
) : TarjaRepository {

    override fun getTarjaStatus(date: String, sectorId: String): Flow<TarjaStatus?> =
        tarjaStatusDao.getForDate(date, sectorId).map { it?.toDomain() }

    override suspend fun cerrarTarja(sectorId: String, date: String): AppResult<TarjaStatus> {
        // Primero enviar todos los pendientes de otros días del mismo sector en paralelo
        val otrosDias = outboxDao.getPending(500).filter { it.sectorId == sectorId && it.date != date }
        sendParallel(otrosDias)

        // Luego enviar los del día actual en paralelo
        val pendingHoy = outboxDao.getAllNotSentForDate(date, sectorId)
        sendParallel(pendingHoy)

        val allSent = outboxDao.getSentForDate(date, sectorId)
        val totalEmpleados = allSent.size
        val totalHours = allSent.sumOf { it.minutesWorked?.toIntOrNull() ?: 0 }.toFloat()

        val status = TarjaStatusEntity(
            date = date,
            sectorId = sectorId,
            enviada = true,
            horaEnvio = System.currentTimeMillis(),
            empleadosTarjados = totalEmpleados,
            horasTarjadas = totalHours,
            jornalesTotales = totalEmpleados
        )
        tarjaStatusDao.upsert(status)
        return AppResult.Success(status.toDomain())
    }

    // Convierte horas (≤16) a minutos para la API. "C" e importes ("$xxx") se dejan tal cual.
    private fun toApiMinutes(minutesWorked: String?): String? {
        if (minutesWorked == null || minutesWorked == "C" || minutesWorked.startsWith("$")) return minutesWorked
        val num = minutesWorked.toIntOrNull() ?: return minutesWorked
        return if (num <= 16) (num * 60).toString() else minutesWorked
    }

    private suspend fun sendParallel(submissions: List<com.staffaxis.hsm.data.local.entity.OutboxSubmissionEntity>) {
        if (submissions.isEmpty()) return
        val mutex = Mutex()
        coroutineScope {
            // Máximo 10 en paralelo para no saturar la API
            submissions.chunked(10).forEach { chunk ->
                chunk.map { submission ->
                    async {
                        try {
                            val response = api.createSubmission(
                                CreateSubmissionRequestDto(submission.employeeId, submission.date, toApiMinutes(submission.minutesWorked), submission.notes)
                            )
                            mutex.withLock {
                                when {
                                    response.isSuccessful -> outboxDao.markSent(submission.id)
                                    response.code() in 400..499 -> outboxDao.markFailed(submission.id, "HTTP ${response.code()}")
                                    else -> outboxDao.incrementAttempt(submission.id, "HTTP ${response.code()}")
                                }
                            }
                        } catch (e: Exception) {
                            mutex.withLock { outboxDao.incrementAttempt(submission.id, e.message ?: "unknown") }
                        }
                    }
                }.awaitAll()
            }
        }
    }

    private fun TarjaStatusEntity.toDomain() = TarjaStatus(date, sectorId, enviada, horaEnvio, empleadosTarjados, horasTarjadas, jornalesTotales)
}
