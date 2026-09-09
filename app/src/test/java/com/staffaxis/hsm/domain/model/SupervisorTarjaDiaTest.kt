package com.staffaxis.hsm.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Los casos de este test salieron de consultar los formatos reales que hay
 * guardados en produccion, no de inventarlos: en la base conviven el formato
 * viejo ("0", "$0", "C"), el nuevo ("H 8|C:50|Cajas 15"), la coma y el punto
 * como separador decimal, y abonadas que son texto y no importes.
 */
class SupervisorTarjaDiaTest {

    // ── Horas ────────────────────────────────────────────────────────────────

    @Test
    fun `horas con prefijo nuevo`() {
        assertEquals(8f, parseHoras("H 8"), 0.001f)
        assertEquals(13f, parseHoras("H 13|AB:limpieza"), 0.001f)
        assertEquals(0f, parseHoras("H 0|C:100"), 0.001f)
    }

    @Test
    fun `horas en formato viejo sin prefijo`() {
        assertEquals(0f, parseHoras("0"), 0.001f)
        assertEquals(8f, parseHoras("8"), 0.001f)
        assertEquals(0f, parseHoras("0|C:100"), 0.001f)
    }

    @Test
    fun `lo que no es un numero de horas no rompe ni suma`() {
        assertEquals(0f, parseHoras("C"), 0.001f)
        assertEquals(0f, parseHoras("$0"), 0.001f)
        assertEquals(0f, parseHoras(null), 0.001f)
        assertEquals(0f, parseHoras(""), 0.001f)
    }

    // ── Cosecha, cajas y cajones ─────────────────────────────────────────────

    @Test
    fun `cosecha acepta punto y el punto colgado que quedo en la base`() {
        assertEquals(100f, parseCosecha("H 0|C:100"), 0.001f)
        assertEquals(122f, parseCosecha("H 8|C:122."), 0.001f)
        assertEquals(0f, parseCosecha("H 8|Cajas 20"), 0.001f)
    }

    @Test
    fun `cajas y cajones con decimales`() {
        val mw = "H 0|Cajas 11.17 Cajones 56.14"
        assertEquals(11.17f, parseCajas(mw), 0.001f)
        assertEquals(56.14f, parseCajones(mw), 0.001f)
    }

    @Test
    fun `cajas y cajones pueden venir de a uno`() {
        assertEquals(20f, parseCajas("H 8|Cajas 20"), 0.001f)
        assertEquals(0f, parseCajones("H 8|Cajas 20"), 0.001f)
        assertEquals(233f, parseCajones("H 0|Cajones 233"), 0.001f)
        assertEquals(0f, parseCajas("H 0|Cajones 233"), 0.001f)
    }

    @Test
    fun `la coma tambien vale como separador decimal`() {
        // Se normalizo la base a punto, pero el parser tiene que seguir aceptando
        // coma: la app vieja en los telefonos todavia puede mandar con coma.
        assertEquals(31.16f, parseCajas("H 0|Cajas 31,16 Cajones 28,24"), 0.001f)
        assertEquals(28.24f, parseCajones("H 0|Cajas 31,16 Cajones 28,24"), 0.001f)
    }

    // ── Abonada: es texto, no un numero ──────────────────────────────────────

    @Test
    fun `abonada devuelve texto y le saca el simbolo de peso`() {
        assertEquals("10200", parseAbonada("H 10|AB:$ 10200"))
        assertEquals("12700", parseAbonada("H 16|AB:$12700"))
        assertEquals("11600", parseAbonada("H 0|AB:11600"))
    }

    @Test
    fun `abonada que no es un importe se conserva tal cual`() {
        assertEquals("barcadilla", parseAbonada("H 7|AB:barcadilla"))
        assertEquals("despique", parseAbonada("H 7|AB:despique"))
        assertEquals("14 bolsas", parseAbonada("H 0|AB:14 bolsas"))
        assertEquals("8h", parseAbonada("H 8|AB:8h"))
    }

    @Test
    fun `sin abonada devuelve null`() {
        assertEquals(null, parseAbonada("H 8"))
        assertEquals(null, parseAbonada("H 8|C:50"))
    }

    // ── Jornales ─────────────────────────────────────────────────────────────

    private fun item(id: String, mw: String?, sector: String = "S1", fecha: String = "2026-08-27") =
        SupervisorPendingItem(
            id = id, employeeId = "e$id", empleado = "EMP $id",
            sectorId = sector, sector = sector, tiposCarga = listOf("cosecha"),
            date = fecha, minutesWorked = mw, notes = null
        )

