package com.staffaxis.hsm.domain.model

/**
 * Totales de un valor de tarja. El campo `minutesWorked` guarda un formato compuesto
 * ("H 8|C:33|Cajas 23 Cajones 55|AB:47573,53") y cada pantalla lo venia parseando por
 * su cuenta, con criterios distintos — de ahi salian las horas en 0 y la cosecha
 * contando empleados en vez de cachos. Este es el unico lugar donde se interpreta.
 */
data class TarjaValores(
    val horas: Float = 0f,
    val cosecha: Float = 0f,
    val cajas: Int = 0,
    val cajones: Int = 0,
    val importe: Float = 0f
) {
    operator fun plus(otro: TarjaValores) = TarjaValores(
        horas = horas + otro.horas,
        cosecha = cosecha + otro.cosecha,
        cajas = cajas + otro.cajas,
        cajones = cajones + otro.cajones,
        importe = importe + otro.importe
    )

    companion object {
        val CERO = TarjaValores()

        private val REGEX_CAJAS = Regex("Cajas ([0-9]+(?:[.,][0-9]+)?)")
        private val REGEX_CAJONES = Regex("Cajones ([0-9]+(?:[.,][0-9]+)?)")

        private fun num(s: String?): Float =
            s?.trim()?.replace(',', '.')?.toFloatOrNull() ?: 0f

        /**
         * Formatos que conviven en la base:
         *   "H 8"                    horas con prefijo (formato actual)
         *   "8" / "480"              numero plano (datos viejos: >16 se guardaba en minutos)
         *   "C:33" / "C"             cosecha — la vieja sin numero no aporta cachos
         *   "Cajas 23 Cajones 55"    cajas y cajones
         *   "AB:47573,53" / "$47573" importe
         */
        fun parse(minutesWorked: String?): TarjaValores {
            if (minutesWorked.isNullOrBlank()) return CERO
            var horas = 0f
            var cosecha = 0f
            var cajas = 0
            var cajones = 0
            var importe = 0f

            for (parte in minutesWorked.split("|").map { it.trim() }) {
                when {
                    parte.startsWith("H ") -> horas += num(parte.removePrefix("H "))
                    parte.startsWith("C:") -> cosecha += num(parte.removePrefix("C:"))
                    parte == "C" -> Unit // cosecha vieja, sin cantidad de cachos
                    parte.startsWith("AB:") -> importe += num(parte.removePrefix("AB:"))
                    parte.startsWith("$") -> importe += num(parte.removePrefix("$"))
                    parte.startsWith("Cajas") || parte.startsWith("Cajones") -> {
                        cajas += num(REGEX_CAJAS.find(parte)?.groupValues?.getOrNull(1)).toInt()
                        cajones += num(REGEX_CAJONES.find(parte)?.groupValues?.getOrNull(1)).toInt()
                    }
                    else -> {
                        val n = num(parte)
                        if (n > 0f) horas += if (n > 16f) n / 60f else n
                    }
                }
            }
            return TarjaValores(horas, cosecha, cajas, cajones, importe)
        }

        /** Suma los valores de varias tarjas. */
        fun sumar(valores: List<String?>): TarjaValores =
            valores.fold(CERO) { acc, mw -> acc + parse(mw) }
    }
}
