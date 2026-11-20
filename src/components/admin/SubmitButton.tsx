"use client";

import { useFormStatus } from "react-dom";
import { btnPrimary } from "./styles";

export function SubmitButton({ children, pending: pendingLabel = "Menyimpan...", className = btnPrimary }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
