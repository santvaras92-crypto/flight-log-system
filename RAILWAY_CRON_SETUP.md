# Configuración Railway Cron - Backup Mensual Automático

## 📋 Resumen

Este documento explica cómo configurar el cron job mensual en Railway para generar y enviar automáticamente backups completos del Flight Log System.

## 🎯 Objetivo

Enviar automáticamente un Excel con **toda la información histórica** del sistema cada 1ro de mes a las 3 AM (hora de Chile) a `santvaras92@gmail.com`.

## ⚙️ Configuración en Railway

### Paso 1: Variables de Entorno

Agregar las siguientes variables de entorno en el proyecto de Railway:

```bash
# Variable requerida para autenticación del cron
CRON_SECRET=<generar-token-seguro-aleatorio>

# Variable opcional para cambiar destinatario del backup
BACKUP_EMAIL=santvaras92@gmail.com

# Variables existentes requeridas
RESEND_API_KEY=<tu-api-key-de-resend>
DATABASE_URL=<postgresql-url-de-railway>
```

**Generar CRON_SECRET:**
```bash
# Opción 1: OpenSSL
openssl rand -hex 32

# Opción 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Opción 3: Online
# https://www.uuidgenerator.net/version4
```

### Paso 2: Crear Railway Cron Service

#### Opción A: Railway Cron (Nativo)

1. En tu proyecto Railway, ir a la sección "Deployments"
2. Click en "New" → "Cron Job"
3. Configurar:
   - **Name:** `monthly-backup-cron`
   - **Schedule:** `0 3 1 * *` (1ro de cada mes a las 3 AM Chile = 6 AM UTC)
   - **Command:** 
     ```bash
     curl -X POST https://flight-log-system-production.up.railway.app/api/cron/monthly-backup \
       -H "Authorization: Bearer ${CRON_SECRET}" \
       -H "Content-Type: application/json"
     ```
   - **Timezone:** `America/Santiago`

#### Opción B: Servicio Externo (cron-job.org)

Si Railway no tiene cron nativo, usar un servicio externo:

1. Ir a https://cron-job.org/en/
2. Crear cuenta gratuita
3. Crear nuevo cron job:
   - **URL:** `https://flight-log-system-production.up.railway.app/api/cron/monthly-backup`
   - **Schedule:** `0 3 1 * *` (Cron expression)
   - **Method:** POST
   - **Headers:**
     ```
     Authorization: Bearer <tu-CRON_SECRET>
     Content-Type: application/json
     ```
   - **Timezone:** America/Santiago

#### Opción C: GitHub Actions

Crear `.github/workflows/monthly-backup.yml`:

