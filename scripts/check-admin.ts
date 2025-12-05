import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';

async function main() {
  // Check admin user
  const admin = await prisma.user.findFirst({
    where: { rol: 'ADMIN' },
    select: { id: true, email: true, nombre: true, rol: true, password: true }
  });
  
  console.log('Admin user:', admin);
  
  if (admin) {
    console.log('Has password:', !!admin.password);
    
    // Test password
    if (admin.password) {
      const isValid = await bcrypt.compare('admin123', admin.password);
      console.log('Password "admin123" valid:', isValid);
    }
  } else {
    console.log('No admin user found! Creating one...');
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const newAdmin = await prisma.user.create({
      data: {
        email: 'admin@aeroclub.cl',
        nombre: 'Administrador',
        rol: 'ADMIN',
        password: hashedPassword,
        tarifa_hora: 0,
      }
    });
    console.log('Created admin:', newAdmin);
  }
}

main().then(() => process.exit(0)).catch(console.error);
