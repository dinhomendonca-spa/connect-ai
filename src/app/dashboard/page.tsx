import DashboardCard from "@/components/DashboardCard";
import DashboardHeader from "@/components/DashboardHeader";

// Dados usados para montar os cards do Dashboard.
const dashboardItems = [
  {
    id: 1,
    title: "Nova reunião",
    description: "Crie uma sala para iniciar uma nova conversa.",
    href: "/reuniao/nova",
  },
  {
    id: 2,
    title: "Reuniões",
    description: "Acompanhe suas reuniões agendadas e recentes.",
    href: "/reunioes",
  },
  {
    id: 3,
    title: "Histórico",
    description: "Consulte conversas e reuniões anteriores.",
    href: "/historico",
  },
];

export default function DashboardPage() {
  return (
    // Página principal exibida após o login.
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-white">
      <section className="mx-auto w-full max-w-5xl">
        <DashboardHeader />

        {/* Os cards são gerados a partir dos dados da lista acima. */}
        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboardItems.map((item) => (
            <DashboardCard
              key={item.id}
              title={item.title}
              description={item.description}
              href={item.href}
            />
          ))}
        </section>
      </section>
    </main>
  );
}