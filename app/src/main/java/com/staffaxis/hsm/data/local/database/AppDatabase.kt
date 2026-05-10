package com.staffaxis.hsm.data.local.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.staffaxis.hsm.data.local.dao.*
import com.staffaxis.hsm.data.local.entity.*

@Database(
    entities = [
        SectorEntity::class,
        EmployeeEntity::class,
        OutboxSubmissionEntity::class,
        AbsenceEntity::class,
        TarjaStatusEntity::class,
        TransferEntity::class
    ],
    version = 2,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun sectorDao(): SectorDao
    abstract fun employeeDao(): EmployeeDao
    abstract fun outboxSubmissionDao(): OutboxSubmissionDao
    abstract fun absenceDao(): AbsenceDao
    abstract fun tarjaStatusDao(): TarjaStatusDao
    abstract fun transferDao(): TransferDao
}
