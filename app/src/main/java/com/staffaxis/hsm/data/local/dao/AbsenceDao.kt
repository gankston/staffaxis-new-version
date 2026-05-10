package com.staffaxis.hsm.data.local.dao

import androidx.room.*
import com.staffaxis.hsm.data.local.entity.AbsenceEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AbsenceDao {
    @Query("SELECT * FROM absences ORDER BY fechaInicio DESC")
    fun getAll(): Flow<List<AbsenceEntity>>

    @Query("SELECT * FROM absences WHERE employeeId = :employeeId ORDER BY fechaInicio DESC")
    suspend fun getByEmployee(employeeId: String): List<AbsenceEntity>

    @Query("SELECT * FROM absences WHERE syncStatus = 'pending' ORDER BY fechaInicio ASC")
    suspend fun getPending(): List<AbsenceEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(absence: AbsenceEntity)

    @Query("UPDATE absences SET syncStatus = 'synced' WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("UPDATE absences SET syncStatus = 'error', lastError = :error, attempts = attempts + 1 WHERE id = :id")
    suspend fun markError(id: String, error: String)

    @Query("DELETE FROM absences WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM absences WHERE employeeId = :employeeId")
    suspend fun deleteByEmployee(employeeId: String)

    @Query("DELETE FROM absences WHERE rowid NOT IN (SELECT MAX(rowid) FROM absences GROUP BY employeeId)")
    suspend fun removeDuplicates()
}
