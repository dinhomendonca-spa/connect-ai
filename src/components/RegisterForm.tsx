"use client";

import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import FormField from "@/components/FormField";
import { supabase } from "@/lib/supabase";

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

const AUTH_RETURN_TO_KEY =
  "connectai-auth-return-to";

function isValidEmail(
  email: string
) {
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return emailRegex.test(
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

function getStoredReturnPath() {
  const stored =
    localStorage.getItem(
      AUTH_RETURN_TO_KEY
    ) || "";

  if (
    stored &&
    isSafeReturnPath(
      stored
    )
  ) {
    return stored;
  }

  return "/dashboard";
}

export default function RegisterForm() {
  const router =
    useRouter();

  const [
    name,
    setName,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    passwordConfirmation,
    setPasswordConfirmation,
  ] = useState("");

  const [
    nameError,
    setNameError,
  ] = useState("");

  const [
    emailError,
    setEmailError,
  ] = useState("");

  const [
    passwordError,
    setPasswordError,
  ] = useState("");

  const [
    passwordConfirmationError,
    setPasswordConfirmationError,
  ] = useState("");

  const [
    generalError,
    setGeneralError,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setNameError("");
    setEmailError("");
    setPasswordError("");
    setPasswordConfirmationError("");
    setGeneralError("");
    setSuccessMessage("");

    let hasError = false;

    const normalizedName =
      name.trim();

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (!normalizedName) {
      setNameError(
        "Digite seu nome."
      );

      hasError = true;
    }

    if (!normalizedEmail) {
      setEmailError(
        "Digite seu e-mail."
      );

      hasError = true;
    } else if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      setEmailError(
        "Digite um e-mail válido."
      );

      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError(
        "Digite uma senha."
      );

      hasError = true;
    } else if (
      password.length < 6
    ) {
      setPasswordError(
        "A senha deve ter pelo menos 6 caracteres."
      );

      hasError = true;
    }

    if (
      !passwordConfirmation.trim()
    ) {
      setPasswordConfirmationError(
        "Confirme sua senha."
      );

      hasError = true;
    } else if (
      passwordConfirmation !==
      password
    ) {
      setPasswordConfirmationError(
        "As senhas não coincidem."
      );

      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data,
        error,
      } =
        await supabase.auth.signUp(
          {
            email:
              normalizedEmail,

            password,

            options: {
              data: {
                name:
                  normalizedName,
              },

              emailRedirectTo:
                `${window.location.origin}/`,
            },
          }
        );

      if (error) {
        const message =
          error.message.toLowerCase();

        if (
          message.includes(
            "already"
          ) ||
          message.includes(
            "registered"
          )
        ) {
          setEmailError(
            "Já existe uma conta cadastrada com este e-mail."
          );
        } else {
          setGeneralError(
            error.message
          );
        }

        return;
      }

      if (data.session) {
        sessionStorage.setItem(
          CURRENT_USER_SESSION_KEY,
          JSON.stringify({
            name:
              normalizedName,

            email:
              normalizedEmail,
          })
        );

        const returnTo =
          getStoredReturnPath();

        localStorage.removeItem(
          AUTH_RETURN_TO_KEY
        );

        router.push(
          returnTo
        );

        router.refresh();

        return;
      }

      setSuccessMessage(
        "Conta criada. Confirme seu e-mail e depois faça login. O ConnectAI guardou o convite para levar você de volta à reunião."
      );
    } catch (error) {
      console.error(
        "Erro ao criar conta:",
        error
      );

      setGeneralError(
        "Não foi possível criar sua conta agora. Tente novamente."
      );
    } finally {
      setIsSubmitting(
        false
      );
    }
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="space-y-5"
    >
      <FormField
        id="name"
        label="Nome"
        type="text"
        placeholder="Digite seu nome"
        value={name}
        error={nameError}
        onChange={(
          event
        ) =>
          setName(
            event.target.value
          )
        }
      />

      <FormField
        id="email"
        label="E-mail"
        type="email"
        placeholder="seu@email.com"
        value={email}
        error={emailError}
        onChange={(
          event
        ) =>
          setEmail(
            event.target.value
          )
        }
      />

      <FormField
        id="password"
        label="Senha"
        type="password"
        placeholder="Crie uma senha"
        value={password}
        error={passwordError}
        onChange={(
          event
        ) =>
          setPassword(
            event.target.value
          )
        }
      />

      <FormField
        id="passwordConfirmation"
        label="Confirmar senha"
        type="password"
        placeholder="Digite a senha novamente"
        value={
          passwordConfirmation
        }
        error={
          passwordConfirmationError
        }
        onChange={(
          event
        ) =>
          setPasswordConfirmation(
            event.target.value
          )
        }
      />

      {generalError && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {generalError}
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
        className="w-full cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting
          ? "Criando conta..."
          : "Criar conta"}
      </button>
    </form>
  );
}