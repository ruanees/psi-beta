import Link from 'next/link';

export default function NaoEncontrada() {
  return (
    <main className="entrada">
      <div className="entrada-caixa pilha">
        <h1>Página não encontrada</h1>
        <p className="mudo">O endereço não existe ou mudou de lugar.</p>
        <Link className="btn" href="/inicio">
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
