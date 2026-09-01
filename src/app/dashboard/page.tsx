import DashboardHeader from "@/components/DashboardHeader";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";
import PlatformShell from "@/components/layout/PlatformShell";

export default function DashboardPage() {
  return (
    <PlatformShell>
      <DashboardHeader />

      <WorkspaceDashboard />
    </PlatformShell>
  );
}