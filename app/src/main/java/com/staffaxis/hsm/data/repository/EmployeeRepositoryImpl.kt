package com.staffaxis.hsm.data.repository

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
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
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID
import javax.inject.Inject

class EmployeeRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
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
                        fechaIngreso = "",
                        tieneFotoFrente = it.tieneFotoFrente,
                        tieneFotoDorso = it.tieneFotoDorso,
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

    override suspend fun createEmployee(firstName: String, lastName: String, dni: String, sectorId: String, sectorName: String, forceTransfer: Boolean): AppResult<Employee> {
        if (!forceTransfer && dni.isNotBlank()) {
            val existing = dao.getByDniAndSector(dni, sectorId)
            if (existing != null) {
                return if (!existing.activo) {
                    AppResult.Error("EXISTS_INACTIVE:${existing.id}:${existing.nombre}")
                } else {
                    AppResult.Error("EXISTS_SAME_SECTOR")
                }
            }
        }

        val fromSectorEntity = if (forceTransfer && dni.isNotBlank()) dao.getByDni(dni) else null

        return try {
            val firstNameClean = firstName.trim()
            val lastNameClean = lastName.trim().ifBlank { "." }
            val response = api.createEmployee(
                CreateEmployeeRequestDto(firstNameClean, lastNameClean, dni.ifBlank { null }, sectorId, forceTransfer)
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
                        fechaIngreso = "",
                        tieneFotoFrente = dto.tieneFotoFrente,
                        tieneFotoDorso = dto.tieneFotoDorso,
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

    override suspend fun reactivateEmployee(id: String): AppResult<Unit> {
        return try {
            api.updateEmployee(id, UpdateEmployeeRequestDto(isActive = true))
            dao.updateActivo(id, true)
            AppResult.Success(Unit)
        } catch (e: Exception) {
            dao.updateActivo(id, true)
            AppResult.Success(Unit)
        }
    }

    override suspend fun updateEmployee(id: String, firstName: String, lastName: String, dni: String?, observacion: String?): AppResult<Unit> {
        val nombreCompleto = if (lastName.isBlank()) firstName.trim() else "${firstName.trim()} ${lastName.trim()}"
        return try {
            api.updateEmployee(id, UpdateEmployeeRequestDto(firstName = firstName.trim(), lastName = lastName.trim().ifBlank { null }, dni = dni?.ifBlank { null }))
            dao.updateNombreObservacion(id, nombreCompleto, dni?.ifBlank { null }, observacion)
            AppResult.Success(Unit)
        } catch (e: Exception) {
            dao.updateNombreObservacion(id, nombreCompleto, dni?.ifBlank { null }, observacion)
            AppResult.Success(Unit)
        }
    }

    override suspend fun uploadFoto(employeeId: String, lado: String, uri: Uri): AppResult<Unit> {
        return try {
            val inputStream = context.contentResolver.openInputStream(uri)
                ?: return AppResult.Error("No se pudo leer la imagen")
            val originalBytes = inputStream.use { it.readBytes() }

            // Comprimir antes de subir
            val bitmap = android.graphics.BitmapFactory.decodeByteArray(originalBytes, 0, originalBytes.size)
                ?: return AppResult.Error("Imagen inválida")
            val out = java.io.ByteArrayOutputStream()
            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, out)
            bitmap.recycle()
            val bytes = out.toByteArray()

            val requestBody = bytes.toRequestBody("image/jpeg".toMediaType())
            val part = MultipartBody.Part.createFormData("foto", "${employeeId}_${lado}.jpg", requestBody)

            val response = api.uploadFoto(employeeId, lado, part)
            if (response.isSuccessful) {
                if (lado == "frente") dao.updateFotoFrente(employeeId, true)
                else dao.updateFotoDorso(employeeId, true)
                AppResult.Success(Unit)
            } else {
                AppResult.Error("Error ${response.code()}")
            }
        } catch (e: Exception) {
            AppResult.Error("Error al subir la foto", e)
        }
    }

    override suspend fun deleteFoto(employeeId: String, lado: String): AppResult<Unit> {
        return try {
            val response = api.deleteFoto(employeeId, lado)
            if (response.isSuccessful) {
                if (lado == "frente") dao.updateFotoFrente(employeeId, false)
                else dao.updateFotoDorso(employeeId, false)
                AppResult.Success(Unit)
            } else {
                AppResult.Error("Error ${response.code()}")
            }
        } catch (e: Exception) {
            AppResult.Error("Error al eliminar la foto", e)
        }
    }

    override suspend fun getFotoBytes(employeeId: String, lado: String): AppResult<ByteArray> {
        return try {
            val response = api.getFoto(employeeId, lado)
            if (response.isSuccessful) {
                val bytes = response.body()?.bytes() ?: return AppResult.Error("Respuesta vacía")
                AppResult.Success(bytes)
            } else {
                AppResult.Error("Error ${response.code()}")
            }
        } catch (e: Exception) {
            AppResult.Error("Error al obtener la foto", e)
        }
    }

    private fun EmployeeEntity.toDomain() = Employee(
        id, nombre, apellido, dni, sectorId, sectorName, activo, observacion, fechaIngreso,
        tieneFotoFrente, tieneFotoDorso
    )
}
