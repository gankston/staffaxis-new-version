package com.staffaxis.hsm.data.repository

import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.data.remote.api.SupervisorApiService
import com.staffaxis.hsm.data.remote.dto.RequestAccessSupervisorRequestDto
import com.staffaxis.hsm.data.remote.dto.SupervisorApproveRejectRequestDto
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.SupervisorAccessResult
import com.staffaxis.hsm.domain.model.SupervisorAccessStatus
import com.staffaxis.hsm.domain.model.SupervisorInfo
import com.staffaxis.hsm.domain.model.SupervisorMe
import com.staffaxis.hsm.domain.model.SupervisorPendingItem
import com.staffaxis.hsm.domain.model.SupervisorResumenRow
import com.staffaxis.hsm.domain.model.SupervisorSector
import com.staffaxis.hsm.domain.model.TiposCargaNuevos
import com.staffaxis.hsm.domain.repository.SupervisorRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class SupervisorRepositoryImpl @Inject constructor(
    private val api: SupervisorApiService,
    private val prefs: AppPreferences
) : SupervisorRepository {

    override fun isSupervisorLoggedIn(): Flow<Boolean> = prefs.supervisorToken.map { it != null }
    override fun supervisorName(): Flow<String?> = prefs.supervisorName

    override suspend fun listSupervisors(): AppResult<List<SupervisorInfo>> = try {
        val r = api.listSupervisors()
        if (!r.isSuccessful) AppResult.Error("Error ${r.code()}")
        else AppResult.Success(r.body()?.supervisors?.map { SupervisorInfo(it.id, it.fullName) } ?: emptyList())
    } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }

    override suspend fun requestAccess(
        deviceId: String, supervisorId: String,
        phoneModel: String?, latitude: Double?, longitude: Double?
    ): AppResult<SupervisorAccessResult> {
        return try {
            val r = api.requestAccess(RequestAccessSupervisorRequestDto(deviceId, supervisorId, phoneModel, latitude, longitude))
            if (!r.isSuccessful) return AppResult.Error("Error ${r.code()}")
            val body = r.body() ?: return AppResult.Error("Respuesta vacía del servidor")
            when (body.status) {
                "authorized" -> {
                    val token = body.token ?: return AppResult.Error("Respuesta inválida del servidor")
                    val nombre = listSupervisors().let { res -> (res as? AppResult.Success)?.data?.find { it.id == supervisorId }?.fullName } ?: ""
                    prefs.saveSupervisorToken(token, supervisorId, nombre)
                    AppResult.Success(SupervisorAccessResult.Authorized(token))
                }
                "pending" -> {
                    val requestId = body.requestId ?: return AppResult.Error("Respuesta inválida del servidor")
                    AppResult.Success(SupervisorAccessResult.Pending(requestId))
                }
                else -> AppResult.Error("Respuesta inesperada del servidor")
            }
        } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }
    }

    override suspend fun checkAccessStatus(requestId: String, supervisorId: String, fullName: String): AppResult<SupervisorAccessStatus> {
        return try {
            val r = api.checkAccessStatus(requestId)
            if (!r.isSuccessful) return AppResult.Error("Error ${r.code()}")
            val body = r.body() ?: return AppResult.Error("Respuesta vacía del servidor")
            when (body.status) {
                "pending" -> AppResult.Success(SupervisorAccessStatus.Pending)
                "rejected" -> AppResult.Success(SupervisorAccessStatus.Rejected)
                "authorized" -> {
                    val token = body.token ?: return AppResult.Error("Respuesta inválida del servidor")
                    // Antes no se guardaba el token en esta rama y quedaba vacio hasta cerrar
                    // y volver a abrir la app (recien ahi requestAccess lo guardaba, al reintentar).
                    prefs.saveSupervisorToken(token, supervisorId, fullName)
                    AppResult.Success(SupervisorAccessStatus.Authorized(token))
                }
                else -> AppResult.Error("Respuesta inesperada del servidor")
            }
        } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }
    }

    override suspend fun me(): AppResult<SupervisorMe> {
        return try {
            val r = api.me()
            if (!r.isSuccessful) return AppResult.Error("Error ${r.code()}")
            val b = r.body() ?: return AppResult.Error("Respuesta vacía del servidor")
            AppResult.Success(SupervisorMe(b.id, b.fullName, b.sectores.map { SupervisorSector(it.id, it.name) }))
        } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }
    }

    override suspend fun pending(): AppResult<List<SupervisorPendingItem>> {
        return try {
            val r = api.pending()
            if (!r.isSuccessful) return AppResult.Error("Error ${r.code()}")
            AppResult.Success(r.body()?.items?.map {
                SupervisorPendingItem(
                    // La fecha llega como "2026-08-25T03:00:00.000Z" — se corta aca para
                    // que el filtro por dia y lo que se muestra usen siempre "2026-08-25".
                    it.id, it.employeeId, it.empleado, it.sector, it.date.take(10), it.minutesWorked, it.notes,
                    TiposCargaNuevos(
                        kmViajes = it.kmViajes, hasFumigadas = it.hasFumigadas, siembraTrilla = it.siembraTrilla,
                        bolseros = it.bolseros, etiquetado = it.etiquetado,
                        cargaCamionKg50 = it.cargaCamionKg50, cargaCamionKg25 = it.cargaCamionKg25, cargaCamionOtro = it.cargaCamionOtro,
                        movimientoEstibaKg50 = it.movimientoEstibaKg50, movimientoEstibaKg25 = it.movimientoEstibaKg25, movimientoEstibaOtro = it.movimientoEstibaOtro
                    ),
                    fueModificada = it.fueModificada
                )
            } ?: emptyList())
        } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }
    }

    override suspend fun approve(submissionIds: List<String>): AppResult<Int> = try {
        val r = api.approve(SupervisorApproveRejectRequestDto(submissionIds))
        if (!r.isSuccessful) AppResult.Error("Error ${r.code()}")
        else AppResult.Success(r.body()?.aprobadas ?: 0)
    } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }

    override suspend fun reject(submissionIds: List<String>, motivo: String?): AppResult<Int> = try {
        val r = api.reject(SupervisorApproveRejectRequestDto(submissionIds, motivo))
        if (!r.isSuccessful) AppResult.Error("Error ${r.code()}")
        else AppResult.Success(r.body()?.rechazadas ?: 0)
    } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }

    override suspend fun resumen(fechaDesde: String, fechaHasta: String): AppResult<List<SupervisorResumenRow>> {
        return try {
            val r = api.resumen(fechaDesde, fechaHasta)
            if (!r.isSuccessful) return AppResult.Error("Error ${r.code()}")
            AppResult.Success(r.body()?.rows?.map {
                SupervisorResumenRow(
                    submissionId = it.submissionId, employeeId = it.employeeId,
                    nombre = "${it.lastName} ${it.firstName}".trim(), sectorName = it.sectorName,
                    date = it.date.take(10), minutesWorked = it.minutesWorked, status = it.status,
                    tiposNuevos = TiposCargaNuevos(
                        kmViajes = it.kmViajes, hasFumigadas = it.hasFumigadas, siembraTrilla = it.siembraTrilla,
                        bolseros = it.bolseros, etiquetado = it.etiquetado,
                        cargaCamionKg50 = it.cargaCamionKg50, cargaCamionKg25 = it.cargaCamionKg25, cargaCamionOtro = it.cargaCamionOtro,
                        movimientoEstibaKg50 = it.movimientoEstibaKg50, movimientoEstibaKg25 = it.movimientoEstibaKg25, movimientoEstibaOtro = it.movimientoEstibaOtro
                    )
                )
            } ?: emptyList())
        } catch (e: Exception) { AppResult.Error("Sin conexión: ${e.message}", e) }
    }

    override suspend fun cerrarSesion() = prefs.clearSupervisorSession()
}
