package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.dao.EmployeeDao
import com.staffaxis.hsm.data.local.dao.TransferDao
import com.staffaxis.hsm.data.local.entity.EmployeeEntity
import com.staffaxis.hsm.data.local.entity.TransferEntity
import com.staffaxis.hsm.data.remote.api.EmployeeApiService
import com.staffaxis.hsm.data.remote.dto.CreateEmployeeRequestDto
import com.staffaxis.hsm.data.remote.dto.UpdateEmployeeRequestDto
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.Employee
import com.staffaxis.hsm.domain.model.EmployeeTransfer
import com.staffaxis.hsm.domain.repository.EmployeeRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID
import javax.inject.Inject

class EmployeeRepositoryImpl @Inject constructor(
    private val dao: EmployeeDao,
    private val transferDao: TransferDao,
    private val api: EmployeeApiService
) : EmployeeRepository {

    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    override fun getEmployeesForSector(sectorId: String): Flow<List<Employee>> =
        dao.getBySector(sectorId).map { list -> list.map { it.toDomain() } }

    override suspend fun syncEmployeesFromApi(sectorId: String, sectorName: String): AppResult<List<Employee>> {
        return try {
            val response = api.getEmployees(sectorId)
            if (response.isSuccessful) {
                val employees = response.body()?.employees ?: emptyList()
                val entities = employees.map {
                    EmployeeEntity(
                        id = it.id,
                        nombre = "${it.firstName} ${it.lastName}".trim(),
                        apellido = it.lastName.trim(),
                        dni = it.dni,
                        sectorId = it.sectorId,
                        sectorName = sectorName,
                        activo = it.isActive,
                        observacion = null,
                        fechaIngreso = ""
                    )
                }
                dao.deleteBySector(sectorId)
                dao.insertAll(entities)
                AppResult.Success(entities.map { it.toDomain() })
            } else {
                AppResult.Error("Error ${response.code()}")
            }
        } catch (e: Exception) {
            AppResult.Error("Sin conexión", e)
        }
    }

    override suspend fun createEmployee(nombre: String, dni: String, sectorId: String, sectorName: String, forceTransfer: Boolean): AppResult<Employee> {
        // Solo chequeamos localmente si el empleado ya está en ESTE sector
        if (!forceTransfer && dni.isNotBlank()) {
            if (dao.getByDniAndSector(dni, sectorId) != null) {
                return AppResult.Error("EXISTS_SAME_SECTOR")
            }
        }

        // Si es transferencia, buscamos el sector de origen antes de la llamada a la API
        val fromSectorEntity = if (forceTransfer && dni.isNotBlank()) dao.getByDni(dni) else null

        return try {
            val nameParts = nombre.trim().split(" ", limit = 2)
            val firstName = nameParts[0]
            val lastName = nameParts.getOrElse(1) { "." }.ifBlank { "." }
            val response = api.createEmployee(
                CreateEmployeeRequestDto(firstName, lastName, dni.ifBlank { null }, sectorId, forceTransfer)
            )
            when {
                response.isSuccessful -> {
                    val dto = response.body()!!
                    val entity = EmployeeEntity(
                        id = dto.id,
                        nombre = "${dto.firstName} ${dto.lastName}".trim(),
                        apellido = dto.lastName.trim(),
                        dni = dto.dni,
                        sectorId = dto.sectorId,
                        sectorName = sectorName,
                        activo = dto.isActive,
                        observacion = null,
                        fechaIngreso = ""
                    )
                    dao.insert(entity)
                    if (forceTransfer) {
                        transferDao.insert(
                            TransferEntity(
                                id = UUID.randomUUID().toString(),
                                employeeId = entity.id,
                                employeeName = entity.nombre,
                                fromSectorId = fromSectorEntity?.sectorId ?: "",
                                fromSectorName = fromSectorEntity?.sectorName?.ifBlank { "Sector anterior" } ?: "Sector anterior",
                                toSectorId = sectorId,
                                toSectorName = sectorName,
                                date = LocalDate.now().format(dateFormatter)
                            )
                        )
                    }
                    AppResult.Success(entity.toDomain())
                }
                response.code() == 409 || response.code() == 422 -> AppResult.Error("EXISTS_OTHER_SECTOR")
                else -> AppResult.Error("Error ${response.code()}")
            }
        } catch (e: Exception) {
            AppResult.Error("Sin conexión", e)
        }
    }

    override fun getTransfersForDate(sectorId: String, date: String): Flow<List<EmployeeTransfer>> =
        transferDao.getForSectorAndDate(sectorId, date).map { list ->
            list.map { EmployeeTransfer(it.employeeName, it.fromSectorName, it.toSectorName) }
        }

    override suspend fun hideEmployee(id: String): AppResult<Unit> {
        return try {
            api.updateEmployee(id, UpdateEmployeeRequestDto(isActive = false))
            dao.updateActivo(id, false)
            AppResult.Success(Unit)
        } catch (e: Exception) {
            dao.updateActivo(id, false)
            AppResult.Success(Unit)
        }
    }

    override suspend fun updateEmployee(id: String, nombre: String, dni: String?, observacion: String?): AppResult<Unit> {
        return try {
            val nameParts = nombre.trim().split(" ", limit = 2)
            val firstName = nameParts[0]
            val lastName = nameParts.getOrElse(1) { null }
            api.updateEmployee(id, UpdateEmployeeRequestDto(firstName = firstName, lastName = lastName, dni = dni?.ifBlank { null }))
            dao.updateNombreObservacion(id, nombre, dni?.ifBlank { null }, observacion)
            AppResult.Success(Unit)
        } catch (e: Exception) {
            dao.updateNombreObservacion(id, nombre, dni?.ifBlank { null }, observacion)
            AppResult.Success(Unit)
        }
    }

    private fun EmployeeEntity.toDomain() = Employee(id, nombre, apellido, dni, sectorId, sectorName, activo, observacion, fechaIngreso)
}
