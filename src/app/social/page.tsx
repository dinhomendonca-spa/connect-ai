"use client";

import Link from "next/link";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import PlatformShell from "@/components/layout/PlatformShell";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type Connection = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  ignored_at: string | null;
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
  updated_at: string;
};

type SocialPostParticipant = {
  post_id: string;
  profile_id: string;
  created_at: string;
};

type SocialStatus =
  | "none"
  | "outgoing"
  | "incoming"
  | "connected";

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

function formatMeetingDate(
  date: string
) {
  const parts =
    date.split("-");

  if (
    parts.length !== 3
  ) {
    return date;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatMeetingTime(
  time: string
) {
  return time.slice(
    0,
    5
  );
}

function formatPostDate(
  value: string
) {
  try {
    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function getErrorDescription(
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  }
) {
  const parts: string[] =
    [];

  if (
    error.message
  ) {
    parts.push(
      error.message
    );
  }

  if (
    error.code
  ) {
    parts.push(
      `Código: ${error.code}`
    );
  }

  if (
    error.details
  ) {
    parts.push(
      `Detalhes: ${error.details}`
    );
  }

  if (
    error.hint
  ) {
    parts.push(
      `Dica: ${error.hint}`
    );
  }

  return parts.join(
    " | "
  );
}

export default function SocialPage() {
  const [
    currentUserId,
    setCurrentUserId,
  ] = useState("");

  const [
    profiles,
    setProfiles,
  ] = useState<
    Profile[]
  >([]);

  const [
    connections,
    setConnections,
  ] = useState<
    Connection[]
  >([]);

  const [
    posts,
    setPosts,
  ] = useState<
    SocialPost[]
  >([]);

  const [
    postParticipants,
    setPostParticipants,
  ] = useState<
    SocialPostParticipant[]
  >([]);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    participantSearch,
    setParticipantSearch,
  ] = useState("");

  const [
    selectedParticipantIds,
    setSelectedParticipantIds,
  ] = useState<
    string[]
  >([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isPublishing,
    setIsPublishing,
  ] = useState(false);

  const [
    actionUserId,
    setActionUserId,
  ] = useState("");

  const [
    deletingPostId,
    setDeletingPostId,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    noticeMessage,
    setNoticeMessage,
  ] = useState("");

  const [
    technicalError,
    setTechnicalError,
  ] = useState("");

  const [
    meetingTitle,
    setMeetingTitle,
  ] = useState("");

  const [
    subject,
    setSubject,
  ] = useState("");

  const [
    meetingDate,
    setMeetingDate,
  ] = useState("");

  const [
    meetingTime,
    setMeetingTime,
  ] = useState("");

  const [
    comment,
    setComment,
  ] = useState("");

  const loadSocial =
    useCallback(
      async (
        silent = false
      ) => {
        if (
          !silent
        ) {
          setIsLoading(
            true
          );
        }

        try {
          const {
            data:
              userData,
            error:
              userError,
          } =
            await supabase.auth.getUser();

          if (
            userError ||
            !userData.user
          ) {
            setErrorMessage(
              "Não foi possível identificar o usuário conectado."
            );

            if (
              userError
            ) {
              setTechnicalError(
                getErrorDescription(
                  userError
                )
              );
            }

            return;
          }

          const userId =
            userData.user.id;

          setCurrentUserId(
            userId
          );

          const [
            profilesResult,
            connectionsResult,
            postsResult,
            participantsResult,
          ] =
            await Promise.all([
              supabase
                .from(
                  "profiles"
                )
                .select(
                  "id, name, headline, bio, avatar_url, created_at, updated_at"
                )
                .order(
                  "name",
                  {
                    ascending:
                      true,
                  }
                ),

              supabase
                .from(
                  "connections"
                )
                .select(
                  "id, requester_id, addressee_id, status, ignored_at, created_at, updated_at"
                )
                .or(
                  `requester_id.eq.${userId},addressee_id.eq.${userId}`
                )
                .order(
                  "created_at",
                  {
                    ascending:
                      false,
                  }
                ),

              supabase
                .from(
                  "social_posts"
                )
                .select(
                  "id, author_id, meeting_title, subject, meeting_date, meeting_time, guests, comment, created_at, updated_at"
                )
                .order(
                  "created_at",
                  {
                    ascending:
                      false,
                  }
                )
                .limit(
                  100
                ),

              supabase
                .from(
                  "social_post_participants"
                )
                .select(
                  "post_id, profile_id, created_at"
                ),
            ]);

          if (
            profilesResult.error
          ) {
            console.warn(
              "Erro ao carregar perfis:",
              profilesResult.error
            );

            setProfiles(
              []
            );

            setErrorMessage(
              "Não foi possível carregar os usuários cadastrados."
            );

            setTechnicalError(
              getErrorDescription(
                profilesResult.error
              )
            );
          } else {
            setProfiles(
              (
                profilesResult.data ||
                []
              ) as Profile[]
            );
          }

          if (
            connectionsResult.error
          ) {
            console.warn(
              "Erro ao carregar conexões:",
              connectionsResult.error
            );

            setConnections(
              []
            );

            setErrorMessage(
              "Não foi possível carregar as solicitações de amizade."
            );

            setTechnicalError(
              getErrorDescription(
                connectionsResult.error
              )
            );
          } else {
            setConnections(
              (
                connectionsResult.data ||
                []
              ) as Connection[]
            );
          }

          if (
            postsResult.error
          ) {
            console.warn(
              "Erro ao carregar publicações:",
              postsResult.error
            );

            setPosts(
              []
            );

            setErrorMessage(
              "Não foi possível carregar as publicações."
            );

            setTechnicalError(
              getErrorDescription(
                postsResult.error
              )
            );
          } else {
            setPosts(
              (
                postsResult.data ||
                []
              ) as SocialPost[]
            );
          }

          if (
            participantsResult.error
          ) {
            console.warn(
              "Erro ao carregar participantes:",
              participantsResult.error
            );

            setPostParticipants(
              []
            );
          } else {
            setPostParticipants(
              (
                participantsResult.data ||
                []
              ) as SocialPostParticipant[]
            );
          }
        } catch (
          error
        ) {
          console.warn(
            "Erro inesperado na Social:",
            error
          );

          setErrorMessage(
            "Ocorreu um erro inesperado ao carregar a área Social."
          );

          setTechnicalError(
            error instanceof
              Error
              ? error.message
              : String(
                  error
                )
          );
        } finally {
          if (
            !silent
          ) {
            setIsLoading(
              false
            );
          }
        }
      },
      []
    );

  useEffect(() => {
    void loadSocial();
  }, [
    loadSocial,
  ]);

  /*
   * Realtime das conexões.
   *
   * Se outra pessoa enviar,
   * aceitar ou recusar uma
   * solicitação, a Social
   * atualiza automaticamente.
   */
  useEffect(() => {
    if (
      !currentUserId
    ) {
      return;
    }

    const channel =
      supabase
        .channel(
          `social-connections-${currentUserId}`
        )
        .on(
          "postgres_changes",
          {
            event:
              "*",
            schema:
              "public",
            table:
              "connections",
          },
          (
            payload
          ) => {
            const newRow =
              (
                payload.new ||
                {}
              ) as Partial<Connection>;

            const oldRow =
              (
                payload.old ||
                {}
              ) as Partial<Connection>;

            const affectsCurrentUser =
              newRow.requester_id ===
                currentUserId ||
              newRow.addressee_id ===
                currentUserId ||
              oldRow.requester_id ===
                currentUserId ||
              oldRow.addressee_id ===
                currentUserId;

            if (
              !affectsCurrentUser
            ) {
              return;
            }

            if (
              payload.eventType ===
                "INSERT" &&
              newRow.addressee_id ===
                currentUserId &&
              newRow.status ===
                "pending"
            ) {
              setNoticeMessage(
                "Você recebeu uma nova solicitação de amizade."
              );
            }

            if (
              payload.eventType ===
                "UPDATE" &&
              newRow.requester_id ===
                currentUserId &&
              newRow.status ===
                "accepted"
            ) {
              setNoticeMessage(
                "Sua solicitação de amizade foi aceita."
              );
            }

            void loadSocial(
              true
            );
          }
        )
        .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [
    currentUserId,
    loadSocial,
  ]);

  function clearMessages() {
    setErrorMessage(
      ""
    );

    setSuccessMessage(
      ""
    );

    setTechnicalError(
      ""
    );
  }

  function getProfile(
    profileId: string
  ) {
    return profiles.find(
      (
        profile
      ) =>
        profile.id ===
        profileId
    );
  }

  function getConnection(
    profileId: string
  ) {
    return connections.find(
      (
        connection
      ) =>
        (
          connection.requester_id ===
            currentUserId &&
          connection.addressee_id ===
            profileId
        ) ||
        (
          connection.addressee_id ===
            currentUserId &&
          connection.requester_id ===
            profileId
        )
    );
  }

  function getStatus(
    profileId: string
  ): SocialStatus {
    const connection =
      getConnection(
        profileId
      );

    if (
      !connection
    ) {
      return "none";
    }

    if (
      connection.status ===
      "accepted"
    ) {
      return "connected";
    }

    if (
      connection.requester_id ===
      currentUserId
    ) {
      return "outgoing";
    }

    return "incoming";
  }

  function isIgnoredIncoming(
    profileId: string
  ) {
    const connection =
      getConnection(
        profileId
      );

    return Boolean(
      connection &&
        connection.status ===
          "pending" &&
        connection.addressee_id ===
          currentUserId &&
        connection.ignored_at
    );
  }

  function getParticipantsForPost(
    postId: string
  ) {
    const participantIds =
      postParticipants
        .filter(
          (
            participant
          ) =>
            participant.post_id ===
            postId
        )
        .map(
          (
            participant
          ) =>
            participant.profile_id
        );

    return participantIds
      .map(
        (
          participantId
        ) =>
          getProfile(
            participantId
          )
      )
      .filter(
        (
          profile
        ): profile is Profile =>
          Boolean(
            profile
          )
      );
  }

  const discoverProfiles =
    useMemo(
      () =>
        profiles.filter(
          (
            profile
          ) =>
            profile.id !==
            currentUserId
        ),
      [
        profiles,
        currentUserId,
      ]
    );

  const filteredProfiles =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      if (
        !term
      ) {
        return discoverProfiles;
      }

      return discoverProfiles.filter(
        (
          profile
        ) => {
          const searchable =
            [
              profile.name,
              profile.headline ||
                "",
              profile.bio ||
                "",
            ]
              .join(
                " "
              )
              .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      discoverProfiles,
      search,
    ]);

  const filteredParticipantProfiles =
    useMemo(() => {
      const term =
        participantSearch
          .trim()
          .toLowerCase();

      const available =
        discoverProfiles.filter(
          (
            profile
          ) =>
            !selectedParticipantIds.includes(
              profile.id
            )
        );

      if (
        !term
      ) {
        return available;
      }

      return available.filter(
        (
          profile
        ) => {
          const searchable =
            [
              profile.name,
              profile.headline ||
                "",
              profile.bio ||
                "",
            ]
              .join(
                " "
              )
              .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      discoverProfiles,
      participantSearch,
      selectedParticipantIds,
    ]);

  const selectedParticipants =
    useMemo(
      () =>
        selectedParticipantIds
          .map(
            (
              profileId
            ) =>
              profiles.find(
                (
                  profile
                ) =>
                  profile.id ===
                  profileId
              )
          )
          .filter(
            (
              profile
            ): profile is Profile =>
              Boolean(
                profile
              )
          ),
      [
        selectedParticipantIds,
        profiles,
      ]
    );

  const friendIds =
    useMemo(() => {
      const ids =
        new Set<string>();

      connections.forEach(
        (
          connection
        ) => {
          if (
            connection.status !==
            "accepted"
          ) {
            return;
          }

          if (
            connection.requester_id ===
            currentUserId
          ) {
            ids.add(
              connection.addressee_id
            );
          }

          if (
            connection.addressee_id ===
            currentUserId
          ) {
            ids.add(
              connection.requester_id
            );
          }
        }
      );

      return ids;
    }, [
      connections,
      currentUserId,
    ]);

  const friends =
    useMemo(
      () =>
        discoverProfiles.filter(
          (
            profile
          ) =>
            friendIds.has(
              profile.id
            )
        ),
      [
        discoverProfiles,
        friendIds,
      ]
    );

  /*
   * Aqui entram apenas
   * solicitações ainda não
   * ignoradas.
   */
  const incomingRequests =
    useMemo(
      () =>
        connections
          .filter(
            (
              connection
            ) =>
              connection.addressee_id ===
                currentUserId &&
              connection.status ===
                "pending" &&
              !connection.ignored_at
          )
          .map(
            (
              connection
            ) =>
              profiles.find(
                (
                  profile
                ) =>
                  profile.id ===
                  connection.requester_id
              )
          )
          .filter(
            (
              profile
            ): profile is Profile =>
              Boolean(
                profile
              )
          ),
      [
        connections,
        profiles,
        currentUserId,
      ]
    );

  const sortedPosts =
    useMemo(() => {
      const result = [
        ...posts,
      ];

      result.sort(
        (
          postA,
          postB
        ) => {
          const priorityA =
            postA.author_id ===
            currentUserId
              ? 2
              : friendIds.has(
                    postA.author_id
                  )
                ? 1
                : 0;

          const priorityB =
            postB.author_id ===
            currentUserId
              ? 2
              : friendIds.has(
                    postB.author_id
                  )
                ? 1
                : 0;

          if (
            priorityA !==
            priorityB
          ) {
            return (
              priorityB -
              priorityA
            );
          }

          return (
            new Date(
              postB.created_at
            ).getTime() -
            new Date(
              postA.created_at
            ).getTime()
          );
        }
      );

      return result;
    }, [
      posts,
      friendIds,
      currentUserId,
    ]);

  function addParticipant(
    profileId: string
  ) {
    setSelectedParticipantIds(
      (
        current
      ) => {
        if (
          current.includes(
            profileId
          )
        ) {
          return current;
        }

        return [
          ...current,
          profileId,
        ];
      }
    );

    setParticipantSearch(
      ""
    );

    clearMessages();
  }

  function removeParticipant(
    profileId: string
  ) {
    setSelectedParticipantIds(
      (
        current
      ) =>
        current.filter(
          (
            id
          ) =>
            id !==
            profileId
        )
    );
  }

  async function sendConnectionRequest(
    profileId: string
  ) {
    if (
      !currentUserId ||
      actionUserId
    ) {
      return;
    }

    const profile =
      getProfile(
        profileId
      );

    setActionUserId(
      profileId
    );

    clearMessages();

    setNoticeMessage(
      ""
    );

    const {
      error,
    } =
      await supabase
        .from(
          "connections"
        )
        .insert({
          requester_id:
            currentUserId,

          addressee_id:
            profileId,

          status:
            "pending",

          ignored_at:
            null,
        });

    if (
      error
    ) {
      setErrorMessage(
        "Não foi possível enviar a solicitação de amizade."
      );

      setTechnicalError(
        getErrorDescription(
          error
        )
      );

      setActionUserId(
        ""
      );

      return;
    }

    setSuccessMessage(
      profile
        ? `Solicitação enviada para ${profile.name}. O pedido ficará pendente até essa pessoa aceitar.`
        : `Solicitação enviada. O pedido ficará pendente até a pessoa aceitar.`
    );

    setActionUserId(
      ""
    );

    await loadSocial(
      true
    );
  }

  async function acceptConnection(
    profileId: string
  ) {
    const connection =
      getConnection(
        profileId
      );

    if (
      !connection ||
      actionUserId
    ) {
      return;
    }

    setActionUserId(
      profileId
    );

    clearMessages();

    setNoticeMessage(
      ""
    );

    const {
      error,
    } =
      await supabase
        .from(
          "connections"
        )
        .update({
          status:
            "accepted",

          ignored_at:
            null,
        })
        .eq(
          "id",
          connection.id
        );

    if (
      error
    ) {
      setErrorMessage(
        "Não foi possível aceitar a solicitação."
      );

      setTechnicalError(
        getErrorDescription(
          error
        )
      );

      setActionUserId(
        ""
      );

      return;
    }

    const profile =
      getProfile(
        profileId
      );

    setSuccessMessage(
      profile
        ? `Você e ${profile.name} agora são amigos.`
        : "Solicitação de amizade aceita."
    );

    setActionUserId(
      ""
    );

    await loadSocial(
      true
    );
  }

  async function rejectConnection(
    profileId: string
  ) {
    const connection =
      getConnection(
        profileId
      );

    if (
      !connection ||
      actionUserId
    ) {
      return;
    }

    setActionUserId(
      profileId
    );

    clearMessages();

    setNoticeMessage(
      ""
    );

    const {
      error,
    } =
      await supabase
        .from(
          "connections"
        )
        .delete()
        .eq(
          "id",
          connection.id
        );

    if (
      error
    ) {
      setErrorMessage(
        "Não foi possível recusar a solicitação."
      );

      setTechnicalError(
        getErrorDescription(
          error
        )
      );

      setActionUserId(
        ""
      );

      return;
    }

    setSuccessMessage(
      "Solicitação recusada."
    );

    setActionUserId(
      ""
    );

    await loadSocial(
      true
    );
  }

  async function ignoreConnection(
    profileId: string
  ) {
    const connection =
      getConnection(
        profileId
      );

    if (
      !connection ||
      actionUserId
    ) {
      return;
    }

    setActionUserId(
      profileId
    );

    clearMessages();

    setNoticeMessage(
      ""
    );

    const {
      error,
    } =
      await supabase
        .from(
          "connections"
        )
        .update({
          ignored_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          connection.id
        );

    if (
      error
    ) {
      setErrorMessage(
        "Não foi possível ignorar a solicitação."
      );

      setTechnicalError(
        getErrorDescription(
          error
        )
      );

      setActionUserId(
        ""
      );

      return;
    }

    setSuccessMessage(
      "Solicitação ignorada. O pedido continua pendente e poderá ser respondido depois."
    );

    setActionUserId(
      ""
    );

    await loadSocial(
      true
    );
  }

  async function removeFriend(
    profileId: string
  ) {
    const connection =
      getConnection(
        profileId
      );

    if (
      !connection ||
      actionUserId
    ) {
      return;
    }

    const profile =
      getProfile(
        profileId
      );

    const confirmed =
      window.confirm(
        profile
          ? `Remover ${profile.name} dos seus amigos?`
          : "Remover esta amizade?"
      );

    if (
      !confirmed
    ) {
      return;
    }

    setActionUserId(
      profileId
    );

    clearMessages();

    const {
      error,
    } =
      await supabase
        .from(
          "connections"
        )
        .delete()
        .eq(
          "id",
          connection.id
        );

    if (
      error
    ) {
      setErrorMessage(
        "Não foi possível remover a amizade."
      );

      setTechnicalError(
        getErrorDescription(
          error
        )
      );

      setActionUserId(
        ""
      );

      return;
    }

    setSuccessMessage(
      "Amizade removida."
    );

    setActionUserId(
      ""
    );

    await loadSocial(
      true
    );
  }

  async function handlePublish(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      isPublishing
    ) {
      return;
    }

    clearMessages();

    if (
      !currentUserId
    ) {
      setErrorMessage(
        "Seu usuário ainda não foi identificado."
      );

      return;
    }

    const normalizedTitle =
      meetingTitle.trim();

    if (
      !normalizedTitle
    ) {
      setErrorMessage(
        "Informe o tema da publicação."
      );

      return;
    }

    if (
      !meetingDate
    ) {
      setErrorMessage(
        "Informe a data."
      );

      return;
    }

    if (
      !meetingTime
    ) {
      setErrorMessage(
        "Informe o horário."
      );

      return;
    }

    setIsPublishing(
      true
    );

    let createdPostId =
      "";

    try {
      const {
        data:
          createdPostData,
        error:
          postError,
      } =
        await supabase
          .from(
            "social_posts"
          )
          .insert({
            author_id:
              currentUserId,

            meeting_title:
              normalizedTitle,

            subject:
              subject.trim() ||
              null,

            meeting_date:
              meetingDate,

            meeting_time:
              `${meetingTime}:00`,

            guests:
              null,

            comment:
              comment.trim() ||
              null,
          })
          .select(
            "id, author_id, meeting_title, subject, meeting_date, meeting_time, guests, comment, created_at, updated_at"
          )
          .single();

      if (
        postError
      ) {
        setErrorMessage(
          "Não foi possível criar a publicação."
        );

        setTechnicalError(
          getErrorDescription(
            postError
          )
        );

        return;
      }

      if (
        !createdPostData
      ) {
        setErrorMessage(
          "A publicação não retornou dados."
        );

        return;
      }

      const createdPost =
        createdPostData as SocialPost;

      createdPostId =
        createdPost.id;

      if (
        selectedParticipantIds.length >
        0
      ) {
        const participantRows =
          selectedParticipantIds.map(
            (
              profileId
            ) => ({
              post_id:
                createdPost.id,

              profile_id:
                profileId,
            })
          );

        const {
          error:
            participantsError,
        } =
          await supabase
            .from(
              "social_post_participants"
            )
            .insert(
              participantRows
            );

        if (
          participantsError
        ) {
          await supabase
            .from(
              "social_posts"
            )
            .delete()
            .eq(
              "id",
              createdPost.id
            );

          setErrorMessage(
            "A publicação não foi salva porque houve um erro ao adicionar os participantes."
          );

          setTechnicalError(
            getErrorDescription(
              participantsError
            )
          );

          return;
        }
      }

      setMeetingTitle(
        ""
      );

      setSubject(
        ""
      );

      setMeetingDate(
        ""
      );

      setMeetingTime(
        ""
      );

      setComment(
        ""
      );

      setParticipantSearch(
        ""
      );

      setSelectedParticipantIds(
        []
      );

      setSuccessMessage(
        "Publicação criada com sucesso."
      );

      await loadSocial(
        true
      );
    } catch (
      error
    ) {
      if (
        createdPostId
      ) {
        await supabase
          .from(
            "social_posts"
          )
          .delete()
          .eq(
            "id",
            createdPostId
          );
      }

      setErrorMessage(
        "Ocorreu um erro inesperado ao publicar."
      );

      setTechnicalError(
        error instanceof
          Error
          ? error.message
          : String(
              error
            )
      );
    } finally {
      setIsPublishing(
        false
      );
    }
  }

  async function deletePost(
    postId: string
  ) {
    if (
      deletingPostId
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Excluir esta publicação?"
      );

    if (
      !confirmed
    ) {
      return;
    }

    setDeletingPostId(
      postId
    );

    clearMessages();

    const {
      error,
    } =
      await supabase
        .from(
          "social_posts"
        )
        .delete()
        .eq(
          "id",
          postId
        );

    if (
      error
    ) {
      setErrorMessage(
        "Não foi possível excluir a publicação."
      );

      setTechnicalError(
        getErrorDescription(
          error
        )
      );

      setDeletingPostId(
        ""
      );

      return;
    }

    setPosts(
      (
        current
      ) =>
        current.filter(
          (
            post
          ) =>
            post.id !==
            postId
        )
    );

    setPostParticipants(
      (
        current
      ) =>
        current.filter(
          (
            participant
          ) =>
            participant.post_id !==
            postId
        )
    );

    setSuccessMessage(
      "Publicação excluída."
    );

    setDeletingPostId(
      ""
    );
  }

  return (
    <PlatformShell>
      <div className="space-y-6">

        {/* CABEÇALHO */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-pink-400/15 bg-white/[0.035] p-4 shadow-2xl shadow-black/10 backdrop-blur-2xl sm:p-6">

          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-pink-500/15 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

          <div className="relative">

            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-pink-300">
              ● ConnectAI Social
            </p>

            <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
              Pessoas, reuniões e ideias
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Conecte-se com pessoas,
              acompanhe sua rede e
              compartilhe reuniões e
              eventos.
            </p>

            <div className="mt-5 flex min-h-14 items-center gap-3 rounded-2xl border border-pink-400/15 bg-black/20 px-4">

              <span className="text-pink-300">
                ◎
              </span>

              <input
                type="search"
                value={
                  search
                }
                onChange={(
                  event
                ) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Pesquisar pessoas..."
                className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
              />

            </div>

          </div>

        </section>

        {/* NOTIFICAÇÃO */}
        {noticeMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-4">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
              🔔
            </div>

            <div className="min-w-0 flex-1">

              <p className="text-sm font-semibold text-amber-100">
                Nova atividade
              </p>

              <p className="mt-1 text-xs leading-5 text-amber-200/70">
                {
                  noticeMessage
                }
              </p>

            </div>

            <button
              type="button"
              onClick={() =>
                setNoticeMessage(
                  ""
                )
              }
              className="text-sm text-amber-200/60 hover:text-amber-100"
            >
              ✕
            </button>

          </div>
        )}

        {/* ERRO */}
        {errorMessage && (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">

            <p className="font-semibold">
              {
                errorMessage
              }
            </p>

            {technicalError && (
              <p className="mt-2 break-words text-xs leading-5 text-red-200/70">
                {
                  technicalError
                }
              </p>
            )}

          </div>
        )}

        {/* CONFIRMAÇÃO */}
        {successMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-200">
              ✓
            </div>

            <div className="min-w-0 flex-1">

              <p className="text-sm font-semibold text-emerald-100">
                Tudo certo
              </p>

              <p className="mt-1 text-xs leading-5 text-emerald-200/70">
                {
                  successMessage
                }
              </p>

            </div>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage(
                  ""
                )
              }
              className="text-sm text-emerald-200/60 hover:text-emerald-100"
            >
              ✕
            </button>

          </div>
        )}

        {/* SOLICITAÇÕES DE AMIZADE */}
        {incomingRequests.length >
          0 && (
          <section>

            <div className="flex items-end justify-between gap-3">

              <div>

                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                  Amizades
                </p>

                <h2 className="mt-1 text-lg font-bold text-white">
                  Solicitações recebidas
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  Aceite, recuse ou ignore.
                </p>

              </div>

              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold text-amber-200">
                {
                  incomingRequests.length
                }{" "}
                {incomingRequests.length ===
                1
                  ? "nova"
                  : "novas"}
              </span>

            </div>

            <div className="mt-3 space-y-3">

              {incomingRequests.map(
                (
                  profile
                ) => (
                  <article
                    key={
                      profile.id
                    }
                    className="rounded-[1.4rem] border border-amber-400/15 bg-amber-500/[0.045] p-4 shadow-xl shadow-black/10"
                  >

                    <div className="flex items-center gap-3">

                      <Link
                        href={`/perfil/${profile.id}`}
                        className="shrink-0"
                      >

                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-amber-400/20 bg-amber-500/10 text-xs font-bold text-amber-100">

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

                      </Link>

                      <div className="min-w-0 flex-1">

                        <Link
                          href={`/perfil/${profile.id}`}
                          className="block truncate text-sm font-bold text-white transition hover:text-pink-300"
                        >
                          {
                            profile.name
                          }
                        </Link>

                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {profile.headline ||
                            "Usuário ConnectAI"}
                        </p>

                        <p className="mt-1 text-[10px] text-amber-300/70">
                          Quer adicionar você à rede.
                        </p>

                      </div>

                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">

                      <button
                        type="button"
                        disabled={
                          actionUserId ===
                          profile.id
                        }
                        onClick={() =>
                          void acceptConnection(
                            profile.id
                          )
                        }
                        className="min-h-11 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        ✓ Aceitar
                      </button>

                      <button
                        type="button"
                        disabled={
                          actionUserId ===
                          profile.id
                        }
                        onClick={() =>
                          void rejectConnection(
                            profile.id
                          )
                        }
                        className="min-h-11 rounded-xl border border-red-400/15 bg-red-500/[0.07] px-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
                      >
                        Recusar
                      </button>

                      <button
                        type="button"
                        disabled={
                          actionUserId ===
                          profile.id
                        }
                        onClick={() =>
                          void ignoreConnection(
                            profile.id
                          )
                        }
                        className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50"
                      >
                        Ignorar
                      </button>

                    </div>

                  </article>
                )
              )}

            </div>

          </section>
        )}

        {/* CRIAR PUBLICAÇÃO */}
        <section>

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
            Compartilhar
          </p>

          <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
            Criar publicação
          </h2>

          <form
            onSubmit={
              handlePublish
            }
            className="mt-3 rounded-[1.6rem] border border-violet-400/15 bg-white/[0.03] p-4 shadow-xl shadow-black/10 sm:p-5"
          >

            <div className="grid gap-4 md:grid-cols-2">

              <label className="block md:col-span-2">

                <span className="text-xs font-semibold text-zinc-300">
                  Tema da reunião
                </span>

                <input
                  type="text"
                  value={
                    meetingTitle
                  }
                  onChange={(
                    event
                  ) =>
                    setMeetingTitle(
                      event.target.value
                    )
                  }
                  placeholder="Ex.: Recital de poemas"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none placeholder:text-zinc-600"
                />

              </label>

              <label className="block md:col-span-2">

                <span className="text-xs font-semibold text-zinc-300">
                  Assunto abordado
                </span>

                <input
                  type="text"
                  value={
                    subject
                  }
                  onChange={(
                    event
                  ) =>
                    setSubject(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none"
                />

              </label>

              <label className="block">

                <span className="text-xs font-semibold text-zinc-300">
                  Data
                </span>

                <input
                  type="date"
                  value={
                    meetingDate
                  }
                  onChange={(
                    event
                  ) =>
                    setMeetingDate(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none"
                />

              </label>

              <label className="block">

                <span className="text-xs font-semibold text-zinc-300">
                  Horário
                </span>

                <input
                  type="time"
                  value={
                    meetingTime
                  }
                  onChange={(
                    event
                  ) =>
                    setMeetingTime(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none"
                />

              </label>

              {/* PARTICIPANTES */}
              <div className="md:col-span-2">

                <div className="flex items-end justify-between gap-3">

                  <div>

                    <span className="text-xs font-semibold text-zinc-300">
                      Participantes da ConnectAI
                    </span>

                    <p className="mt-1 text-[10px] text-zinc-600">
                      Escolha usuários cadastrados.
                    </p>

                  </div>

                  <span className="rounded-full border border-pink-400/15 bg-pink-500/[0.08] px-2.5 py-1 text-[10px] text-pink-200">
                    {
                      selectedParticipantIds.length
                    } selecionados
                  </span>

                </div>

                {selectedParticipants.length >
                  0 && (
                  <div className="mt-3 flex flex-wrap gap-2">

                    {selectedParticipants.map(
                      (
                        participant
                      ) => (
                        <div
                          key={
                            participant.id
                          }
                          className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 py-1.5 pl-2 pr-1.5"
                        >

                          <span className="text-xs text-emerald-100">
                            {
                              participant.name
                            }
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              removeParticipant(
                                participant.id
                              )
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-emerald-200 hover:bg-red-500/20"
                          >
                            ✕
                          </button>

                        </div>
                      )
                    )}

                  </div>
                )}

                <div className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4">

                  <span className="text-pink-300">
                    ◎
                  </span>

                  <input
                    type="search"
                    value={
                      participantSearch
                    }
                    onChange={(
                      event
                    ) =>
                      setParticipantSearch(
                        event.target.value
                      )
                    }
                    placeholder="Pesquisar participante..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                  />

                </div>

                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-white/[0.07] bg-black/10 p-2">

                  {filteredParticipantProfiles.map(
                    (
                      profile
                    ) => (
                      <div
                        key={
                          profile.id
                        }
                        className="flex items-center gap-3 rounded-xl bg-white/[0.025] p-2.5"
                      >

                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-500/10 text-[10px] font-bold text-pink-100">

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

                        <div className="min-w-0 flex-1">

                          <p className="truncate text-xs font-semibold text-white">
                            {
                              profile.name
                            }
                          </p>

                          <p className="truncate text-[10px] text-zinc-500">
                            {profile.headline ||
                              "Usuário ConnectAI"}
                          </p>

                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            addParticipant(
                              profile.id
                            )
                          }
                          className="rounded-xl border border-pink-400/15 bg-pink-500/10 px-3 py-2 text-[10px] font-bold text-pink-200"
                        >
                          + Adicionar
                        </button>

                      </div>
                    )
                  )}

                </div>

              </div>

              <label className="block md:col-span-2">

                <span className="text-xs font-semibold text-zinc-300">
                  Comentário
                </span>

                <textarea
                  value={
                    comment
                  }
                  onChange={(
                    event
                  ) =>
                    setComment(
                      event.target.value
                    )
                  }
                  rows={4}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none"
                />

              </label>

            </div>

            <button
              type="submit"
              disabled={
                isPublishing
              }
              className="mt-5 min-h-12 w-full rounded-2xl border border-violet-400/20 bg-violet-500/15 px-6 text-sm font-bold text-violet-100 disabled:opacity-50 sm:w-auto"
            >
              {isPublishing
                ? "Publicando..."
                : "Publicar"}
            </button>

          </form>

        </section>

        {/* TIMELINE */}
        <section>

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">
            Timeline
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Publicações
          </h2>

          {isLoading ? (
            <div className="mt-3 rounded-2xl border border-white/10 p-8 text-center text-zinc-500">
              Carregando...
            </div>
          ) : (
            <div className="mt-3 space-y-4">

              {sortedPosts.map(
                (
                  post
                ) => {
                  const author =
                    getProfile(
                      post.author_id
                    );

                  const participants =
                    getParticipantsForPost(
                      post.id
                    );

                  const isOwn =
                    post.author_id ===
                    currentUserId;

                  const isFriend =
                    friendIds.has(
                      post.author_id
                    );

                  return (
                    <article
                      key={
                        post.id
                      }
                      className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5"
                    >

                      <div className="flex items-start gap-3">

                        {author ? (
                          <Link
                            href={`/perfil/${author.id}`}
                          >

                            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-pink-500/10 text-xs font-bold text-pink-100">

                              {author.avatar_url ? (
                                <img
                                  src={
                                    author.avatar_url
                                  }
                                  alt={
                                    author.name
                                  }
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                getInitials(
                                  author.name
                                )
                              )}

                            </div>

                          </Link>
                        ) : null}

                        <div className="min-w-0 flex-1">

                          {author && (
                            <div className="flex flex-wrap items-center gap-2">

                              <Link
                                href={`/perfil/${author.id}`}
                                className="font-bold text-white hover:text-pink-300"
                              >
                                {
                                  author.name
                                }
                              </Link>

                              {isFriend &&
                                !isOwn && (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] text-emerald-300">
                                  Amigo
                                </span>
                              )}

                            </div>
                          )}

                          <p className="mt-1 text-[10px] text-zinc-600">
                            {formatPostDate(
                              post.created_at
                            )}
                          </p>

                        </div>

                        {isOwn && (
                          <button
                            type="button"
                            onClick={() =>
                              void deletePost(
                                post.id
                              )
                            }
                            className="rounded-xl bg-red-500/[0.05] px-3 py-2 text-[10px] text-red-300"
                          >
                            Excluir
                          </button>
                        )}

                      </div>

                      <h3 className="mt-5 text-xl font-bold text-white">
                        {
                          post.meeting_title
                        }
                      </h3>

                      {post.subject && (
                        <p className="mt-2 text-sm text-zinc-400">
                          {
                            post.subject
                          }
                        </p>
                      )}

                      <div className="mt-4 grid grid-cols-2 gap-3">

                        <div className="rounded-2xl bg-cyan-500/[0.05] p-3">

                          <p className="text-[9px] uppercase text-cyan-300">
                            Data
                          </p>

                          <p className="mt-1 text-sm text-white">
                            {formatMeetingDate(
                              post.meeting_date
                            )}
                          </p>

                        </div>

                        <div className="rounded-2xl bg-violet-500/[0.05] p-3">

                          <p className="text-[9px] uppercase text-violet-300">
                            Horário
                          </p>

                          <p className="mt-1 text-sm text-white">
                            {formatMeetingTime(
                              post.meeting_time
                            )}
                          </p>

                        </div>

                      </div>

                      {participants.length >
                        0 && (
                        <div className="mt-3 rounded-2xl bg-amber-500/[0.04] p-3">

                          <p className="text-[9px] uppercase text-amber-300">
                            Participantes
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">

                            {participants.map(
                              (
                                participant
                              ) => (
                                <Link
                                  key={
                                    participant.id
                                  }
                                  href={`/perfil/${participant.id}`}
                                  className="rounded-full border border-amber-400/15 bg-amber-500/[0.07] px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/15"
                                >
                                  {
                                    participant.name
                                  }
                                </Link>
                              )
                            )}

                          </div>

                        </div>
                      )}

                      {post.comment && (
                        <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-zinc-300">
                          {
                            post.comment
                          }
                        </p>
                      )}

                    </article>
                  );
                }
              )}

            </div>
          )}

        </section>

        {/* PESSOAS */}
        <section>

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">
            Descobrir
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Pessoas na ConnectAI
          </h2>

          <div className="mt-3 grid gap-3 md:grid-cols-2">

            {filteredProfiles.map(
              (
                profile
              ) => {
                const status =
                  getStatus(
                    profile.id
                  );

                const processing =
                  actionUserId ===
                  profile.id;

                const ignored =
                  isIgnoredIncoming(
                    profile.id
                  );

                return (
                  <article
                    key={
                      profile.id
                    }
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >

                    <div className="flex items-center gap-3">

                      <Link
                        href={`/perfil/${profile.id}`}
                      >

                        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-pink-500/10 text-xs font-bold text-pink-200">

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

                      </Link>

                      <div className="min-w-0 flex-1">

                        <Link
                          href={`/perfil/${profile.id}`}
                          className="block truncate font-semibold text-white hover:text-pink-300"
                        >
                          {
                            profile.name
                          }
                        </Link>

                        <p className="truncate text-xs text-zinc-500">
                          {profile.headline ||
                            "Usuário ConnectAI"}
                        </p>

                      </div>

                    </div>

                    <div className="mt-4">

                      {status ===
                        "none" && (
                        <button
                          type="button"
                          disabled={
                            processing
                          }
                          onClick={() =>
                            void sendConnectionRequest(
                              profile.id
                            )
                          }
                          className="w-full rounded-xl border border-pink-400/20 bg-pink-500/10 px-3 py-2.5 text-xs font-bold text-pink-200 transition hover:bg-pink-500/20 disabled:opacity-50"
                        >
                          {processing
                            ? "Enviando..."
                            : "+ Conectar"}
                        </button>
                      )}

                      {status ===
                        "outgoing" && (
                        <button
                          type="button"
                          disabled
                          className="w-full cursor-default rounded-xl border border-amber-400/20 bg-amber-500/[0.08] px-3 py-2.5 text-xs font-bold text-amber-200"
                        >
                          ⏳ Pedido enviado
                        </button>
                      )}

                      {status ===
                        "incoming" &&
                        !ignored && (
                        <div className="grid grid-cols-3 gap-2">

                          <button
                            type="button"
                            disabled={
                              processing
                            }
                            onClick={() =>
                              void acceptConnection(
                                profile.id
                              )
                            }
                            className="rounded-xl bg-emerald-500/10 px-2 py-2.5 text-[10px] font-semibold text-emerald-200"
                          >
                            Aceitar
                          </button>

                          <button
                            type="button"
                            disabled={
                              processing
                            }
                            onClick={() =>
                              void rejectConnection(
                                profile.id
                              )
                            }
                            className="rounded-xl bg-red-500/[0.07] px-2 py-2.5 text-[10px] text-red-200"
                          >
                            Recusar
                          </button>

                          <button
                            type="button"
                            disabled={
                              processing
                            }
                            onClick={() =>
                              void ignoreConnection(
                                profile.id
                              )
                            }
                            className="rounded-xl bg-white/[0.04] px-2 py-2.5 text-[10px] text-zinc-300"
                          >
                            Ignorar
                          </button>

                        </div>
                      )}

                      {status ===
                        "incoming" &&
                        ignored && (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center text-xs text-zinc-500">
                          Solicitação pendente
                        </div>
                      )}

                      {status ===
                        "connected" && (
                        <div className="grid grid-cols-2 gap-2">

                          <div className="flex items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-200">
                            ✓ Amigos
                          </div>

                          <button
                            type="button"
                            disabled={
                              processing
                            }
                            onClick={() =>
                              void removeFriend(
                                profile.id
                              )
                            }
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-zinc-400"
                          >
                            Remover
                          </button>

                        </div>
                      )}

                    </div>

                  </article>
                );
              }
            )}

          </div>

        </section>

        {/* AMIGOS */}
        <section className="pb-8">

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
            Sua rede
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Meus amigos ({
              friends.length
            })
          </h2>

          {friends.length ===
          0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
              Nenhuma amizade ainda.
            </div>
          ) : (
            <div className="mt-3 space-y-2">

              {friends.map(
                (
                  friend
                ) => (
                  <Link
                    key={
                      friend.id
                    }
                    href={`/perfil/${friend.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-pink-400/20"
                  >

                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-pink-500/10 text-xs font-bold text-pink-200">

                      {friend.avatar_url ? (
                        <img
                          src={
                            friend.avatar_url
                          }
                          alt={
                            friend.name
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(
                          friend.name
                        )
                      )}

                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="truncate text-sm font-semibold text-white">
                        {
                          friend.name
                        }
                      </p>

                      <p className="truncate text-[10px] text-zinc-500">
                        {friend.headline ||
                          "Usuário ConnectAI"}
                      </p>

                    </div>

                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-300">
                      Amigo
                    </span>

                  </Link>
                )
              )}

            </div>
          )}

        </section>

      </div>
    </PlatformShell>
  );
}