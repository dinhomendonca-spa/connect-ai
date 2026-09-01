"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import PlatformShell from "@/components/layout/PlatformShell";
import { supabase } from "@/lib/supabase";

type ProfileForm = {
  name: string;
  headline: string;
  bio: string;
  location: string;
  interests: string[];
};

type PublicProfile = {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  interests: string[] | null;
  avatar_url: string | null;
};

const availableInterests = [
  "Desenvolvimento",
  "Inteligência Artificial",
  "Networking",
  "Podcast",
  "Tecnologia",
  "Design",
  "Empreendedorismo",
  "Idiomas",
  "Carreira",
  "Freelancer",
];

const MAX_AVATAR_SIZE =
  5 * 1024 * 1024;

const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

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
    return "U";
  }

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${
    parts[
      parts.length - 1
    ][0]
  }`.toUpperCase();
}

function readMetadataString(
  value: unknown
) {
  return typeof value ===
    "string"
    ? value
    : "";
}

function readMetadataInterests(
  value: unknown
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item
    ): item is string =>
      typeof item ===
      "string"
  );
}

function getFileExtension(
  file: File
) {
  if (
    file.type ===
    "image/png"
  ) {
    return "png";
  }

  if (
    file.type ===
    "image/webp"
  ) {
    return "webp";
  }

  return "jpg";
}

function getErrorMessage(
  error: unknown
) {
  if (
    error &&
    typeof error ===
      "object" &&
    "message" in error &&
    typeof (
      error as {
        message?: unknown;
      }
    ).message ===
      "string"
  ) {
    return (
      error as {
        message: string;
      }
    ).message;
  }

  return String(error);
}

export default function PerfilPage() {
  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [
    userId,
    setUserId,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    avatarUrl,
    setAvatarUrl,
  ] = useState("");

  const [
    avatarPath,
    setAvatarPath,
  ] = useState("");

  const [
    avatarFile,
    setAvatarFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    avatarPreview,
    setAvatarPreview,
  ] = useState("");

  const [
    form,
    setForm,
  ] = useState<ProfileForm>({
    name: "",
    headline: "",
    bio: "",
    location: "",
    interests: [],
  });

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    feedback,
    setFeedback,
  ] = useState("");

  const [
    feedbackType,
    setFeedbackType,
  ] = useState<
    "success" | "error" | ""
  >("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setIsLoading(true);

      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.getUser();

      if (
        !active
      ) {
        return;
      }

      if (
        authError ||
        !authData.user
      ) {
        if (authError) {
          console.warn(
            "Erro ao carregar usuário:",
            {
              message:
                authError.message,
            }
          );
        }

        setFeedback(
          "Não foi possível carregar seu usuário."
        );

        setFeedbackType(
          "error"
        );

        setIsLoading(false);

        return;
      }

      const user =
        authData.user;

      const metadata =
        user.user_metadata ||
        {};

      setUserId(
        user.id
      );

      setEmail(
        user.email || ""
      );

      const {
        data: profileData,
        error: profileError,
      } =
        await supabase
          .from("profiles")
          .select(
            "id, name, headline, bio, location, interests, avatar_url"
          )
          .eq(
            "id",
            user.id
          )
          .maybeSingle();

      if (!active) {
        return;
      }

      if (
        profileError
      ) {
        console.warn(
          "Erro ao carregar perfil público:",
          {
            message:
              profileError.message,
            code:
              profileError.code,
            details:
              profileError.details,
            hint:
              profileError.hint,
          }
        );
      }

      const publicProfile =
        profileData as PublicProfile | null;

      const metadataName =
        readMetadataString(
          metadata.name
        ).trim();

      const fallbackName =
        user.email
          ?.split("@")[0] ||
        "Usuário";

      const loadedName =
        publicProfile?.name?.trim() ||
        metadataName ||
        fallbackName;

      const loadedHeadline =
        publicProfile
          ?.headline ??
        readMetadataString(
          metadata.headline
        );

      const loadedBio =
        publicProfile?.bio ??
        readMetadataString(
          metadata.bio
        );

      const loadedLocation =
        publicProfile
          ?.location ??
        readMetadataString(
          metadata.location
        );

      const loadedInterests =
        Array.isArray(
          publicProfile?.interests
        )
          ? publicProfile
              ?.interests || []
          : readMetadataInterests(
              metadata.interests
            );

      const loadedAvatar =
        publicProfile
          ?.avatar_url ||
        readMetadataString(
          metadata.avatar_url
        );

      const loadedAvatarPath =
        readMetadataString(
          metadata.avatar_path
        );

      setForm({
        name:
          loadedName,

        headline:
          loadedHeadline,

        bio:
          loadedBio,

        location:
          loadedLocation,

        interests:
          loadedInterests,
      });

      setAvatarUrl(
        loadedAvatar
      );

      setAvatarPath(
        loadedAvatarPath
      );

      setIsLoading(false);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (
        avatarPreview
      ) {
        URL.revokeObjectURL(
          avatarPreview
        );
      }
    };
  }, [
    avatarPreview,
  ]);

  const initials =
    useMemo(
      () =>
        getInitials(
          form.name ||
            "Usuário"
        ),
      [
        form.name,
      ]
    );

  const displayedAvatar =
    avatarPreview ||
    avatarUrl;

  function clearFeedback() {
    setFeedback("");
    setFeedbackType("");
  }

  function updateField(
    field:
      | "name"
      | "headline"
      | "bio"
      | "location",
    value: string
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );

    clearFeedback();
  }

  function toggleInterest(
    interest: string
  ) {
    setForm(
      (current) => {
        const selected =
          current.interests.includes(
            interest
          );

        return {
          ...current,

          interests:
            selected
              ? current.interests.filter(
                  (item) =>
                    item !==
                    interest
                )
              : [
                  ...current.interests,
                  interest,
                ],
        };
      }
    );

    clearFeedback();
  }

  function handleAvatarChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    clearFeedback();

    if (
      !ALLOWED_AVATAR_TYPES.includes(
        file.type
      )
    ) {
      setFeedback(
        "Escolha uma imagem JPG, PNG ou WEBP."
      );

      setFeedbackType(
        "error"
      );

      event.target.value =
        "";

      return;
    }

    if (
      file.size >
      MAX_AVATAR_SIZE
    ) {
      setFeedback(
        "A foto deve ter no máximo 5 MB."
      );

      setFeedbackType(
        "error"
      );

      event.target.value =
        "";

      return;
    }

    if (
      avatarPreview
    ) {
      URL.revokeObjectURL(
        avatarPreview
      );
    }

    const previewUrl =
      URL.createObjectURL(
        file
      );

    setAvatarFile(
      file
    );

    setAvatarPreview(
      previewUrl
    );
  }

  async function uploadAvatar() {
    if (
      !avatarFile ||
      !userId
    ) {
      return {
        url:
          avatarUrl,
        path:
          avatarPath,
      };
    }

    const extension =
      getFileExtension(
        avatarFile
      );

    const newPath =
      `${userId}/avatar-${Date.now()}.${extension}`;

    const {
      error:
        uploadError,
    } =
      await supabase.storage
        .from("avatars")
        .upload(
          newPath,
          avatarFile,
          {
            cacheControl:
              "3600",

            upsert:
              false,
          }
        );

    if (
      uploadError
    ) {
      throw uploadError;
    }

    const {
      data:
        publicUrlData,
    } =
      supabase.storage
        .from("avatars")
        .getPublicUrl(
          newPath
        );

    const newUrl =
      publicUrlData.publicUrl;

    if (
      avatarPath &&
      avatarPath !==
        newPath
    ) {
      const {
        error:
          removeError,
      } =
        await supabase.storage
          .from(
            "avatars"
          )
          .remove([
            avatarPath,
          ]);

      if (
        removeError
      ) {
        console.warn(
          "Não foi possível remover o avatar anterior:",
          {
            message:
              removeError.message,
          }
        );
      }
    }

    return {
      url:
        newUrl,

      path:
        newPath,
    };
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !form.name.trim() ||
      !userId ||
      isSaving
    ) {
      return;
    }

    setIsSaving(true);

    clearFeedback();

    try {
      const normalizedName =
        form.name.trim();

      const normalizedHeadline =
        form.headline.trim();

      const normalizedBio =
        form.bio.trim();

      const normalizedLocation =
        form.location.trim();

      const uploadedAvatar =
        await uploadAvatar();

      /*
       * Atualiza primeiro o perfil público.
       * É este registro que a Social e
       * /perfil/[id] enxergam.
       */
      const {
        data:
          updatedProfile,
        error:
          profileError,
      } =
        await supabase
          .from("profiles")
          .update({
            name:
              normalizedName,

            headline:
              normalizedHeadline ||
              null,

            bio:
              normalizedBio ||
              null,

            location:
              normalizedLocation ||
              null,

            interests:
              form.interests,

            avatar_url:
              uploadedAvatar.url ||
              null,
          })
          .eq(
            "id",
            userId
          )
          .select(
            "id, name, headline, bio, location, interests, avatar_url"
          )
          .single();

      if (
        profileError
      ) {
        throw new Error(
          `Não foi possível atualizar o perfil público: ${profileError.message}`
        );
      }

      /*
       * Também mantém o metadata do Auth
       * sincronizado para outras partes
       * já existentes da ConnectAI.
       */
      const {
        error:
          authUpdateError,
      } =
        await supabase.auth.updateUser({
          data: {
            name:
              normalizedName,

            headline:
              normalizedHeadline,

            bio:
              normalizedBio,

            location:
              normalizedLocation,

            interests:
              form.interests,

            avatar_url:
              uploadedAvatar.url,

            avatar_path:
              uploadedAvatar.path,
          },
        });

      if (
        authUpdateError
      ) {
        throw new Error(
          `O perfil público foi salvo, mas os dados da conta não foram sincronizados: ${authUpdateError.message}`
        );
      }

      const savedProfile =
        updatedProfile as PublicProfile;

      setForm({
        name:
          savedProfile.name,

        headline:
          savedProfile.headline ||
          "",

        bio:
          savedProfile.bio ||
          "",

        location:
          savedProfile.location ||
          "",

        interests:
          savedProfile.interests ||
          [],
      });

      setAvatarUrl(
        savedProfile.avatar_url ||
        uploadedAvatar.url
      );

      setAvatarPath(
        uploadedAvatar.path
      );

      setAvatarFile(
        null
      );

      if (
        avatarPreview
      ) {
        URL.revokeObjectURL(
          avatarPreview
        );
      }

      setAvatarPreview(
        ""
      );

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }

      setFeedback(
        "Perfil atualizado com sucesso. Suas informações já estão visíveis na área Social."
      );

      setFeedbackType(
        "success"
      );
    } catch (error) {
      console.warn(
        "Erro ao salvar perfil:",
        {
          message:
            getErrorMessage(
              error
            ),
        }
      );

      setFeedback(
        getErrorMessage(
          error
        ) ||
          "Não foi possível salvar seu perfil."
      );

      setFeedbackType(
        "error"
      );
    } finally {
      setIsSaving(
        false
      );
    }
  }

  if (isLoading) {
    return (
      <PlatformShell>
        <div className="flex min-h-72 items-center justify-center">

          <div className="text-center">

            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400" />

            <p className="mt-4 text-sm text-zinc-500">
              Carregando seu perfil...
            </p>

          </div>

        </div>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell>
      <form
        onSubmit={
          handleSubmit
        }
        className="space-y-5 sm:space-y-6"
      >

        {/* PERFIL / CAPA */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-emerald-400/15 bg-white/[0.035] shadow-2xl shadow-black/10 backdrop-blur-2xl">

          <div className="h-28 bg-gradient-to-r from-emerald-500/20 via-cyan-500/10 to-teal-500/20 sm:h-36" />

          <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">

            <div className="-mt-11 flex items-end justify-between gap-3">

              <div className="relative">

                <button
                  type="button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  className="group relative block h-24 w-24 overflow-hidden rounded-full border-4 border-[#07100d] bg-emerald-500/15 shadow-xl shadow-black/30 transition hover:border-emerald-400/40 sm:h-28 sm:w-28"
                  aria-label="Alterar foto de perfil"
                >

                  {displayedAvatar ? (
                    <img
                      src={
                        displayedAvatar
                      }
                      alt={`Foto de ${form.name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xl font-bold text-emerald-100 sm:text-2xl">
                      {initials}
                    </span>
                  )}

                  <span className="absolute inset-x-0 bottom-0 flex min-h-8 items-center justify-center bg-black/65 px-1 text-[9px] font-semibold text-white backdrop-blur-sm sm:text-[10px]">
                    Alterar foto
                  </span>

                </button>

                <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#07100d] bg-emerald-400" />

                <input
                  ref={
                    fileInputRef
                  }
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={
                    handleAvatarChange
                  }
                  className="hidden"
                />

              </div>

              <span className="mb-1 rounded-full border border-emerald-400/15 bg-emerald-500/[0.08] px-3 py-1.5 text-[10px] font-semibold text-emerald-300">
                ● Perfil público
              </span>

            </div>

            <div className="mt-4">

              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-400">
                Meu Perfil
              </p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {form.name ||
                  "Seu perfil"}
              </h1>

              {form.headline ? (
                <p className="mt-1 text-sm text-zinc-400">
                  {
                    form.headline
                  }
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-600">
                  Adicione um título profissional.
                </p>
              )}

              {form.location && (
                <p className="mt-2 text-xs text-zinc-500">
                  📍 {
                    form.location
                  }
                </p>
              )}

              <p className="mt-2 truncate text-xs text-zinc-600">
                {email}
              </p>

              <p className="mt-3 text-[10px] text-zinc-600">
                Toque na foto para escolher uma imagem JPG, PNG ou WEBP de até 5 MB.
              </p>

              {avatarFile && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.06] px-3 py-2 text-[10px] text-cyan-200">

                  <span>
                    ✓
                  </span>

                  <span className="min-w-0 truncate">
                    Nova foto selecionada. Salve o perfil para confirmar.
                  </span>

                </div>
              )}

            </div>

          </div>

        </section>

        {/* IDENTIDADE */}
        <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.025] p-4 backdrop-blur-xl sm:p-6">

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
            Identidade
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Sobre você
          </h2>

          <div className="mt-5 space-y-4">

            <label className="block">

              <span className="text-xs font-medium text-zinc-300">
                Nome
              </span>

              <input
                type="text"
                value={
                  form.name
                }
                onChange={(
                  event
                ) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                maxLength={80}
                placeholder="Seu nome"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/30"
              />

            </label>

            <label className="block">

              <span className="text-xs font-medium text-zinc-300">
                Título profissional
              </span>

              <input
                type="text"
                value={
                  form.headline
                }
                onChange={(
                  event
                ) =>
                  updateField(
                    "headline",
                    event.target.value
                  )
                }
                maxLength={100}
                placeholder="Ex.: Desenvolvedor Full Stack"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/30"
              />

            </label>

            <label className="block">

              <div className="flex items-center justify-between gap-3">

                <span className="text-xs font-medium text-zinc-300">
                  Sobre mim
                </span>

                <span className="text-[10px] text-zinc-600">
                  {
                    form.bio.length
                  }
                  /500
                </span>

              </div>

              <textarea
                value={
                  form.bio
                }
                onChange={(
                  event
                ) =>
                  updateField(
                    "bio",
                    event.target.value
                  )
                }
                maxLength={500}
                rows={5}
                placeholder="Conte sobre você, sua carreira, interesses e projetos."
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/30"
              />

            </label>

            <label className="block">

              <span className="text-xs font-medium text-zinc-300">
                Localização
              </span>

              <input
                type="text"
                value={
                  form.location
                }
                onChange={(
                  event
                ) =>
                  updateField(
                    "location",
                    event.target.value
                  )
                }
                maxLength={100}
                placeholder="Ex.: São Paulo, Brasil"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/30"
              />

            </label>

          </div>

        </section>

        {/* INTERESSES */}
        <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.025] p-4 backdrop-blur-xl sm:p-6">

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            Afinidades
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Seus interesses
          </h2>

          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Essas informações ajudam outras pessoas a encontrar conexões com interesses em comum.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">

            {availableInterests.map(
              (
                interest
              ) => {
                const selected =
                  form.interests.includes(
                    interest
                  );

                return (
                  <button
                    key={
                      interest
                    }
                    type="button"
                    onClick={() =>
                      toggleInterest(
                        interest
                      )
                    }
                    className={[
                      "min-h-10 rounded-full border px-3.5 py-2 text-xs font-medium transition",
                      selected
                        ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                        : "border-white/[0.08] bg-white/[0.025] text-zinc-400 hover:bg-white/[0.05] hover:text-white",
                    ].join(
                      " "
                    )}
                  >
                    {selected
                      ? "✓ "
                      : ""}
                    {
                      interest
                    }
                  </button>
                );
              }
            )}

          </div>

        </section>

        {/* SALVAR */}
        <section className="pb-6">

          <div className="rounded-[1.5rem] border border-emerald-400/10 bg-emerald-500/[0.035] p-4 sm:p-5">

            {feedback && (
              <div
                className={[
                  "mb-4 rounded-xl border px-4 py-3 text-xs leading-5",
                  feedbackType ===
                  "success"
                    ? "border-emerald-400/15 bg-emerald-500/10 text-emerald-200"
                    : "border-red-400/15 bg-red-500/10 text-red-200",
                ].join(
                  " "
                )}
              >
                {
                  feedback
                }
              </div>
            )}

            <button
              type="submit"
              disabled={
                !form.name.trim() ||
                isSaving
              }
              className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-500/15 px-5 text-sm font-bold text-emerald-50 shadow-[0_12px_35px_rgba(16,185,129,0.10)] transition hover:-translate-y-0.5 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? "Salvando..."
                : avatarFile
                  ? "Salvar perfil e foto"
                  : "Salvar perfil"}
            </button>

          </div>

        </section>

      </form>
    </PlatformShell>
  );
}