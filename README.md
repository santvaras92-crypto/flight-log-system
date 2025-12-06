# Sistema de Gestión de Vuelos con OCR Automatizado

Sistema automatizado para registro de vuelos de aviación usando **GPT-4o Vision** para extraer automáticamente los valores de los contadores Hobbs y Tach de fotografías.

## 🚀 Características

- **OCR Automatizado**: Extracción automática de valores de contadores usando GPT-4o Vision
- **Doble Sistema de Contadores**: 
  - **Hobbs** (comercial): Para cobro a pilotos
  - **Tach** (técnico): Para mantenimiento de componentes
- **Flujo Automatizado**: 
  1. Piloto envía fotos → Sistema procesa con OCR → Auto-registro (si confianza ≥ 85%)
  2. Si confianza < 85% → Requiere revisión manual por Admin
- **Gestión de Mantenimiento**: Actualización automática de horas en componentes (Motor, Célula, Hélice)
- **Sistema de Cuentas**: Control de saldos y cobros por vuelo

## 📋 Requisitos

- Node.js 18+
- OpenAI API Key

## 🛠️ Instalación

1. **Clonar o crear el proyecto**
```bash
cd /Users/santiagovaras/Documents/VScode
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**

Edita el archivo `.env` y agrega tu API Key de OpenAI:
```env
OPENAI_API_KEY=sk-proj-tu-api-key-real-aqui
DATABASE_URL="file:./dev.db"
NODE_ENV=development
```

4. **Generar base de datos**
```bash
npm run db:generate
npm run db:push
```

## 📂 Estructura del Proyecto

```
/
├── app/
│   └── actions/
│       ├── submit-flight-images.ts   # Recibe fotos del piloto
│       ├── process-ocr.ts            # Procesa OCR con GPT-4o
│       ├── manual-review.ts          # Revisión manual por admin
│       └── register-flight.ts        # Registro manual de vuelo
├── lib/
│   ├── prisma.ts                     # Cliente Prisma
│   └── ocr-service.ts                # Servicio OCR con GPT-4o
├── prisma/
│   ├── schema.prisma                 # Modelos de base de datos
│   └── dev.db                        # Base de datos SQLite
├── .env                              # Variables de entorno
├── package.json                      # Dependencias
└── tsconfig.json                     # Configuración TypeScript
```

## 🗄️ Modelos de Base de Datos

### User
- Control de pilotos y administradores
- Saldo de cuenta y tarifa por hora

### Aircraft
- Matrícula, modelo
- Contadores actuales (Hobbs y Tach)

### Component
- Componentes del avión (Motor, Célula, Hélice)
- Horas acumuladas y límite TBO

### FlightSubmission
- Estado del procesamiento de fotos
- Relación con vuelos e imágenes

### ImageLog
- Almacenamiento de fotos
- Valores extraídos por OCR
- Nivel de confianza

### Flight
- Registro de vuelos completados
- Contadores inicio/fin
- Cálculo automático de costos

### Transaction
- Historial de cargos, abonos y gastos

## 🔧 Comandos Disponibles

```bash
# Desarrollo
npm run dev              # Iniciar servidor de desarrollo

# Base de datos
npm run db:generate      # Generar cliente Prisma
npm run db:push          # Aplicar cambios al schema
npm run db:studio        # Abrir Prisma Studio

# Producción
npm run build            # Build para producción
npm start                # Iniciar en producción
```

## 📸 Flujo de Uso

### 1. Piloto Envía Fotos
```typescript
import { submitFlightImages } from "@/app/actions/submit-flight-images";

const result = await submitFlightImages(
  pilotoId: 1,
  matricula: "CC-AQI",
  hobbsImageUrl: "/uploads/hobbs-123.jpg",
  tachImageUrl: "/uploads/tach-123.jpg"
);
```

### 2. Sistema Procesa OCR Automáticamente
```typescript
import { processOCR } from "@/app/actions/process-ocr";

// Se ejecuta automáticamente después de submitFlightImages
await processOCR(result.submissionId);
```

### 3. Revisión Manual (solo si confianza < 85%)
```typescript
import { manualReviewAndApprove } from "@/app/actions/manual-review";

await manualReviewAndApprove(
  submissionId: 1,
  hobbsValue: 1234.5,
  tachValue: 987.3,
  adminId: 2
);
```

## 🔐 Estados del Sistema

- **PENDIENTE**: Fotos recibidas, esperando procesamiento
- **PROCESANDO**: OCR en curso
- **REVISION**: Requiere validación manual (confianza < 85%)
- **COMPLETADO**: Vuelo registrado exitosamente
- **ERROR**: Error en el procesamiento

## ⚙️ Configuración de OCR

El sistema usa **GPT-4o Vision** con:
- **Temperatura**: 0.1 (respuestas consistentes)
- **Detalle**: high (máxima precisión)
- **Umbral de confianza**: 85%

## 🚨 Próximos Pasos

1. **Configurar tu OpenAI API Key** en `.env`
2. **Crear datos iniciales** en la base de datos:
   - Usuarios (pilotos y admins)
   - Aeronave con matrícula
   - Componentes del avión
3. **Implementar endpoint de upload** de imágenes
4. **Crear interfaz de usuario** para pilotos y admins

## 📝 Notas Importantes

- SQLite no soporta enums nativos, por lo que usamos Strings
- Los valores Decimal se convierten con `.toNumber()` para cálculos
- Las transacciones de Prisma garantizan atomicidad
- El sistema guarda las imágenes originales para auditoría

## 🐛 Errores de TypeScript

Los errores de tipo implícito `any` en los parámetros son advertencias del compilador TypeScript pero no afectan la funcionalidad. Para resolverlos, puedes:

1. Agregar `"noImplicitAny": false` en `tsconfig.json`, o
2. Agregar tipos explícitos a los parámetros de las funciones callback

## 📄 Licencia

Este proyecto es privado y solo para uso interno.


