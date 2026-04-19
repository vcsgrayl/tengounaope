"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NUM_PREGUNTAS = [5, 10, 15, 20, 30, 40,50,100,150,200,250,300] as const;


const TIPOS_TEST = [
  { value: "menos_veces_preguntadas", label: "Menos veces preguntadas" },
  { value: "peor_respondidas", label: "Peor respondidas" },
  { value: "aleatorio", label: "Aleatorio" },
  { value: "recientes", label: "Repetir últimas preguntas respondidas" },
  { value: "desde_pregunta", label: "N preguntas seguidas desde..." },
] as const;

const MODOS = [
  {
    value: "entrenamiento",
    label: "Entrenamiento",
    hint: "Feedback inmediato y sin límite estricto de tiempo.",
  },
  {
    value: "simulacro",
    label: "Simulacro",
    hint: "Condiciones de examen: cronómetro y sin ayudas entre pregunta y pregunta.",
  },
] as const;

// Definimos la interfaz para la tabla baterías_preguntas
interface Bateria {
  id: string;
  nombre: string;
}
export function CrearTestForm() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "authenticated">(
    "checking"
  );
  const [baterias, setBaterias] = useState<Bateria[]>([]);
  const [bateriaId, setBateriaId] = useState<string>("");
  const [numPreguntas, setNumPreguntas] =
    useState<(typeof NUM_PREGUNTAS)[number]>(10);
  const [tipo, setTipo] = useState<(typeof TIPOS_TEST)[number]["value"]>(
    "menos_veces_preguntadas"
  );
  const [modo, setModo] = useState<(typeof MODOS)[number]["value"]>(
    "entrenamiento"
  );
  const [desdeNumero, setDesdeNumero] = useState<number>(1);

  useEffect(() => {
    let cancelled = false;
    async function inicializar() {
      // 1. Validar Sesión
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (cancelled) return;
      
      if (authError || !authData.user) {
        router.replace("/login?next=%2Fcrear_test");
        return;
      }

      // 2. Cargar Baterías de la tabla 'bateria_preguntas'
      const { data: bateriasData, error: bateriasError } = await supabase
        .from("baterias_preguntas")
        .select("id, nombre")
        .order("nombre", { ascending: true });

      if (!cancelled && !bateriasError && bateriasData) {
        setBaterias(bateriasData);
        // Opcional: seleccionar la primera por defecto
        if (bateriasData.length > 0) setBateriaId(bateriasData[0].id);
      }

      setAuthState("authenticated");
    }

    void inicializar();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({
      n: String(numPreguntas),
      tipo,
      modo,
      bateria: bateriaId,
      desde: String(desdeNumero)
    });
    router.push(`/test?${params.toString()}`);
  }

  if (authState === "checking") {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        Validando sesión…
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Batería de preguntas
        </legend>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Selecciona la batería de preguntas que quieres usar.
        </p>
        <div className="mt-4">
          <select
            value={bateriaId}
            onChange={(e) => setBateriaId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:focus:border-zinc-100"
            required
          >
            <option value="" disabled>Selecciona una batería...</option>
            {baterias.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Número de preguntas
        </legend>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Define el número de preguntas que quieres hacer.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {NUM_PREGUNTAS.map((n) => (
            <label
              key={n}
              className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                numPreguntas === n
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              <input
                type="radio"
                name="num"
                value={n}
                checked={numPreguntas === n}
                onChange={() => setNumPreguntas(n)}
                className="sr-only"
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Tipo de test
        </legend>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Define el tipo de test que quieres hacer.
        </p>
        <div className="mt-4 space-y-2">
          {TIPOS_TEST.map((t) => (
            <label
              key={t.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                tipo === t.value
                  ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900 dark:border-zinc-100 dark:bg-zinc-800/40 dark:ring-zinc-100"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
              }`}
            >
              <input
                type="radio"
                name="tipo"
                value={t.value}
                checked={tipo === t.value}
                onChange={() => setTipo(t.value)}
                className="mt-1 size-4 shrink-0 border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {t.label}
              </span>
            </label>
          ))}
        </div>
        {tipo === "desde_pregunta" && (
          <div className="mt-4 p-4 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">
              Empezar por la pregunta número:
            </label>
            <input
              type="number"
              min="1"
              value={desdeNumero} // Vinculado al estado
              onChange={(e) => {
                const val = e.target.value;
                // Si está vacío, ponemos 0 temporalmente para que deje escribir
                if (val === "") {
                  setDesdeNumero(0);
                  return;
                }
                // Convertimos a entero base 10 para evitar interpretaciones raras
                const num = parseInt(val, 10);
                if (!isNaN(num)) {
                  setDesdeNumero(num);
                }
              }}
              // Esto asegura que al hacer clic en el botón, se use el valor real
              onBlur={() => {
                if (desdeNumero < 1) setDesdeNumero(1);
              }}
              className="mt-2 w-full rounded-lg border border-zinc-200 p-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100"
            />
          </div>              
            )}        
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Modo
        </legend>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Entrenamiento o simulacro de examen.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {MODOS.map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
                modo === m.value
                  ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900 dark:border-zinc-100 dark:bg-zinc-800/40 dark:ring-zinc-100"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="modo"
                  value={m.value}
                  checked={modo === m.value}
                  onChange={() => setModo(m.value)}
                  className="size-4 border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {m.label}
                </span>
              </span>
              <span className="mt-2 pl-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {m.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Ir al test
      </button>
    </form>
  );
}
