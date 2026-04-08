import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Identifícate para acceder a tus tests",
};

export default function LoginPage() {
  return (
    <PageShell
      title="Iniciar sesión"
      description="Inicia sesión o crea una cuenta nueva. El alta requiere confirmar el correo electrónico antes de poder acceder."
    >
      <LoginForm />
      <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        ¿Ya confirmaste tu email?{" "}
        <Link
          href="/login"
          className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
        >
          Inicia sesión aquí
        </Link>
      </p>
    </PageShell>
  );
}
