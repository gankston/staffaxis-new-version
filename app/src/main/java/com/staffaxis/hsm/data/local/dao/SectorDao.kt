package com.staffaxis.hsm.data.local.dao

import androidx.room.*
import com.staffaxis.hsm.data.local.entity.SectorEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SectorDao {
    @Query("SELECT * FROM sectors") fun getAll(): Flow<List<SectorEntity>>
    @Query("SELECT * FROM sectors WHERE id = :id") suspend fun getById(id: String): SectorEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(sectors: List<SectorEntity>)
    @Query("DELETE FROM sectors") suspend fun deleteAll()
}
