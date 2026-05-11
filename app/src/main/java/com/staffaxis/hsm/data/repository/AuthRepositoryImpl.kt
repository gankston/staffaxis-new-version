package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.data.remote.api.AuthApiService
import com.staffaxis.hsm.data.remote.api.SectorsApiService
import com.staffaxis.hsm.data.remote.dto.RegisterDeviceRequestDto
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

    override fun getDeviceToken(): Flow<String?> = prefs.deviceToken
    override fun getDeviceId(): Flow<String?> = prefs.deviceId
}
