import type { Metadata } from 'next';
import { SalaPaciente } from '@/components/SalaPaciente';

// Página do paciente, sem login. O token vem na URL e só vai ao back; a
// política de referrer (no-referrer) impede que ele siga para o Meet.
export const metadata: Metadata = { title: 'Sala online · Senda' };

export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SalaPaciente token={token} />;
}
