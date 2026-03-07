#!/usr/bin/env node
/**
 * Pre-build verification script
 * Ensures all critical source files exist before starting the build.
 * This catches Railway snapshot issues early.
 */
const fs = require('fs');
const path = require('path');

const CRITICAL_FILES = [
  'lib/prisma.ts',
  'lib/auth.ts',
  'lib/r2-storage.ts',
  'lib/uf-service.ts',
  'lib/ocr-service.ts',
  'lib/codegen.ts',
  'lib/generate-account-pdf.ts',
  'lib/generate-flight-logbook-pdf.ts',
  'lib/generate-complete-excel-backup.ts',
  'lib/hobbs-predictor.ts',
  'app/actions/pilot-actions.ts',
  'app/actions/create-flight-submission.ts',
  'app/actions/create-fuel.ts',
  'app/actions/create-deposit.ts',
  'app/actions/find-or-create-pilot.ts',
  'app/actions/approve-flight.ts',
  'app/actions/cancel-submission.ts',
  'app/actions/delete-deposit.ts',
  'app/actions/delete-fuel-log.ts',
  'app/actions/register-overhaul.ts',
  'app/actions/validate-fuel.ts',
  'app/actions/validate-deposit.ts',
  'app/actions/update-aircraft.ts',
  'app/actions/update-maintenance-data.ts',
  'app/actions/update-pilot-balance.ts',
  'app/actions/update-pilot-rate.ts',
  'app/actions/update-rate-instructor.ts',
  'app/actions/update-user-password.ts',
  'app/actions/_utils/save-upload.ts',
  'app/admin/dashboard/page.tsx',
  'app/admin/dashboard/ui/DashboardClient.tsx',
  'app/api/upload-cartola/route.ts',
  'app/layout.tsx',
  'app/page.tsx',
  'prisma/schema.prisma',
  'Cuenta banco/Movimientos.xlsx',
];

const root = path.resolve(__dirname, '..');
let missing = [];

for (const file of CRITICAL_FILES) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    missing.push(file);
  }
}

if (missing.length > 0) {
  console.error('\n❌ CRITICAL: The following source files are MISSING from the build snapshot:\n');
  missing.forEach(f => console.error(`   • ${f}`));
  console.error('\n👉 FIX: Clear the Railway build cache and redeploy.');
  console.error('   Railway Dashboard → Service → Settings → Build → Clear Build Cache\n');
  
  // List what IS in app/actions/ and lib/
  console.error('--- Files present in app/actions/ ---');
  try {
    const actionsDir = path.join(root, 'app', 'actions');
    if (fs.existsSync(actionsDir)) {
      fs.readdirSync(actionsDir, { recursive: true }).forEach(f => console.error(`   ${f}`));
    } else {
      console.error('   (directory does not exist!)');
    }
  } catch (e) { console.error('   (error reading directory)'); }
  
  console.error('\n--- Files present in lib/ ---');
  try {
    const libDir = path.join(root, 'lib');
    if (fs.existsSync(libDir)) {
      fs.readdirSync(libDir).forEach(f => console.error(`   ${f}`));
    } else {
      console.error('   (directory does not exist!)');
    }
  } catch (e) { console.error('   (error reading directory)'); }
  
  process.exit(1);
} else {
  console.log(`✅ All ${CRITICAL_FILES.length} critical source files verified.`);
}