```yaml
name: Monthly Backup

on:
  schedule:
    # 1st of every month at 6:00 AM UTC (3:00 AM Chile)
    - cron: '0 6 1 * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Backup
        run: |
          curl -X POST https://flight-log-system-production.up.railway.app/api/cron/monthly-backup \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

Agregar `CRON_SECRET` en GitHub Secrets.

## 🧪 Testing

### Test Manual del Endpoint

```bash
# Desde terminal local
curl -X POST https://flight-log-system-production.up.railway.app/api/cron/monthly-backup \
  -H "Authorization: Bearer <tu-CRON_SECRET>" \
  -H "Content-Type: application/json"
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "message": "Monthly backup generated and sent successfully",
  "filename": "FlightLog-Backup-2026-01.xlsx",
  "size": "3.45 MB",
  "generationTime": "12.3s",
  "totalTime": "14.8s",
  "timestamp": "2026-01-01T06:00:00.000Z"
}
```

**Respuesta de error:**
```json
{
  "ok": false,
  "error": "Error message details"
}
```

### Test desde Dashboard Admin

1. Ir a https://flight-log-system-production.up.railway.app/admin/dashboard
2. Click en botón "💾 Generar Backup Completo"
3. Seleccionar "Enviar por Email"
4. Verificar recepción del email

## 📧 Email de Backup

El email incluye:
- Archivo Excel adjunto con todos los datos históricos
- Tamaño: ~2-5 MB (según cantidad de vuelos)
- Formato: `.xlsx` compatible con Excel, Google Sheets, LibreOffice
- Contenido:
  - 📋 Resumen ejecutivo
  - ✈️ Todos los vuelos históricos
  - 💰 Depósitos completos (DB + CSV)
  - ⛽ Combustible desde Sep 2020
  - 👥 Pilotos con balances lifetime
  - 🛩️ Aeronaves y mantenimiento
  - 📝 Transacciones completas
  - ⏳ Pendientes de aprobación

## 🔔 Notificaciones

### Email de Éxito
- **To:** `santvaras92@gmail.com` (o `BACKUP_EMAIL`)
- **Subject:** `📊 Flight Log - Backup Automático Mensual (Enero 2026)`
- **Adjunto:** `FlightLog-Backup-2026-01.xlsx`

### Email de Error
- **To:** `santvaras92@gmail.com`
- **Subject:** `⚠️ Error en Backup Automático Mensual - Flight Log`
- **Contenido:** Stack trace y detalles del error

## 🔍 Monitoreo

### Ver Logs en Railway

```bash
# CLI de Railway
railway logs

# Filtrar por cron
railway logs --filter "Monthly Backup Cron"
```

### Verificar Ejecución

Buscar en logs:
```
[Monthly Backup Cron] ===== STARTING MONTHLY BACKUP =====
[Monthly Backup Cron] Backup generated successfully:
[Monthly Backup Cron] Email sent successfully: <resend-email-id>
[Monthly Backup Cron] ===== BACKUP COMPLETED SUCCESSFULLY =====
```

## 🛡️ Seguridad

1. **CRON_SECRET:** Token aleatorio de 64 caracteres hexadecimales
2. **Header Authorization:** Validación en cada request
3. **Admin Only:** Endpoint manual solo accesible por admin
4. **Rate Limiting:** Configurar en Railway si es necesario

## 📅 Calendario de Backups

| Fecha | Hora Chile | Hora UTC | Archivo Generado |
|-------|------------|----------|------------------|
| 1 Enero | 3:00 AM | 6:00 AM | FlightLog-Backup-2026-01.xlsx |
| 1 Febrero | 3:00 AM | 6:00 AM | FlightLog-Backup-2026-02.xlsx |
| 1 Marzo | 3:00 AM | 6:00 AM | FlightLog-Backup-2026-03.xlsx |
| ... | ... | ... | ... |

## 🔧 Troubleshooting

### Backup no se envió

1. Verificar logs de Railway
2. Comprobar `RESEND_API_KEY` configurada
3. Verificar `CRON_SECRET` correcto
4. Test manual del endpoint
5. Verificar cuota de Resend (límite de archivos adjuntos)

### Email no llegó

1. Revisar spam/promociones
2. Verificar límite de tamaño de Resend (40MB max)
3. Comprobar logs de Resend: https://resend.com/emails
4. Test manual desde dashboard

### Error de generación

1. Verificar `DATABASE_URL` accesible
2. Comprobar espacio en Railway
3. Revisar memoria disponible (archivos grandes)
4. Ver stack trace en email de error

## 📞 Soporte

Para problemas con el backup automático:
1. Revisar logs de Railway
2. Test manual desde dashboard admin
3. Verificar email de error enviado automáticamente
4. Contactar soporte de Railway si es problema de infraestructura

## 🎉 Backup Manual Adicional

En cualquier momento puedes generar un backup manual:
1. Ir a Dashboard Admin
2. Click "💾 Generar Backup Completo"
3. Elegir "Descargar Ahora" o "Enviar por Email"

---

**Última actualización:** Enero 2026  
**Versión del sistema:** 1.0.3+
