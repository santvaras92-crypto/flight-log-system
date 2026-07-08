'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { runComplianceAudit, type AuditReport } from '@/lib/compliance-auditor';

/**
 * Admin-triggered "Auditar ahora" action. Runs the AD/DA compliance audit
 * (FAA Federal Register + optional DGAC) and revalidates the dashboard so any
 * newly-found directives appear immediately in the AD/DA subtab.
 */
export async function runAuditNow(): Promise<{ success: boolean; error?: string; report?: AuditReport }> {
  const session = await getServerSession(authOptions);
  if (!session || (session as any)?.role !== 'ADMIN') {
    return { success: false, error: 'No autorizado' };
  }
  try {
    const report = await runComplianceAudit();
    revalidatePath('/admin/dashboard');
    return { success: report.ok, report };
  } catch (error: any) {
    console.error('Error ejecutando auditoría de cumplimiento:', error);
    return { success: false, error: error?.message || 'Error desconocido' };
  }
}
