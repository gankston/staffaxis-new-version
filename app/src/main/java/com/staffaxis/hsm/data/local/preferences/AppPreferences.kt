package com.staffaxis.hsm.data.local.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "staffaxis_prefs")

@Singleton
class AppPreferences @Inject constructor(@ApplicationContext private val context: Context) {

    companion object {
        private val KEY_DEVICE_TOKEN = stringPreferencesKey("device_token")
        private val KEY_DEVICE_ID = stringPreferencesKey("device_id")
        private val KEY_ACTIVE_SECTOR_ID = stringPreferencesKey("active_sector_id")
        private val KEY_ACTIVE_SECTOR_NAME = stringPreferencesKey("active_sector_name")
        private val KEY_ACTIVE_SECTOR_TIPO = stringPreferencesKey("active_sector_tipo")
        private val KEY_ACTIVE_SECTOR_TIPOS = stringPreferencesKey("active_sector_tipos")
        private val KEY_ACTIVE_SECTOR_ENCARGADO = stringPreferencesKey("active_sector_encargado")
        private val KEY_LAST_SYNC_EPOCH = longPreferencesKey("last_sync_epoch")
        private val KEY_LAST_SYNC_ID = stringPreferencesKey("last_sync_id")
        private val KEY_IS_MASTER = booleanPreferencesKey("is_master_device")
        private val KEY_FULL_NAME = stringPreferencesKey("user_full_name")
        private val KEY_LAST_SEEN_VERSION_CODE = intPreferencesKey("last_seen_version_code")
        // Modo supervisor: token/identidad separados del dispositivo normal — un mismo
        // telefono podria en teoria tener las dos sesiones activas a la vez.
        private val KEY_SUPERVISOR_TOKEN = stringPreferencesKey("supervisor_token")
        private val KEY_SUPERVISOR_ID = stringPreferencesKey("supervisor_id")
        private val KEY_SUPERVISOR_NAME = stringPreferencesKey("supervisor_name")
    }

