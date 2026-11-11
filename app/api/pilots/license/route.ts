import { NextRequest, NextResponse } from 'next/server';
import { resolveLicense, sipaPdfUrl, SIPA_VERIFY_PAGE, type SipaRow } from '@/lib/sipa-license';

/**
 * GET /api/pilots/license?licencia=1672&documento=15380695-0&tipoDocumento=rut&nombre=Alfredo+Rossi
 *
 * Solo ADMIN (ver ADMIN_API_PREFIXES en middleware.ts).
 * Busca la licencia en SIPA (consulta pública de la DGAC) y redirige al PDF del botón "Imprimir".
 * Si hay ambigüedad o no se encuentra, muestra una página con las opciones.
 */
export const dynamic = 'force-dynamic';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SECTION_LABEL: Record<SipaRow['seccion'], string> = {
  nacional: 'Nacional',
  provisional: 'Provisional',
  convalidacion: 'Convalidación',
};

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#0f172a}
  .card{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:18px;margin:0 0 8px} p{font-size:14px;color:#475569;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
  th,td{text-align:left;padding:8px;border-bottom:1px solid #e2e8f0} th{color:#64748b;font-size:11px;text-transform:uppercase}
  a.btn{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:12px}
  a.link{color:#1d4ed8;font-size:13px}
</style></head><body><div class="card">${body}</div></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const licencia = (sp.get('licencia') || '').trim();
  const documento = (sp.get('documento') || '').trim();
  const tipoDocumento = (sp.get('tipoDocumento') || '').trim();
  const nombre = (sp.get('nombre') || '').trim();

  if (!licencia && !documento) {
    return page('Licencia', '<h1>Faltan datos</h1><p>Indica un número de licencia o un documento.</p>', 400);
  }

  const fallbackLink = `<p><a class="link" href="${SIPA_VERIFY_PAGE}" target="_blank" rel="noopener noreferrer">Abrir SIPA y buscar manualmente →</a></p>`;

  let result;
  try {
    result = await resolveLicense({ licencia, documento, tipoDocumento, nombre });
  } catch (e: any) {
    console.error('[license] error consultando SIPA:', e);
    return page(
      'SIPA no disponible',
      `<h1>No se pudo consultar SIPA</h1>
       <p>${esc(e?.name === 'AbortError' ? 'SIPA no respondió a tiempo.' : [e?.message, e?.cause?.message].filter(Boolean).join(' — ') || 'Error desconocido')}</p>${fallbackLink}`,
      502
    );
  }

  if (result.kind === 'found') {
    return NextResponse.redirect(sipaPdfUrl(result.row.id), 302);
  }

  if (result.kind === 'none') {
    return page('Licencia no encontrada', `<h1>Licencia no encontrada</h1><p>${esc(result.note)}</p>${fallbackLink}`, 404);
  }

  const rows = result.rows
    .map(
      r => `<tr>
        <td>${esc(r.nombre)}</td><td>${esc(r.numero)}</td><td>${esc(r.tipo)}</td><td>${SECTION_LABEL[r.seccion]}</td>
        <td><a class="btn" href="${sipaPdfUrl(r.id)}" target="_blank" rel="noopener noreferrer">Abrir PDF</a></td>
      </tr>`
    )
    .join('');
  return page(
    'Elegir licencia',
    `<h1>Elige la licencia correcta</h1><p>${esc(result.note)}</p>
     <table><thead><tr><th>Nombre</th><th>N°</th><th>Licencia</th><th>Tipo</th><th></th></tr></thead><tbody>${rows}</tbody></table>${fallbackLink}`
  );
}
