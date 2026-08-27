"use client";

import { FormEvent, useState } from "react";

import FormField from "@/components/FormField";

export default function LoginForm() {
  // Dados digitados pelo usuário.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Mensagens de erro específicas para cada campo.
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Limpa erros da tentativa anterior.
    setEmailError("");
    setPasswordError("");

    let hasError = false;

    if (!email.trim()) {
      setEmailError("Digite seu e-mail.");
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError("Digite sua senha.");
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      hasError = true;
    }

    // Se houver algum erro, não continuamos o login.
    if (hasError) {
      return;
    }

    // Mais tarde, aqui enviaremos os dados para o backend.
    console.log("Dados válidos. Pronto para enviar ao servidor.");
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
        onChange={(event) => setEmail(event.target.value)}
      />

      <FormField
        id="password"
        label="Senha"
        type="password"
        placeholder="Digite sua senha"
        value={password}
        error={passwordError}
        onChange={(event) => setPassword(event.target.value)}
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