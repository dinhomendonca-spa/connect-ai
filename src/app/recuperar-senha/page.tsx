"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

const AUTH_RETURN_TO_KEY =
  "connectai-auth-return-to";

function isValidEmail(
  email: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function isSafeReturnPath(
  value: string
) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//")
  );
}

export default function RecuperarSenhaPage() {
  const [
    email,
    setEmail,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const returnTo =
      params.get("next") || "";

    if (
      returnTo &&
      isSafeReturnPath(
        returnTo
      )
    ) {
      localStorage.setItem(
        AUTH_RETURN_TO_KEY,
        returnTo
      );
    }
  }, []);

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !normalizedEmail
    ) {
      setErrorMessage(
        "Digite seu e-mail."
      );

      return;
    }

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      setErrorMessage(
        "Digite um e-mail válido."
      );

      return;
    }

    setIsSubmitting(true);

    try {
      const {
        error,
      } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo:
              `${window.location.origin}/redefinir-senha`,
          }
        );

      if (error) {
        console.error(
          "Erro ao solicitar recuperação:",
          error
        );

        setErrorMessage(
          "Não foi possível enviar o e-mail de recuperação agora."
        );

        return;
      }

      setSuccessMessage(
        "Se existir uma conta cadastrada com esse e-mail, você receberá um link para criar uma nova senha."
      );
    } catch (error) {
      console.error(
        "Erro ao solicitar recuperação:",
        error
      );

      setErrorMessage(
        "Não foi possível enviar o e-mail de recuperação agora."
      );
    } finally {
      setIsSubmitting(
        false
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#05070d] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center">
        <section className="w-full rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          <p className="text-sm font-semibold text-blue-400">
            ConnectAI
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Recuperar senha
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Digite o e-mail da sua conta. Enviaremos um link seguro para você criar uma nova senha.
          </p>

          <form
            onSubmit={
              handleSubmit
            }
            className="mt-7 space-y-5"
          >
            <div>
              <label
                htmlFor="recovery-email"
                className="mb-2 block text-sm font-medium text-zinc-200"
              >
                E-mail
              </label>

              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(
                  event
                ) =>
                  setEmail(
                    event.target.value
                  )
                }
                placeholder="seu@email.com"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-500"
              />
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-200">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isSubmitting
              }
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Enviando..."
                : "Enviar link de recuperação"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-400 transition hover:text-white"
            >
              Voltar para o login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}