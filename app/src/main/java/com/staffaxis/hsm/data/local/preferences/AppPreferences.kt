package com.staffaxis.hsm.data.local.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
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
        private val KEY_ACTIVE_SECTOR_ENCARGADO = stringPreferencesKey("active_sector_encargado")
        private val KEY_LAST_SYNC_EPOCH = longPreferencesKey("last_sync_epoch")
        private val KEY_LAST_SYNC_ID = stringPreferencesKey("last_sync_id")
    }

    val deviceToken: Flow<String?> = context.dataStore.data.map { it[KEY_DEVICE_TOKEN] }
    val deviceId: Flow<String?> = context.dataStore.data.map { it[KEY_DEVICE_ID] }
    val activeSectorId: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_ID] }
    val activeSectorName: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_NAME] }
    val activeSectorTipo: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_TIPO] }
    val activeSectorEncargado: Flow<String?> = context.dataStore.data.map { it[KEY_ACTIVE_SECTOR_ENCARGADO] }

    suspend fun saveDeviceToken(token: String, deviceId: String) {
        context.dataStore.edit {
            it[KEY_DEVICE_TOKEN] = token
            it[KEY_DEVICE_ID] = deviceId
        }
    }

    suspend fun saveActiveSector(id: String, name: String, tipoCarga: String, encargado: String? = null) {
        context.dataStore.edit {
            it[KEY_ACTIVE_SECTOR_ID] = id
            it[KEY_ACTIVE_SECTOR_NAME] = name
            it[KEY_ACTIVE_SECTOR_TIPO] = tipoCarga
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
            it.remove(KEY_ACTIVE_SECTOR_ENCARGADO)
        }
    }

    suspend fun clearAll() { context.dataStore.edit { it.clear() } }
}
