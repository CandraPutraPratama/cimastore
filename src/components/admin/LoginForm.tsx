"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/admin/actions";
import { Field, FormMessage, TextInput } from "./ui";
import { SubmitButton } from "./SubmitButton";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Password admin" name="password">
        <TextInput name="password" type="password" autoComplete="current-password" required autoFocus />
      </Field>
      <FormMessage state={state ? { ok: false, ...(state.message ? { message: state.message } : {}) } : undefined} />
      <SubmitButton pending="Memeriksa...">Masuk</SubmitButton>
    </form>
  );
}
