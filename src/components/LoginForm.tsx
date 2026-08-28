"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import FormField from "@/components/FormField";

type StoredUser = {
  name: string;
  email: string;
};

const USERS_STORAGE_KEY = "connectai-users";

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

function isValidEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return emailRegex.test(email);
}

function getStoredUsers(): StoredUser[] {
  try {
    const storedUsers = localStorage.getItem(
      USERS_STORAGE_KEY
    );

    if (!storedUsers) {
      return [];
    }

    const parsedUsers = JSON.parse(storedUsers);

    if (!Array.isArray(parsedUsers)) {
      return [];
    }

    return parsedUsers;
  } catch {
    return [];
  }
}

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [emailError, setEmailError] =
    useState("");

  const [passwordError, setPasswordError] =
    useState("");

  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setEmailError("");
    setPasswordError("");

    let hasError = false;

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      setEmailError("Digite seu e-mail.");
      hasError = true;
    } else if (!isValidEmail(normalizedEmail)) {
      setEmailError("Digite um e-mail válido.");
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError("Digite sua senha.");
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError(
        "A senha deve ter pelo menos 6 caracteres."
      );

      hasError = true;
    }

    if (hasError) {
      return;
    }

    const storedUsers = getStoredUsers();

    const user = storedUsers.find(
      (storedUser) =>
        storedUser.email.toLowerCase() ===
        normalizedEmail
    );

    if (!user) {
      setEmailError(
        "Conta não encontrada. Crie uma conta primeiro."
      );

      return;
    }

    // Autenticação temporária do protótipo.
    // Não verificamos senha de verdade porque
    // ainda não existe backend.
    //
    // Nunca armazenamos a senha no navegador.
    sessionStorage.setItem(
      CURRENT_USER_SESSION_KEY,
      JSON.stringify(user)
    );

    router.push("/dashboard");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <FormField
        id="email"
        label="E-mail"
        type="email"
        placeholder="seu@email.com"
        value={email}
        error={emailError}
        onChange={(event) =>
          setEmail(event.target.value)
        }
      />

      <FormField
        id="password"
        label="Senha"
        type="password"
        placeholder="Digite sua senha"
        value={password}
        error={passwordError}
        onChange={(event) =>
          setPassword(event.target.value)
        }
      />

      <button
        type="submit"
        className="w-full cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98]"
      >
        Entrar
      </button>
    </form>
  );
}