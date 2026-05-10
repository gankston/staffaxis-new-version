package com.staffaxis.hsm.data.local.dao

import androidx.room.*
import com.staffaxis.hsm.data.local.entity.TransferEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TransferDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transfer: TransferEntity)

    @Query("SELECT * FROM employee_transfers WHERE (fromSectorId = :sectorId OR toSectorId = :sectorId) AND date = :date ORDER BY employeeName ASC")
    fun getForSectorAndDate(sectorId: String, date: String): Flow<List<TransferEntity>>
}
