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

- Responder siempre en **español informal**
- No hacer commits ni push sin confirmación explícita del usuario
- No cambiar el método de storage de fotos (Volume → archivos)
