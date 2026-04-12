import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { CrearTestForm } from "./crear-test-form";

export const metadata: Metadata = {
  title: "Crear test",
  description: "Configura número de preguntas, tipo y modo",
};

export default function CrearTestPage() {
  return (
    <PageShell
      title="Crear test"
      description="Configura el test que quieres hacer."
    >
      <CrearTestForm />
    </PageShell>
  );
}
