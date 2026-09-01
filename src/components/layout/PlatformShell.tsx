"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import RequireAuth from "@/components/RequireAuth";

type PlatformShellProps = {
  children: ReactNode;
};

type NavigationItem = {
  href: string;
  label: string;
  mobileLabel: string;
  symbol: string;
  activeClass: string;
  iconClass: string;
};

type RouteTheme = {
  background: string;
  glowPrimary: string;
  glowSecondary: string;
  glowBottom: string;
};

const primaryNavigation: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Início",
    mobileLabel: "Início",
    symbol: "⌂",
    activeClass:
      "border-blue-400/30 bg-blue-500/15 text-blue-100 shadow-[0_8px_30px_rgba(59,130,246,0.16)]",
    iconClass:
      "border-blue-400/20 bg-blue-500/10 text-blue-300",
  },
  {
    href: "/reunioes",
    label: "Sala de Reuniões",
    mobileLabel: "Reuniões",
    symbol: "◉",
    activeClass:
      "border-cyan-400/30 bg-cyan-500/15 text-cyan-100 shadow-[0_8px_30px_rgba(34,211,238,0.16)]",
    iconClass:
      "border-cyan-400/20 bg-cyan-500/10 text-cyan-300",
  },
  {
    href: "/social",
    label: "Social",
    mobileLabel: "Social",
    symbol: "◎",
    activeClass:
      "border-pink-400/30 bg-pink-500/15 text-pink-100 shadow-[0_8px_30px_rgba(236,72,153,0.18)]",
    iconClass:
      "border-pink-400/20 bg-pink-500/10 text-pink-300",
  },
  {
    href: "/edicao",
    label: "Edição",
    mobileLabel: "Edição",
    symbol: "✦",
    activeClass:
      "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-100 shadow-[0_8px_30px_rgba(217,70,239,0.16)]",
    iconClass:
      "border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-300",
  },
];

const secondaryNavigation: NavigationItem[] = [
  {
    href: "/perfil",
    label: "Meu Perfil",
    mobileLabel: "Perfil",
    symbol: "●",
    activeClass:
      "border-emerald-400/30 bg-emerald-500/15 text-emerald-100 shadow-[0_8px_30px_rgba(16,185,129,0.16)]",
    iconClass:
      "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
  },
  {
    href: "/desenvolvedor",
    label: "Sobre o Desenvolvedor",
    mobileLabel: "Dev",
    symbol: "<>",
    activeClass:
      "border-amber-400/30 bg-amber-500/15 text-amber-100 shadow-[0_8px_30px_rgba(245,158,11,0.16)]",
    iconClass:
      "border-amber-400/20 bg-amber-500/10 text-amber-300",
  },
  {
    href: "/contato",
    label: "Contato",
    mobileLabel: "Contato",
    symbol: "@",
    activeClass:
      "border-rose-400/30 bg-rose-500/15 text-rose-100 shadow-[0_8px_30px_rgba(244,63,94,0.16)]",
    iconClass:
      "border-rose-400/20 bg-rose-500/10 text-rose-300",
  },
];

const routeThemes: Record<string, RouteTheme> = {
  dashboard: {
    background: "#05070d",
    glowPrimary: "rgba(59, 130, 246, 0.14)",
    glowSecondary: "rgba(99, 102, 241, 0.09)",
    glowBottom: "rgba(34, 211, 238, 0.06)",
  },

  reunioes: {
    background: "#031014",
    glowPrimary: "rgba(34, 211, 238, 0.15)",
    glowSecondary: "rgba(14, 165, 233, 0.09)",
    glowBottom: "rgba(6, 182, 212, 0.07)",
  },

  social: {
    background: "#13070f",
    glowPrimary: "rgba(236, 72, 153, 0.20)",
    glowSecondary: "rgba(244, 63, 94, 0.11)",
    glowBottom: "rgba(219, 39, 119, 0.08)",
  },

  edicao: {
    background: "#100610",
    glowPrimary: "rgba(217, 70, 239, 0.15)",
    glowSecondary: "rgba(236, 72, 153, 0.09)",
    glowBottom: "rgba(168, 85, 247, 0.07)",
  },

  perfil: {
    background: "#04100c",
    glowPrimary: "rgba(16, 185, 129, 0.14)",
    glowSecondary: "rgba(52, 211, 153, 0.09)",
    glowBottom: "rgba(20, 184, 166, 0.06)",
  },

  desenvolvedor: {
    background: "#100c04",
    glowPrimary: "rgba(245, 158, 11, 0.14)",
    glowSecondary: "rgba(234, 179, 8, 0.08)",
    glowBottom: "rgba(249, 115, 22, 0.06)",
  },

  contato: {
    background: "#100609",
    glowPrimary: "rgba(244, 63, 94, 0.14)",
    glowSecondary: "rgba(236, 72, 153, 0.09)",
    glowBottom: "rgba(251, 113, 133, 0.06)",
  },
};

