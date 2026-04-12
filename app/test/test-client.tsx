"use client";

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Pregunta en memoria para el test (mapeada desde `preguntas` u origen local). */
export type PreguntaTest = {
  id: string;
  numPregunta: number | null;
  enunciado: string;
  opciones: string[];
  indiceCorrecto: number;
};

const OPCIONES_DEMO = [
  "Practicar sin presión ni límite de tiempo.",
  "Replicar condiciones de examen con tiempo y sin pistas.",
  "Solo revisar respuestas al final del curso.",
  "Generar preguntas aleatorias sin configuración.",
] as const;

function parseConfig(searchParams: URLSearchParams) {
  const n = Number(searchParams.get("n")) || 10;
  const tipo = searchParams.get("tipo") ?? "general";
  const modo = searchParams.get("modo") ?? "entrenamiento";
  const bateria = searchParams.get("bateria") ?? null;
  const count = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 200) : 10;
  return { n: count, tipo, modo, bateria };
}

function textoEnunciado(row: Record<string, unknown>): string {
  const a = row.enunciado;
  const b = row.texto;
  const c = row.pregunta;
  if (typeof a === "string" && a.trim()) return a;
  if (typeof b === "string" && b.trim()) return b;
  if (typeof c === "string" && c.trim()) return c;
  return "";
}

function mapRowToPregunta(row: Record<string, unknown>): PreguntaTest | null {
  const id = row.id != null ? String(row.id) : "";
  if (!id) return null;

  let opciones: string[] = [];
  const rawOp = row.opciones;
  if (Array.isArray(rawOp)) {
    opciones = rawOp.filter((x): x is string => typeof x === "string");
  }
  if (opciones.length === 0) {
    opciones = [...OPCIONES_DEMO];
  }

  let indiceCorrecto = 0;
  const rc = row.respuesta_correcta;
  const ic = row.indice_correcto;
  if (typeof rc === "number" && Number.isFinite(rc)) indiceCorrecto = rc;
  else if (typeof ic === "number" && Number.isFinite(ic)) indiceCorrecto = ic;
  indiceCorrecto = Math.min(
    Math.max(0, Math.floor(indiceCorrecto)),
    opciones.length - 1
  );

  const enunciado = textoEnunciado(row) || "Pregunta sin texto";
  const rawNum = row.num_pregunta;
  const numPregunta =
    typeof rawNum === "number" && Number.isFinite(rawNum)
      ? Math.floor(rawNum)
      : null;

  return { id, numPregunta, enunciado, opciones, indiceCorrecto };
}

/** Ajusta columnas a tu tabla `progreso_usuario` si difieren. */
async function guardarProgresoUsuario(payload: {
  preguntaId: string;
  esCorrecto: boolean;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    console.warn("progreso_usuario: no hay usuario autenticado");
    return;
  }

  const { data: existente, error: selectError } = await supabase
    .from("progreso_usuario")
    .select("veces_fallada, veces_acertada")
    .eq("usuario_id", userId)
    .eq("pregunta_id", payload.preguntaId)
    .maybeSingle();

  if (selectError) {
    console.error("progreso_usuario select:", selectError.message);
    return;
  }

  const ahora = new Date().toISOString();

  if (existente) {
    const vecesFallada = Number(existente.veces_fallada ?? 0);
    const vecesAcertada = Number(existente.veces_acertada ?? 0);

    const { error: updateError } = await supabase
      .from("progreso_usuario")
      .update({
        veces_fallada: vecesFallada + (payload.esCorrecto ? 0 : 1),
        veces_acertada: vecesAcertada + (payload.esCorrecto ? 1 : 0),
        ultima_vez: ahora,
      })
      .eq("usuario_id", userId)
      .eq("pregunta_id", payload.preguntaId);

    if (updateError) {
      console.error("progreso_usuario update:", updateError.message);
    }
    return;
  }

  const { error: insertError } = await supabase
    .from("progreso_usuario")
    .insert({
      usuario_id: userId,
      pregunta_id: payload.preguntaId,
      veces_fallada: payload.esCorrecto ? 0 : 1,
      veces_acertada: payload.esCorrecto ? 1 : 0,
      ultima_vez: ahora,
    });

  if (insertError) {
    console.error("progreso_usuario insert:", insertError.message);
  }
}

