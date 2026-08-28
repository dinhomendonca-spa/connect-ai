import Link from "next/link";

// Define as informações que cada card do Dashboard recebe.
type DashboardCardProps = {
  title: string;
  description: string;
  href: string;
};

export default function DashboardCard({
  title,
  description,
  href,
}: DashboardCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:border-zinc-700 hover:bg-zinc-800/80"
    >
      <h2 className="text-lg font-semibold text-white">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {description}
      </p>
    </Link>
  );
}