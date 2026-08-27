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
    version = 8,
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

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN latitude REAL")
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN longitude REAL")
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN datosExtra TEXT")
            }
        }

        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN horas REAL")
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN cosecha REAL")
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN cajas INTEGER")
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN cajones INTEGER")
                database.execSQL("ALTER TABLE outbox_submissions ADD COLUMN importe REAL")
            }
        }

        // Reemplaza datosExtra (JSON) por columnas propias para cada tipo de carga nuevo.
        // SQLite viejo no soporta DROP COLUMN de forma confiable, asi que se recrea la tabla.
        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE outbox_submissions_new (
                        id TEXT NOT NULL PRIMARY KEY,
                        dedupKey TEXT,
                        employeeId TEXT NOT NULL,
                        sectorId TEXT NOT NULL,
                        date TEXT NOT NULL,
                        minutesWorked TEXT,
                        notes TEXT,
                        createdAt INTEGER NOT NULL,
                        attempts INTEGER NOT NULL,
                        lastError TEXT,
                        status TEXT NOT NULL,
                        latitude REAL,
                        longitude REAL,
                        horas REAL,
                        cosecha REAL,
                        cajas INTEGER,
                        cajones INTEGER,
                        importe REAL,
                        kmViajes REAL,
                        hasFumigadas REAL,
                        siembraTrilla REAL,
                        bolseros REAL,
                        etiquetado REAL,
                        cargaCamionKg50 INTEGER,
                        cargaCamionKg25 INTEGER,
                        cargaCamionOtro TEXT,
                        movimientoEstibaKg50 INTEGER,
                        movimientoEstibaKg25 INTEGER,
                        movimientoEstibaOtro TEXT
                    )
                    """.trimIndent()
                )
                database.execSQL(
                    """
                    INSERT INTO outbox_submissions_new (
                        id, dedupKey, employeeId, sectorId, date, minutesWorked, notes, createdAt,
                        attempts, lastError, status, latitude, longitude, horas, cosecha, cajas, cajones, importe
                    )
                    SELECT id, dedupKey, employeeId, sectorId, date, minutesWorked, notes, createdAt,
                           attempts, lastError, status, latitude, longitude, horas, cosecha, cajas, cajones, importe
                    FROM outbox_submissions
                    """.trimIndent()
                )
                database.execSQL("DROP TABLE outbox_submissions")
                database.execSQL("ALTER TABLE outbox_submissions_new RENAME TO outbox_submissions")
                database.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_outbox_submissions_dedupKey ON outbox_submissions(dedupKey)")
            }
        }
    }
}
