"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
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

function getReturnPath() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const fromUrl =
    params.get("next") || "";

  if (
    fromUrl &&
    isSafeReturnPath(
      fromUrl
    )
  ) {
    return fromUrl;
  }

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

function getUserName(
  user: {
    email?: string;
    user_metadata?: {
      name?: unknown;
    };
  }
) {
  const metadataName =
    user.user_metadata?.name;

  if (
    typeof metadataName ===
      "string" &&
    metadataName.trim()
  ) {
    return metadataName.trim();
  }

  return (
    user.email?.split("@")[0] ||
    "Usuário"
  );
}

export default function LoginForm() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
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
    generalError,
    setGeneralError,
  ] = useState("");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    recoveryHref,
    setRecoveryHref,
  ] = useState(
    "/recuperar-senha"
  );

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

      setRecoveryHref(
        `/recuperar-senha?next=${encodeURIComponent(
          returnTo
        )}`
      );

      return;
    }

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
      setRecoveryHref(
        `/recuperar-senha?next=${encodeURIComponent(
          stored
        )}`
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

    setEmailError("");
    setPasswordError("");
    setGeneralError("");

    let hasError = false;

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

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
        "Digite sua senha."
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

    if (hasError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data,
        error,
      } =
        await supabase.auth.signInWithPassword(
          {
            email:
              normalizedEmail,

            password,
          }
        );

      if (error) {
        setGeneralError(
          "E-mail ou senha inválidos."
        );

        return;
      }

      if (
        !data.user ||
        !data.session
      ) {
        setGeneralError(
          "Não foi possível iniciar sua sessão."
        );

        return;
      }

      if (
        data.user.is_anonymous ===
        true
      ) {
        await supabase.auth.signOut();

        setGeneralError(
          "É necessário usar uma conta registrada."
        );

        return;
      }

      const currentUser = {
        name:
          getUserName(
            data.user
          ),

        email:
          data.user.email ||
          normalizedEmail,
      };

      sessionStorage.setItem(
        CURRENT_USER_SESSION_KEY,
        JSON.stringify(
          currentUser
        )
      );

      const returnTo =
        getReturnPath();

      localStorage.removeItem(
        AUTH_RETURN_TO_KEY
      );

      router.push(
        returnTo
      );

      router.refresh();
    } catch (error) {
      console.error(
        "Erro ao fazer login:",
        error
      );

      setGeneralError(
        "Não foi possível entrar agora. Tente novamente."
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

      <div className="space-y-2">
        <FormField
          id="password"
          label="Senha"
          type="password"
          placeholder="Digite sua senha"
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

        <div className="flex justify-end">
          <Link
            href={
              recoveryHref
            }
            className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
          >
            Esqueci minha senha
          </Link>
        </div>
      </div>

      {generalError && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {generalError}
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
          ? "Entrando..."
          : "Entrar"}
      </button>
    </form>
  );
}