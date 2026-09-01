"use client";

import {
  useEffect,
  useMemo,
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
  avatarUrl: string | null;
};

function getNameFromUser(user: {
  email?: string;
  user_metadata?: {
    name?: unknown;
  };
}) {
  const metadataName =
    user.user_metadata?.name;

  if (
    typeof metadataName === "string" &&
    metadataName.trim()
  ) {
    return metadataName.trim();
  }

  return (
    user.email?.split("@")[0] ||
    "Usuário"
  );
}

function getAvatarFromUser(user: {
  user_metadata?: Record<string, unknown>;
}) {
  const metadata =
    user.user_metadata || {};

  const possibleAvatar =
    metadata.avatar_url ||
    metadata.avatarUrl ||
    metadata.picture ||
    metadata.photo_url;

  if (
    typeof possibleAvatar === "string" &&
    possibleAvatar.trim()
  ) {
    return possibleAvatar.trim();
  }

  return null;
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "U";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${
    parts[parts.length - 1][0]
  }`.toUpperCase();
}

export default function DashboardHeader() {
  const router =
    useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] = useState<HeaderUser>({
    name: "Carregando...",
    email: "",
    avatarUrl: null,
  });

  const [
    isLoggingOut,
    setIsLoggingOut,
  ] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data } =
        await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (
        !data.user ||
        data.user.is_anonymous === true
      ) {
        router.replace("/");
        return;
      }

      const user: HeaderUser = {
        name: getNameFromUser(
          data.user
        ),

        email:
          data.user.email || "",

        avatarUrl:
          getAvatarFromUser(
            data.user
          ),
      };

      setCurrentUser(user);

      sessionStorage.setItem(
        CURRENT_USER_SESSION_KEY,
        JSON.stringify({
          name: user.name,
          email: user.email,
        })
      );
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [router]);

  const initials =
    useMemo(
      () =>
        getInitials(
          currentUser.name
        ),
      [currentUser.name]
    );

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await fetch(
        "/api/connectai-session",
        {
          method: "DELETE",
          credentials:
            "same-origin",
        }
      ).catch(() => {
        // A sessão local ainda será encerrada.
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

      setIsLoggingOut(false);
    }
  }

  return (
    <header className="overflow-hidden rounded-[1.75rem] border border-blue-400/10 bg-gradient-to-br from-blue-500/[0.08] via-white/[0.025] to-violet-500/[0.07] p-4 shadow-2xl shadow-black/10 backdrop-blur-2xl sm:p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.8)]" />

            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-300">
              Workspace
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Dashboard
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Organize suas reuniões,
            contextos e conteúdos em um
            único lugar.
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2.5 backdrop-blur-xl sm:p-3">
          <div className="relative h-12 w-12 shrink-0">
            {currentUser.avatarUrl ? (
              <img
                src={
                  currentUser.avatarUrl
                }
                alt={`Foto de ${currentUser.name}`}
                className="h-12 w-12 rounded-full border border-emerald-400/20 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-sm font-bold text-emerald-200">
                {initials}
              </div>
            )}

            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#10131b] bg-emerald-400" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {currentUser.name}
            </p>

            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {currentUser.email}
            </p>

            <p className="mt-1 text-[10px] font-medium text-emerald-400">
              Online
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
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 backdrop-blur-xl transition hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoggingOut
              ? "..."
              : "Sair"}
          </button>
        </div>
      </div>
    </header>
  );
}