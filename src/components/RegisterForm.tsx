"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import FormField from "@/components/FormField";

type StoredUser = {
  name: string;
  email: string;
};

const USERS_STORAGE_KEY = "connectai-users";

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

export default function RegisterForm() {
  const router = useRouter();

  // Dados preenchidos pelo usuário.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [
    passwordConfirmation,
    setPasswordConfirmation,
  ] = useState("");

  // Mensagens de erro.
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] =
    useState("");
  const [
    passwordConfirmationError,
    setPasswordConfirmationError,
  ] = useState("");

  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setNameError("");
    setEmailError("");
    setPasswordError("");
    setPasswordConfirmationError("");

    let hasError = false;

    const normalizedName = name.trim();
    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (!normalizedName) {
      setNameError("Digite seu nome.");
      hasError = true;
    }

    if (!normalizedEmail) {
      setEmailError("Digite seu e-mail.");
      hasError = true;
    } else if (!isValidEmail(normalizedEmail)) {
      setEmailError("Digite um e-mail válido.");
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError("Digite uma senha.");
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError(
        "A senha deve ter pelo menos 6 caracteres."
      );

      hasError = true;
    }

    if (!passwordConfirmation.trim()) {
      setPasswordConfirmationError(
        "Confirme sua senha."
      );

      hasError = true;
    } else if (
      passwordConfirmation !== password
    ) {
      setPasswordConfirmationError(
        "As senhas não coincidem."
      );

      hasError = true;
    }

    if (hasError) {
      return;
    }

    const storedUsers = getStoredUsers();

    const userAlreadyExists = storedUsers.some(
      (user) =>
        user.email.toLowerCase() === normalizedEmail
    );

    if (userAlreadyExists) {
      setEmailError(
        "Já existe uma conta cadastrada com este e-mail."
      );

      return;
    }

    const newUser: StoredUser = {
      name: normalizedName,
      email: normalizedEmail,
    };

    // Nesta fase do projeto guardamos apenas
    // nome e e-mail.
    // A senha NÃO é armazenada no navegador.
    const updatedUsers = [
      ...storedUsers,
      newUser,
    ];

    localStorage.setItem(
      USERS_STORAGE_KEY,
      JSON.stringify(updatedUsers)
    );

    // Depois do cadastro, vai para o login.
    router.push("/");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <FormField
        id="name"
        label="Nome"
        type="text"
        placeholder="Digite seu nome"
        value={name}
        error={nameError}
        onChange={(event) =>
          setName(event.target.value)
        }
      />

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
        placeholder="Crie uma senha"
        value={password}
        error={passwordError}
        onChange={(event) =>
          setPassword(event.target.value)
        }
      />

      <FormField
        id="passwordConfirmation"
        label="Confirmar senha"
        type="password"
        placeholder="Digite a senha novamente"
        value={passwordConfirmation}
        error={passwordConfirmationError}
        onChange={(event) =>
          setPasswordConfirmation(
            event.target.value
          )
        }
      />

      <button
        type="submit"
        className="w-full cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98]"
      >
        Criar conta
      </button>
    </form>
  );
}