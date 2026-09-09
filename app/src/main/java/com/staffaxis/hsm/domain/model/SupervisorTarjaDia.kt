package com.staffaxis.hsm.domain.model

/**
 * Modelo de la vista nueva del supervisor: en vez de una lista plana de tarjas
 * empleado por empleado, se ve un cartel por sector con el total de lo cargado
 * ese dia. El detalle empleado por empleado recien aparece al tocar el cartel.
 */

// Un jornal son 8 horas. El supervisor razona en jornales, no en horas sueltas.
const val HORAS_POR_JORNAL = 8f

/** Formatea sin decimales si es entero, y con coma decimal (es-AR) si no. */
fun fmtNumero(v: Float, decimales: Int = 2): String {
    if (v == v.toLong().toFloat()) return v.toLong().toString()
    return String.format("%.${decimales}f", v).trimEnd('0').trimEnd('.', ',').replace('.', ',')
}

/**
 * Tipos de carga por los que se puede filtrar el detalle. Se arma con los tipos
 * que tiene habilitado EL SECTOR (tabla sector_tipos_carga), no con una lista fija:
 * un sector que solo carga cosecha no tiene por que ofrecer "Bolseros" en el filtro.
 */
enum class TipoCargaFiltro(val slug: String, val etiqueta: String) {
    HORAS("horas", "Horas"),
    COSECHA("cosecha", "Cosecha"),
    ABONADA("abonada", "Abonada"),
    CAJAS_CAJONES("cajas_cajones", "Cajas y cajones"),
    KM_VIAJES("km_viajes", "Km / Viajes"),
    HAS_FUMIGADAS("has_fumigadas", "Has fumigadas"),
    SIEMBRA_TRILLA("siembra_trilla", "Siembra / Trilla"),
    BOLSEROS("bolseros", "Bolseros"),
    ETIQUETADO("etiquetado", "Etiquetado"),
    CARGA_CAMION("carga_camion", "Carga de camión"),
    MOVIMIENTO_ESTIBA("movimiento_estiba", "Movimiento de estiba");

    /** Si esta tarja tiene algo cargado de este tipo. */
    fun tieneDato(item: SupervisorPendingItem): Boolean {
        val partes = (item.minutesWorked ?: "").split("|")
        val t = item.tiposNuevos
        return when (this) {
            HORAS -> parseHoras(item.minutesWorked) > 0f
            COSECHA -> partes.any { it == "C" || it.startsWith("C:") }
            ABONADA -> partes.any { it.startsWith("AB:") }
            CAJAS_CAJONES -> partes.any { it.startsWith("Cajas ") || it.startsWith("Cajones ") }
            KM_VIAJES -> t.kmViajes != null
            HAS_FUMIGADAS -> t.hasFumigadas != null
            SIEMBRA_TRILLA -> t.siembraTrilla != null
            BOLSEROS -> t.bolseros != null
            ETIQUETADO -> t.etiquetado != null
            CARGA_CAMION -> t.cargaCamionKg50 == true || t.cargaCamionKg25 == true || !t.cargaCamionOtro.isNullOrBlank()
            MOVIMIENTO_ESTIBA -> t.movimientoEstibaKg50 == true || t.movimientoEstibaKg25 == true || !t.movimientoEstibaOtro.isNullOrBlank()
        }
    }

    companion object {
        /** Los filtros que corresponden a este sector. Horas va siempre: todos cargan horas. */
        fun deSector(tiposDelSector: List<String>): List<TipoCargaFiltro> =
            listOf(HORAS) + entries.filter { it != HORAS && tiposDelSector.contains(it.slug) }
    }
}

// ── Parseo del campo compuesto "H 8|C:33|Cajas 23 Cajones 55|AB:47573.53" ──────
// Se acepta coma o punto como separador decimal: en la base conviven los dos.

private fun aFloat(s: String?): Float? =
    s?.trim()?.replace(',', '.')?.toFloatOrNull()

fun parseHoras(mw: String?): Float {
    val parte = (mw ?: "").split("|").firstOrNull() ?: return 0f
    return aFloat(if (parte.startsWith("H ")) parte.substring(2) else parte) ?: 0f
}

fun parseCosecha(mw: String?): Float =
    (mw ?: "").split("|").firstOrNull { it.startsWith("C:") }?.let { aFloat(it.removePrefix("C:")) } ?: 0f

/**
 * La abonada se devuelve como texto, no como numero: en la base conviven importes
 * ("$ 10200") con descripciones ("barcadilla", "14 bolsas", "8h"). Sumarla daria
 * cero y perderia el dato, asi que se muestra tal cual, sin el simbolo de peso.
 */
fun parseAbonada(mw: String?): String? =
    (mw ?: "").split("|").firstOrNull { it.startsWith("AB:") }
        ?.removePrefix("AB:")?.replace("$", "")?.trim()?.takeIf { it.isNotBlank() }

