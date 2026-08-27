import Link from "next/link";

import RegisterForm from "@/components/RegisterForm";

export default function CadastroPage() {
  return (
    // Página de criação de conta do ConnectAI.
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">
            Criar conta
          </h1>

          <p className="mt-2 text-zinc-400">
            Cadastre-se para começar a usar o ConnectAI.
          </p>
        </header>

        {/* Formulário responsável pelo cadastro. */}
        <RegisterForm />

        <p className="mt-6 text-center text-sm text-zinc-400">
          Já possui uma conta?{" "}
          <Link
            href="/"
            className="font-medium text-violet-400 transition hover:text-violet-300"
          >
            Entrar
          </Link>
        </p>
      </section>
    </main>
  );
}