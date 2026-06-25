package com.staffaxis.hsm.data.local.dao

import androidx.room.*
import com.staffaxis.hsm.data.local.entity.EmployeeEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface EmployeeDao {
    @Query("SELECT * FROM employees WHERE sectorId = :sectorId AND activo = 1 ORDER BY apellido ASC, nombre ASC")
    fun getBySector(sectorId: String): Flow<List<EmployeeEntity>>

    @Query("SELECT * FROM employees WHERE sectorId = :sectorId AND activo = 1 ORDER BY apellido ASC, nombre ASC")
    suspend fun getBySectorOnce(sectorId: String): List<EmployeeEntity>

    @Query("SELECT * FROM employees WHERE id = :id")
    suspend fun getById(id: String): EmployeeEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(employees: List<EmployeeEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(employee: EmployeeEntity)

    @Query("UPDATE employees SET activo = :activo WHERE id = :id")
    suspend fun updateActivo(id: String, activo: Boolean)

    @Query("UPDATE employees SET nombre = :nombre, dni = :dni, observacion = :observacion WHERE id = :id")
    suspend fun updateNombreObservacion(id: String, nombre: String, dni: String?, observacion: String?)

    @Query("SELECT * FROM employees WHERE dni = :dni AND sectorId = :sectorId LIMIT 1")
    suspend fun getByDniAndSector(dni: String, sectorId: String): EmployeeEntity?

    @Query("SELECT * FROM employees WHERE dni = :dni LIMIT 1")
    suspend fun getByDni(dni: String): EmployeeEntity?

    @Query("DELETE FROM employees WHERE sectorId = :sectorId")
    suspend fun deleteBySector(sectorId: String)

    @Query("UPDATE employees SET tieneFotoFrente = :tiene WHERE id = :id")
    suspend fun updateFotoFrente(id: String, tiene: Boolean)

    @Query("UPDATE employees SET tieneFotoDorso = :tiene WHERE id = :id")
    suspend fun updateFotoDorso(id: String, tiene: Boolean)
}
