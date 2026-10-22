"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="block space-y-1">
        <span className="text-sm text-muted">Usuario</span>
        <input
          name="user"
          defaultValue={state.user}
          key={state.user ?? ""}
          autoComplete="username"
          required
          autoFocus={!state.user}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-muted">Contraseña</span>
        <input
          name="password"
          type="password"
          autoFocus={Boolean(state.user)}
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {state.error && <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white dark:text-black hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
