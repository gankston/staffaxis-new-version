package com.staffaxis.hsm.data.local

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

// Puente entre el interceptor de red (que ve las respuestas 403 "revocado") y la
// UI (que tiene que cortar la sesion y volver a bienvenida "en caliente", sin
// esperar a que el usuario reinicie la app).
@Singleton
class SessionEvents @Inject constructor() {
    private val _forceLogout = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val forceLogout: SharedFlow<Unit> = _forceLogout.asSharedFlow()

    fun notifyRevoked() {
        _forceLogout.tryEmit(Unit)
    }
}
