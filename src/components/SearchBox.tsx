export function SearchBox({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form action="/buscar" className="flex gap-2 w-full">
      <input
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        required
        placeholder="RUT (76.123.456-7) o razón social"
        className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
      />
      <button type="submit" className="rounded-lg bg-accent px-5 py-3 font-medium text-white dark:text-black hover:opacity-90">
        Evaluar
      </button>
    </form>
  );
}
