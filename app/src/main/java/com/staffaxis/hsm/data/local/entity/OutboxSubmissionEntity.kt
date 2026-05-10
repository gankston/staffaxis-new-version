package com.staffaxis.hsm.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "outbox_submissions",
    indices = [Index(value = ["dedupKey"], unique = true)]
)
data class OutboxSubmissionEntity(
    @PrimaryKey val id: String,
    val dedupKey: String?,
    val employeeId: String,
    val sectorId: String,
    val date: String,
    val minutesWorked: String?,
    val notes: String?,
    val createdAt: Long,
    val attempts: Int = 0,
    val lastError: String? = null,
    val status: String = STATUS_PENDING
) {
    companion object {
        const val STATUS_PENDING = "pending"
        const val STATUS_SENT = "sent"
        const val STATUS_FAILED = "failed_permanent"
    }
}
