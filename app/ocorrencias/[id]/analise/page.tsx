"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnalysisBefore = {
  id: string;
  occurrence_id: string;
  occurrence_cause: string | null;
  non_detection_cause: string | null;
  systemic_cause: string | null;
  five_why_occurrence: any | null;
  approved: boolean | null;
  created_at?: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  is_active: boolean;
};

export default function AnalisePage() {
  const params = useParams();
  const router = useRouter();
  const occurrenceId = params.id as string;

  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisBefore, setAnalysisBefore] = useState<AnalysisBefore | null>(
    null
  );

  const [profile, setProfile] = useState<Profile | null>(null);

  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [form, setForm] = useState({
    occurrence_cause: "",
    non_detection_cause: "",
    systemic_cause: "",
    why1: "",
    why2: "",
    why3: "",
    why4: "",
    why5: "",
  });

  useEffect(() => {
    if (occurrenceId) verificarUsuarioECarregarAnalise();
  }, [occurrenceId]);

  async function verificarUsuarioECarregarAnalise() {
    setAuthLoading(true);
    setLoading(true);
    setErro(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.push("/login");
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        role,
        department,
        is_active
      `)
      .eq("id", userData.user.id)
      .single();

    if (profileError) {
      setErro(
        "Usuário autenticado, mas não foi possível carregar o perfil: " +
          profileError.message
      );
      setAuthLoading(false);
      setLoading(false);
      return;
    }

    if (!profileData?.is_active) {
      await supabase.auth.signOut();
      router.push("/login");
      return;
    }

    setProfile(profileData as Profile);
    setAuthLoading(false);

    await carregarAnaliseExistente();
  }

  async function carregarAnaliseExistente() {
    setLoading(true);
    setErro(null);

    const { data, error } = await supabase
      .from("root_cause_analysis")
      .select("*")
      .eq("occurrence_id", occurrenceId)
      .maybeSingle();

    if (error) {
      setErro("Erro ao carregar análise: " + error.message);
      setLoading(false);
      return;
    }

    if (data) {
      setAnalysisId(data.id);
      setAnalysisBefore(data as AnalysisBefore);

      setForm({
        occurrence_cause: data.occurrence_cause || "",
        non_detection_cause: data.non_detection_cause || "",
        systemic_cause: data.systemic_cause || "",
        why1: data.five_why_occurrence?.why1 || "",
        why2: data.five_why_occurrence?.why2 || "",
        why3: data.five_why_occurrence?.why3 || "",
        why4: data.five_why_occurrence?.why4 || "",
        why5: data.five_why_occurrence?.why5 || "",
      });
    }

    setLoading(false);
  }
  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErro("Não foi possível sair do sistema: " + error.message);
      return;
    }

    router.push("/login");
  }

  const causasFracas = [
    "erro humano",
    "falta de atenção",
    "descuido",
    "operador não viu",
    "falha do operador",
    "treinamento",
    "falta de treinamento",
  ];

  const textoCompleto = Object.values(form).join(" ").toLowerCase();

  const causaFracaDetectada = causasFracas.find((termo) =>
    textoCompleto.includes(termo)
  );

  function handleChange(campo: string, valor: string) {
    setErro(null);

    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  const camposObrigatoriosPreenchidos =
    form.occurrence_cause.trim() &&
    form.non_detection_cause.trim() &&
    form.systemic_cause.trim() &&
    form.why1.trim() &&
    form.why2.trim() &&
    form.why3.trim();

  const profundidade5Porques = [
    form.why1,
    form.why2,
    form.why3,
    form.why4,
    form.why5,
  ].filter((item) => item.trim()).length;

  const podeSalvar =
    !!camposObrigatoriosPreenchidos && !causaFracaDetectada && !salvando;

  const statusAnalise = useMemo(() => {
    if (causaFracaDetectada) return "Revisar causa fraca";
    if (!camposObrigatoriosPreenchidos) return "Preenchimento pendente";
    if (profundidade5Porques < 5) return "Aceitável, mas pode aprofundar";
    return "Análise pronta";
  }, [causaFracaDetectada, camposObrigatoriosPreenchidos, profundidade5Porques]);

  const statusAnaliseStyle = causaFracaDetectada
    ? "bg-red-100 text-red-800"
    : !camposObrigatoriosPreenchidos
    ? "bg-yellow-100 text-yellow-800"
    : profundidade5Porques < 5
    ? "bg-orange-100 text-orange-800"
    : "bg-green-100 text-green-800";

  function montarPayload() {
    return {
      occurrence_id: occurrenceId,
      occurrence_cause: form.occurrence_cause.trim(),
      non_detection_cause: form.non_detection_cause.trim(),
      systemic_cause: form.systemic_cause.trim(),
      five_why_occurrence: {
        why1: form.why1.trim(),
        why2: form.why2.trim(),
        why3: form.why3.trim(),
        why4: form.why4.trim(),
        why5: form.why5.trim(),
      },
      approved: false,
    };
  }

  async function registrarAuditoria({
    eventType,
    eventLabel,
    description,
    beforeData = null,
    afterData,
  }: {
    eventType: string;
    eventLabel: string;
    description: string;
    beforeData?: any | null;
    afterData: any;
  }) {
    const { error } = await supabase.from("quality_audit_logs").insert({
      occurrence_id: occurrenceId,
      event_type: eventType,
      event_label: eventLabel,
      description,
      before_data: beforeData,
      after_data: {
        ...(afterData || {}),
        audit_user_id: profile?.id || null,
        audit_user_name: profile?.full_name || profile?.email || null,
        audit_user_role: profile?.role || null,
      },
    });

    if (error) {
      throw new Error("Erro ao registrar auditoria: " + error.message);
    }
  }

  async function handleSalvarAnalise() {
    setErro(null);

    if (!podeSalvar) {
      setErro(
        causaFracaDetectada
          ? `Causa fraca detectada: "${causaFracaDetectada}". Reformule em nível de processo, método, controle ou sistema.`
          : "Preencha todos os campos obrigatórios antes de salvar a análise."
      );
      return;
    }

    setSalvando(true);

    const payload = montarPayload();
    try {
      if (analysisId) {
        const { error } = await supabase
          .from("root_cause_analysis")
          .update(payload)
          .eq("id", analysisId);

        if (error) {
          setErro("Erro ao atualizar análise: " + error.message);
          setSalvando(false);
          return;
        }

        await registrarAuditoria({
          eventType: "analysis_updated",
          eventLabel: "Análise de causa atualizada",
          description: "A análise de causa raiz da RNC foi atualizada.",
          beforeData: analysisBefore,
          afterData: payload,
        });
      } else {
        const { data, error } = await supabase
          .from("root_cause_analysis")
          .insert([payload])
          .select("id")
          .single();

        if (error) {
          setErro("Erro ao salvar análise: " + error.message);
          setSalvando(false);
          return;
        }

        await registrarAuditoria({
          eventType: "analysis_created",
          eventLabel: "Análise de causa criada",
          description: "A análise de causa raiz da RNC foi registrada.",
          afterData: {
            id: data.id,
            ...payload,
          },
        });
      }

      const { error: occurrenceError } = await supabase
        .from("occurrences")
        .update({ status: "em_analise" })
        .eq("id", occurrenceId);

      if (occurrenceError) {
        setErro(
          "Análise salva, mas houve erro ao atualizar status da RNC: " +
            occurrenceError.message
        );
        setSalvando(false);
        return;
      }

      await registrarAuditoria({
        eventType: "occurrence_status_changed",
        eventLabel: "RNC enviada para etapa de análise",
        description: "A RNC foi atualizada para status em análise.",
        beforeData: null,
        afterData: {
          status: "em_analise",
        },
      });

      router.push(`/ocorrencias/${occurrenceId}`);
    } catch (error: any) {
      setErro(error.message || "Erro ao salvar análise.");
      setSalvando(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 text-black">
        <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
          Carregando análise...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-black">
      <div className="mx-auto max-w-6xl rounded-xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.push(`/ocorrencias/${occurrenceId}`)}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              ← Voltar para ocorrência
            </button>

            <h1 className="mt-4 text-2xl font-bold">
              {analysisId
                ? "Editar análise de causa raiz"
                : "Análise de causa raiz"}
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Estruture a investigação separando causa da ocorrência, falha de
              detecção e causa sistêmica.
            </p>

            {profile && (
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p>
                  Logado como:{" "}
                  <strong>{profile.full_name || profile.email}</strong>
                </p>

                <p className="mt-1 text-xs text-blue-700">
                  Perfil: {formatarPerfil(profile.role)}
                  {profile.department ? ` • Setor: ${profile.department}` : ""}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm">
              <p className="font-semibold text-gray-700">Status da análise</p>
              <p
                className={`mt-1 rounded-full px-3 py-1 text-xs font-bold ${statusAnaliseStyle}`}
              >
                {statusAnalise}
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Sair
            </button>
          </div>
        </div>

        {erro && (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            {erro}
          </div>
        )}

        {causaFracaDetectada && (
          <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <strong>Causa fraca detectada:</strong> {causaFracaDetectada}. Evite
            explicações como “erro humano”. Transforme em causa de processo,
            método, padrão, treinamento validado, poka-yoke, inspeção ou
            controle.
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-xl border p-5">
              <h2 className="text-lg font-bold">1. Causas principais</h2>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <Campo
                  label="Causa da ocorrência"
                  ajuda="Explique por que o problema aconteceu no processo."
                  obrigatorio
                >
                  <textarea
                    className="w-full rounded border bg-white p-3 text-black placeholder-gray-500"
                    rows={4}
                    placeholder="Ex: O parâmetro de temperatura não estava padronizado para este material/lote."
                    value={form.occurrence_cause}
                    onChange={(e) =>
                      handleChange("occurrence_cause", e.target.value)
                    }
                  />
                </Campo>
                <Campo
                  label="Causa da não detecção"
                  ajuda="Explique por que o problema não foi detectado antes de avançar."
                  obrigatorio
                >
                  <textarea
                    className="w-full rounded border bg-white p-3 text-black placeholder-gray-500"
                    rows={4}
                    placeholder="Ex: O plano de inspeção não previa verificação dimensional nesta etapa."
                    value={form.non_detection_cause}
                    onChange={(e) =>
                      handleChange("non_detection_cause", e.target.value)
                    }
                  />
                </Campo>

                <Campo
                  label="Causa sistêmica"
                  ajuda="Explique qual falha do sistema permitiu a recorrência ou exposição ao risco."
                  obrigatorio
                >
                  <textarea
                    className="w-full rounded border bg-white p-3 text-black placeholder-gray-500"
                    rows={4}
                    placeholder="Ex: Ausência de revisão formal do plano de controle após alteração de processo."
                    value={form.systemic_cause}
                    onChange={(e) =>
                      handleChange("systemic_cause", e.target.value)
                    }
                  />
                </Campo>
              </div>
            </div>

            <div className="rounded-xl border p-5">
              <h2 className="text-lg font-bold">2. 5 Porquês</h2>

              <p className="mt-1 text-sm text-gray-600">
                Os três primeiros porquês são obrigatórios. O quarto e quinto
                ajudam a aprofundar a causa sistêmica.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3">
                {["why1", "why2", "why3", "why4", "why5"].map(
                  (campo, index) => (
                    <Campo
                      key={campo}
                      label={`${index + 1}º Por quê?`}
                      obrigatorio={index < 3}
                    >
                      <input
                        className="w-full rounded border bg-white p-3 text-black placeholder-gray-500"
                        placeholder={
                          index < 3
                            ? "Resposta obrigatória"
                            : "Opcional, mas recomendado"
                        }
                        value={form[campo as keyof typeof form]}
                        onChange={(e) => handleChange(campo, e.target.value)}
                      />
                    </Campo>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-5">
            <h2 className="text-lg font-bold">Resumo da análise</h2>

            <div className="mt-4 space-y-3 text-sm">
              <Resumo
                label="Causa da ocorrência"
                value={form.occurrence_cause}
              />
              <Resumo
                label="Causa da não detecção"
                value={form.non_detection_cause}
              />
              <Resumo label="Causa sistêmica" value={form.systemic_cause} />
              <Resumo
                label="Profundidade dos 5 porquês"
                value={`${profundidade5Porques}/5 respondidos`}
              />
              <Resumo label="Status" value={statusAnalise} />
            </div>
            <div className="mt-6 rounded-lg border bg-white p-3 text-xs text-gray-600">
              Ao salvar, o sistema registrará a análise no histórico de
              auditoria da RNC com o usuário logado.
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleSalvarAnalise}
                disabled={!podeSalvar}
                className={`rounded px-4 py-3 text-sm font-bold text-white ${
                  podeSalvar
                    ? "bg-black hover:bg-gray-800"
                    : "cursor-not-allowed bg-gray-400"
                }`}
              >
                {salvando
                  ? "Salvando análise..."
                  : analysisId
                  ? "Atualizar análise"
                  : "Salvar análise"}
              </button>

              <button
                onClick={() => router.push(`/ocorrencias/${occurrenceId}`)}
                disabled={salvando}
                className="rounded border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancelar e voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  ajuda,
  obrigatorio,
  children,
}: {
  label: string;
  ajuda?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-gray-700">
        {label} {obrigatorio && <span className="text-red-600">*</span>}
      </label>

      {ajuda && <p className="mb-2 text-xs text-gray-500">{ajuda}</p>}

      {children}
    </div>
  );
}

function Resumo({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
      <p className="mt-1 break-words font-medium text-black">
        {value || "-"}
      </p>
    </div>
  );
}

function formatarPerfil(role?: string | null) {
  if (role === "admin") return "Administrador";
  if (role === "qualidade") return "Qualidade";
  if (role === "engenharia") return "Engenharia";
  if (role === "producao") return "Produção";
  if (role === "diretoria") return "Diretoria";

  return role || "-";
}
