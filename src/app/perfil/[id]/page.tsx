"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import PlatformShell from "@/components/layout/PlatformShell";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  interests: string[] | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type SocialPost = {
  id: string;
  author_id: string;
  meeting_title: string;
  subject: string | null;
  meeting_date: string;
  meeting_time: string;
  guests: string | null;
  comment: string | null;
  created_at: string;
};

function getInitials(
  name: string
) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (
    parts.length === 0
  ) {
    return "?";
  }

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[
      parts.length - 1
    ][0]
  ).toUpperCase();
}

function formatJoinedDate(
  value: string
) {
  try {
    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        month: "long",
        year: "numeric",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return "";
  }
}

function formatMeetingDate(
  value: string
) {
  const parts =
    value.split("-");

  if (
    parts.length !== 3
  ) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatMeetingTime(
  value: string
) {
  return value.slice(
    0,
    5
  );
}

export default function PublicProfilePage() {
  const params =
    useParams<{
      id: string;
    }>();

  const profileId =
    params.id;

  const [
    profile,
    setProfile,
  ] =
    useState<Profile | null>(
      null
    );

  const [
    posts,
    setPosts,
  ] =
    useState<SocialPost[]>(
      []
    );

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState("");

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!profileId) {
        return;
      }

      setIsLoading(
        true
      );

      setErrorMessage(
        ""
      );

      try {
        const {
          data:
            userData,
        } =
          await supabase.auth.getUser();

        if (
          userData.user
        ) {
          setCurrentUserId(
            userData.user.id
          );
        }

        const [
          profileResult,
          postsResult,
        ] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(
                "id, name, headline, bio, location, interests, avatar_url, created_at, updated_at"
              )
              .eq(
                "id",
                profileId
              )
              .maybeSingle(),

            supabase
              .from(
                "social_posts"
              )
              .select(
                "id, author_id, meeting_title, subject, meeting_date, meeting_time, guests, comment, created_at"
              )
              .eq(
                "author_id",
                profileId
              )
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              )
              .limit(20),
          ]);

        if (
          profileResult.error
        ) {
          console.warn(
            "Erro ao carregar perfil:",
            {
              message:
                profileResult.error.message,
              code:
                profileResult.error.code,
              details:
                profileResult.error.details,
              hint:
                profileResult.error.hint,
            }
          );

          setErrorMessage(
            "Não foi possível carregar este perfil."
          );

          return;
        }

        if (
          !profileResult.data
        ) {
          setErrorMessage(
            "Este perfil não foi encontrado."
          );

          return;
        }

        setProfile(
          profileResult.data as Profile
        );

        if (
          postsResult.error
        ) {
          console.warn(
            "Erro ao carregar publicações:",
            {
              message:
                postsResult.error.message,
            }
          );

          setPosts([]);
        } else {
          setPosts(
            (
              postsResult.data ||
              []
            ) as SocialPost[]
          );
        }
      } catch (error) {
        console.warn(
          "Erro inesperado no perfil:",
          error
        );

        setErrorMessage(
          "Não foi possível carregar este perfil."
        );
      } finally {
        setIsLoading(
          false
        );
      }
    }

    void loadProfile();
  }, [
    profileId,
  ]);

  if (isLoading) {
    return (
      <PlatformShell>
        <div className="flex min-h-[60vh] items-center justify-center">

          <div className="text-center">

            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-pink-400" />

            <p className="mt-4 text-sm text-zinc-500">
              Carregando perfil...
            </p>

          </div>

        </div>
      </PlatformShell>
    );
  }

  if (
    errorMessage ||
    !profile
  ) {
    return (
      <PlatformShell>
        <div className="py-8">

          <div className="rounded-[1.5rem] border border-red-400/15 bg-red-500/[0.06] p-6 text-center">

            <h1 className="text-lg font-bold text-white">
              Perfil indisponível
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              {errorMessage ||
                "Perfil não encontrado."}
            </p>

            <Link
              href="/social"
              className="mt-5 inline-flex rounded-xl border border-pink-400/20 bg-pink-500/10 px-4 py-2.5 text-sm font-semibold text-pink-200"
            >
              Voltar para Social
            </Link>

          </div>

        </div>
      </PlatformShell>
    );
  }

  const isOwnProfile =
    currentUserId ===
    profile.id;

  const interests =
    profile.interests ||
    [];

  return (
    <PlatformShell>
      <div className="space-y-6 pb-10">

        <div className="flex items-center justify-between gap-3">

          <Link
            href="/social"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
          >
            ← Voltar para Social
          </Link>

          {isOwnProfile && (
            <Link
              href="/perfil"
              className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.08] px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/15"
            >
              Editar meu perfil
            </Link>
          )}

        </div>

        {/* CABEÇALHO DO PERFIL */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-pink-400/15 bg-white/[0.035] shadow-2xl shadow-black/10 backdrop-blur-2xl">

          <div className="h-28 bg-gradient-to-r from-pink-500/20 via-violet-500/10 to-cyan-500/15 sm:h-36" />

          <div className="relative px-5 pb-6 sm:px-7">

            <div className="-mt-12 flex flex-col gap-5 sm:flex-row sm:items-end">

              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[#08090f] bg-gradient-to-br from-pink-500/20 to-violet-500/10 text-2xl font-bold text-pink-100 sm:h-28 sm:w-28">

                {profile.avatar_url ? (
                  <img
                    src={
                      profile.avatar_url
                    }
                    alt={
                      profile.name
                    }
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(
                    profile.name
                  )
                )}

              </div>

              <div className="min-w-0 flex-1 pb-1">

                <div className="flex flex-wrap items-center gap-2">

                  <h1 className="text-2xl font-bold text-white sm:text-3xl">
                    {
                      profile.name
                    }
                  </h1>

                  {isOwnProfile && (
                    <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-300">
                      Você
                    </span>
                  )}

                </div>

                <p className="mt-2 text-sm font-medium text-pink-200 sm:text-base">
                  {profile.headline ||
                    "Usuário ConnectAI"}
                </p>

                {profile.location && (
                  <p className="mt-2 text-xs text-zinc-400">
                    📍 {
                      profile.location
                    }
                  </p>
                )}

                <p className="mt-2 text-xs text-zinc-600">
                  Na ConnectAI desde{" "}
                  {formatJoinedDate(
                    profile.created_at
                  )}
                </p>

              </div>

            </div>

          </div>

        </section>

        {/* SOBRE */}
        <section>

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">
            Perfil
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Sobre
          </h2>

          <div className="mt-3 rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-5">

            {profile.bio ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                {profile.bio}
              </p>
            ) : (
              <p className="text-sm text-zinc-500">
                Este usuário ainda não adicionou uma descrição ao perfil.
              </p>
            )}

          </div>

        </section>

        {/* INTERESSES */}
        <section>

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            Afinidades
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Interesses
          </h2>

          {interests.length ===
          0 ? (
            <div className="mt-3 rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-500">
              Este usuário ainda não informou seus interesses.
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">

              {interests.map(
                (
                  interest
                ) => (
                  <span
                    key={
                      interest
                    }
                    className="rounded-full border border-cyan-400/15 bg-cyan-500/[0.08] px-3.5 py-2 text-xs font-medium text-cyan-100"
                  >
                    {
                      interest
                    }
                  </span>
                )
              )}

            </div>
          )}

        </section>

        {/* PUBLICAÇÕES */}
        <section>

          <div className="flex items-end justify-between gap-3">

            <div>

              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                Atividade
              </p>

              <h2 className="mt-1 text-lg font-bold text-white">
                Publicações
              </h2>

            </div>

            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-zinc-400">
              {posts.length}{" "}
              {posts.length ===
              1
                ? "post"
                : "posts"}
            </span>

          </div>

          {posts.length ===
          0 ? (
            <div className="mt-3 rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">

              <div className="text-3xl">
                📅
              </div>

              <p className="mt-3 text-sm font-semibold text-white">
                Nenhuma publicação ainda
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                As atividades deste usuário aparecerão aqui.
              </p>

            </div>
          ) : (
            <div className="mt-3 space-y-3">

              {posts.map(
                (
                  post
                ) => (
                  <article
                    key={
                      post.id
                    }
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/10 sm:p-5"
                  >

                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-400">
                      Reunião / Evento
                    </p>

                    <h3 className="mt-2 text-lg font-bold text-white">
                      {
                        post.meeting_title
                      }
                    </h3>

                    {post.subject && (
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        {
                          post.subject
                        }
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2">

                      <div className="rounded-xl border border-cyan-400/10 bg-cyan-500/[0.05] p-3">

                        <p className="text-[9px] uppercase text-cyan-300">
                          Data
                        </p>

                        <p className="mt-1 text-sm font-semibold text-white">
                          {formatMeetingDate(
                            post.meeting_date
                          )}
                        </p>

                      </div>

                      <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.05] p-3">

                        <p className="text-[9px] uppercase text-violet-300">
                          Horário
                        </p>

                        <p className="mt-1 text-sm font-semibold text-white">
                          {formatMeetingTime(
                            post.meeting_time
                          )}
                        </p>

                      </div>

                    </div>

                    {post.guests && (
                      <div className="mt-3 rounded-xl border border-amber-400/10 bg-amber-500/[0.04] p-3">

                        <p className="text-[9px] uppercase text-amber-300">
                          Participantes
                        </p>

                        <p className="mt-1 text-sm text-zinc-300">
                          {
                            post.guests
                          }
                        </p>

                      </div>
                    )}

                    {post.comment && (
                      <p className="mt-4 whitespace-pre-wrap border-t border-white/10 pt-4 text-sm leading-6 text-zinc-300">
                        {
                          post.comment
                        }
                      </p>
                    )}

                  </article>
                )
              )}

            </div>
          )}

        </section>

      </div>
    </PlatformShell>
  );
}