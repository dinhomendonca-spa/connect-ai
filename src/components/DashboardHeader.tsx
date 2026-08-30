"use client";

import {
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

const AUTH_RETURN_TO_KEY =
  "connectai-auth-return-to";

type HeaderUser = {
  name: string;
  email: string;
};

function getNameFromUser(
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

export default function DashboardHeader() {
  const router =
    useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] = useState<HeaderUser>({
    name:
      "Carregando...",

    email:
      "",
  });

  const [
    isLoggingOut,
    setIsLoggingOut,
  ] = useState(false);

  useEffect(() => {
    let active =
      true;

    async function loadUser() {
      const {
        data,
      } =
        await supabase.auth.getUser();

      if (
        !active
      ) {
        return;
      }

      if (
        !data.user ||
        data.user.is_anonymous ===
          true
      ) {
        router.replace("/");
        return;
      }

      const user = {
        name:
          getNameFromUser(
            data.user
          ),

        email:
          data.user.email ||
          "",
      };

      setCurrentUser(
        user
      );

      sessionStorage.setItem(
        CURRENT_USER_SESSION_KEY,
        JSON.stringify(user)
      );
    }

    void loadUser();

    return () => {
      active =
        false;
    };
  }, [router]);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(
      true
    );

    try {
      await fetch(
        "/api/connectai-session",
        {
          method:
            "DELETE",

          credentials:
            "same-origin",
        }
      ).catch(() => {
        // A sessão do navegador ainda será encerrada.
      });

      await supabase.auth.signOut();
    } finally {
      sessionStorage.removeItem(
        CURRENT_USER_SESSION_KEY
      );

      localStorage.removeItem(
        AUTH_RETURN_TO_KEY
      );

      router.replace("/");
      router.refresh();

      setIsLoggingOut(
        false
      );
    }
  }

  return (
    <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-blue-400">
          ConnectAI
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Dashboard
        </h1>

        <p className="mt-2 text-zinc-400">
          Organize reuniões, contextos e relatórios em um só lugar.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 text-right">
          <p className="max-w-48 truncate text-sm font-medium">
            {currentUser.name}
          </p>

          <p className="max-w-48 truncate text-xs text-zinc-500">
            {currentUser.email}
          </p>
        </div>

        <button
          type="button"
          onClick={
            handleLogout
          }
          disabled={
            isLoggingOut
          }
          className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut
            ? "Saindo..."
            : "Sair"}
        </button>
      </div>
    </header>
  );
}