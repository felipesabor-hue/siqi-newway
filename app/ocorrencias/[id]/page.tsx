"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Occurrence = {
  id: string;
  occurrence_number: string;
  status: string;
  origin: string | null;
  lot_number: string | null;
  suspected_quantity: number | null;
  opened_at: string;
  closed_at: string | null;
  companies: { name: string } | null;
  customers: { name: string } | null;
  processes: { name: string } | null;
  defects: { name: string } | null;
};

type Evidence = {
  id: string;
  action_id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  description: string | null;
  created_at: string;
};

type Action = {
  id: string;
  description: string;
  action_type: string;
  responsible_role: string;
  responsible_name: string | null;
  responsible_user_id?: string | null;
  completed_by: string | null;
  verified_by: string | null;
  effectiveness_comment: string | null;
  due_date: string;
  status: string;
  effectiveness_result: string | null;
  completed_at: string | null;
  created_at: string | null;
  completion_description: string | null;
  evidence_description: string | null;
  corrective_action_evidences?: Evidence[];
};

type AuditLog = {
  id: string;
  occurrence_id: string;
  action_id: string | null;
  event_type: string;
  event_label: string;
  description: string | null;
  before_data: any | null;
  after_data: any | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  is_active: boolean;
};
type HistoricoItem = {
  data: string;
  titulo: string;
  descricao: string;
  tipo:
    | "ocorrencia"
    | "analise"
    | "acao"
    | "execucao"
    | "evidencia"
    | "eficacia"
    | "reabertura"
    | "fechamento"
    | "auditoria";
  etapa: string;
  statusVisual: "neutro" | "sucesso" | "alerta" | "erro" | "info";
  detalhes?: string[];
  origem?: "auditoria";
};

