"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const AUTH_RETURN_TO_KEY =
  "connectai-auth-return-to";

function isSafeReturnPath(
  value: string
) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//")
  );
}

export default function RedefinirSenhaPage() {
  const router =
    useRouter();

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    confirmation,
    setConfirmation,
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
    isReady,
    setIsReady,
  ] = useState(false);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  useEffect(() => {
    let active =
      true;

    async function checkSession() {
      const {
        data,
      } =
        await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (
        data.session
      ) {
        setIsReady(
          true
        );
      }
    }

    void checkSession();

    const {
      data:
        authListener,
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          session
        ) => {
          if (
            !active
          ) {
            return;
          }

          if (
            event ===
              "PASSWORD_RECOVERY" ||
            session
          ) {
            setIsReady(
              true
            );
          }
        }
      );

    const timeout =
      window.setTimeout(
        () => {
          if (
            active
          ) {
            setIsReady(
              true
            );
          }
        },
        2500
      );

    return () => {
      active =
        false;

      window.clearTimeout(
        timeout
      );

      authListener.subscription.unsubscribe();
    };
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

    if (
      password.length < 6
    ) {
      setErrorMessage(
        "A nova senha deve ter pelo menos 6 caracteres."
      );

      return;
    }

    if (
      password !==
      confirmation
    ) {
      setErrorMessage(
        "As senhas não coincidem."
      );

      return;
    }

    setIsSubmitting(
      true
    );

    try {
      const {
        data:
          sessionData,
      } =
        await supabase.auth.getSession();

      if (
        !sessionData.session
      ) {
        setErrorMessage(
          "Este link de recuperação é inválido ou expirou. Solicite um novo link."
        );

        return;
      }

      const {
        error,
      } =
        await supabase.auth.updateUser(
          {
            password,
          }
        );

      if (error) {
        console.error(
          "Erro ao redefinir senha:",
          error
        );

        setErrorMessage(
          error.message ||
          "Não foi possível atualizar sua senha."
        );

        return;
      }

      setSuccessMessage(
        "Senha alterada com sucesso."
      );

      const stored =
        localStorage.getItem(
          AUTH_RETURN_TO_KEY
        ) || "";

      const returnTo =
        stored &&
        isSafeReturnPath(
          stored
        )
          ? stored
          : "/dashboard";

      localStorage.removeItem(
        AUTH_RETURN_TO_KEY
      );

      window.setTimeout(
        () => {
          router.replace(
            returnTo
          );

          router.refresh();
        },
        1200
      );
    } catch (error) {
      console.error(
        "Erro ao redefinir senha:",
        error
      );

      setErrorMessage(
        "Não foi possível atualizar sua senha."
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
            Criar nova senha
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Escolha uma nova senha para sua conta.
          </p>

          {!isReady ? (
            <div className="mt-8 text-center">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-blue-400" />

              <p className="mt-4 text-sm text-zinc-400">
                Validando link de recuperação...
              </p>
            </div>
          ) : (
            <form
              onSubmit={
                handleSubmit
              }
              className="mt-7 space-y-5"
            >
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-2 block text-sm font-medium text-zinc-200"
                >
                  Nova senha
                </label>

                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  placeholder="Digite a nova senha"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="new-password-confirmation"
                  className="mb-2 block text-sm font-medium text-zinc-200"
                >
                  Confirmar nova senha
                </label>

                <input
                  id="new-password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={
                    confirmation
                  }
                  onChange={(
                    event
                  ) =>
                    setConfirmation(
                      event.target.value
                    )
                  }
                  placeholder="Digite a nova senha novamente"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-500"
                />
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
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
                  ? "Salvando..."
                  : "Salvar nova senha"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}