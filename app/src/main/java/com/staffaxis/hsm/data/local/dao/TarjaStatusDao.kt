package com.staffaxis.hsm.data.local.dao

import androidx.room.*
import com.staffaxis.hsm.data.local.entity.TarjaStatusEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TarjaStatusDao {
    @Query("SELECT * FROM tarja_status WHERE date = :date AND sectorId = :sectorId LIMIT 1")
    fun getForDate(date: String, sectorId: String): Flow<TarjaStatusEntity?>

    @Query("SELECT * FROM tarja_status WHERE date = :date AND sectorId = :sectorId LIMIT 1")
    suspend fun getForDateOnce(date: String, sectorId: String): TarjaStatusEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(status: TarjaStatusEntity)
}
