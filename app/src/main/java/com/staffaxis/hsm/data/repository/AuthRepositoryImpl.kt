package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.data.remote.api.AuthApiService
import com.staffaxis.hsm.data.remote.api.SectorsApiService
import com.staffaxis.hsm.data.remote.dto.RegisterDeviceRequestDto
import com.staffaxis.hsm.data.remote.dto.RequestAccessRequestDto
import com.staffaxis.hsm.domain.model.AccessRequestResult
import com.staffaxis.hsm.domain.model.AccessStatus
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.Sector
import com.staffaxis.hsm.domain.repository.AuthRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import javax.inject.Inject

class AuthRepositoryImpl @Inject constructor(
    private val api: AuthApiService,
    private val sectorsApi: SectorsApiService,
    private val prefs: AppPreferences
) : AuthRepository {

    override suspend fun fetchPublicSectors(): AppResult<List<Sector>> {
        return try {
            val response = sectorsApi.getSectors()
            if (response.isSuccessful) {
                val sectors = (response.body()?.sectors ?: emptyList())
                    .map { Sector(it.id, it.name, it.tipoCarga ?: "importe", it.encargado) }
                AppResult.Success(sectors)
            } else {
                AppResult.Error("Error ${response.code()}")
            }
        } catch (e: Exception) {
            AppResult.Error("Sin conexión: ${e.message}", e)
        }
    }

    override suspend fun registerDevice(
        deviceId: String,
        sectorId: String,
        encargadoName: String
    ): AppResult<Unit> {
        return try {
            val response = api.registerDevice(
                RegisterDeviceRequestDto(deviceId, sectorId, encargadoName)
            )
            if (response.isSuccessful) {
                val body = response.body()
                val token = body?.token
                if (!token.isNullOrBlank()) {
                    prefs.saveDeviceToken(token, deviceId)
                    AppResult.Success(Unit)
                } else if (body?.pending == true) {
                    AppResult.Error("Registro pendiente de aprobación por el administrador")
                } else {
                    AppResult.Error("Respuesta inválida del servidor")
                }
            } else {
                AppResult.Error("Error al registrar: ${response.code()}")
            }
        } catch (e: Exception) {
            AppResult.Error("Sin conexión: ${e.message}", e)
        }
    }

    override suspend fun getAllowedSectors(): AppResult<List<Sector>> {
        return try {
            val currentSectorId = prefs.activeSectorId.first() ?: return AppResult.Error("Sin sector")

            // Traer todos los sectores públicos (incluyen campo encargado cargado en la BD)
            val response = sectorsApi.getSectors()
            if (!response.isSuccessful) return AppResult.Error("Error ${response.code()}")

            val allSectors = response.body()?.sectors ?: emptyList()
            val esMaestro = prefs.isMasterDevice.first()

            // Dispositivo maestro: ve todos los sectores, sin la restriccion de grupo/encargado.
            if (esMaestro) {
                return AppResult.Success(
                    allSectors.map { Sector(it.id, it.name, it.tipoCarga ?: "importe", it.encargado) }
                        .sortedBy { it.name }
                )
            }

            // Encontrar el sector actual para obtener su encargado
            val currentSector = allSectors.find { it.id == currentSectorId }
            val encargado = currentSector?.encargado?.trim()

            // Si el sector tiene encargado, mostrar todos los sectores de ese mismo encargado
            val sectors = if (!encargado.isNullOrBlank()) {
                allSectors
                    .filter { it.encargado?.trim().equals(encargado, ignoreCase = true) }
                    .map { Sector(it.id, it.name, it.tipoCarga ?: "importe", it.encargado) }
                    .sortedBy { it.name }
            } else {
                // Sin encargado → solo su propio sector
                listOfNotNull(currentSector?.let { Sector(it.id, it.name, it.tipoCarga ?: "importe", it.encargado) })
            }

            AppResult.Success(sectors)
        } catch (e: Exception) {
            AppResult.Error("Sin conexión", e)
        }
    }

    override suspend fun requestAccess(
        deviceId: String, sectorId: String, fullName: String,
        phoneModel: String?, latitude: Double?, longitude: Double?
    ): AppResult<AccessRequestResult> {
        return try {
            val response = api.requestAccess(
                RequestAccessRequestDto(deviceId, sectorId, fullName, phoneModel, latitude, longitude)
            )
            if (!response.isSuccessful) return AppResult.Error("Error ${response.code()}")
            val body = response.body() ?: return AppResult.Error("Respuesta vacía del servidor")
            prefs.saveUserFullName(fullName)
            when (body.status) {
                "authorized" -> {
                    val token = body.token ?: return AppResult.Error("Respuesta inválida del servidor")
                    val isMaster = body.isMaster == true
                    prefs.saveDeviceToken(token, deviceId, isMaster)
                    AppResult.Success(AccessRequestResult.Authorized(token, isMaster))
                }
                "pending" -> {
                    val requestId = body.requestId ?: return AppResult.Error("Respuesta inválida del servidor")
                    AppResult.Success(AccessRequestResult.Pending(requestId))
                }
                else -> AppResult.Error("Respuesta inesperada del servidor")
            }
        } catch (e: Exception) {
            AppResult.Error("Sin conexión: ${e.message}", e)
        }
    }

    override suspend fun checkAccessStatus(requestId: String, deviceId: String): AppResult<AccessStatus> {
        return try {
            val response = api.checkAccessStatus(requestId)
            if (!response.isSuccessful) return AppResult.Error("Error ${response.code()}")
            val body = response.body() ?: return AppResult.Error("Respuesta vacía del servidor")
            when (body.status) {
                "pending" -> AppResult.Success(AccessStatus.Pending)
                "rejected" -> AppResult.Success(AccessStatus.Rejected)
                "authorized" -> {
                    val token = body.token ?: return AppResult.Error("Respuesta inválida del servidor")
                    val isMaster = body.isMaster == true
                    prefs.saveDeviceToken(token, deviceId, isMaster)
                    AppResult.Success(AccessStatus.Authorized(token, isMaster))
                }
                else -> AppResult.Error("Respuesta inesperada del servidor")
            }
        } catch (e: Exception) {
            AppResult.Error("Sin conexión: ${e.message}", e)
        }
    }

    override suspend fun pingDeviceStatus() {
        try {
            val response = api.deviceStatus()
            // Refresca el flag de maestro: se marca a mano en la base despues de que
            // el telefono ya fue autorizado, y sin esto la app nunca se enteraba.
            val isMaster = response.body()?.isMaster
            if (response.isSuccessful && isMaster != null && isMaster != prefs.isMasterDevice.first()) {
                prefs.setMasterDevice(isMaster)
            }
        } catch (_: Exception) {
            // Sin conexion puntual, no pasa nada — se reintenta en el proximo ciclo.
        }
    }

    override fun getDeviceToken(): Flow<String?> = prefs.deviceToken
    override fun getDeviceId(): Flow<String?> = prefs.deviceId
}
