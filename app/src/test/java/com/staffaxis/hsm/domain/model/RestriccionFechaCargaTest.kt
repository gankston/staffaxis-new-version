package com.staffaxis.hsm.domain.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class RestriccionFechaCargaTest {

    private val hoy = LocalDate.of(2026, 8, 27)

    @Test
    fun `hoy es cargable`() {
        assertTrue(esFechaCargable(hoy, hoy))
    }

    @Test
    fun `ayer es cargable`() {
        assertTrue(esFechaCargable(hoy.minusDays(1), hoy))
    }

    @Test
    fun `anteayer ya no es cargable`() {
        assertFalse(esFechaCargable(hoy.minusDays(2), hoy))
    }

    @Test
    fun `una semana atras no es cargable`() {
        assertFalse(esFechaCargable(hoy.minusDays(7), hoy))
    }

    @Test
    fun `manana no es cargable`() {
        assertFalse(esFechaCargable(hoy.plusDays(1), hoy))
    }

    @Test
    fun `el limite de fin de mes no rompe el calculo`() {
        // 1 de septiembre - 1 dia = 31 de agosto, no un 0 de septiembre invalido.
        val primero = LocalDate.of(2026, 9, 1)
        assertTrue(esFechaCargable(LocalDate.of(2026, 8, 31), primero))
        assertFalse(esFechaCargable(LocalDate.of(2026, 8, 30), primero))
    }
}
