import type { ReactNode } from "react";
import { STATUS_LABEL, type OrderStatus } from "@/core/orders/status";
import { FLASH, STATUS_STYLE } from "./format";
import { input } from "./styles";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`sticker [transform:none] ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Flash({ code }: { code: string | undefined }) {
  const flash = code ? FLASH[code] : undefined;
  if (!flash) return null;
  return (
    <p role="status" className={`mb-4 rounded-xl border-2 border-ink px-4 py-3 text-sm font-semibold ${flash.tone === "ok" ? "bg-hemat-soft text-hemat" : "bg-spark text-ink"}`}>
      {flash.text}
    </p>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

/** Kolom form: label, kolom isian, petunjuk, dan pesan salah di bawahnya. */
export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
      {error ? (
        <p id={`${name}-error`} role="alert" className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  name,
  defaultValue,
  error,
  ...rest
}: { name: string; defaultValue?: string | number | undefined; error?: string | undefined } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  return <input id={name} name={name} defaultValue={defaultValue} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} className={input} {...rest} />;
}

export function Select({
  name,
  defaultValue,
  children,
  ...rest
}: { name: string; defaultValue?: string | undefined; children: ReactNode } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name" | "defaultValue">) {
  return (
    <select id={name} name={name} defaultValue={defaultValue} className={input} {...rest}>
      {children}
    </select>
  );
}

export function FormMessage({ state }: { state: { ok?: boolean; message?: string } | undefined }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`rounded-xl border-2 border-ink px-4 py-3 text-sm font-semibold ${state.ok ? "bg-hemat-soft text-hemat" : "bg-paper text-danger"}`}>
      {state.message}
    </p>
  );
}
