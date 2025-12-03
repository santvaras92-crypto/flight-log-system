import { prisma } from '../lib/prisma';

// COMPLETA ESTE MAPEO CON LOS NOMBRES COMPLETOS DE CADA PILOTO
const nameMapping: Record<string, string> = {
  // Ya expandidos
  'Santiago Varas': 'Santiago Varas',
  'José Varas': 'José Varas',
  'Pablo Silva': 'Pablo Silva',
  'Max Camposano': 'Max Camposano',
  
  // Pendientes - COMPLETAR CON NOMBRES REALES
  'J. Pizarro': 'Juan Pizarro', // CER - ejemplo, verificar nombre real
  'N. Sanhueza': 'Nombre Sanhueza', // FPRO - completar
  'I. Allende': 'Nombre Allende', // IA - completar
  'I. Cortez': 'Nombre Cortez', // IC - completar
  'I. Cifuentes': 'Nombre Cifuentes', // ICI - completar
  'I. Opazo': 'Nombre Opazo', // IO - completar
  'I. Roure': 'Nombre Roure', // IR - completar
  'J. Arnello': 'Nombre Arnello', // JA - completar
  'J. Bermedo': 'Nombre Bermedo', // JB - completar
  'N. Zapata': 'Nombre Zapata', // JC - completar
  'J. Llorente': 'Nombre Llorente', // JL - completar
  'J. Mulet': 'Nombre Mulet', // JM, JMU - completar
  'J. Pablo Bonilla': 'Juan Pablo Bonilla', // JPB - verificar
  'J. Robledo': 'Nombre Robledo', // JR - completar
  'M. Villagra': 'Nombre Villagra', // MA, MV - completar
  'M. Candia': 'Nombre Candia', // MCA - completar
  'M. Gonzalez': 'Nombre Gonzalez', // MG - completar
  'M. Herrada': 'Nombre Herrada', // MH - completar
  'M. Lobos': 'Nombre Lobos', // ML - completar
  'M. Lucero': 'Nombre Lucero', // MLU - completar
  'M. Montero': 'Nombre Montero', // MM - completar
  'M. Ortúzar': 'Nombre Ortúzar', // MO - completar
  'M. Osses': 'Nombre Osses', // MOS - completar
  'M. Sougarret': 'Nombre Sougarret', // MS - completar
  'N. Elias': 'Nombre Elias', // NE - completar
  'N. Espinoza': 'Nombre Espinoza', // NES - completar
  'N. León': 'Nombre León', // NL - completar
  'N. Rivas': 'Nombre Rivas', // NR - completar
  'N. Vega': 'Nombre Vega', // NV - completar
  'P. Agliati': 'Nombre Agliati', // PA - completar
  'P. Gutiérrez': 'Nombre Gutiérrez', // PG - completar
  'F. Rivas': 'Nombre Rivas', // PV - completar (nota: inicial no coincide)
  'R. Alvarez': 'Nombre Alvarez', // RA - completar
  'R. Barraza': 'Nombre Barraza', // RB - completar
  'R. Castro': 'Nombre Castro', // RC - completar
  'R. Fuentes': 'Nombre Fuentes', // RF - completar
  'R. Galvez': 'Nombre Galvez', // RG - completar
  'A. Brunel': 'Nombre Brunel', // RL - completar (nota: inicial no coincide)
  'R. Mejía': 'Nombre Mejía', // RM - completar
  'S. Aranguiz': 'Nombre Aranguiz', // SA - completar
  'S. Casas': 'Nombre Casas', // SC - completar
  'S. Espinoza': 'Nombre Espinoza', // SE - completar
  'S. Martin': 'Nombre Martin', // SM - completar
  'S. Navarro': 'Nombre Navarro', // SN - completar
  'T. González': 'Tomás González', // TG - ejemplo, verificar
  'T. González Colombara': 'Tomás González Colombara', // TGCO - ejemplo, verificar
  'V. Amengual': 'Nombre Amengual', // VA - completar
  'V. Asenjo': 'Nombre Asenjo', // VAS - completar
  'V. Beoriza': 'Nombre Beoriza', // VB - completar
  'V. Bascuñan': 'Nombre Bascuñan', // VBA - completar
  'V. Ortiz': 'Nombre Ortiz', // VO - completar
};

async function expandAbbreviatedNames() {
  console.log('Expandiendo nombres abreviados...\n');
  
  for (const [abbreviated, fullName] of Object.entries(nameMapping)) {
    const pilots = await prisma.user.findMany({
      where: { nombre: abbreviated },
      select: { id: true, nombre: true, codigo: true, email: true }
    });
    
    for (const pilot of pilots) {
      console.log(`Actualizando: ${pilot.nombre} (${pilot.codigo}) → ${fullName}`);
      
      await prisma.user.update({
        where: { id: pilot.id },
        data: { nombre: fullName }
      });
    }
  }
  
  console.log('\n✅ Nombres expandidos correctamente');
  await prisma.$disconnect();
}

expandAbbreviatedNames().catch(console.error);
