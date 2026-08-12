# CLAUDE.md — StaffAxis (Android + Backend)

## Acceso directo a la base de datos

**PostgreSQL en Railway — usar siempre la URL pública:**

```
postgresql://postgres:LqmEneHjwfiTEgmgnyLVPzexsvoKHcYC@viaduct.proxy.rlwy.net:58870/railway
```

Correr consultas SQL directamente con psql:
```bash
psql "postgresql://postgres:LqmEneHjwfiTEgmgnyLVPzexsvoKHcYC@viaduct.proxy.rlwy.net:58870/railway" -c "SELECT ..."
```

O con Node (pg ya instalado en `server/`):
```js
import pg from 'pg';
const db = new pg.Pool({ connectionString: 'postgresql://postgres:LqmEneHjwfiTEgmgnyLVPzexsvoKHcYC@viaduct.proxy.rlwy.net:58870/railway', ssl: { rejectUnauthorized: false } });
```

## API Backend

**URL de producción:** `https://staffaxis-new-version-production.up.railway.app`

**Admin token:** `staffaxis_admin_token_2024_prod`  
Header: `x-admin-token: staffaxis_admin_token_2024_prod`

### Endpoints clave

```
GET    /api/sectors                          → lista sectores
GET    /api/employees?sector_id=<id>         → empleados de un sector
POST   /api/admin/employees                  → crear empleado { first_name, last_name, dni, sector_id }
PUT    /api/admin/employees/:id              → editar empleado { first_name, last_name, dni }
DELETE /api/admin/employees/:id              → eliminar empleado (hard delete)
GET    /api/employees/:id/foto/:lado         → obtener foto (lado = frente | dorso)
POST   /api/employees/:id/foto/:lado         → subir foto (multipart)
DELETE /api/employees/:id/foto/:lado         → eliminar foto
```

### Insertar empleados en bulk (PowerShell)
```powershell
$token = "staffaxis_admin_token_2024_prod"
$base  = "https://staffaxis-new-version-production.up.railway.app"
$sectorId = "<uuid-del-sector>"
@("Apellido, Nombre") | ForEach-Object {
    $parts = $_ -split ", "
    $body = @{ last_name=$parts[0]; first_name=$parts[1]; dni=""; sector_id=$sectorId } | ConvertTo-Json
    Invoke-RestMethod "$base/api/admin/employees" -Method POST -Headers @{"x-admin-token"=$token;"Content-Type"="application/json"} -Body $body
}
```

## Railway (infra)

- **Proyecto:** `StaffAxis + StaffAdmin Build`
- **Servicio backend:** `staffaxis-new-version` (Service ID: `a719f95e-006d-457f-abfd-950f52cb4fdc`)
- **CRÍTICO:** El backend tiene un Volume montado → la DB **debe** usar la URL pública (`viaduct.proxy.rlwy.net`), NO la privada (`postgres.railway.internal`). Si se usa la privada con Volume activo → connection timeout.
- **NO montar Volumes nuevos** sin avisar al usuario — dispara un redeploy en cadena que puede tumbar Postgres.

## Sectores conocidos

| Nombre | ID |
|--------|-----|
| OTITO | `612deb14-b814-49dc-95d1-d413a61abdf6` |
| PAMPA BLANCA | `51c0cfaa-3f96-45e7-9081-99735d7f44f3` |

## Fotos de DNI

- Se guardan en Railway Volume en `/data/dni/{employeeId}_{frente|dorso}.jpg`
- La DB guarda el filename en columnas `dni_foto_frente`, `dni_foto_dorso` (TEXT) en la tabla `employees`
- **NUNCA cambiar a bytea** — el usuario lo eligió así expresamente

## Estructura del proyecto

- `server/` — backend Node.js/Fastify/Express
- `server/src/db.js` — pool de Postgres (usa `process.env.DATABASE_URL`)
- `server/src/routes/` — rutas de la API
- `app/` — app Android en Kotlin/Jetpack Compose

## Reglas generales

- Responder siempre en **español informal**, directo y sin vueltas
- No hacer commits ni push sin confirmación explícita del usuario
- No cambiar el método de storage de fotos (Volume → archivos)
- Si algo no cierra o falta un dato, **frenar y preguntar** en vez de adivinar

## Compilar y publicar

**Nunca compilar release, empaquetar ni publicar sin autorización explícita del usuario, cada vez.** Compilar en debug para chequear que algo compila está bien.

Publicar la app Android tiene consecuencias grandes: la actualización llega a ~45 teléfonos del campo, y al cambiar el `versionCode` **todos vuelven a la pantalla de autorización** y hay que aprobarlos a mano desde StaffAdmin. No hacerlo un lunes a la mañana.

Antes de publicar un APK, seguir sí o sí lo documentado en `SETUP.md` (sección 6):
- Compilar **siempre** con `gradlew clean` — sin eso, Gradle puede dejar embebida en el bytecode una constante `BuildConfig.VERSION_CODE` vieja y el cartel de "actualizar" queda en loop
- Verificar con `dexdump` el `versionCode` que quedó **realmente adentro del APK**, no confiar en el manifest
- Subir el APK al repo de updates **antes** de tocar el `version.json`

## Tocar la base de producción

La base es de producción y de ahí sale la liquidación de sueldos. Antes de cualquier `INSERT`, `UPDATE` o `DELETE`:

1. **Mostrar primero** qué filas se van a ver afectadas (un `SELECT` con el detalle y el total)
2. **Hacer respaldo** a un `.json` en el Escritorio con lo que se va a modificar
3. Recién ahí ejecutar, y **verificar después** que quedó como se esperaba
4. Para cargas masivas, usar `ON CONFLICT DO NOTHING` para no pisar lo que ya está

Para borrar tarjas usar `is_deleted = true` (borrado lógico), nunca `DELETE`: es reversible y el índice único ignora las borradas, así que se puede volver a cargar ese día sin conflicto.

Los scripts sueltos de consulta se borran después de usarlos — no dejar archivos con la contraseña de la base en el repo.
