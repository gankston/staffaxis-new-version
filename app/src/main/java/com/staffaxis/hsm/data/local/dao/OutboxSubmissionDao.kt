package com.staffaxis.hsm.data.local.dao

import androidx.room.*
import com.staffaxis.hsm.data.local.entity.OutboxSubmissionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OutboxSubmissionDao {
    @Query("SELECT * FROM outbox_submissions WHERE status = 'pending' ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getPending(limit: Int = 500): List<OutboxSubmissionEntity>

    @Query("SELECT COUNT(*) FROM outbox_submissions WHERE status = 'pending'")
    fun countPendingFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox_submissions WHERE status = 'pending'")
    suspend fun countPending(): Int

    @Query("SELECT COUNT(*) FROM outbox_submissions WHERE date = :date AND sectorId = :sectorId AND status = 'sent'")
    suspend fun countSentForDate(date: String, sectorId: String): Int

    @Query("SELECT * FROM outbox_submissions WHERE date = :date AND sectorId = :sectorId AND status = 'sent'")
    suspend fun getSentForDate(date: String, sectorId: String): List<OutboxSubmissionEntity>

    @Query("SELECT * FROM outbox_submissions WHERE date = :date AND sectorId = :sectorId AND status != 'failed_permanent'")
    suspend fun getAllActiveForDate(date: String, sectorId: String): List<OutboxSubmissionEntity>

    @Query("SELECT * FROM outbox_submissions WHERE date = :date AND sectorId = :sectorId AND status != 'sent'")
    suspend fun getAllNotSentForDate(date: String, sectorId: String): List<OutboxSubmissionEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(submission: OutboxSubmissionEntity): Long

    @Query("UPDATE outbox_submissions SET status = 'sent' WHERE id = :id")
    suspend fun markSent(id: String)

    @Query("UPDATE outbox_submissions SET status = 'failed_permanent', lastError = :error WHERE id = :id")
    suspend fun markFailed(id: String, error: String)

    @Query("UPDATE outbox_submissions SET attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun incrementAttempt(id: String, error: String)

    @Query("DELETE FROM outbox_submissions WHERE status = 'sent' AND createdAt < :before")
    suspend fun cleanOldSent(before: Long)

    @Query("SELECT * FROM outbox_submissions WHERE employeeId = :employeeId AND status != 'failed_permanent' ORDER BY date DESC LIMIT 60")
    suspend fun getByEmployee(employeeId: String): List<OutboxSubmissionEntity>

    @Query("UPDATE outbox_submissions SET minutesWorked = :minutesWorked, status = 'pending', attempts = 0 WHERE id = :id")
    suspend fun updateMinutesWorked(id: String, minutesWorked: String?)

    @Query("SELECT * FROM outbox_submissions WHERE sectorId = :sectorId AND date >= :startDate AND date <= :endDate AND status != 'failed_permanent' ORDER BY date ASC")
    suspend fun getForSectorBetween(sectorId: String, startDate: String, endDate: String): List<OutboxSubmissionEntity>

    // Convierte registros en minutos (>16 y divisible por 60) a horas
    @Query("""
        UPDATE outbox_submissions
        SET minutesWorked = CAST(CAST(minutesWorked AS INTEGER) / 60 AS TEXT)
        WHERE minutesWorked IS NOT NULL
          AND minutesWorked != 'C'
          AND minutesWorked NOT LIKE '$%'
          AND CAST(minutesWorked AS INTEGER) > 16
          AND CAST(minutesWorked AS INTEGER) % 60 = 0
    """)
    suspend fun migrateMinutesToHours()
}
