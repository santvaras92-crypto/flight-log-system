# 📊 DASHBOARD OVERVIEW - Preview Visual

## Navegación
```
┌──────────────────────────────────────────────────────────────────────┐
│  [🔵 Overview] [Flights] [Pilots] [Registro] [Mx] [Corregir Deposit]│
└──────────────────────────────────────────────────────────────────────┘
```

---

## Vista Principal - Grid de Métricas

### Fila 1: Métricas de Combustible y Operación
```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  ⛽ FUEL RATE        │  │  ⏱️  TOTAL HOURS     │  │  ✈️  TOTAL FLIGHTS   │
│                      │  │                      │  │                      │
│     23.84 L/H        │  │      2,220.3         │  │       1,333          │
│     6.30 GAL/H       │  │                      │  │                      │
│                      │  │  Since Dec 2, 2017   │  │  Since Dec 2, 2017   │
│  📅 Since Aug 2020   │  │                      │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### Fila 2: Métricas Financieras
```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  💰 TOTAL REVENUE    │  │  ⛽ FUEL CONSUMED    │  │  👨‍✈️ ACTIVE PILOTS   │
│                      │  │                      │  │                      │
│   $XXX,XXX,XXX       │  │   28,724.18 L        │  │        XX            │
│                      │  │   7,590.12 GAL       │  │                      │
│  All time revenue    │  │                      │  │  Currently active    │
│                      │  │  📅 Since Aug 2020   │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### Fila 3: Estado Actual
```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  💵 PENDING BALANCE  │  │  📆 THIS MONTH       │  │  📊 AVG FLIGHT TIME  │
│                      │  │                      │  │                      │
│   $XXX,XXX           │  │   XX flights         │  │      1.67 hrs        │
│                      │  │   XXX.X hrs          │  │                      │
│  Unpaid deposits     │  │   November 2025      │  │  Average per flight  │
│                      │  │                      │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

---

## Gráfico de Tendencia
```
┌──────────────────────────────────────────────────────────────────────┐
│  📈 MONTHLY FLIGHT HOURS TREND                                       │
│                                                                      │
│  200hrs ┤                                                            │
│         │                    ╭─╮                                     │
│  150hrs ┤          ╭─╮      │ │        ╭─╮                          │
│         │     ╭─╮  │ │  ╭─╮ │ │    ╭─╮ │ │                          │
│  100hrs ┤ ╭─╮ │ │  │ │  │ │ │ │╭─╮ │ │ │ │    ╭─╮                  │
│         │ │ │ │ │  │ │  │ │ │ ││ │ │ │ │ │╭─╮ │ │                  │
│   50hrs ┤ │ │ │ │  │ │  │ │ │ ││ │ │ │ │ ││ │ │ │                  │
│         │ │ │ │ │  │ │  │ │ │ ││ │ │ │ │ ││ │ │ │                  │
│    0hrs ┴─┴─┴─┴─┴──┴─┴──┴─┴─┴─┴┴─┴─┴─┴─┴─┴┴─┴─┴─┴──────────────────│
│         J F M A M  J J  A S O N D J F M A M  J J A S  O  N  D       │
│         │────── 2024 ──────│ │────── 2025 ──────│                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Paleta de Colores

### Tarjetas de Métricas
- **Fondo**: Blanco `#FFFFFF`
- **Borde**: Gris claro `#E5E7EB`
- **Sombra**: `shadow-sm hover:shadow-md`

### Iconos y Valores
- **Icono Combustible** ⛽: Amarillo `#F59E0B`
- **Icono Tiempo** ⏱️: Azul `#3B82F6`
- **Icono Vuelos** ✈️: Navy `#0B1F3B`
- **Icono Dinero** 💰: Verde `#10B981`
- **Icono Pilotos** 👨‍✈️: Púrpura `#8B5CF6`

### Números Principales
- **Tamaño**: `text-3xl` (30px)
- **Peso**: `font-bold`
- **Color**: Gris oscuro `#1F2937`

### Texto Secundario
- **Tamaño**: `text-sm` (14px)
- **Peso**: `font-medium`
- **Color**: Gris medio `#6B7280`

---

## 📐 Especificaciones Técnicas

