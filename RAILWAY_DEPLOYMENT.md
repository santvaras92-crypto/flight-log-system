# Railway Deployment - Flight Log System

## Pasos para deployar en Railway

### 1. Crear cuenta en Railway
- Ve a https://railway.app
- Conéctate con GitHub

### 2. Crear nuevo proyecto
```bash
# Instalar Railway CLI (opcional)
npm i -g @railway/cli

# Login
railway login

# Iniciar proyecto
railway init
```

### 3. Configurar variables de entorno en Railway Dashboard

**Variables requeridas (producción con PostgreSQL):**

```env
NODE_ENV=production
DATABASE_URL=postgresql://<user>:<password>@shortline.proxy.rlwy.net:<port>/<db>?sslmode=require
NEXTAUTH_URL=https://tu-app.railway.app
NEXTAUTH_SECRET=<generado-via-openssl>
OPENAI_API_KEY=<tu-openai-api-key>
```

Para generar NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

### 4. Deploy desde GitHub

1. En Railway Dashboard, click "New Project"
2. Selecciona "Deploy from GitHub repo"
3. Autoriza Railway en GitHub
4. Selecciona este repositorio
5. Railway detectará automáticamente Next.js
6. Configura las variables de entorno
7. Click "Deploy"

### 5. Configurar dominio (opcional)

En Railway Dashboard:
- Settings → Domains
- Genera un dominio de Railway o conecta uno custom

### 6. Migrar base de datos

El proyecto está configurado para PostgreSQL (`prisma/schema.prisma`).

1. En Railway, agrega PostgreSQL:
  - Click "+ New" → Database → PostgreSQL

2. En Variables, copia el `DATABASE_URL` provisto por Railway.

3. Migrar el schema a la base:
```bash
railway run npx prisma db push
```

### 7. Importar datos iniciales

Conectarse a Railway y ejecutar seeds:
```bash
railway run npm run db:seed
```

### 8. Monitoreo

- Logs en tiempo real: Railway Dashboard → Deployments → Logs
- Métricas: Dashboard → Metrics
- Database: Dashboard → PostgreSQL → Data

## Comandos útiles

```bash
# Ver logs
railway logs

# Ejecutar comandos en producción
railway run <comando>

# Abrir app
railway open

# Ver variables
railway variables
```

## Costos

- **Starter Plan**: $5/mes
- **Developer Plan**: $20/mes
- 500 horas de ejecución incluidas
- PostgreSQL incluido

## Troubleshooting

**Build falla:**
- Verifica que `prisma generate` esté en el script `build` (ya configurado)
- Revisa logs en Dashboard

**Database connection error:**
- Verifica DATABASE_URL en variables
- Confirma que PostgreSQL esté corriendo

**App no carga:**
- Revisa `NEXTAUTH_URL` apunte al dominio correcto
- Verifica `NEXTAUTH_SECRET` esté configurado
- Railway expone `PORT`; el `startCommand` usa `next start -p $PORT`
- Asegura que la app use el proxy público en `DATABASE_URL` (host `shortline.proxy.rlwy.net`) y no el host interno `postgres.railway.internal`
