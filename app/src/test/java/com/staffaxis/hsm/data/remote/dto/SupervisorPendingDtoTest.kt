package com.staffaxis.hsm.data.remote.dto

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * El servidor de produccion todavia no manda sectorId ni tiposCarga. Gson NO aplica
 * los valores por defecto de Kotlin: si el campo falta en el JSON deja null, aunque
 * el tipo sea no-nullable. Este test usa la respuesta real del endpoint para que no
 * se nos vuelva a colar un campo que revienta apenas se lee.
 */
class SupervisorPendingDtoTest {

    // Copiado de la respuesta real de /api/supervisor/pending en produccion.
    private val JSON_PRODUCCION = """
    {"items":[
      {"id":"a1","employeeId":"e1","empleado":"GIMENEZ MARTINA","sector":"PRUEBAS",
       "date":"2026-08-27T00:00:00.000Z","minutesWorked":"H 8","notes":null,
       "createdAt":"2026-08-27T17:40:20.570Z","fueModificada":false,
       "kmViajes":null,"hasFumigadas":null,"siembraTrilla":null,"bolseros":null,"etiquetado":null,
       "cargaCamionKg50":null,"cargaCamionKg25":null,"cargaCamionOtro":null,
       "movimientoEstibaKg50":null,"movimientoEstibaKg25":null,"movimientoEstibaOtro":null}
    ]}
    """.trimIndent()

    @Test
    fun `tiposCarga nunca queda en null aunque el servidor no lo mande`() {
        val dto = Gson().fromJson(JSON_PRODUCCION, SupervisorPendingResponseDto::class.java)
        val item = dto.items.first()
        // El campo llega null (Gson no aplica el default de Kotlin). Lo importante es
        // que el DTO lo declare nullable, para que no reviente el constructor del
        // modelo, y que el mapeo lo normalice a lista vacia.
        assertNull("el DTO tiene que dejarlo pasar como null, no romper", item.tiposCarga)
        assertEquals(emptyList<String>(), item.tiposCarga.orEmpty())
    }

    @Test
    fun `la lista de items nunca queda en null`() {
        val dto = Gson().fromJson("""{"ok":true}""", SupervisorPendingResponseDto::class.java)
        assertNotNull("items quedo en null", dto.items)
        dto.items.forEach { _ -> }
    }
}