### Grid Layout
```css
display: grid;
grid-template-columns: repeat(3, 1fr);
gap: 1.5rem; /* 24px */
```

### Responsive Breakpoints
- **Desktop** (≥1024px): 3 columnas
- **Tablet** (768-1023px): 2 columnas
- **Mobile** (<768px): 1 columna

### Tarjeta Individual
```css
padding: 1.5rem; /* 24px */
border-radius: 0.5rem; /* 8px */
border: 1px solid #E5E7EB;
background: white;
transition: shadow 0.2s;
```

### Icono Container
```css
width: 3rem; /* 48px */
height: 3rem; /* 48px */
border-radius: 9999px; /* full circle */
display: flex;
align-items: center;
justify-content: center;
background: rgba(color, 0.1); /* 10% opacity del color del icono */
```

---

## 🔄 Datos Auto-Actualizados

### Cálculos en Tiempo Real
1. **Fuel Rate**: `totalLiters / hoursSinceAug2020`
   - Fuente: DB (Prisma query con filtro fecha ≥ 2020-08-27)
   
2. **Total Hours**: `SUM(diffHobbs)` desde DB
   - Fuente: `prisma.flight.aggregate()`
   
3. **Total Flights**: `COUNT(*)` desde DB
   - Fuente: `prisma.flight.count()`
   
4. **Total Revenue**: `SUM(total)` desde DB
   - Fuente: `prisma.flight.aggregate({ _sum: { total } })`
   
5. **Fuel Consumed**: Query a tabla de combustible
   - Fuente: `prisma.fuelCharge.aggregate({ _sum: { liters } })`
   
6. **Active Pilots**: Pilotos con vuelos en últimos 6 meses
   - Fuente: Query con filtro `fecha >= 6 meses atrás`
   
7. **Pending Balance**: Depósitos no aplicados
   - Fuente: `prisma.deposit.aggregate({ where: { status: 'pending' } })`
   
8. **This Month**: Vuelos del mes actual
   - Fuente: `prisma.flight.findMany({ where: { fecha >= inicio_mes } })`

---

## 💡 Interacciones

### Hover States
- Tarjetas elevan sombra: `hover:shadow-md`
- Cursor pointer en tarjetas clickeables
- Transición suave 200ms

### Click Actions (Opcional - Fase 2)
- Click en "Total Flights" → Navega a tab Flights
- Click en "Active Pilots" → Navega a tab Pilots
- Click en "Pending Balance" → Navega a Deposits

### Loading States
- Skeleton loaders mientras cargan datos
- Spinner en gráfico mientras renderiza

---

## 🚀 Implementación

### Componentes Necesarios
1. `OverviewTab.tsx` - Componente principal
2. `MetricCard.tsx` - Componente reutilizable para tarjetas
3. `MonthlyTrendChart.tsx` - Gráfico con Chart.js o Recharts
4. `hooks/useFleetMetrics.ts` - Hook para cargar datos

### Librerías Adicionales
```json
{
  "recharts": "^2.10.0",  // Para gráfico de tendencia
  "lucide-react": "^0.294.0"  // Para iconos modernos
}
```

---

## 📊 Datos de Ejemplo (Valores Reales)

### Métricas Confirmadas
- **Fuel Rate**: 23.84 L/H | 6.30 GAL/H
- **Total Hours**: 2,220.3 hrs
- **Total Flights**: 1,333
- **Fuel Consumed**: 28,724.18 L | 7,590.12 GAL
- **Hours Since Aug 2020**: 1,204.9 hrs (740 flights)
- **Avg Flight Time**: 1.67 hrs (2220.3 / 1333)

### Métricas por Calcular
- Total Revenue: Query a DB
- Active Pilots: Query últimos 6 meses
- Pending Balance: Query deposits pending
- This Month Stats: Query mes actual

---

## ✅ Estado de Implementación

- [x] Diseño visual aprobado
- [x] Paleta de colores definida
- [x] Datos validados y confirmados
- [x] Cálculo de Fuel Rate completado
- [ ] Implementar componentes React
- [ ] Integrar con Prisma queries
- [ ] Agregar gráfico de tendencia
- [ ] Testing con datos reales
- [ ] Deploy a producción