function getThemeKey(pathname: string) {
  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/")
  ) {
    return "dashboard";
  }

  if (
    pathname === "/reunioes" ||
    pathname.startsWith("/reunioes/") ||
    pathname === "/reuniao" ||
    pathname.startsWith("/reuniao/")
  ) {
    return "reunioes";
  }

  if (
    pathname === "/social" ||
    pathname.startsWith("/social/")
  ) {
    return "social";
  }

  if (
    pathname === "/edicao" ||
    pathname.startsWith("/edicao/")
  ) {
    return "edicao";
  }

  if (
    pathname === "/perfil" ||
    pathname.startsWith("/perfil/")
  ) {
    return "perfil";
  }

  if (
    pathname === "/desenvolvedor" ||
    pathname.startsWith("/desenvolvedor/")
  ) {
    return "desenvolvedor";
  }

  if (
    pathname === "/contato" ||
    pathname.startsWith("/contato/")
  ) {
    return "contato";
  }

  return "dashboard";
}

export default function PlatformShell({
  children,
}: PlatformShellProps) {
  const pathname = usePathname();

  const [
    moreMenuOpen,
    setMoreMenuOpen,
  ] = useState(false);

  useEffect(() => {
    setMoreMenuOpen(false);
  }, [pathname]);

  const theme = useMemo(() => {
    const themeKey =
      getThemeKey(pathname);

    return routeThemes[themeKey];
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    if (href === "/reunioes") {
      return (
        pathname === "/reunioes" ||
        pathname.startsWith("/reunioes/") ||
        pathname === "/reuniao" ||
        pathname.startsWith("/reuniao/")
      );
    }

    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  }

  const secondaryActive =
    secondaryNavigation.some((item) =>
      isActive(item.href)
    );

  function renderDesktopItem(
    item: NavigationItem
  ) {
    const active =
      isActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={[
          "flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2",
          "text-sm font-medium backdrop-blur-xl transition duration-300",
          active
            ? item.activeClass
            : "border-white/[0.07] bg-white/[0.025] text-zinc-400 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-bold",
            item.iconClass,
          ].join(" ")}
        >
          {item.symbol}
        </span>

        <span className="min-w-0 flex-1 truncate">
          {item.label}
        </span>

        {active && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        )}
      </Link>
    );
  }

  return (
    <RequireAuth>
      <div
        className="min-h-screen w-full max-w-full overflow-x-hidden text-white transition-colors duration-700"
        style={{
          backgroundColor:
            theme.background,
        }}
      >
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div
            className="absolute -left-40 -top-40 h-80 w-80 rounded-full blur-3xl transition-colors duration-700"
            style={{
              background:
                theme.glowPrimary,
            }}
          />

          <div
            className="absolute -right-40 top-1/3 h-96 w-96 rounded-full blur-3xl transition-colors duration-700"
            style={{
              background:
                theme.glowSecondary,
            }}
          />

          <div
            className="absolute bottom-[-12rem] left-1/4 h-80 w-80 rounded-full blur-3xl transition-colors duration-700"
            style={{
              background:
                theme.glowBottom,
            }}
          />
        </div>

        <div className="relative z-10 flex min-h-screen w-full max-w-full">
          <aside className="hidden w-[260px] shrink-0 p-3 xl:block">
            <div className="sticky top-3 flex h-[calc(100vh-1.5rem)] flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-black/20 backdrop-blur-2xl">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500 to-violet-600 font-black">
                  C
                </div>

                <div className="min-w-0">
                  <p className="truncate font-bold">
                    ConnectAI
                  </p>

                  <p className="truncate text-[10px] text-zinc-500">
                    Conecte. Crie. Evolua.
                  </p>
                </div>
              </Link>

              <p className="mb-2 mt-5 px-2 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                Principal
              </p>

              <nav className="space-y-1.5">
                {primaryNavigation.map(
                  renderDesktopItem
                )}
              </nav>

              <p className="mb-2 mt-5 px-2 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                Conta e projeto
              </p>

              <nav className="space-y-1.5">
                {secondaryNavigation.map(
                  renderDesktopItem
                )}
              </nav>

              <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="text-[10px] leading-5 text-zinc-500">
                  Pessoas, reuniões e criação em uma única plataforma.
                </p>
              </div>
            </div>
          </aside>

          <div className="min-w-0 w-full flex-1">
            <header
              className="sticky top-0 z-40 w-full border-b border-white/[0.07] px-3 py-3 backdrop-blur-2xl transition-colors duration-700 sm:px-4 xl:hidden"
              style={{
                backgroundColor:
                  `${theme.background}dd`,
              }}
            >
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
                <Link
                  href="/dashboard"
                  className="flex min-w-0 items-center gap-2.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-black shadow-lg shadow-blue-500/10">
                    C
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-base font-bold leading-none">
                      ConnectAI
                    </p>

                    <p className="mt-1 truncate text-[9px] text-zinc-500">
                      Conecte. Crie. Evolua.
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    setMoreMenuOpen(
                      (current) =>
                        !current
                    )
                  }
                  aria-label="Abrir mais opções"
                  aria-expanded={
                    moreMenuOpen
                  }
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-xl transition",
                    moreMenuOpen ||
                    secondaryActive
                      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                      : "border-white/10 bg-white/[0.05] text-zinc-300",
                  ].join(" ")}
                >
                  <span className="text-lg leading-none">
                    {moreMenuOpen
                      ? "×"
                      : "•••"}
                  </span>
                </button>
              </div>
            </header>

            <main className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-3 pb-28 pt-4 sm:px-4 sm:pt-5 md:px-6 xl:px-8 xl:pb-10 xl:pt-8">
              {children}
            </main>
          </div>
        </div>

        {moreMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() =>
                setMoreMenuOpen(false)
              }
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm xl:hidden"
            />

            <section className="fixed inset-x-3 bottom-[6.5rem] z-[70] mx-auto max-w-md xl:hidden">
              <div className="rounded-[1.75rem] border border-white/10 bg-[#0b0e16]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                <div className="flex items-center justify-between px-2 pb-3">
                  <div>
                    <p className="text-sm font-bold">
                      Mais
                    </p>

                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      Sua conta e o projeto
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setMoreMenuOpen(
                        false
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lg text-zinc-400"
                  >
                    ×
                  </button>
                </div>

                <nav className="space-y-2">
                  {secondaryNavigation.map(
                    (item) => {
                      const active =
                        isActive(
                          item.href
                        );

                      return (
                        <Link
                          key={
                            item.href
                          }
                          href={
                            item.href
                          }
                          className={[
                            "flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2.5 backdrop-blur-xl transition",
                            active
                              ? item.activeClass
                              : "border-white/[0.07] bg-white/[0.035] text-zinc-300",
                          ].join(
                            " "
                          )}
                        >
                          <span
                            className={[
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold",
                              item.iconClass,
                            ].join(
                              " "
                            )}
                          >
                            {
                              item.symbol
                            }
                          </span>

                          <span className="text-sm font-medium">
                            {
                              item.label
                            }
                          </span>
                        </Link>
                      );
                    }
                  )}
                </nav>
              </div>
            </section>
          </>
        )}

        <nav className="fixed inset-x-2 bottom-2 z-50 xl:hidden">
          <div className="mx-auto grid w-full max-w-md grid-cols-5 gap-1 rounded-[1.6rem] border border-white/10 bg-[#0b0e16]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-2xl">
            {primaryNavigation.map(
              (item) => {
                const active =
                  isActive(
                    item.href
                  );

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2",
                      "text-[9px] font-medium backdrop-blur-xl transition",
                      active
                        ? item.activeClass
                        : "border-transparent text-zinc-500",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded-lg border text-xs",
                        active
                          ? item.iconClass
                          : "border-transparent",
                      ].join(" ")}
                    >
                      {item.symbol}
                    </span>

                    <span className="w-full truncate text-center">
                      {
                        item.mobileLabel
                      }
                    </span>
                  </Link>
                );
              }
            )}

            <button
              type="button"
              onClick={() =>
                setMoreMenuOpen(
                  (current) =>
                    !current
                )
              }
              className={[
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-[9px] font-medium transition",
                moreMenuOpen ||
                secondaryActive
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                  : "border-transparent text-zinc-500",
              ].join(" ")}
            >
              <span className="flex h-7 w-7 items-center justify-center text-base leading-none">
                •••
              </span>

              <span>
                Mais
              </span>
            </button>
          </div>
        </nav>
      </div>
    </RequireAuth>
  );
}