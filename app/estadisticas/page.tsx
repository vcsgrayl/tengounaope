"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageShell } from "@/components/page-shell";
import { Suspense } from "react";

interface EstadisticaBateria {
  id: string;
  nombre: string;
  totalPreguntas: number;
  respondidas: number;
}

export default function EstadisticasPage() {
  const [datos, setDatos] = useState<EstadisticaBateria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarEstadisticas() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      // 1. Obtener todas las baterías
      const { data: baterias } = await supabase
        .from("baterias_preguntas")
        .select("id, nombre");

      // 2. Obtener el conteo total de preguntas por batería
      const { data: conteoTotal } = await supabase
        .from("preguntas")
        .select("bateria_id");

      // 3. Obtener el progreso del usuario actual
      const { data: progreso } = await supabase
        .from("progreso_usuario")
        .select("pregunta_id, preguntas!inner(bateria_id)")
        .eq("usuario_id", auth.user.id);

      if (baterias) {
        const stats: EstadisticaBateria[] = baterias.map((b) => {
          const total = conteoTotal?.filter((p) => p.bateria_id === b.id).length || 0;
          // Filtramos el progreso donde la pregunta pertenece a esta batería
          const respondidas = progreso?.filter((pr: any) => pr.preguntas.bateria_id === b.id).length || 0;

          return {
            id: b.id,
            nombre: b.nombre,
            totalPreguntas: total,
            respondidas: respondidas,
          };
        });
        setDatos(stats);
      }
      setLoading(false);
    }

    cargarEstadisticas();
  }, []);

  return (
    <PageShell 
      title="Estadísticas por Batería" 
      description="Progreso detallado de preguntas completadas por cada conjunto."
    >
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-100">Batería</th>
              <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-100 text-center">Completadas</th>
              <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-100 text-right">Progreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-zinc-500">Cargando estadísticas...</td>
              </tr>
            ) : datos.map((item) => (
              <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-6 py-4 font-medium text-zinc-800 dark:text-zinc-200">{item.nombre}</td>
                <td className="px-6 py-4 text-center text-zinc-600 dark:text-zinc-400">
                  {item.respondidas} / {item.totalPreguntas}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    {item.totalPreguntas > 0 
                      ? Math.round((item.respondidas / item.totalPreguntas) * 100) 
                      : 0}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}