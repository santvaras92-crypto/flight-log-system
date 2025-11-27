import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

export async function GET(req: NextRequest) {
  // Verificar autenticación
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Obtener todos los datos
  const [users, aircraft, flights, submissions, components, transactions] = await Promise.all([
    prisma.user.findMany({ select: { id: true, nombre: true, email: true, rol: true, saldo_cuenta: true, tarifa_hora: true, createdAt: true } }),
    prisma.aircraft.findMany({ select: { matricula: true, modelo: true, hobbs_actual: true, tach_actual: true, createdAt: true } }),
    prisma.flight.findMany({
      select: {
        id: true, fecha: true, hobbs_inicio: true, hobbs_fin: true, tach_inicio: true, tach_fin: true,
        diff_hobbs: true, diff_tach: true, costo: true, pilotoId: true, aircraftId: true, submissionId: true, createdAt: true,
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.flightSubmission.findMany({
      select: {
        id: true, pilotoId: true, aircraftId: true, estado: true, errorMessage: true, createdAt: true, updatedAt: true,
        imageLogs: { select: { id: true, tipo: true, valorExtraido: true, confianza: true, validadoManual: true, createdAt: true } },
        flight: { select: { id: true, diff_hobbs: true, diff_tach: true, costo: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.component.findMany({ select: { id: true, tipo: true, horas_acumuladas: true, limite_tbo: true, aircraftId: true, createdAt: true } }),
    prisma.transaction.findMany({
      select: { id: true, monto: true, tipo: true, userId: true, flightId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  // Serializar decimales y fechas
  const data = {
    users: users.map((u: any) => ({ ...u, saldo_cuenta: Number(u.saldo_cuenta), tarifa_hora: Number(u.tarifa_hora), createdAt: u.createdAt.toISOString() })),
    aircraft: aircraft.map((a: any) => ({ ...a, hobbs_actual: Number(a.hobbs_actual), tach_actual: Number(a.tach_actual), createdAt: a.createdAt.toISOString() })),
    flights: flights.map((f: any) => ({
      ...f,
      hobbs_inicio: Number(f.hobbs_inicio), hobbs_fin: Number(f.hobbs_fin),
      tach_inicio: Number(f.tach_inicio), tach_fin: Number(f.tach_fin),
      diff_hobbs: Number(f.diff_hobbs), diff_tach: Number(f.diff_tach),
      costo: Number(f.costo),
      fecha: f.fecha.toISOString(),
      createdAt: f.createdAt.toISOString(),
    })),
    submissions: submissions.map((s: any) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      imageLogs: s.imageLogs.map((img: any) => ({
        ...img,
        valorExtraido: img.valorExtraido ? Number(img.valorExtraido) : null,
        confianza: img.confianza ? Number(img.confianza) : null,
        createdAt: img.createdAt.toISOString(),
      })),
      flight: s.flight ? { ...s.flight, diff_hobbs: Number(s.flight.diff_hobbs), diff_tach: Number(s.flight.diff_tach), costo: Number(s.flight.costo) } : null,
    })),
    components: components.map((c: any) => ({
      ...c,
      horas_acumuladas: Number(c.horas_acumuladas),
      limite_tbo: Number(c.limite_tbo),
      createdAt: c.createdAt.toISOString(),
    })),
    transactions: transactions.map((t: any) => ({ ...t, monto: Number(t.monto), createdAt: t.createdAt.toISOString() })),
    exportDate: new Date().toISOString(),
  };

  const html = generateOfflineHTML(data);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="flight-log-dashboard-${new Date().toISOString().split('T')[0]}.html"`,
    },
  });
}

function generateOfflineHTML(data: any) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Flight Log - Offline</title>
  <style>
    :root{--bg:linear-gradient(135deg,#eef2ff 0%,#fff 50%,#ecfdf5 100%);--fg:#0f172a;--muted:#64748b;--primary:#4f46e5;--success:#10b981;--warn:#f59e0b;--danger:#ef4444;--card:#ffffff;--border:#e2e8f0;--shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06)}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);background:linear-gradient(135deg,#eef2ff 0%,#fff 50%,#ecfdf5 100%);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;min-height:100vh}
    .container{max-width:1200px;margin:0 auto;padding:32px 24px}
    .stat-card{background:var(--card);border-radius:16px;box-shadow:var(--shadow);padding:24px;border:1px solid var(--border);position:relative;overflow:hidden}
    .stat-card::before{content:'';position:absolute;top:0;right:0;width:80px;height:80px;background:linear-gradient(135deg,#4f46e5 0%,#818cf8 100%);opacity:0.08;border-radius:0 0 0 100%}
    .muted{color:var(--muted)}
    .title{font-weight:700;color:var(--fg)}
    .grid{display:grid;gap:24px}
    @media(min-width:1024px){.grid-4{grid-template-columns:repeat(4,1fr)}.grid-3{grid-template-columns:repeat(3,1fr)}}
    .card{background:var(--card);border-radius:16px;box-shadow:var(--shadow);border:1px solid var(--border);padding:24px;margin-bottom:24px}
    .table-container{overflow-x:auto;background:var(--card);border-radius:16px;box-shadow:var(--shadow);border:1px solid var(--border)}
    table{min-width:100%;border-collapse:collapse}
    th{padding:14px 20px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;background:#f8fafc;border-bottom:2px solid var(--border)}
    td{padding:14px 20px;font-size:14px;color:var(--fg);border-bottom:1px solid #f1f5f9}
    tr:hover{background:#f8fafc}
    .tabs{display:flex;gap:8px;margin-bottom:24px}
    .tab{padding:10px 20px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--muted);font-weight:600;cursor:pointer;transition:all 0.2s}
    .tab:hover{background:#f8fafc}
    .tab.active{background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border-color:#4f46e5;box-shadow:0 2px 4px rgba(79,70,229,0.2)}
    .badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em}
    .badge-completado{background:#d1fae5;color:#065f46}
    .badge-pendiente{background:#fef3c7;color:#92400e}
    .badge-revision{background:#fed7aa;color:#9a3412}
    .badge-error{background:#fee2e2;color:#991b1b}
    .badge-procesando{background:#dbeafe;color:#1e40af}
    .controls{display:grid;gap:12px;grid-template-columns:1fr 1fr 1fr auto;margin-bottom:16px}
    .input,.select,.button{border:1px solid var(--border);border-radius:10px;padding:10px 14px;font-size:14px}
    .input,.select{background:var(--card)}
    .input:focus,.select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(79,70,229,0.1)}
    .button{background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none;cursor:pointer;font-weight:600;box-shadow:0 2px 4px rgba(79,70,229,0.2)}
    .button:hover{opacity:.92;box-shadow:0 4px 6px rgba(79,70,229,0.3)}
    .accent-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}
  </style>
</head>
<body>
  <div id="app" class="container">
    <header style="margin-bottom:32px">
      <h1 style="font-size:2rem;margin-bottom:8px;font-weight:700">Dashboard de Vuelos - Offline</h1>
      <p class="muted">Exportado: <span id="exportDate"></span></p>
    </header>

    <!-- Stats Cards -->
    <div class="grid grid-4" style="margin-bottom:32px">
      <div class="stat-card">
        <p class="muted" style="font-size:0.875rem;margin-bottom:8px"><span class="accent-dot" style="background:#3b82f6"></span>Total Envíos</p>
        <h2 id="totalSubmissions" style="font-size:2rem;font-weight:700;margin:0">0</h2>
      </div>
      <div class="stat-card">
        <p class="muted" style="font-size:0.875rem;margin-bottom:8px"><span class="accent-dot" style="background:#10b981"></span>Vuelos Registrados</p>
        <h2 id="totalFlights" style="font-size:2rem;font-weight:700;margin:0">0</h2>
      </div>
      <div class="stat-card">
        <p class="muted" style="font-size:0.875rem;margin-bottom:8px"><span class="accent-dot" style="background:#f59e0b"></span>Usuarios</p>
        <h2 id="totalUsers" style="font-size:2rem;font-weight:700;margin:0">0</h2>
      </div>
      <div class="stat-card">
        <p class="muted" style="font-size:0.875rem;margin-bottom:8px"><span class="accent-dot" style="background:#ef4444"></span>Componentes Activos</p>
        <h2 id="totalComponents" style="font-size:2rem;font-weight:700;margin:0">0</h2>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card">
      <h2 style="font-size:1.125rem;font-weight:600;margin-bottom:16px">Filtros</h2>
      <div class="controls">
        <input type="text" id="filterPilot" placeholder="Buscar piloto..." class="input">
        <input type="text" id="filterAircraft" placeholder="Buscar aeronave..." class="input">
        <select id="filterStatus" class="select">
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PROCESANDO">Procesando</option>
          <option value="REVISION">Revisión</option>
          <option value="COMPLETADO">Completado</option>
          <option value="ERROR">Error</option>
        </select>
        <button onclick="exportToCSV()" class="button">
          Exportar CSV
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button onclick="switchTab('submissions')" id="tab-submissions" class="tab active">
        Submissions
      </button>
      <button onclick="switchTab('flights')" id="tab-flights" class="tab">
        Vuelos
      </button>
      <button onclick="switchTab('users')" id="tab-users" class="tab">
        Usuarios
      </button>
      <button onclick="switchTab('components')" id="tab-components" class="tab">
        Componentes
      </button>
    </div>

    <!-- Tables -->
    <div id="content-submissions" class="table-container" style="display:block"></div>
    <div id="content-flights" class="table-container" style="display:none"></div>
    <div id="content-users" class="table-container" style="display:none"></div>
    <div id="content-components" class="table-container" style="display:none"></div>
  </div>

  <script>
    const DATA = ${JSON.stringify(data, null, 2)};
    let currentTab = 'submissions';
    let filteredData = { ...DATA };

    // Inicializar
    document.getElementById('exportDate').textContent = new Date(DATA.exportDate).toLocaleString('es-CL');
    updateStats();
    renderSubmissions();

    function updateStats() {
      document.getElementById('totalSubmissions').textContent = DATA.submissions.length;
      document.getElementById('totalFlights').textContent = DATA.flights.length;
      document.getElementById('totalUsers').textContent = DATA.users.length;
      document.getElementById('totalComponents').textContent = DATA.components.length;
    }

    function switchTab(tab) {
      currentTab = tab;
      ['submissions', 'flights', 'users', 'components'].forEach(t => {
        const el = document.getElementById(\`content-\${t}\`);
        el.style.display = t === tab ? 'block' : 'none';
        document.getElementById(\`tab-\${t}\`).classList.toggle('active', t === tab);
      });

      if (tab === 'submissions') renderSubmissions();
      if (tab === 'flights') renderFlights();
      if (tab === 'users') renderUsers();
      if (tab === 'components') renderComponents();
    }

    function applyFilters() {
      const pilot = document.getElementById('filterPilot').value.toLowerCase();
      const aircraft = document.getElementById('filterAircraft').value.toLowerCase();
      const status = document.getElementById('filterStatus').value;

      filteredData.submissions = DATA.submissions.filter(s => {
        const user = DATA.users.find(u => u.id === s.pilotoId);
        const matchPilot = !pilot || user?.nombre.toLowerCase().includes(pilot);
        const matchAircraft = !aircraft || s.aircraftId.toLowerCase().includes(aircraft);
        const matchStatus = !status || s.estado === status;
        return matchPilot && matchAircraft && matchStatus;
      });
      renderSubmissions();
    }

    document.getElementById('filterPilot').addEventListener('input', applyFilters);
    document.getElementById('filterAircraft').addEventListener('input', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);

    function renderSubmissions() {
      const data = filteredData.submissions || DATA.submissions;
      document.getElementById('content-submissions').innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Piloto</th>
              <th>Aeronave</th>
              <th>Estado</th>
              <th>Hobbs OCR</th>
              <th>Tach OCR</th>
              <th>Confianza</th>
              <th>Costo</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            \${data.map(s => {
              const user = DATA.users.find(u => u.id === s.pilotoId);
              const hobbsImg = s.imageLogs.find(img => img.tipo === 'HOBBS');
              const tachImg = s.imageLogs.find(img => img.tipo === 'TACH');
              return \`
                <tr>
                  <td>#\${s.id}</td>
                  <td>\${user?.nombre || 'N/A'}</td>
                  <td>\${s.aircraftId}</td>
                  <td><span class="badge badge-\${s.estado.toLowerCase()}">\${s.estado}</span></td>
                  <td>\${hobbsImg?.valorExtraido || '-'}</td>
                  <td>\${tachImg?.valorExtraido || '-'}</td>
                  <td>\${hobbsImg?.confianza ? hobbsImg.confianza.toFixed(0) + '%' : '-'}</td>
                  <td>\${s.flight ? '$' + s.flight.costo.toLocaleString('es-CL') : '-'}</td>
                  <td>\${new Date(s.createdAt).toLocaleDateString('es-CL')}</td>
                </tr>
              \`;
            }).join('')}
          </tbody>
        </table>
      \`;
    }

    function renderFlights() {
      document.getElementById('content-flights').innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Piloto</th>
              <th>Aeronave</th>
              <th>Hobbs Δ</th>
              <th>Tach Δ</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody>
            \${DATA.flights.map(f => {
              const user = DATA.users.find(u => u.id === f.pilotoId);
              return \`
                <tr>
                  <td>#\${f.id}</td>
                  <td>\${new Date(f.fecha).toLocaleString('es-CL')}</td>
                  <td>\${user?.nombre || 'N/A'}</td>
                  <td>\${f.aircraftId}</td>
                  <td>\${f.diff_hobbs.toFixed(1)} hrs</td>
                  <td>\${f.diff_tach.toFixed(1)} hrs</td>
                  <td>$\${f.costo.toLocaleString('es-CL')}</td>
                </tr>
              \`;
            }).join('')}
          </tbody>
        </table>
      \`;
    }

    function renderUsers() {
      document.getElementById('content-users').innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Código</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Saldo</th>
              <th>Tarifa/Hora</th>
            </tr>
          </thead>
          <tbody>
            \${DATA.users.map(u => \`
              <tr>
                <td>#\${u.id}</td>
                <td>\${u.codigo || '-'}\</td>
                <td>\${u.nombre}</td>
                <td>\${u.email}</td>
                <td><span class="badge badge-\${u.rol === 'ADMIN' ? 'completado' : 'pendiente'}">\${u.rol}</span></td>
                <td>$\${u.saldo_cuenta.toLocaleString('es-CL')}</td>
                <td>$\${u.tarifa_hora.toLocaleString('es-CL')}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function renderComponents() {
      document.getElementById('content-components').innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Aeronave</th>
              <th>Horas Acumuladas</th>
              <th>Límite TBO</th>
              <th>Restante</th>
              <th>% Vida</th>
            </tr>
          </thead>
          <tbody>
            \${DATA.components.map(c => {
              const restante = c.limite_tbo - c.horas_acumuladas;
              const pct = ((c.horas_acumuladas / c.limite_tbo) * 100).toFixed(1);
              const colorClass = pct > 80 ? 'text-red-600 font-semibold' : pct > 60 ? 'text-orange-600' : 'text-green-600';
              return \`
                <tr>
                  <td>#\${c.id}</td>
                  <td>\${c.tipo}</td>
                  <td>\${c.aircraftId}</td>
                  <td>\${c.horas_acumuladas.toFixed(1)} hrs</td>
                  <td>\${c.limite_tbo.toFixed(0)} hrs</td>
                  <td>\${restante.toFixed(1)} hrs</td>
                  <td class="\${colorClass}">\${pct}%</td>
                </tr>
              \`;
            }).join('')}
          </tbody>
        </table>
      \`;
    }

    function exportToCSV() {
      let csv = '';
      let filename = '';
      if (currentTab === 'submissions') {
        csv = 'ID,Piloto,Aeronave,Estado,Hobbs,Tach,Confianza,Costo,Fecha\\n';
        (filteredData.submissions || DATA.submissions).forEach(s => {
          const user = DATA.users.find(u => u.id === s.pilotoId);
          const hobbsImg = s.imageLogs.find(img => img.tipo === 'HOBBS');
          const tachImg = s.imageLogs.find(img => img.tipo === 'TACH');
          csv += \`\${s.id},"\${user?.nombre}",\${s.aircraftId},\${s.estado},\${hobbsImg?.valorExtraido || ''},\${tachImg?.valorExtraido || ''},\${hobbsImg?.confianza || ''},\${s.flight?.costo || ''},\${new Date(s.createdAt).toISOString()}\\n\`;
        });
        filename = 'submissions.csv';
      } else if (currentTab === 'flights') {
        csv = 'ID,Fecha,Piloto,Aeronave,Hobbs_Delta,Tach_Delta,Costo\\n';
        DATA.flights.forEach(f => {
          const user = DATA.users.find(u => u.id === f.pilotoId);
          csv += \`\${f.id},\${new Date(f.fecha).toISOString()},"\${user?.nombre}",\${f.aircraftId},\${f.diff_hobbs},\${f.diff_tach},\${f.costo}\\n\`;
        });
        filename = 'flights.csv';
      } else if (currentTab === 'users') {
        csv = 'ID,Nombre,Email,Rol,Saldo,Tarifa_Hora\\n';
        DATA.users.forEach(u => {
          csv += \`\${u.id},"\${u.nombre}",\${u.email},\${u.rol},\${u.saldo_cuenta},\${u.tarifa_hora}\\n\`;
        });
        filename = 'users.csv';
      } else if (currentTab === 'components') {
        csv = 'ID,Tipo,Aeronave,Horas_Acumuladas,Limite_TBO,Restante\\n';
        DATA.components.forEach(c => {
          csv += \`\${c.id},\${c.tipo},\${c.aircraftId},\${c.horas_acumuladas},\${c.limite_tbo},\${c.limite_tbo - c.horas_acumuladas}\\n\`;
        });
        filename = 'components.csv';
      }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  </script>
</body>
</html>`;
}