private val RE_CAJAS = Regex("""Cajas ([0-9]+(?:[.,][0-9]+)?)""")
private val RE_CAJONES = Regex("""Cajones ([0-9]+(?:[.,][0-9]+)?)""")

fun parseCajas(mw: String?): Float =
    RE_CAJAS.find(mw ?: "")?.groupValues?.get(1)?.let { aFloat(it) } ?: 0f

fun parseCajones(mw: String?): Float =
    RE_CAJONES.find(mw ?: "")?.groupValues?.get(1)?.let { aFloat(it) } ?: 0f

/** Totales de un dia entero de un sector, ya en jornales. */
data class TotalesTarja(
    val jornales: Float = 0f,
    val cosecha: Float = 0f,
    val cajas: Float = 0f,
    val cajones: Float = 0f,
    // Valores distintos de abonada, sin repetir. Es texto libre, no se suma.
    val abonadas: List<String> = emptyList(),
    val tiposNuevos: TiposCargaNuevos = TiposCargaNuevos()
) {
    /** Las lineas que van en el cartel, ya armadas y sin las que estan en cero. */
    val lineas: List<String>
        get() = buildList {
            if (jornales > 0f) add("${fmtNumero(jornales)} jornales")
            if (cosecha > 0f) add("${fmtNumero(cosecha)} cosecha")
            if (cajas > 0f) add("${fmtNumero(cajas)} cajas")
            if (cajones > 0f) add("${fmtNumero(cajones)} cajones")
            if (abonadas.isNotEmpty()) add("abonada: ${abonadas.joinToString(", ")}")
            with(tiposNuevos) {
                kmViajes?.let { if (it > 0f) add("${fmtNumero(it)} km/viajes") }
                hasFumigadas?.let { if (it > 0f) add("${fmtNumero(it)} has fumigadas") }
                siembraTrilla?.let { if (it > 0f) add("${fmtNumero(it)} siembra/trilla") }
                bolseros?.let { if (it > 0f) add("${fmtNumero(it)} bolseros") }
                etiquetado?.let { if (it > 0f) add("${fmtNumero(it)} etiquetado") }
                val camion = listOfNotNull(
                    if (cargaCamionKg50 == true) "50kg" else null,
                    if (cargaCamionKg25 == true) "25kg" else null,
                    cargaCamionOtro?.takeIf { it.isNotBlank() }
                )
                if (camion.isNotEmpty()) add("camión ${camion.joinToString("/")}")
                val estiba = listOfNotNull(
                    if (movimientoEstibaKg50 == true) "50kg" else null,
                    if (movimientoEstibaKg25 == true) "25kg" else null,
                    movimientoEstibaOtro?.takeIf { it.isNotBlank() }
                )
                if (estiba.isNotEmpty()) add("estiba ${estiba.joinToString("/")}")
            }
        }
}

/**
 * Un cartel: todo lo que se tarjo en un sector un dia. Es la unidad que el
 * supervisor aprueba entera desde la lista, o abre para revisar uno por uno.
 */
data class TarjaDelDia(
    val sectorId: String,
    val sectorName: String,
    val fecha: String,
    val tiposCarga: List<String>,
    val items: List<SupervisorPendingItem>,
    val totales: TotalesTarja
) {
    /** Clave estable para navegar al detalle e identificar el cartel. */
    val clave: String get() = "$sectorId|$fecha"
    val cantidadEmpleados: Int get() = items.map { it.employeeId }.distinct().size
    val tieneModificadas: Boolean get() = items.any { it.fueModificada }
    val filtrosDisponibles: List<TipoCargaFiltro> get() = TipoCargaFiltro.deSector(tiposCarga)
}

/** Agrupa las tarjas pendientes en un cartel por sector y dia. */
fun agruparEnTarjasDelDia(pendientes: List<SupervisorPendingItem>): List<TarjaDelDia> =
    pendientes
        .groupBy { (it.sectorId ?: it.sector) to it.date }
        .map { (clave, items) ->
            val primero = items.first()
            var totales = TotalesTarja()
            items.forEach { it ->
                totales = TotalesTarja(
                    jornales = totales.jornales + parseHoras(it.minutesWorked) / HORAS_POR_JORNAL,
                    cosecha = totales.cosecha + parseCosecha(it.minutesWorked),
                    cajas = totales.cajas + parseCajas(it.minutesWorked),
                    cajones = totales.cajones + parseCajones(it.minutesWorked),
                    abonadas = (totales.abonadas + listOfNotNull(parseAbonada(it.minutesWorked))).distinct(),
                    tiposNuevos = totales.tiposNuevos + it.tiposNuevos
                )
            }
            TarjaDelDia(
                sectorId = clave.first,
                sectorName = primero.sector,
                fecha = primero.date,
                tiposCarga = primero.tiposCarga,
                items = items.sortedBy { it.empleado },
                totales = totales
            )
        }
        .sortedWith(compareByDescending<TarjaDelDia> { it.fecha }.thenBy { it.sectorName })
