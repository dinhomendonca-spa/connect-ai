"use client";

import { FormEvent, useState } from "react";

import FormField from "@/components/FormField";

// Valida um formato simples de e-mail.
// Não tenta cobrir todos os casos possíveis da internet,
// apenas evita entradas claramente inválidas.
function isValidEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return emailRegex.test(email);
}

export default function RegisterForm() {
  // Dados preenchidos pelo usuário.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  // Mensagens de erro específicas de cada campo.
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordConfirmationError, setPasswordConfirmationError] =
    useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Limpa os erros da tentativa anterior.
    setNameError("");
    setEmailError("");
    setPasswordError("");
    setPasswordConfirmationError("");

    let hasError = false;

    if (!name.trim()) {
      setNameError("Digite seu nome.");
      hasError = true;
    }

    if (!email.trim()) {
      setEmailError("Digite seu e-mail.");
      hasError = true;
    } else if (!isValidEmail(email)) {
      setEmailError("Digite um e-mail válido.");
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError("Digite uma senha.");
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      hasError = true;
    }

    if (!passwordConfirmation.trim()) {
      setPasswordConfirmationError("Confirme sua senha.");
      hasError = true;
    } else if (passwordConfirmation !== password) {
      setPasswordConfirmationError("As senhas não coincidem.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    // Mais tarde, aqui enviaremos os dados para o backend.
    console.log("Cadastro validado com sucesso.");
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
        onChange={(event) => setName(event.target.value)}
      />

      <FormField
        id="email"
        label="E-mail"
        type="email"
        placeholder="seu@email.com"
        value={email}
        error={emailError}
        onChange={(event) => setEmail(event.target.value)}
      />

      <FormField
        id="password"
        label="Senha"
        type="password"
        placeholder="Crie uma senha"
        value={password}
        error={passwordError}
        onChange={(event) => setPassword(event.target.value)}
      />

      <FormField
        id="passwordConfirmation"
        label="Confirmar senha"
        type="password"
        placeholder="Digite a senha novamente"
        value={passwordConfirmation}
        error={passwordConfirmationError}
        onChange={(event) =>
          setPasswordConfirmation(event.target.value)
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