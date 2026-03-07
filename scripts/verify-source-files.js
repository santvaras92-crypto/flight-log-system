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
  'app/actions/update-counters.ts',
  'app/actions/manual-review.ts',
  'app/actions/process-ocr.ts',
  'app/actions/register-flight.ts',
  'app/actions/register-pilot.ts',
  'app/actions/submit-flight-images.ts',
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

console.log(`\n📂 Working directory: ${process.cwd()}`);
console.log(`📂 Script root: ${root}`);

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
  process.exit(1);
}

// Extra diagnostics: verify files are REAL (not empty / not symlinks)
console.log(`\n✅ All ${CRITICAL_FILES.length} critical source files exist.`);

// Show key file sizes and first line to prove they're real
const keyFiles = ['lib/prisma.ts', 'lib/r2-storage.ts', 'app/actions/delete-deposit.ts', 'app/actions/approve-flight.ts'];
for (const file of keyFiles) {
  const fullPath = path.join(root, file);
  try {
    const stat = fs.statSync(fullPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    console.log(`   ${file}: ${stat.size}b, isSymlink=${fs.lstatSync(fullPath).isSymbolicLink()}, first="${firstLine}"`);
  } catch (e) {
    console.error(`   ${file}: ERROR reading - ${e.message}`);
  }
}

// Verify tsconfig paths resolution would work
const tsconfigPath = path.join(root, 'tsconfig.json');
if (fs.existsSync(tsconfigPath)) {
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
  console.log(`\n📋 tsconfig.json paths:`, JSON.stringify(tsconfig.compilerOptions?.paths));
}

// List ALL files in lib/ and app/actions/ with sizes
console.log('\n📁 lib/ directory:');
try {
  fs.readdirSync(path.join(root, 'lib')).forEach(f => {
    const stat = fs.statSync(path.join(root, 'lib', f));
    console.log(`   ${f} (${stat.size}b)`);
  });
} catch (e) { console.error('   ERROR:', e.message); }

console.log('\n📁 app/actions/ directory:');
try {
  fs.readdirSync(path.join(root, 'app', 'actions')).forEach(f => {
    const fp = path.join(root, 'app', 'actions', f);
    const stat = fs.statSync(fp);
    console.log(`   ${f} ${stat.isDirectory() ? '(dir)' : `(${stat.size}b)`}`);
  });
} catch (e) { console.error('   ERROR:', e.message); }

console.log('');
