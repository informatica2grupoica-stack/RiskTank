import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar · RiskTank" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-12 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted">Acceso a RiskTank</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
