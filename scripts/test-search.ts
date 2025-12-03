import { searchExistingPilots } from '../app/actions/pilot-actions';

async function test() {
  console.log('Buscando "Santiago" + "Varas"...\n');
  
  const result = await searchExistingPilots('Santiago', 'Varas', '18166515-7');
  
  console.log('Resultado:');
  console.log('- Exact match:', result.exactMatch);
  console.log('- Match type:', result.matchType);
  console.log('- Pilot:', result.pilot);
  console.log('- Sugerencias encontradas:', result.suggestions.length);
  
  if (result.suggestions.length > 0) {
    console.log('\nSugerencias:');
    result.suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.nombre} (${s.codigo}) - Email: ${s.email}`);
    });
  }
}

test();
