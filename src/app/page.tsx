import Link from "next/link";

import LoginForm from "@/components/LoginForm";

export default function Home() {
  return (
    // Página inicial do ConnectAI.
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        {/* Identidade inicial do projeto */}
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white">
            ConnectAI
          </h1>

          <p className="mt-2 text-zinc-400">
            Conectando pessoas com tecnologia e inteligência artificial.
          </p>
        </header>

        {/* Formulário responsável pelo login */}
        <LoginForm />

        <p className="mt-6 text-center text-sm text-zinc-400">
          Ainda não possui uma conta?{" "}
          <Link
            href="/cadastro"
            className="font-medium text-violet-400 transition hover:text-violet-300"
          >
            Criar conta
          </Link>
        </p>
      </section>
    </main>
  );
}