export function TestClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { n, tipo, modo, bateria } = useMemo(
    () => parseConfig(searchParams),
    [searchParams]
  );
  const [authState, setAuthState] = useState<"checking" | "authenticated">(
    "checking"
  );

  const [preguntas, setPreguntas] = useState<PreguntaTest[]>([]);
  const [respuestas, setRespuestas] = useState<Array<number | null>>([]);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  /** Aciertos del test actual (solo memoria del componente). */
  const [aciertos, setAciertos] = useState(0);
  const ultimoCorrectoPorIndice = useRef<Map<number, boolean>>(new Map());
  /** Evita insertar dos veces la misma respuesta al mismo índice en esta sesión. */
  const opcionPersistidaPorIndice = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function validarSesion() {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        const params = new URLSearchParams({ n: String(n), tipo, modo });
        if (bateria) params.append("bateria", bateria);
      
        const next = encodeURIComponent(`/test?${params.toString()}`);
        router.replace(`/login?next=${next}`);
        return;
      }
      setAuthState("authenticated");
    }
    void validarSesion();
    return () => {
      cancelled = true;
    };
  }, [modo, n, router, tipo]);

  useEffect(() => {
    if (authState !== "authenticated") return;
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);
    setIndex(0);
    setRespuestas([]);
    setCompleted(false);
    setAciertos(0);
    ultimoCorrectoPorIndice.current = new Map();
    opcionPersistidaPorIndice.current = new Map();

    async function cargar() {
      setLoadState("loading");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
        setLoadState("error");
        setLoadError("No hay usuario autenticado");
        setPreguntas([]);
        return;
      }
      // 1. Obtener el progreso del usuario para esta batería (si existe)
      // Necesitamos esto para calcular fallos y frecuencia
      const { data: progreso } = await supabase
         .from("progreso_usuario")
         .select("pregunta_id, veces_fallada, veces_acertada, ultima_vez")
         .eq("usuario_id", userId);
      
      // 2. Consulta base de preguntas filtrada por batería
      let query = supabase.from("preguntas").select("*");
      if (bateria) {
        query = query.eq("bateria_id", bateria);
      }
         
      const { data: preguntasData, error } = await query;

      if (cancelled) return;

      if (error || !preguntasData) {
        setLoadState("error");
        setLoadError(error.message);
        setPreguntas([]);
        return;
      }

      // 3. Lógica de filtrado y ordenación en Memoria (JS)
      // Mapeamos y calculamos las métricas para cada pregunta
      let listaProcesada = preguntasData.map((p) => {
        const prog = progreso?.find((pr) => pr.pregunta_id === p.id);
        const fallos = prog?.veces_fallada ?? 0;
        const aciertos = prog?.veces_acertada ?? 0;
        const total = fallos + aciertos;
        const ultimaVez = prog?.ultima_vez ? new Date(prog.ultima_vez).getTime() : 0; // Convertimos a timestamp
        
        return {
          ...p,
          ratioError: total > 0 ? fallos / total : 0,
          vecesRespondida: total,
          ultimaVez
        };
      });

      // 4. Aplicar criterio según el "tipo"
      if (tipo === "peor_respondidas") {
        // Priorizar preguntas con mayor ratio de error
        listaProcesada.sort((a, b) => b.ratioError - a.ratioError);
      } else if (tipo === "menos_veces_preguntadas") {
        // Priorizar las menos respondidas
        listaProcesada.sort((a, b) => a.vecesRespondida - b.vecesRespondida);
      } else if (tipo === "recientes") {
        // ORDENAR POR FECHA: Más reciente primero
        listaProcesada.sort((a, b) => b.ultimaVez - a.ultimaVez);
      } else {
        // General / Aleatorio
        listaProcesada.sort(() => Math.random() - 0.5);
      }

      // 5. Tomar solo las 'n' preguntas solicitadas
      const seleccionadas = listaProcesada.slice(0, n);

      // 6. ORDENACIÓN FINAL: Siempre por num_pregunta (ascendente)
      seleccionadas.sort((a, b) => (a.num_pregunta ?? 0) - (b.num_pregunta ?? 0));

      // 7. Mapear al formato del Test
      const mapped = seleccionadas
      .map(mapRowToPregunta)
      .filter((p): p is PreguntaTest => p !== null);


      setPreguntas(mapped);
      setRespuestas(Array.from({ length: mapped.length }, () => null));
      setLoadState("ok");
    }

    void cargar();
    return () => {
      cancelled = true;
    };
  }, [authState, n, tipo]);

  const total = preguntas.length;
  const actual = total > 0 ? preguntas[index] : null;
  const selected = respuestas[index] ?? null;
  const esEntrenamiento = modo === "entrenamiento";
  const esUltima = total > 0 && index >= total - 1;

  const progressPct =
    total > 0
      ? completed
        ? 100
        : Math.min(100, ((index + 1) / total) * 100)
      : 0;

  const confirmarRespuestaActual = useCallback(async () => {
    if (!actual || selected === null) return;

    const esCorrecto = selected === actual.indiceCorrecto;
    const prev = ultimoCorrectoPorIndice.current.get(index);

    if (prev === undefined) {
      setAciertos((a) => a + (esCorrecto ? 1 : 0));
    } else {
      setAciertos(
        (a) => a - (prev ? 1 : 0) + (esCorrecto ? 1 : 0)
      );
    }
    ultimoCorrectoPorIndice.current.set(index, esCorrecto);

    if (actual.id.startsWith("demo-")) return;

    const yaEnviada = opcionPersistidaPorIndice.current.get(index);
    if (yaEnviada === selected) return;

    await guardarProgresoUsuario({
      preguntaId: actual.id,
      esCorrecto,
    });
    opcionPersistidaPorIndice.current.set(index, selected);
  }, [actual, index, selected]);

  const goNext = useCallback(async () => {
    if (!actual || selected === null) return;

    await confirmarRespuestaActual();

    if (esUltima) {
      setCompleted(true);
      return;
    }
    setIndex((i) => i + 1);
  }, [actual, selected, esUltima, confirmarRespuestaActual]);

  if (authState === "checking") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Validando sesión…
      </div>
    );
  }

  if (loadState === "loading" || loadState === "idle") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Cargando preguntas…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError ?? "No se pudieron cargar las preguntas."}
        </p>
        <Link
          href="/crear_test"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          Volver a configurar
        </Link>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No hay preguntas disponibles.
      </div>
    );
  }

  const preguntaActual = actual;
  if (!preguntaActual) return null;

  const opcionesActuales = preguntaActual.opciones;
  const esCorrectaSeleccion =
    selected !== null && selected === preguntaActual.indiceCorrecto;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Test ·{" "}
            {tipo === "tema"
              ? "Tema"
              : tipo === "fallos"
                ? "Fallos"
                  : tipo === "recientes"
                  ? "Últimas preguntas respondidas"
                : "General"}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Pregunta {index + 1} de {total}
          </h1>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            esEntrenamiento
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
          }`}
        >
          {esEntrenamiento ? "Entrenamiento" : "Simulacro"}
        </span>
      </div>

      <div
        className="mb-8 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-zinc-900 transition-[width] duration-300 dark:bg-zinc-100"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 sm:p-8">
        {completed ? (
          <div className="py-4">
            <p className="text-center text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Test completado
            </p>
            <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
              Aciertos:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {aciertos}
              </span>{" "}
              de {total}
            </p>
            <p className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
              El resultado de tu test ha sido guardado en la base de datos.
            </p>

            {!esEntrenamiento ? (
              <div className="mt-8 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Revisión del simulacro · Pregunta {index + 1} de {total}
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-2 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    {preguntaActual.numPregunta ?? index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {preguntaActual.enunciado}
                  </p>
                </div>
                <ul className="mt-4 space-y-2">
                  {opcionesActuales.map((texto, i) => {
                    const fueSeleccionada = selected === i;
                    const esCorrecta = i === preguntaActual.indiceCorrecto;
                    let tone =
                      "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";
                    if (esCorrecta) {
                      tone =
                        "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
                    } else if (fueSeleccionada) {
                      tone =
                        "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100";
                    }

                    return (
                      <li
                        key={`${preguntaActual.id}-review-${i}`}
                        className={`rounded-xl border px-4 py-3 text-sm ${tone}`}
                      >
                        <span className="mr-2 font-mono text-xs opacity-70">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        {texto}
                        {fueSeleccionada ? (
                          <span className="ml-2 text-xs font-semibold">
                            (Tu respuesta)
                          </span>
                        ) : null}
                        {esCorrecta ? (
                          <span className="ml-2 text-xs font-semibold">
                            (Correcta)
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 text-sm">
                  {selected === preguntaActual.indiceCorrecto ? (
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      Resultado: acierto
                    </span>
                  ) : (
                    <span className="font-medium text-rose-700 dark:text-rose-300">
                      Resultado: fallo
                    </span>
                  )}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={index >= total - 1}
                    onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                    className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-6 text-center">
              <Link
                href="/crear_test"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Crear otro test
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-zinc-100 px-2 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {preguntaActual.numPregunta ?? index + 1}
              </span>
              <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
                {preguntaActual.enunciado}
              </p>
            </div>

            <ul className="mt-8 space-y-2">
              {opcionesActuales.map((texto, i) => {
                const active = selected === i;
                return (
                  <li key={`${preguntaActual.id}-${i}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setRespuestas((prev) => {
                          const next = [...prev];
                          next[index] = i;
                          return next;
                        })
                      }
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600"
                      }`}
                    >
                      <span className="mr-2 font-mono text-xs opacity-70">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {texto}
                    </button>
                  </li>
                );
              })}
            </ul>

            {esEntrenamiento && selected !== null && (
              <p
                className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
                  esCorrectaSeleccion
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100"
                }`}
              >
                {esCorrectaSeleccion
                  ? "Correcto."
                  : "Incorrecto. En simulacro este feedback podría ocultarse."}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/crear_test"
                className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Cambiar configuración
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => {
                    setIndex((i) => Math.max(0, i - 1));
                  }}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={selected === null}
                  onClick={() => void goNext()}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {esUltima ? "Finalizar" : "Siguiente"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
