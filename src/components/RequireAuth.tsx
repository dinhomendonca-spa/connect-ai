"use client";

import {
  ReactNode,
  useEffect,
  useState,
} from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

import { supabase } from "@/lib/supabase";

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

const AUTH_RETURN_TO_KEY =
  "connectai-auth-return-to";

type RequireAuthProps = {
  children: ReactNode;

  establishServerSession?: boolean;
};

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

async function syncServerSession(
  accessToken: string
) {
  const response =
    await fetch(
      "/api/connectai-session",
      {
        method:
          "POST",

        credentials:
          "same-origin",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      "Não foi possível validar a sessão no servidor."
    );
  }
}

export default function RequireAuth({
  children,
  establishServerSession =
    false,
}: RequireAuthProps) {
  const router =
    useRouter();

  const pathname =
    usePathname();

  const [
    isReady,
    setIsReady,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    let active =
      true;

    function redirectToLogin() {
      const returnTo =
        `${window.location.pathname}${window.location.search}`;

      localStorage.setItem(
        AUTH_RETURN_TO_KEY,
        returnTo
      );

      router.replace(
        `/?next=${encodeURIComponent(
          returnTo
        )}`
      );
    }

    async function validate() {
      setErrorMessage("");

      const {
        data:
          sessionData,
      } =
        await supabase.auth.getSession();

      const session =
        sessionData.session;

      if (!session) {
        redirectToLogin();
        return;
      }

      const {
        data:
          userData,
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !userData.user ||
        userData.user.is_anonymous ===
          true
      ) {
        await supabase.auth.signOut();

        redirectToLogin();
        return;
      }

      const currentUser = {
        name:
          getUserName(
            userData.user
          ),

        email:
          userData.user.email ||
          "",
      };

      sessionStorage.setItem(
        CURRENT_USER_SESSION_KEY,
        JSON.stringify(
          currentUser
        )
      );

      if (
        establishServerSession
      ) {
        try {
          await syncServerSession(
            session.access_token
          );
        } catch (error) {
          console.error(
            "Erro ao sincronizar sessão:",
            error
          );

          if (active) {
            setErrorMessage(
              "Não foi possível validar seu acesso à reunião."
            );
          }

          return;
        }
      }

      if (active) {
        setIsReady(
          true
        );
      }
    }

    void validate();

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
            event ===
              "SIGNED_OUT" ||
            !session
          ) {
            if (active) {
              setIsReady(
                false
              );

              redirectToLogin();
            }

            return;
          }

          if (
            establishServerSession &&
            (
              event ===
                "SIGNED_IN" ||
              event ===
                "TOKEN_REFRESHED"
            )
          ) {
            void syncServerSession(
              session.access_token
            ).catch(
              (error) => {
                console.error(
                  "Erro ao renovar sessão do servidor:",
                  error
                );
              }
            );
          }
        }
      );

    return () => {
      active =
        false;

      authListener.subscription.unsubscribe();
    };
  }, [
    router,
    pathname,
    establishServerSession,
  ]);

  if (errorMessage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-400/20 bg-red-500/10 p-6 text-center">
          <div className="text-4xl">
            🔐
          </div>

          <h2 className="mt-4 text-lg font-semibold text-white">
            Acesso não autorizado
          </h2>

          <p className="mt-2 text-sm leading-6 text-red-100">
            {errorMessage}
          </p>

          <button
            type="button"
            onClick={() =>
              window.location.reload()
            }
            className="mt-5 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-blue-400" />

          <p className="mt-4 text-sm text-zinc-400">
            Verificando seu acesso...
          </p>
        </div>
      </div>
    );
  }

  return children;
}