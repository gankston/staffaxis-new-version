package com.staffaxis.hsm.data.local.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
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
    version = 4,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun sectorDao(): SectorDao
    abstract fun employeeDao(): EmployeeDao
    abstract fun outboxSubmissionDao(): OutboxSubmissionDao
    abstract fun absenceDao(): AbsenceDao
    abstract fun tarjaStatusDao(): TarjaStatusDao
    abstract fun transferDao(): TransferDao

    companion object {
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE employees ADD COLUMN tieneFotoFrente INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE employees ADD COLUMN tieneFotoDorso INTEGER NOT NULL DEFAULT 0")
            }
        }
    }
}