export default function DetalheOcorrenciaPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [acoes, setAcoes] = useState<Action[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    verificarUsuarioECarregar();
  }, []);

  async function verificarUsuarioECarregar() {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .single();

    if (!profileData?.is_active) {
      await supabase.auth.signOut();
      router.push("/login");
      return;
    }

    setProfile(profileData);
    setAuthLoading(false);

    await carregar();
  }

  async function carregar() {
    const { data } = await supabase
      .from("occurrences")
      .select(`
        *,
        companies(name),
        customers(name),
        processes(name),
        defects(name)
      `)
      .eq("id", id)
      .single();

    setOccurrence(data);

    const { data: analise } = await supabase
      .from("root_cause_analysis")
      .select("*")
      .eq("occurrence_id", id)
      .maybeSingle();

    setAnalysis(analise);

    const { data: acoesData } = await supabase
      .from("corrective_actions")
      .select(`*, corrective_action_evidences(*)`)
      .eq("occurrence_id", id)
      .order("created_at", { ascending: false });

    setAcoes(acoesData || []);

    const { data: logs } = await supabase
      .from("quality_audit_logs")
      .select("*")
      .eq("occurrence_id", id)
      .order("created_at", { ascending: true });

    setAuditLogs(logs || []);
    setLoading(false);
  }

  // =========================
  // 🔥 SLA ENGINE
  // =========================

  function calcularSLA(acao: Action) {
    if (acao.status === "concluida") return "concluida";

    if (!acao.due_date) return "sem_prazo";

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const prazo = new Date(acao.due_date);
    prazo.setHours(0, 0, 0, 0);

    const diff =
      (prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);

    if (diff < 0) return "atrasada";
    if (diff <= 2) return "vencendo";
    return "no_prazo";
  }
  function calcularDiasPrazo(acao: Action) {
    if (!acao.due_date) return null;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const prazo = new Date(acao.due_date);
    prazo.setHours(0, 0, 0, 0);

    return Math.ceil(
      (prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const [acaoEmConclusao, setAcaoEmConclusao] = useState<string | null>(null);
  const [acaoEmVerificacao, setAcaoEmVerificacao] = useState<string | null>(
    null
  );

  const [arquivos, setArquivos] = useState<File[]>([]);

  const [conclusaoForm, setConclusaoForm] = useState({
    completion_description: "",
    evidence_description: "",
    completed_by: "",
  });

  const [verificacaoForm, setVerificacaoForm] = useState({
    verified_by: "",
    effectiveness_comment: "",
  });

  const resumoAcoes = useMemo(() => {
    const total = acoes.length;

    const pendentes = acoes.filter((acao) => acao.status !== "concluida")
      .length;

    const concluidas = acoes.filter((acao) => acao.status === "concluida")
      .length;

    const atrasadas = acoes.filter((acao) => calcularSLA(acao) === "atrasada")
      .length;

    const vencendo = acoes.filter((acao) => calcularSLA(acao) === "vencendo")
      .length;

    const aguardandoEficacia = acoes.filter(
      (acao) =>
        acao.status === "concluida" &&
        (!acao.effectiveness_result ||
          acao.effectiveness_result === "pendente")
    ).length;

    const eficazes = acoes.filter(
      (acao) => acao.effectiveness_result === "eficaz"
    ).length;

    const ineficazes = acoes.filter(
      (acao) => acao.effectiveness_result === "ineficaz"
    ).length;

    return {
      total,
      pendentes,
      concluidas,
      atrasadas,
      vencendo,
      aguardandoEficacia,
      eficazes,
      ineficazes,
    };
  }, [acoes]);

  const existeAcao = acoes.length > 0;

  const existeAcaoPendente = acoes.some(
    (acao) => acao.status !== "concluida"
  );

  const existeAcaoSemEficacia = acoes.some(
    (acao) =>
      acao.status === "concluida" &&
      acao.effectiveness_result !== "eficaz" &&
      acao.effectiveness_result !== "ineficaz"
  );

  const existeAcaoEficaz = acoes.some(
    (acao) => acao.effectiveness_result === "eficaz"
  );

  const todasAcoesConcluidas = existeAcao && !existeAcaoPendente;

  const podeFechar =
    occurrence?.status !== "concluida" &&
    !!analysis &&
    existeAcao &&
    !existeAcaoPendente &&
    !existeAcaoSemEficacia &&
    existeAcaoEficaz;

  const motivosBloqueioFechamento = useMemo(() => {
    const motivos: string[] = [];

    if (!analysis) motivos.push("Falta registrar a análise de causa.");
    if (!existeAcao) motivos.push("Falta criar pelo menos uma ação.");
    if (existeAcaoPendente) motivos.push("Existem ações pendentes.");
    if (existeAcaoSemEficacia)
      motivos.push("Existem ações sem verificação de eficácia.");
    if (existeAcao && !existeAcaoEficaz)
      motivos.push("É necessário pelo menos uma ação eficaz.");

    return motivos;
  }, [
    analysis,
    existeAcao,
    existeAcaoPendente,
    existeAcaoSemEficacia,
    existeAcaoEficaz,
  ]);

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErro("Não foi possível sair do sistema: " + error.message);
      return;
    }

    router.push("/login");
  }
  async function registrarLogAuditoria({
    actionId = null,
    eventType,
    eventLabel,
    description = null,
    beforeData = null,
    afterData = null,
  }: {
    actionId?: string | null;
    eventType: string;
    eventLabel: string;
    description?: string | null;
    beforeData?: any | null;
    afterData?: any | null;
  }) {
    const { error } = await supabase.from("quality_audit_logs").insert({
      occurrence_id: id,
      action_id: actionId,
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

  async function uploadEvidencias(acaoId: string) {
    if (arquivos.length === 0) return;

    for (const arquivo of arquivos) {
      const nomeSeguro = arquivo.name.replaceAll(" ", "-");
      const caminho = `${acaoId}/${Date.now()}-${nomeSeguro}`;

      const { error: uploadError } = await supabase.storage
        .from("evidencias")
        .upload(caminho, arquivo);

      if (uploadError) {
        throw new Error("Erro no upload: " + uploadError.message);
      }

      const { data } = supabase.storage
        .from("evidencias")
        .getPublicUrl(caminho);

      const { error: insertError } = await supabase
        .from("corrective_action_evidences")
        .insert({
          action_id: acaoId,
          file_url: data.publicUrl,
          file_name: arquivo.name,
          file_type: arquivo.type,
          description: conclusaoForm.evidence_description,
        });

      if (insertError) {
        throw new Error("Erro ao salvar evidência: " + insertError.message);
      }

      await registrarLogAuditoria({
        actionId: acaoId,
        eventType: "evidence_added",
        eventLabel: "Evidência anexada",
        description: arquivo.name,
        afterData: {
          file_name: arquivo.name,
          file_type: arquivo.type,
          description: conclusaoForm.evidence_description,
          file_url: data.publicUrl,
        },
      });
    }
  }

  async function concluirAcao(acaoId: string) {
    if (
      !conclusaoForm.completion_description.trim() ||
      !conclusaoForm.evidence_description.trim()
    ) {
      setErro("Preencha o que foi executado e a evidência da ação.");
      return;
    }

    const acaoAntes = acoes.find((acao) => acao.id === acaoId) || null;

    try {
      const usuarioLogado = profile?.full_name || profile?.email || "";

      const afterData = {
        status: "concluida",
        completed_at: new Date().toISOString(),
        completed_by: usuarioLogado,
        effectiveness_result: "pendente",
        completion_description: conclusaoForm.completion_description.trim(),
        evidence_description: conclusaoForm.evidence_description.trim(),
      };

      const { error } = await supabase
        .from("corrective_actions")
        .update(afterData)
        .eq("id", acaoId);

      if (error) {
        setErro("Erro ao concluir ação: " + error.message);
        return;
      }

      await registrarLogAuditoria({
        actionId: acaoId,
        eventType: "action_completed",
        eventLabel: "Ação concluída",
        description: conclusaoForm.completion_description.trim(),
        beforeData: acaoAntes,
        afterData,
      });

      await uploadEvidencias(acaoId);

      const occurrenceAntes = occurrence;

      await supabase
        .from("occurrences")
        .update({ status: "verificacao_eficacia" })
        .eq("id", id);

      await registrarLogAuditoria({
        actionId: acaoId,
        eventType: "occurrence_status_changed",
        eventLabel: "RNC enviada para verificação de eficácia",
        description: "Ação concluída e RNC aguardando verificação de eficácia.",
        beforeData: {
          status: occurrenceAntes?.status || null,
        },
        afterData: {
          status: "verificacao_eficacia",
        },
      });

      setAcaoEmConclusao(null);
      setArquivos([]);
      setConclusaoForm({
        completion_description: "",
        evidence_description: "",
        completed_by: "",
      });

      await carregar();
    } catch (error: any) {
      setErro(error.message || "Erro ao concluir ação.");
    }
  }
  async function marcarEficacia(
    acaoId: string,
    resultado: "eficaz" | "ineficaz"
  ) {
    const acaoAntes = acoes.find((acao) => acao.id === acaoId) || null;
    const occurrenceAntes = occurrence;

    const usuarioLogado = profile?.full_name || profile?.email || "";

    const afterData = {
      effectiveness_result: resultado,
      verified_by: usuarioLogado,
      effectiveness_comment: verificacaoForm.effectiveness_comment.trim(),
    };

    const { error } = await supabase
      .from("corrective_actions")
      .update(afterData)
      .eq("id", acaoId);

    if (error) {
      setErro("Erro ao registrar eficácia: " + error.message);
      return;
    }

    try {
      await registrarLogAuditoria({
        actionId: acaoId,
        eventType: "effectiveness_checked",
        eventLabel: resultado === "eficaz" ? "Ação eficaz" : "Ação ineficaz",
        description:
          verificacaoForm.effectiveness_comment.trim() ||
          `Resultado da verificação de eficácia: ${resultado}`,
        beforeData: {
          effectiveness_result: acaoAntes?.effectiveness_result || null,
          verified_by: acaoAntes?.verified_by || null,
          effectiveness_comment: acaoAntes?.effectiveness_comment || null,
        },
        afterData,
      });

      if (resultado === "ineficaz") {
        const { error: reopenError } = await supabase
          .from("occurrences")
          .update({ status: "reaberta" })
          .eq("id", id);

        if (reopenError) {
          setErro("Erro ao reabrir RNC: " + reopenError.message);
          return;
        }

        await registrarLogAuditoria({
          actionId: acaoId,
          eventType: "occurrence_reopened",
          eventLabel: "RNC reaberta",
          description:
            "A RNC foi reaberta porque a ação foi considerada ineficaz.",
          beforeData: {
            status: occurrenceAntes?.status || null,
          },
          afterData: {
            status: "reaberta",
          },
        });
      }

      setAcaoEmVerificacao(null);
      setVerificacaoForm({
        verified_by: "",
        effectiveness_comment: "",
      });

      await carregar();
    } catch (error: any) {
      setErro(error.message || "Erro ao registrar auditoria da eficácia.");
      await carregar();
    }
  }

  async function fecharRNC() {
    if (motivosBloqueioFechamento.length > 0) {
      setErro(
        "A RNC ainda não pode ser fechada: " +
          motivosBloqueioFechamento.join(" ")
      );
      return;
    }

    const occurrenceAntes = occurrence;

    const afterData = {
      status: "concluida",
      closed_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("occurrences")
      .update(afterData)
      .eq("id", id);

    if (error) {
      setErro("Erro ao fechar RNC: " + error.message);
      return;
    }

    try {
      await registrarLogAuditoria({
        eventType: "occurrence_closed",
        eventLabel: "RNC fechada",
        description: "Processo concluído após validação de eficácia.",
        beforeData: {
          status: occurrenceAntes?.status || null,
          closed_at: occurrenceAntes?.closed_at || null,
        },
        afterData,
      });

      await carregar();
    } catch (error: any) {
      setErro(
        error.message || "RNC fechada, mas houve erro ao registrar auditoria."
      );
      await carregar();
    }
  }

  const historico = useMemo(() => {
    return auditLogs
      .map((log): HistoricoItem => {
        const tipo =
          log.event_type === "occurrence_created"
            ? "ocorrencia"
            : log.event_type === "analysis_created" ||
              log.event_type === "analysis_updated"
            ? "analise"
            : log.event_type === "action_created"
            ? "acao"
            : log.event_type === "action_completed"
            ? "execucao"
            : log.event_type === "evidence_added"
            ? "evidencia"
            : log.event_type === "effectiveness_checked"
            ? log.after_data?.effectiveness_result === "ineficaz"
              ? "reabertura"
              : "eficacia"
            : log.event_type === "occurrence_reopened"
            ? "reabertura"
            : log.event_type === "occurrence_closed"
            ? "fechamento"
            : "auditoria";

        const statusVisual =
          tipo === "reabertura"
            ? "erro"
            : tipo === "fechamento" ||
              tipo === "eficacia" ||
              tipo === "execucao" ||
              tipo === "ocorrencia" ||
              tipo === "analise" ||
              tipo === "acao"
            ? "sucesso"
            : tipo === "auditoria"
            ? "info"
            : "neutro";

        const etapa =
          tipo === "ocorrencia"
            ? "Abertura"
            : tipo === "analise"
            ? "Análise"
            : tipo === "acao"
            ? "Ação"
            : tipo === "execucao"
            ? "Execução"
            : tipo === "evidencia"
            ? "Evidência"
            : tipo === "eficacia"
            ? "Verificação"
            : tipo === "reabertura"
            ? "Reabertura"
            : tipo === "fechamento"
            ? "Fechamento"
            : "Auditoria";

        return {
          data: log.created_at,
          titulo: log.event_label,
          descricao: log.description || "",
          tipo,
          etapa,
          statusVisual,
          origem: "auditoria",
          detalhes: montarDetalhesAuditoria(log),
        };
      })
      .sort(
        (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
      );
  }, [auditLogs]);
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 text-black">
        <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
          Carregando detalhe da RNC...
        </div>
      </div>
    );
  }

  if (!occurrence) {
    return <p className="p-6 text-black">Ocorrência não encontrada.</p>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-black">
      <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a href="/ocorrencias" className="text-sm text-blue-600">
              ← Voltar para ocorrências
            </a>

            <h1 className="mt-4 text-2xl font-bold">
              {occurrence.occurrence_number}
            </h1>

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

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={occurrence.status} />

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

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="Empresa" value={occurrence.companies?.name} />
          <Info label="Cliente" value={occurrence.customers?.name} />
          <Info label="Processo" value={occurrence.processes?.name} />
          <Info label="Defeito" value={occurrence.defects?.name} />
          <Info label="Lote" value={occurrence.lot_number} />
          <Info
            label="Quantidade"
            value={String(occurrence.suspected_quantity || "-")}
          />
          <Info label="Origem" value={occurrence.origin} />
          <Info
            label="Data"
            value={new Date(occurrence.opened_at).toLocaleDateString("pt-BR")}
          />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <ResumoCard label="Total de ações" value={resumoAcoes.total} />
          <ResumoCard label="Pendentes" value={resumoAcoes.pendentes} />
          <ResumoCard label="Atrasadas" value={resumoAcoes.atrasadas} />
          <ResumoCard
            label="Aguardando eficácia"
            value={resumoAcoes.aguardandoEficacia}
          />
          <ResumoCard label="Concluídas" value={resumoAcoes.concluidas} />
          <ResumoCard label="Vencendo" value={resumoAcoes.vencendo} />
          <ResumoCard label="Eficazes" value={resumoAcoes.eficazes} />
          <ResumoCard label="Ineficazes" value={resumoAcoes.ineficazes} />
        </div>

        <div className="mt-8 rounded-xl border p-5">
          <h2 className="text-lg font-bold">Workflow da RNC</h2>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            <WorkflowStep active done label="1. Ocorrência" />
            <WorkflowStep
              active={!!analysis}
              done={!!analysis}
              label="2. Análise"
            />
            <WorkflowStep
              active={!!analysis}
              done={existeAcao}
              label="3. Ações"
            />
            <WorkflowStep
              active={todasAcoesConcluidas}
              done={existeAcaoEficaz}
              label="4. Eficácia"
            />
            <WorkflowStep
              active={podeFechar || occurrence.status === "concluida"}
              done={occurrence.status === "concluida"}
              label="5. Fechamento"
            />
          </div>
        </div>
        {analysis && (
          <div className="mt-8 rounded-xl border p-5">
            <h2 className="text-lg font-bold">Análise de Causa Raiz</h2>

            <div className="mt-4 space-y-4">
              <Info
                label="Causa da ocorrência"
                value={analysis.occurrence_cause}
              />
              <Info
                label="Causa da não detecção"
                value={analysis.non_detection_cause}
              />
              <Info label="Causa sistêmica" value={analysis.systemic_cause} />

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-500">
                  5 Porquês
                </p>

                <div className="grid grid-cols-1 gap-2">
                  <Info
                    label="1º Por quê"
                    value={analysis.five_why_occurrence?.why1}
                  />
                  <Info
                    label="2º Por quê"
                    value={analysis.five_why_occurrence?.why2}
                  />
                  <Info
                    label="3º Por quê"
                    value={analysis.five_why_occurrence?.why3}
                  />
                  <Info
                    label="4º Por quê"
                    value={analysis.five_why_occurrence?.why4}
                  />
                  <Info
                    label="5º Por quê"
                    value={analysis.five_why_occurrence?.why5}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl border p-5">
          <h2 className="text-lg font-bold">Próxima etapa</h2>

          {!analysis ? (
            <>
              <p className="mt-2 text-gray-600">
                Antes de criar ações, registre a análise de causa raiz.
              </p>

              <a
                href={`/ocorrencias/${occurrence.id}/analise`}
                className="mt-4 inline-block rounded bg-black px-4 py-3 text-sm font-semibold text-white"
              >
                Iniciar análise de causa
              </a>
            </>
          ) : (
            <>
              <p className="mt-2 text-gray-600">
                Análise registrada. Agora defina ações, conclua a execução e
                registre a eficácia.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`/ocorrencias/${occurrence.id}/analise`}
                  className="inline-block rounded bg-black px-4 py-3 text-sm font-semibold text-white"
                >
                  Editar análise de causa
                </a>

                {occurrence.status !== "concluida" && (
                  <a
                    href={`/ocorrencias/${occurrence.id}/acao`}
                    className={`inline-block rounded px-4 py-3 text-sm font-semibold text-white ${
                      occurrence.status === "reaberta"
                        ? "bg-red-700"
                        : "bg-blue-700"
                    }`}
                  >
                    {occurrence.status === "reaberta"
                      ? "Criar nova ação (ineficaz anterior)"
                      : "Criar ação corretiva"}
                  </a>
                )}

                {podeFechar && (
                  <button
                    onClick={fecharRNC}
                    className="rounded bg-green-700 px-4 py-3 text-sm font-semibold text-white"
                  >
                    Fechar RNC
                  </button>
                )}
              </div>

              {!podeFechar &&
                occurrence.status !== "concluida" &&
                motivosBloqueioFechamento.length > 0 && (
                  <div className="mt-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                    <p className="font-semibold">
                      Esta RNC ainda não pode ser fechada:
                    </p>

                    <ul className="mt-2 list-inside list-disc space-y-1">
                      {motivosBloqueioFechamento.map((motivo) => (
                        <li key={motivo}>{motivo}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {occurrence.status === "reaberta" && (
                <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  ⚠️ Esta RNC foi reaberta devido a ação ineficaz. É necessário
                  definir uma nova ação corretiva.
                </div>
              )}
            </>
          )}
        </div>
        <div className="mt-8 rounded-xl border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Histórico da RNC</h2>
              <p className="mt-1 text-sm text-gray-500">
                Linha do tempo baseada exclusivamente nos registros reais de
                auditoria.
              </p>
            </div>

            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {historico.length} eventos
            </span>
          </div>

          {historico.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              Nenhum evento registrado.
            </p>
          ) : (
            <div className="mt-5 space-y-0">
              {historico.map((item, index) => (
                <TimelineItem
                  key={`${item.origem}-${item.tipo}-${item.data}-${index}`}
                  item={item}
                  isLast={index === historico.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-xl border p-5">
          <h2 className="text-lg font-bold">Ações corretivas / preventivas</h2>

          {acoes.length === 0 ? (
            <p className="mt-3 text-gray-500">Nenhuma ação cadastrada.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {acoes.map((acao) => {
                const statusSLA = calcularSLA(acao);
                const diasPrazo = calcularDiasPrazo(acao);

                return (
                  <div key={acao.id} className="rounded-lg border bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold text-black">
                          {acao.description}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge status={acao.status} />
                          <EficaciaBadge resultado={acao.effectiveness_result} />
                          <PrazoBadge status={statusSLA} />
                        </div>

                        <p className="mt-3 text-sm text-gray-600">
                          Tipo: {acao.action_type || "-"}
                        </p>

                        <p className="text-sm text-gray-600">
                          Responsável:{" "}
                          {acao.responsible_name
                            ? `${acao.responsible_name} (${acao.responsible_role})`
                            : acao.responsible_role || "-"}
                        </p>

                        {acao.completed_by && (
                          <p className="text-sm text-gray-600">
                            Concluído por: {acao.completed_by}
                          </p>
                        )}

                        {acao.verified_by && (
                          <p className="text-sm text-gray-600">
                            Verificado por: {acao.verified_by}
                          </p>
                        )}

                        <p
                          className={`text-sm ${
                            statusSLA === "atrasada"
                              ? "font-semibold text-red-700"
                              : statusSLA === "vencendo"
                              ? "font-semibold text-orange-700"
                              : "text-gray-600"
                          }`}
                        >
                          Prazo:{" "}
                          {acao.due_date
                            ? new Date(acao.due_date).toLocaleDateString("pt-BR")
                            : "-"}
                          {diasPrazo !== null && acao.status !== "concluida" && (
                            <>
                              {" "}
                              •{" "}
                              {diasPrazo < 0
                                ? `${Math.abs(diasPrazo)} dia(s) em atraso`
                                : diasPrazo === 0
                                ? "vence hoje"
                                : `${diasPrazo} dia(s) restante(s)`}
                            </>
                          )}
                        </p>

                        {acao.completed_at && (
                          <p className="text-sm text-gray-600">
                            Concluída em:{" "}
                            {new Date(acao.completed_at).toLocaleDateString(
                              "pt-BR"
                            )}
                          </p>
                        )}
                        <div className="mt-2 space-y-1 text-sm text-gray-700">
                          {acao.status === "concluida" &&
                            acao.completion_description && (
                              <p className="break-words">
                                <strong>O que foi executado:</strong>{" "}
                                {acao.completion_description}
                              </p>
                            )}

                          {acao.status === "concluida" &&
                            acao.evidence_description && (
                              <p className="break-words">
                                <strong>Evidência:</strong>{" "}
                                {acao.evidence_description}
                              </p>
                            )}

                          {acao.effectiveness_comment && (
                            <p className="break-words">
                              <strong>Comentário da eficácia:</strong>{" "}
                              {acao.effectiveness_comment}
                            </p>
                          )}
                        </div>

                        {acao.corrective_action_evidences &&
                          acao.corrective_action_evidences.length > 0 && (
                            <div className="mt-3 rounded border bg-white p-3">
                              <p className="text-xs font-semibold uppercase text-gray-500">
                                Evidências anexadas
                              </p>

                              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                                {acao.corrective_action_evidences.map(
                                  (evidencia) => {
                                    const isImage =
                                      evidencia.file_type?.startsWith("image/");

                                    return (
                                      <a
                                        key={evidencia.id}
                                        href={evidencia.file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="group overflow-hidden rounded-lg border bg-gray-50 hover:bg-gray-100"
                                      >
                                        {isImage ? (
                                          <img
                                            src={evidencia.file_url}
                                            alt={
                                              evidencia.file_name ||
                                              "Evidência"
                                            }
                                            className="h-28 w-full object-cover transition group-hover:scale-105"
                                          />
                                        ) : (
                                          <div className="flex h-28 w-full items-center justify-center bg-gray-100 text-3xl">
                                            📎
                                          </div>
                                        )}

                                        <div className="p-2">
                                          <p className="truncate text-xs font-semibold text-gray-700">
                                            {evidencia.file_name ||
                                              "Arquivo anexado"}
                                          </p>

                                          <p className="mt-1 text-xs text-blue-700 underline">
                                            Abrir evidência
                                          </p>
                                        </div>
                                      </a>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          )}

                        <p className="mt-2 text-sm text-gray-600">
                          Eficácia: {acao.effectiveness_result || "pendente"}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {acao.status !== "concluida" &&
                          occurrence.status !== "concluida" && (
                            <button
                              onClick={() => {
                                setErro(null);
                                setAcaoEmConclusao(acao.id);
                                setConclusaoForm((prev) => ({
                                  ...prev,
                                  completed_by:
                                    profile?.full_name || profile?.email || "",
                                }));
                              }}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white"
                            >
                              Concluir
                            </button>
                          )}

                        {acao.status === "concluida" &&
                          (!acao.effectiveness_result ||
                            acao.effectiveness_result === "pendente") &&
                          occurrence.status !== "concluida" && (
                            <button
                              onClick={() => {
                                setErro(null);
                                setAcaoEmVerificacao(acao.id);
                                setVerificacaoForm((prev) => ({
                                  ...prev,
                                  verified_by:
                                    profile?.full_name || profile?.email || "",
                                }));
                              }}
                              className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
                            >
                              Verificar eficácia
                            </button>
                          )}
                      </div>
                    </div>

                    {acaoEmConclusao === acao.id && (
                      <div className="mt-4 space-y-3 rounded border bg-white p-3">
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-gray-700">
                            Concluído por
                          </label>

                          <input
                            className="w-full rounded border bg-gray-100 p-2 text-sm text-gray-700"
                            value={
                              conclusaoForm.completed_by ||
                              profile?.full_name ||
                              profile?.email ||
                              ""
                            }
                            readOnly
                          />
                        </div>
                        <textarea
                          placeholder="O que foi executado?"
                          className="w-full rounded border p-2 text-sm"
                          value={conclusaoForm.completion_description}
                          onChange={(e) =>
                            setConclusaoForm((prev) => ({
                              ...prev,
                              completion_description: e.target.value,
                            }))
                          }
                        />

                        <textarea
                          placeholder="Evidência da execução (ex: fotos, checklist, etc)"
                          className="w-full rounded border p-2 text-sm"
                          value={conclusaoForm.evidence_description}
                          onChange={(e) =>
                            setConclusaoForm((prev) => ({
                              ...prev,
                              evidence_description: e.target.value,
                            }))
                          }
                        />

                        <div>
                          <label className="mb-1 block text-sm font-semibold text-gray-700">
                            Anexar evidências
                          </label>

                          <input
                            type="file"
                            multiple
                            accept="image/*,application/pdf"
                            onChange={(e) =>
                              setArquivos(Array.from(e.target.files || []))
                            }
                            className="w-full rounded border bg-gray-50 p-2 text-sm"
                          />

                          {arquivos.length > 0 && (
                            <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700">
                              <p className="font-semibold">
                                Arquivos selecionados:
                              </p>

                              <ul className="mt-1 list-inside list-disc">
                                {arquivos.map((arquivo) => (
                                  <li key={arquivo.name}>{arquivo.name}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => concluirAcao(acao.id)}
                            className="rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white"
                          >
                            Confirmar conclusão
                          </button>

                          <button
                            onClick={() => {
                              setAcaoEmConclusao(null);
                              setArquivos([]);
                              setConclusaoForm({
                                completion_description: "",
                                evidence_description: "",
                                completed_by: "",
                              });
                            }}
                            className="rounded bg-gray-400 px-3 py-1 text-xs font-semibold text-white"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {acaoEmVerificacao === acao.id && (
                      <div className="mt-4 space-y-3 rounded border bg-white p-3">
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-gray-700">
                            Verificado por
                          </label>

                          <input
                            className="w-full rounded border bg-gray-100 p-2 text-sm text-gray-700"
                            value={
                              verificacaoForm.verified_by ||
                              profile?.full_name ||
                              profile?.email ||
                              ""
                            }
                            readOnly
                          />
                        </div>

                        <textarea
                          placeholder="Comentário da verificação de eficácia (opcional)"
                          className="w-full rounded border p-2 text-sm"
                          value={verificacaoForm.effectiveness_comment}
                          onChange={(e) =>
                            setVerificacaoForm((prev) => ({
                              ...prev,
                              effectiveness_comment: e.target.value,
                            }))
                          }
                        />

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => marcarEficacia(acao.id, "eficaz")}
                            className="rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white"
                          >
                            Marcar como eficaz
                          </button>

                          <button
                            onClick={() => marcarEficacia(acao.id, "ineficaz")}
                            className="rounded bg-red-700 px-3 py-1 text-xs font-semibold text-white"
                          >
                            Marcar como ineficaz
                          </button>

                          <button
                            onClick={() => {
                              setAcaoEmVerificacao(null);
                              setVerificacaoForm({
                                verified_by: "",
                                effectiveness_comment: "",
                              });
                            }}
                            className="rounded bg-gray-400 px-3 py-1 text-xs font-semibold text-white"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Info({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-lg border bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 break-words font-medium text-black">{value || "-"}</p>
    </div>
  );
}

function ResumoCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-black">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label =
    status === "concluida"
      ? "concluída"
      : status === "em_analise"
      ? "em análise"
      : status === "acao_definida"
      ? "ação definida"
      : status === "verificacao_eficacia"
      ? "verificação de eficácia"
      : status === "reaberta"
      ? "reaberta"
      : status;

  const style =
    status === "concluida"
      ? "bg-green-100 text-green-800"
      : status === "em_analise"
      ? "bg-blue-100 text-blue-800"
      : status === "acao_definida"
      ? "bg-purple-100 text-purple-800"
      : status === "verificacao_eficacia"
      ? "bg-orange-100 text-orange-800"
      : status === "reaberta"
      ? "bg-red-100 text-red-800"
      : "bg-yellow-100 text-yellow-800";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

function EficaciaBadge({ resultado }: { resultado: string | null }) {
  const style =
    resultado === "eficaz"
      ? "bg-green-100 text-green-800"
      : resultado === "ineficaz"
      ? "bg-red-100 text-red-800"
      : "bg-gray-100 text-gray-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      eficácia: {resultado || "pendente"}
    </span>
  );
}

function PrazoBadge({ status }: { status: string }) {
  const style =
    status === "atrasada"
      ? "bg-red-100 text-red-800"
      : status === "vencendo"
      ? "bg-orange-100 text-orange-800"
      : status === "no_prazo"
      ? "bg-green-100 text-green-800"
      : status === "concluida"
      ? "bg-blue-100 text-blue-800"
      : "bg-gray-100 text-gray-700";

  const label =
    status === "atrasada"
      ? "atrasada"
      : status === "vencendo"
      ? "vencendo"
      : status === "no_prazo"
      ? "no prazo"
      : status === "concluida"
      ? "concluída"
      : "sem prazo";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      prazo: {label}
    </span>
  );
}
function TimelineItem({
  item,
  isLast,
}: {
  item: HistoricoItem;
  isLast: boolean;
}) {
  const style = timelineStyle(item.tipo);
  const statusStyle = timelineStatusStyle(item.statusVisual);

  return (
    <div className="relative flex gap-4 pb-6">
      {!isLast && (
        <div className="absolute left-[15px] top-9 h-full w-px bg-gray-200" />
      )}

      <div
        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm ${style.dot}`}
      >
        <span className="text-sm">{style.icon}</span>
      </div>

      <div className="min-w-0 flex-1 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${statusStyle}`}
              >
                {item.etapa}
              </span>

              {item.origem === "auditoria" && (
                <span className="rounded-full bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">
                  audit trail
                </span>
              )}

              <p className="font-bold text-black">{item.titulo}</p>
            </div>

            {item.descricao && (
              <p className="mt-2 break-words text-sm text-gray-700">
                {item.descricao}
              </p>
            )}
          </div>

          <div className="text-right text-xs text-gray-500">
            <p>{new Date(item.data).toLocaleDateString("pt-BR")}</p>
            <p>
              {new Date(item.data).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        {item.detalhes && item.detalhes.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {item.detalhes.map((detalhe) => (
              <div
                key={detalhe}
                className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"
              >
                {detalhe}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function montarDetalhesAuditoria(log: AuditLog) {
  const detalhes: string[] = [];

  if (log.event_type) {
    detalhes.push(`Evento técnico: ${log.event_type}`);
  }

  if (log.after_data?.audit_user_name) {
    detalhes.push(`Usuário: ${log.after_data.audit_user_name}`);
  }

  if (log.after_data?.audit_user_role) {
    detalhes.push(
      `Perfil do usuário: ${formatarPerfil(log.after_data.audit_user_role)}`
    );
  }

  if (log.after_data?.responsible_name) {
    detalhes.push(`Responsável nominal: ${log.after_data.responsible_name}`);
  }

  if (log.after_data?.responsible_user_name) {
    detalhes.push(`Responsável usuário: ${log.after_data.responsible_user_name}`);
  }

  if (log.after_data?.responsible_user_email) {
    detalhes.push(`E-mail do responsável: ${log.after_data.responsible_user_email}`);
  }

  if (log.after_data?.responsible_role_label) {
    detalhes.push(`Setor responsável: ${log.after_data.responsible_role_label}`);
  }

  if (log.after_data?.responsible_full_label) {
    detalhes.push(`Responsável: ${log.after_data.responsible_full_label}`);
  }

  if (log.after_data?.completed_by) {
    detalhes.push(`Concluído por: ${log.after_data.completed_by}`);
  }

  if (log.after_data?.verified_by) {
    detalhes.push(`Verificado por: ${log.after_data.verified_by}`);
  }

  if (log.after_data?.effectiveness_comment) {
    detalhes.push(`Comentário: ${log.after_data.effectiveness_comment}`);
  }

  if (log.before_data?.status || log.after_data?.status) {
    detalhes.push(
      `Status: ${log.before_data?.status || "-"} → ${
        log.after_data?.status || "-"
      }`
    );
  }

  if (
    log.before_data?.effectiveness_result ||
    log.after_data?.effectiveness_result
  ) {
    detalhes.push(
      `Eficácia: ${log.before_data?.effectiveness_result || "-"} → ${
        log.after_data?.effectiveness_result || "-"
      }`
    );
  }

  if (log.after_data?.file_name) {
    detalhes.push(`Arquivo: ${log.after_data.file_name}`);
  }

  if (log.after_data?.file_type) {
    detalhes.push(`Tipo: ${log.after_data.file_type}`);
  }

  if (log.after_data?.completion_description) {
    detalhes.push(`Execução: ${log.after_data.completion_description}`);
  }

  if (log.after_data?.evidence_description) {
    detalhes.push(`Evidência: ${log.after_data.evidence_description}`);
  }

  return detalhes;
}
function timelineStyle(tipo: HistoricoItem["tipo"]) {
  if (tipo === "ocorrencia") {
    return {
      icon: "📌",
      dot: "border-blue-300 bg-blue-50 text-blue-700",
    };
  }

  if (tipo === "analise") {
    return {
      icon: "🔎",
      dot: "border-purple-300 bg-purple-50 text-purple-700",
    };
  }

  if (tipo === "acao") {
    return {
      icon: "🛠️",
      dot: "border-orange-300 bg-orange-50 text-orange-700",
    };
  }

  if (tipo === "execucao") {
    return {
      icon: "✅",
      dot: "border-green-300 bg-green-50 text-green-700",
    };
  }

  if (tipo === "evidencia") {
    return {
      icon: "📎",
      dot: "border-gray-300 bg-gray-50 text-gray-700",
    };
  }

  if (tipo === "eficacia") {
    return {
      icon: "🎯",
      dot: "border-green-300 bg-green-50 text-green-700",
    };
  }

  if (tipo === "reabertura") {
    return {
      icon: "⚠️",
      dot: "border-red-300 bg-red-50 text-red-700",
    };
  }

  if (tipo === "auditoria") {
    return {
      icon: "🧾",
      dot: "border-black bg-gray-900 text-white",
    };
  }

  return {
    icon: "🏁",
    dot: "border-green-300 bg-green-50 text-green-700",
  };
}

function timelineStatusStyle(status: HistoricoItem["statusVisual"]) {
  if (status === "sucesso") {
    return "bg-green-100 text-green-800";
  }

  if (status === "erro") {
    return "bg-red-100 text-red-800";
  }

  if (status === "alerta") {
    return "bg-orange-100 text-orange-800";
  }

  if (status === "info") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-gray-100 text-gray-700";
}

function WorkflowStep({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        done
          ? "border-green-300 bg-green-50 text-green-800"
          : active
          ? "border-blue-300 bg-blue-50 text-blue-800"
          : "border-gray-200 bg-gray-50 text-gray-500"
      }`}
    >
      {label}
    </div>
  );
}

function formatarPerfil(role?: string | null) {
  if (role === "admin") return "Administrador";
  if (role === "qualidade") return "Qualidade";
  if (role === "engenharia") return "Engenharia";
  if (role === "producao") return "Produção";
  if (role === "diretoria") return "Diretoria";
  if (role === "manutencao") return "Manutenção";

  return role || "-";
}