    val deviceToken: Flow<String?> = context.dataStore.data.map { it[KEY_DEVICE_TOKEN] }
    val deviceId: Flow<String?> = context.dataStore.data.map { it[KEY_DEVICE_ID] }
    val isMasterDevice: Flow<Boolean> = context.dataStore.data.map { it[KEY_IS_MASTER] ?: false }
    // Nombre con el que se pidio la autorizacion — se reusa al cambiar de sector
    // para no pisar la identidad del dispositivo con el encargado del sector nuevo.
    val userFullName: Flow<String?> = context.dataStore.data.map { it[KEY_FULL_NAME] }
    val activeSectorId: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_ID] }
    val activeSectorName: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_NAME] }
    val activeSectorTipo: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_TIPO] }
    val activeSectorTipos: Flow<List<String>> = context.dataStore.data.map {
        it[KEY_ACTIVE_SECTOR_TIPOS]?.split(",")?.filter { t -> t.isNotBlank() } ?: emptyList()
    }
    val activeSectorEncargado: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_ENCARGADO] }
    val supervisorToken: Flow<String?> = context.dataStore.data.map { it[KEY_SUPERVISOR_TOKEN] }
    val supervisorId: Flow<String?> = context.dataStore.data.map { it[KEY_SUPERVISOR_ID] }
    val supervisorName: Flow<String?> = context.dataStore.data.map { it[KEY_SUPERVISOR_NAME] }

    suspend fun saveSupervisorToken(token: String, supervisorId: String, fullName: String) {
        context.dataStore.edit {
            it[KEY_SUPERVISOR_TOKEN] = token
            it[KEY_SUPERVISOR_ID] = supervisorId
            it[KEY_SUPERVISOR_NAME] = fullName
        }
    }

    suspend fun clearSupervisorSession() {
        context.dataStore.edit {
            it.remove(KEY_SUPERVISOR_TOKEN)
            it.remove(KEY_SUPERVISOR_ID)
            it.remove(KEY_SUPERVISOR_NAME)
        }
    }

    suspend fun saveDeviceToken(token: String, deviceId: String, isMaster: Boolean = false) {
        context.dataStore.edit {
            it[KEY_DEVICE_TOKEN] = token
            it[KEY_DEVICE_ID] = deviceId
            it[KEY_IS_MASTER] = isMaster
        }
    }

    // Sesion forzada a re-autenticarse tras una actualizacion de la app, SIN perder
    // el historial local de tarjas (Room queda intacto, solo se borra token+sector).
    suspend fun clearSessionKeepingLocalData() {
        context.dataStore.edit {
            it.remove(KEY_DEVICE_TOKEN)
            it.remove(KEY_ACTIVE_SECTOR_ID)
            it.remove(KEY_ACTIVE_SECTOR_NAME)
            it.remove(KEY_ACTIVE_SECTOR_TIPO)
            it.remove(KEY_ACTIVE_SECTOR_TIPOS)
            it.remove(KEY_ACTIVE_SECTOR_ENCARGADO)
            it.remove(KEY_IS_MASTER)
            // KEY_DEVICE_ID se mantiene a proposito: es el mismo Settings.Secure.ANDROID_ID
            // de siempre, asi que si este telefono ya era "maestro" en el servidor, el
            // proximo pedido de acceso lo va a reconocer igual sin volver a marcarlo.
        }
    }

    // El flag de maestro se marca a mano en la base despues de la autorizacion,
    // asi que tiene que poder actualizarse solo (lo refresca el heartbeat).
    suspend fun setMasterDevice(isMaster: Boolean) {
        context.dataStore.edit { it[KEY_IS_MASTER] = isMaster }
    }

    suspend fun saveUserFullName(fullName: String) {
        context.dataStore.edit { it[KEY_FULL_NAME] = fullName }
    }

    suspend fun getLastSeenVersionCode(): Int =
        context.dataStore.data.map { it[KEY_LAST_SEEN_VERSION_CODE] ?: 0 }.first()

    suspend fun setLastSeenVersionCode(code: Int) {
        context.dataStore.edit { it[KEY_LAST_SEEN_VERSION_CODE] = code }
    }

    suspend fun saveActiveSector(id: String, name: String, tipoCarga: String, encargado: String? = null, tiposCarga: List<String> = emptyList()) {
        context.dataStore.edit {
            it[KEY_ACTIVE_SECTOR_ID] = id
            it[KEY_ACTIVE_SECTOR_NAME] = name
            it[KEY_ACTIVE_SECTOR_TIPO] = tipoCarga
            it[KEY_ACTIVE_SECTOR_TIPOS] = tiposCarga.joinToString(",")
            if (encargado != null) it[KEY_ACTIVE_SECTOR_ENCARGADO] = encargado
        }
    }

    suspend fun saveSyncState(epoch: Long, lastId: String?) {
        context.dataStore.edit {
            it[KEY_LAST_SYNC_EPOCH] = epoch
            if (lastId != null) it[KEY_LAST_SYNC_ID] = lastId
        }
    }

    suspend fun getSyncEpoch(): Long =
        context.dataStore.data.map { it[KEY_LAST_SYNC_EPOCH] ?: 0L }.let {
            var value = 0L
            it.collect { v -> value = v; return@collect }
            value
        }

    suspend fun clearActiveSector() {
        context.dataStore.edit {
            it.remove(KEY_ACTIVE_SECTOR_ID)
            it.remove(KEY_ACTIVE_SECTOR_NAME)
            it.remove(KEY_ACTIVE_SECTOR_TIPO)
            it.remove(KEY_ACTIVE_SECTOR_TIPOS)
            it.remove(KEY_ACTIVE_SECTOR_ENCARGADO)
        }
    }

    suspend fun clearAll() { context.dataStore.edit { it.clear() } }
}
