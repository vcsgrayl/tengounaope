import type { Metadata } from "next";
import { Suspense } from "react";
import { TestClient } from "./test-client";

export const metadata: Metadata = {
  title: "Test",
  description: "Responde las preguntas del test",
};

function TestFallback() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
      Cargando test…
    </div>
  );
}

export default function TestPage() {
  return (
    <Suspense fallback={<TestFallback />}>
      <TestClient />
    </Suspense>
  );
}
