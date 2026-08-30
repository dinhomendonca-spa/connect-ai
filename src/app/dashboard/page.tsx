import DashboardHeader from "@/components/DashboardHeader";
import RequireAuth from "@/components/RequireAuth";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <RequireAuth>
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <DashboardHeader />

          <WorkspaceDashboard />
        </div>
      </RequireAuth>
    </main>
  );
}