    @Test
    fun `ocho horas es un jornal`() {
        val t = agruparEnTarjasDelDia(listOf(item("1", "H 8"))).first()
        assertEquals(1f, t.totales.jornales, 0.001f)
    }

    @Test
    fun `los jornales llevan decimales`() {
        // 4 horas es medio jornal, no se redondea a 0 ni a 1.
        val t = agruparEnTarjasDelDia(listOf(item("1", "H 4"))).first()
        assertEquals(0.5f, t.totales.jornales, 0.001f)
        assertEquals("0,5 jornales", t.totales.lineas.first())
    }

    @Test
    fun `un dia entero suma los jornales de todos`() {
        // 8 + 8 + 4 = 20 horas = 2,5 jornales
        val t = agruparEnTarjasDelDia(
            listOf(item("1", "H 8"), item("2", "H 8"), item("3", "H 4"))
        ).first()
        assertEquals(2.5f, t.totales.jornales, 0.001f)
        assertEquals(3, t.cantidadEmpleados)
    }

    // ── Agrupacion en carteles ───────────────────────────────────────────────

    @Test
    fun `cada sector y dia es un cartel aparte`() {
        val tarjas = agruparEnTarjasDelDia(listOf(
            item("1", "H 8", sector = "PICHANAL", fecha = "2026-08-27"),
            item("2", "H 8", sector = "PICHANAL", fecha = "2026-08-27"),
            item("3", "H 8", sector = "PICHANAL", fecha = "2026-08-26"),
            item("4", "H 8", sector = "ZANJA", fecha = "2026-08-27")
        ))
        assertEquals(3, tarjas.size)
        // El mas nuevo primero, para que el supervisor vea el dia de hoy arriba.
        assertEquals("2026-08-27", tarjas.first().fecha)
        val pichanalHoy = tarjas.first { it.sectorName == "PICHANAL" && it.fecha == "2026-08-27" }
        assertEquals(2, pichanalHoy.cantidadEmpleados)
        assertEquals(2f, pichanalHoy.totales.jornales, 0.001f)
    }

    @Test
    fun `no se muestran las lineas que estan en cero`() {
        val t = agruparEnTarjasDelDia(listOf(item("1", "H 8"))).first()
        assertEquals(listOf("1 jornales"), t.totales.lineas)
    }

    // ── Filtros: solo los tipos del sector ───────────────────────────────────

    @Test
    fun `el filtro solo ofrece los tipos habilitados en el sector`() {
        val soloCosecha = TipoCargaFiltro.deSector(listOf("cosecha"))
        assertEquals(listOf(TipoCargaFiltro.HORAS, TipoCargaFiltro.COSECHA), soloCosecha)

        val empaque = TipoCargaFiltro.deSector(listOf("cajas_cajones", "abonada"))
        assertTrue(empaque.contains(TipoCargaFiltro.CAJAS_CAJONES))
        assertTrue(empaque.contains(TipoCargaFiltro.ABONADA))
        // No tiene que aparecer nada que el sector no cargue.
        assertTrue(!empaque.contains(TipoCargaFiltro.BOLSEROS))
        assertTrue(!empaque.contains(TipoCargaFiltro.COSECHA))
    }

    @Test
    fun `horas aparece siempre porque todos los sectores cargan horas`() {
        assertEquals(listOf(TipoCargaFiltro.HORAS), TipoCargaFiltro.deSector(emptyList()))
    }

    @Test
    fun `el filtro detecta que tarjas tienen ese tipo cargado`() {
        assertTrue(TipoCargaFiltro.COSECHA.tieneDato(item("1", "H 8|C:50")))
        assertTrue(!TipoCargaFiltro.COSECHA.tieneDato(item("1", "H 8")))
        assertTrue(TipoCargaFiltro.CAJAS_CAJONES.tieneDato(item("1", "H 0|Cajas 20")))
        assertTrue(TipoCargaFiltro.ABONADA.tieneDato(item("1", "H 7|AB:barcadilla")))
        // Una tarja de 0 horas no cuenta como que tiene horas cargadas.
        assertTrue(!TipoCargaFiltro.HORAS.tieneDato(item("1", "H 0|C:100")))
        assertTrue(TipoCargaFiltro.HORAS.tieneDato(item("1", "H 8|C:100")))
    }

    // ── Formateo ─────────────────────────────────────────────────────────────

    @Test
    fun `los numeros enteros van sin decimales y el resto con coma`() {
        assertEquals("22", fmtNumero(22f))
        assertEquals("0,5", fmtNumero(0.5f))
        assertEquals("211,38", fmtNumero(211.375f))
        assertEquals("17,03", fmtNumero(17.03f))
    }
}
