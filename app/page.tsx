import { redirect } from 'next/navigation';

export default async function Home() {
  // Redirigir a la página de registro
  redirect('/register');
}
