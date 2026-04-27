"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RelationName = { name: string } | { name: string }[] | null;

type Occurrence = {
  id: string;
  occurrence_number: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  processes: RelationName;
  defects: RelationName;
};
function getRelationName(relation: RelationName) {
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0]?.name || null;
  return relation.name || null;
}

type Action = {
  id: string;
  occurrence_id: string;
  status: string;
  due_date: string | null;
  effectiveness_result: string | null;
  responsible_role?: string | null;
  responsible_name?: string | null;
  responsible_user_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  is_active: boolean;
};

type Periodo = "7" | "30" | "90" | "todos";

type RankingResponsavel = {
  id: string;
  nome: string;
  setor: string;
  total: number;
  pendentes: number;
  concluidas: number;
  atrasadas: number;
  vencendo: number;
  eficazes: number;
  ineficazes: number;
  eficaciaPercentual: number;
  tempoMedioResolucao: number;
};

export default function DashboardQualidadePage() {
  const router = useRouter();

  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("30");

  useEffect(() => {
    verificarUsuarioECarregarDashboard();
  }, []);

  async function verificarUsuarioECarregarDashboard() {
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

    await carregarDashboard();
  }

  async function carregarDashboard() {
    setLoading(true);
    setErro(null);

    const { data: occurrencesData, error: occurrencesError } = await supabase
      .from("occurrences")
      .select(`
        id,
        occurrence_number,
        status,
        opened_at,
        closed_at,
        processes(name),
        defects(name)
      `)
      .order("opened_at", { ascending: false });

    if (occurrencesError) {
      setErro("Erro ao carregar ocorrências: " + occurrencesError.message);
      setLoading(false);
      return;
    }

    const { data: actionsData, error: actionsError } = await supabase
      .from("corrective_actions")
      .select(`
        id,
        occurrence_id,
        status,
        due_date,
        effectiveness_result,
        responsible_role,
        responsible_name,
        responsible_user_id,
        created_at,
        completed_at
      `);

    if (actionsError) {
      setErro("Erro ao carregar ações: " + actionsError.message);
      setLoading(false);
      return;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        role,
        department,
        is_active
      `)
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (profilesError) {
      setErro("Erro ao carregar usuários: " + profilesError.message);
      setLoading(false);
      return;
    }

    setOccurrences((occurrencesData || []) as Occurrence[]);
    setActions((actionsData || []) as Action[]);
    setProfiles((profilesData || []) as Profile[]);
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

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  function calcularSLA(acao: Action) {
    if (acao.status === "concluida") return "concluida";
    if (!acao.due_date) return "sem_prazo";

    const prazo = new Date(acao.due_date);
    prazo.setHours(0, 0, 0, 0);

    const dias = Math.ceil(
      (prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dias < 0) return "atrasada";
    if (dias <= 2) return "vencendo";
    return "no_prazo";
  }

  function calcularDiasResolucao(acao: Action) {
    if (!acao.created_at || !acao.completed_at) return null;

    const inicio = new Date(acao.created_at).getTime();
    const fim = new Date(acao.completed_at).getTime();

    return Math.max(0, Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)));
  }

  function buscarPerfilResponsavel(acao: Action) {
    if (!acao.responsible_user_id) return null;

    return profiles.find((item) => item.id === acao.responsible_user_id) || null;
  }

  function nomeResponsavelAcao(acao: Action) {
    const usuario = buscarPerfilResponsavel(acao);

    if (usuario?.full_name) return usuario.full_name;
    if (acao.responsible_name) return acao.responsible_name;
    if (acao.responsible_role) return formatarResponsavel(acao.responsible_role);

    return "Sem responsável";
  }

  function setorResponsavelAcao(acao: Action) {
    const usuario = buscarPerfilResponsavel(acao);

    if (usuario?.department) return usuario.department;
    if (acao.responsible_role) return formatarResponsavel(acao.responsible_role);

    return "Sem setor";
  }

  const occurrencesFiltradas = useMemo(() => {
    if (periodo === "todos") return occurrences;

    const dias = Number(periodo);
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);
    limite.setHours(0, 0, 0, 0);

    return occurrences.filter((item) => {
      const abertura = new Date(item.opened_at);
      return abertura.getTime() >= limite.getTime();
    });
  }, [occurrences, periodo]);

  const idsOcorrenciasFiltradas = useMemo(() => {
    return new Set(occurrencesFiltradas.map((item) => item.id));
  }, [occurrencesFiltradas]);

  const actionsFiltradas = useMemo(() => {
    return actions.filter((item) =>
      idsOcorrenciasFiltradas.has(item.occurrence_id)
    );
  }, [actions, idsOcorrenciasFiltradas]);

  const indicadores = useMemo(() => {
    const totalRNCs = occurrencesFiltradas.length;

    const rncsAbertas = occurrencesFiltradas.filter(
      (item) => item.status !== "concluida"
    ).length;

    const rncsConcluidas = occurrencesFiltradas.filter(
      (item) => item.status === "concluida"
    ).length;

    const rncsReabertas = occurrencesFiltradas.filter(
      (item) => item.status === "reaberta"
    ).length;

    const totalAcoes = actionsFiltradas.length;

    const acoesPendentes = actionsFiltradas.filter(
      (item) => item.status !== "concluida"
    ).length;

    const acoesConcluidas = actionsFiltradas.filter(
      (item) => item.status === "concluida"
    ).length;

    const acoesAtrasadas = actionsFiltradas.filter(
      (item) => calcularSLA(item) === "atrasada"
    ).length;

    const acoesVencendo = actionsFiltradas.filter(
      (item) => calcularSLA(item) === "vencendo"
    ).length;
    const acoesNoPrazo = actionsFiltradas.filter(
      (item) => calcularSLA(item) === "no_prazo"
    ).length;

    const acoesComEficacia = actionsFiltradas.filter(
      (item) =>
        item.effectiveness_result === "eficaz" ||
        item.effectiveness_result === "ineficaz"
    );

    const acoesEficazes = actionsFiltradas.filter(
      (item) => item.effectiveness_result === "eficaz"
    ).length;

    const acoesIneficazes = actionsFiltradas.filter(
      (item) => item.effectiveness_result === "ineficaz"
    ).length;

    const eficaciaPercentual =
      acoesComEficacia.length > 0
        ? Math.round((acoesEficazes / acoesComEficacia.length) * 100)
        : 0;

    const rncsFechadasComTempo = occurrencesFiltradas.filter(
      (item) => item.opened_at && item.closed_at
    );

    const tempoMedioFechamento =
      rncsFechadasComTempo.length > 0
        ? Math.round(
            rncsFechadasComTempo.reduce((total, item) => {
              const inicio = new Date(item.opened_at).getTime();
              const fim = new Date(item.closed_at as string).getTime();
              const dias = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24));

              return total + dias;
            }, 0) / rncsFechadasComTempo.length
          )
        : 0;

    const acoesComResolucao = actionsFiltradas
      .map((acao) => calcularDiasResolucao(acao))
      .filter((dias): dias is number => dias !== null);

    const tempoMedioResolucao =
      acoesComResolucao.length > 0
        ? Math.round(
            acoesComResolucao.reduce((total, dias) => total + dias, 0) /
              acoesComResolucao.length
          )
        : 0;

    const taxaConclusao =
      totalRNCs > 0 ? Math.round((rncsConcluidas / totalRNCs) * 100) : 0;

    const percentualAcoesNoPrazo =
      totalAcoes > 0
        ? Math.round(((acoesNoPrazo + acoesConcluidas) / totalAcoes) * 100)
        : 0;

    const percentualAcoesAtrasadas =
      totalAcoes > 0 ? Math.round((acoesAtrasadas / totalAcoes) * 100) : 0;

    const saudeQualidade = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          taxaConclusao * 0.3 +
            percentualAcoesNoPrazo * 0.3 +
            eficaciaPercentual * 0.3 -
            percentualAcoesAtrasadas * 0.4 -
            rncsReabertas * 5
        )
      )
    );

    return {
      totalRNCs,
      rncsAbertas,
      rncsConcluidas,
      rncsReabertas,
      totalAcoes,
      acoesPendentes,
      acoesConcluidas,
      acoesAtrasadas,
      acoesVencendo,
      acoesNoPrazo,
      acoesEficazes,
      acoesIneficazes,
      eficaciaPercentual,
      tempoMedioFechamento,
      tempoMedioResolucao,
      taxaConclusao,
      percentualAcoesNoPrazo,
      percentualAcoesAtrasadas,
      saudeQualidade,
    };
  }, [occurrencesFiltradas, actionsFiltradas, profiles]);

  const alertasExecutivos = useMemo(() => {
    const alertas: {
      tipo: "danger" | "warning" | "success";
      titulo: string;
      descricao: string;
    }[] = [];

    if (indicadores.acoesAtrasadas > 0) {
      alertas.push({
        tipo: "danger",
        titulo: `${indicadores.acoesAtrasadas} ação(ões) atrasada(s)`,
        descricao:
          "Existem ações corretivas ou preventivas fora do prazo definido.",
      });
    }
    if (indicadores.acoesVencendo > 0) {
      alertas.push({
        tipo: "warning",
        titulo: `${indicadores.acoesVencendo} ação(ões) vencendo`,
        descricao:
          "Existem ações com prazo de até 2 dias. Vale acionar os responsáveis.",
      });
    }

    if (indicadores.rncsReabertas > 0) {
      alertas.push({
        tipo: "danger",
        titulo: `${indicadores.rncsReabertas} RNC(s) reaberta(s)`,
        descricao:
          "Há ocorrências reabertas por falha de eficácia em ação anterior.",
      });
    }

    if (
      indicadores.eficaciaPercentual > 0 &&
      indicadores.eficaciaPercentual < 80
    ) {
      alertas.push({
        tipo: "warning",
        titulo: `Eficácia em ${indicadores.eficaciaPercentual}%`,
        descricao:
          "A taxa de eficácia está abaixo do patamar recomendado de 80%.",
      });
    }

    if (indicadores.saudeQualidade > 0 && indicadores.saudeQualidade < 70) {
      alertas.push({
        tipo: "warning",
        titulo: `Saúde da qualidade em ${indicadores.saudeQualidade}%`,
        descricao:
          "O índice composto indica atenção em prazo, eficácia ou fechamento.",
      });
    }

    if (
      indicadores.acoesAtrasadas === 0 &&
      indicadores.acoesVencendo === 0 &&
      indicadores.rncsReabertas === 0 &&
      (indicadores.eficaciaPercentual >= 80 ||
        indicadores.eficaciaPercentual === 0)
    ) {
      alertas.push({
        tipo: "success",
        titulo: "Nenhum alerta crítico no período",
        descricao:
          "Não há ações atrasadas, ações vencendo nem RNCs reabertas no período selecionado.",
      });
    }

    return alertas;
  }, [indicadores]);

  const rankingProcessos = useMemo(() => {
    const mapa = new Map<string, number>();

    occurrencesFiltradas.forEach((item) => {
      const processo = getRelationName(item.processes) || "Sem processo";
      mapa.set(processo, (mapa.get(processo) || 0) + 1);
    });

    return Array.from(mapa.entries())
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [occurrencesFiltradas]);

  const rankingDefeitos = useMemo(() => {
    const mapa = new Map<string, number>();

    occurrencesFiltradas.forEach((item) => {
      const defeito = getRelationName(item.defects) || "Sem defeito";
      mapa.set(defeito, (mapa.get(defeito) || 0) + 1);
    });

    return Array.from(mapa.entries())
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [occurrencesFiltradas]);

  const rankingResponsaveis = useMemo(() => {
    const mapa = new Map<string, RankingResponsavel>();

    actionsFiltradas.forEach((acao) => {
      const usuario = buscarPerfilResponsavel(acao);
      const chave =
        acao.responsible_user_id ||
        acao.responsible_name ||
        acao.responsible_role ||
        "sem_responsavel";

      const nome = nomeResponsavelAcao(acao);
      const setor = usuario?.department || setorResponsavelAcao(acao);

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          id: chave,
          nome,
          setor,
          total: 0,
          pendentes: 0,
          concluidas: 0,
          atrasadas: 0,
          vencendo: 0,
          eficazes: 0,
          ineficazes: 0,
          eficaciaPercentual: 0,
          tempoMedioResolucao: 0,
        });
      }
      const item = mapa.get(chave)!;

      item.total += 1;

      if (acao.status === "concluida") {
        item.concluidas += 1;
      } else {
        item.pendentes += 1;
      }

      if (calcularSLA(acao) === "atrasada") {
        item.atrasadas += 1;
      }

      if (calcularSLA(acao) === "vencendo") {
        item.vencendo += 1;
      }

      if (acao.effectiveness_result === "eficaz") {
        item.eficazes += 1;
      }

      if (acao.effectiveness_result === "ineficaz") {
        item.ineficazes += 1;
      }
    });

    const resultado = Array.from(mapa.values()).map((item) => {
      const totalVerificadas = item.eficazes + item.ineficazes;

      const eficaciaPercentual =
        totalVerificadas > 0
          ? Math.round((item.eficazes / totalVerificadas) * 100)
          : 0;

      const acoesDoResponsavel = actionsFiltradas.filter((acao) => {
        const chave =
          acao.responsible_user_id ||
          acao.responsible_name ||
          acao.responsible_role ||
          "sem_responsavel";

        return chave === item.id;
      });

      const temposResolucao = acoesDoResponsavel
        .map((acao) => calcularDiasResolucao(acao))
        .filter((dias): dias is number => dias !== null);

      const tempoMedioResolucao =
        temposResolucao.length > 0
          ? Math.round(
              temposResolucao.reduce((total, dias) => total + dias, 0) /
                temposResolucao.length
            )
          : 0;

      return {
        ...item,
        eficaciaPercentual,
        tempoMedioResolucao,
      };
    });

    return resultado
      .sort((a, b) => {
        if (b.atrasadas !== a.atrasadas) return b.atrasadas - a.atrasadas;
        return b.total - a.total;
      })
      .slice(0, 10);
  }, [actionsFiltradas, profiles]);

  const rankingSetores = useMemo(() => {
    const mapa = new Map<
      string,
      {
        nome: string;
        total: number;
        pendentes: number;
        atrasadas: number;
        eficazes: number;
        ineficazes: number;
      }
    >();

    actionsFiltradas.forEach((acao) => {
      const setor = setorResponsavelAcao(acao);

      if (!mapa.has(setor)) {
        mapa.set(setor, {
          nome: setor,
          total: 0,
          pendentes: 0,
          atrasadas: 0,
          eficazes: 0,
          ineficazes: 0,
        });
      }

      const item = mapa.get(setor)!;

      item.total += 1;

      if (acao.status !== "concluida") {
        item.pendentes += 1;
      }

      if (calcularSLA(acao) === "atrasada") {
        item.atrasadas += 1;
      }

      if (acao.effectiveness_result === "eficaz") {
        item.eficazes += 1;
      }

      if (acao.effectiveness_result === "ineficaz") {
        item.ineficazes += 1;
      }
    });

    return Array.from(mapa.values())
      .sort((a, b) => {
        if (b.atrasadas !== a.atrasadas) return b.atrasadas - a.atrasadas;
        return b.total - a.total;
      })
      .slice(0, 8);
  }, [actionsFiltradas, profiles]);

  const acoesAtrasadasDetalhe = useMemo(() => {
    return actionsFiltradas
      .filter((item) => calcularSLA(item) === "atrasada")
      .sort((a, b) => {
        const dataA = a.due_date ? new Date(a.due_date).getTime() : 0;
        const dataB = b.due_date ? new Date(b.due_date).getTime() : 0;

        return dataA - dataB;
      })
      .slice(0, 10);
  }, [actionsFiltradas, profiles]);

  const acoesVencendoDetalhe = useMemo(() => {
    return actionsFiltradas
      .filter((item) => calcularSLA(item) === "vencendo")
      .sort((a, b) => {
        const dataA = a.due_date ? new Date(a.due_date).getTime() : 0;
        const dataB = b.due_date ? new Date(b.due_date).getTime() : 0;

        return dataA - dataB;
      })
      .slice(0, 10);
  }, [actionsFiltradas, profiles]);

  const rncsRecentes = useMemo(() => {
    return occurrencesFiltradas.slice(0, 8);
  }, [occurrencesFiltradas]);
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 text-black">
        <div className="mx-auto max-w-7xl rounded-xl bg-white p-6 shadow">
          Carregando dashboard executivo da qualidade...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-black">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <a href="/ocorrencias" className="text-sm text-blue-700">
                ← Voltar para ocorrências
              </a>

              <h1 className="mt-4 text-2xl font-bold">
                Dashboard Executivo da Qualidade
              </h1>

              <p className="mt-2 text-sm text-gray-600">
                Indicadores gerenciais de RNCs, SLA, responsáveis, atrasos,
                eficácia e reincidência.
              </p>

              {profile && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <p>
                    Logado como:{" "}
                    <strong>{profile.full_name || profile.email}</strong>
                  </p>

                  <p className="mt-1 text-xs text-blue-700">
                    Perfil: {formatarPerfil(profile.role)}
                    {profile.department
                      ? ` • Setor: ${profile.department}`
                      : ""}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as Periodo)}
                className="rounded border bg-white px-4 py-3 text-sm font-semibold text-gray-700"
              >
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="todos">Todo o histórico</option>
              </select>

              <button
                onClick={carregarDashboard}
                className="rounded border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Atualizar dados
              </button>

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

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {alertasExecutivos.map((alerta, index) => (
              <AlertaExecutivo
                key={`${alerta.titulo}-${index}`}
                tipo={alerta.tipo}
                titulo={alerta.titulo}
                descricao={alerta.descricao}
              />
            ))}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Saúde da qualidade"
              value={`${indicadores.saudeQualidade}%`}
              description="Índice composto de prazo, eficácia e fechamento"
              tone={
                indicadores.saudeQualidade >= 80
                  ? "success"
                  : indicadores.saudeQualidade >= 60
                  ? "warning"
                  : "danger"
              }
            />

            <KpiCard
              label="Total de RNCs"
              value={String(indicadores.totalRNCs)}
              description="Ocorrências no período"
              tone="neutral"
            />

            <KpiCard
              label="RNCs abertas"
              value={String(indicadores.rncsAbertas)}
              description="Ainda em tratamento"
              tone={indicadores.rncsAbertas > 0 ? "warning" : "success"}
            />

            <KpiCard
              label="Taxa de conclusão"
              value={`${indicadores.taxaConclusao}%`}
              description="RNCs concluídas no período"
              tone={
                indicadores.taxaConclusao >= 80 ||
                indicadores.totalRNCs === 0
                  ? "success"
                  : "warning"
              }
            />

            <KpiCard
              label="RNCs reabertas"
              value={String(indicadores.rncsReabertas)}
              description="Ação anterior ineficaz"
              tone={indicadores.rncsReabertas > 0 ? "danger" : "neutral"}
            />
            <KpiCard
              label="Total de ações"
              value={String(indicadores.totalAcoes)}
              description="Ações no período"
              tone="neutral"
            />

            <KpiCard
              label="Ações pendentes"
              value={String(indicadores.acoesPendentes)}
              description="Ainda não concluídas"
              tone={indicadores.acoesPendentes > 0 ? "warning" : "success"}
            />

            <KpiCard
              label="Ações atrasadas"
              value={String(indicadores.acoesAtrasadas)}
              description={`${indicadores.percentualAcoesAtrasadas}% das ações`}
              tone={indicadores.acoesAtrasadas > 0 ? "danger" : "success"}
            />

            <KpiCard
              label="Ações vencendo"
              value={String(indicadores.acoesVencendo)}
              description="Prazo de até 2 dias"
              tone={indicadores.acoesVencendo > 0 ? "warning" : "success"}
            />

            <KpiCard
              label="Ações no prazo"
              value={`${indicadores.percentualAcoesNoPrazo}%`}
              description="Concluídas ou dentro do prazo"
              tone={
                indicadores.percentualAcoesNoPrazo >= 80
                  ? "success"
                  : "warning"
              }
            />

            <KpiCard
              label="Eficácia"
              value={`${indicadores.eficaciaPercentual}%`}
              description="Ações eficazes sobre verificadas"
              tone={
                indicadores.eficaciaPercentual >= 80 ||
                indicadores.eficaciaPercentual === 0
                  ? "success"
                  : "warning"
              }
            />

            <KpiCard
              label="Ações eficazes"
              value={String(indicadores.acoesEficazes)}
              description="Validadas como eficazes"
              tone="success"
            />

            <KpiCard
              label="Ações ineficazes"
              value={String(indicadores.acoesIneficazes)}
              description="Geram aprendizado ou reabertura"
              tone={indicadores.acoesIneficazes > 0 ? "danger" : "neutral"}
            />

            <KpiCard
              label="Tempo médio RNC"
              value={`${indicadores.tempoMedioFechamento} dias`}
              description="Média de fechamento das RNCs"
              tone="neutral"
            />

            <KpiCard
              label="Tempo médio ação"
              value={`${indicadores.tempoMedioResolucao} dias`}
              description="Média de conclusão das ações"
              tone="neutral"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <RankingResponsaveisCard items={rankingResponsaveis} />

            <RankingSetoresCard items={rankingSetores} />

            <RankingCard
              title="Ranking de processos"
              description="Processos com mais RNCs no período"
              items={rankingProcessos}
            />

            <RankingCard
              title="Ranking de defeitos"
              description="Defeitos mais recorrentes no período"
              items={rankingDefeitos}
            />
            <div className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-bold">Ações atrasadas</h2>
              <p className="mt-1 text-sm text-gray-500">
                Lista das ações pendentes com prazo vencido.
              </p>

              <div className="mt-4 space-y-2">
                {acoesAtrasadasDetalhe.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Nenhuma ação atrasada no período.
                  </p>
                ) : (
                  acoesAtrasadasDetalhe.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">
                          {nomeResponsavelAcao(item)}
                        </span>

                        <span className="text-xs">
                          Prazo:{" "}
                          {item.due_date
                            ? new Date(item.due_date).toLocaleDateString(
                                "pt-BR"
                              )
                            : "-"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs">
                        Setor: {setorResponsavelAcao(item)}
                      </p>

                      <a
                        href={`/ocorrencias/${item.occurrence_id}`}
                        className="mt-1 inline-block text-xs font-semibold underline"
                      >
                        Abrir RNC relacionada
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-bold">Ações vencendo</h2>
              <p className="mt-1 text-sm text-gray-500">
                Ações com prazo de até 2 dias.
              </p>

              <div className="mt-4 space-y-2">
                {acoesVencendoDetalhe.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Nenhuma ação vencendo no período.
                  </p>
                ) : (
                  acoesVencendoDetalhe.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">
                          {nomeResponsavelAcao(item)}
                        </span>

                        <span className="text-xs">
                          Prazo:{" "}
                          {item.due_date
                            ? new Date(item.due_date).toLocaleDateString(
                                "pt-BR"
                              )
                            : "-"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs">
                        Setor: {setorResponsavelAcao(item)}
                      </p>

                      <a
                        href={`/ocorrencias/${item.occurrence_id}`}
                        className="mt-1 inline-block text-xs font-semibold underline"
                      >
                        Abrir RNC relacionada
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-bold">RNCs recentes</h2>
              <p className="mt-1 text-sm text-gray-500">
                Últimas ocorrências registradas no período.
              </p>

              <div className="mt-4 space-y-2">
                {rncsRecentes.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Nenhuma ocorrência encontrada.
                  </p>
                ) : (
                  rncsRecentes.map((item) => (
                    <a
                      key={item.id}
                      href={`/ocorrencias/${item.id}`}
                      className="block rounded-lg border bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">
                          {item.occurrence_number}
                        </span>

                        <StatusMini status={item.status} />
                      </div>

                      <div className="mt-1 text-xs text-gray-600">
                        {getRelationName(item.processes) || "-"} /{" "}
{getRelationName(item.defects) || "-"}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        Aberta em:{" "}
                        {new Date(item.opened_at).toLocaleDateString("pt-BR")}
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function KpiCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const style =
    tone === "success"
      ? "bg-green-50 border-green-200 text-green-800"
      : tone === "warning"
      ? "bg-yellow-50 border-yellow-200 text-yellow-800"
      : tone === "danger"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-gray-50 border-gray-200 text-gray-800";

  return (
    <div className={`rounded-xl border p-4 ${style}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </div>
  );
}

function AlertaExecutivo({
  tipo,
  titulo,
  descricao,
}: {
  tipo: "danger" | "warning" | "success";
  titulo: string;
  descricao: string;
}) {
  const style =
    tipo === "danger"
      ? "border-red-300 bg-red-50 text-red-800"
      : tipo === "warning"
      ? "border-yellow-300 bg-yellow-50 text-yellow-800"
      : "border-green-300 bg-green-50 text-green-800";

  const icon = tipo === "danger" ? "🚨" : tipo === "warning" ? "⚠️" : "✅";

  return (
    <div className={`rounded-xl border p-4 ${style}`}>
      <p className="text-sm font-bold">
        {icon} {titulo}
      </p>
      <p className="mt-1 text-xs opacity-90">{descricao}</p>
    </div>
  );
}

function RankingCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: { nome: string; total: number }[];
}) {
  const maiorValor = Math.max(...items.map((item) => item.total), 1);

  return (
    <div className="rounded-xl border bg-white p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">Sem dados suficientes.</p>
        ) : (
          items.map((item) => {
            const percentual = Math.round((item.total / maiorValor) * 100);

            return (
              <div key={item.nome}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{item.nome}</span>
                  <span className="font-bold">{item.total}</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-black"
                    style={{ width: `${percentual}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
function RankingResponsaveisCard({
  items,
}: {
  items: RankingResponsavel[];
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <h2 className="text-lg font-bold">Ranking por responsável</h2>
      <p className="mt-1 text-sm text-gray-500">
        Responsáveis com mais ações, atrasos, eficácia e tempo médio de
        resolução.
      </p>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">Sem ações no período.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border bg-gray-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-black">{item.nome}</p>
                  <p className="text-xs text-gray-500">{item.setor}</p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    item.atrasadas > 0
                      ? "bg-red-100 text-red-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {item.atrasadas} atrasada(s)
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <MiniMetric label="Total" value={item.total} />
                <MiniMetric label="Pendentes" value={item.pendentes} />
                <MiniMetric label="Concluídas" value={item.concluidas} />
                <MiniMetric label="Vencendo" value={item.vencendo} />
                <MiniMetric label="Eficazes" value={item.eficazes} />
                <MiniMetric label="Ineficazes" value={item.ineficazes} />
                <MiniMetric
                  label="Eficácia"
                  value={`${item.eficaciaPercentual}%`}
                />
                <MiniMetric
                  label="Tempo médio"
                  value={`${item.tempoMedioResolucao}d`}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RankingSetoresCard({
  items,
}: {
  items: {
    nome: string;
    total: number;
    pendentes: number;
    atrasadas: number;
    eficazes: number;
    ineficazes: number;
  }[];
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <h2 className="text-lg font-bold">Ranking por setor</h2>
      <p className="mt-1 text-sm text-gray-500">
        Volume, pendências, atrasos e eficácia por área responsável.
      </p>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">Sem ações no período.</p>
        ) : (
          items.map((item) => (
            <div key={item.nome} className="rounded-lg border bg-gray-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-black">{item.nome}</p>
                  <p className="text-xs text-gray-500">
                    {item.total} ação(ões) no período
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    item.atrasadas > 0
                      ? "bg-red-100 text-red-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {item.atrasadas} atrasada(s)
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                <MiniMetric label="Total" value={item.total} />
                <MiniMetric label="Pendentes" value={item.pendentes} />
                <MiniMetric label="Atrasadas" value={item.atrasadas} />
                <MiniMetric label="Eficazes" value={item.eficazes} />
                <MiniMetric label="Ineficazes" value={item.ineficazes} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded border bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-black">{value}</p>
    </div>
  );
}

function StatusMini({ status }: { status: string }) {
  const label =
    status === "concluida"
      ? "concluída"
      : status === "em_analise"
      ? "em análise"
      : status === "acao_definida"
      ? "ação definida"
      : status === "verificacao_eficacia"
      ? "verificação"
      : status === "reaberta"
      ? "reaberta"
      : status;

  const style =
    status === "concluida"
      ? "bg-green-100 text-green-800"
      : status === "reaberta"
      ? "bg-red-100 text-red-800"
      : status === "verificacao_eficacia"
      ? "bg-orange-100 text-orange-800"
      : "bg-gray-100 text-gray-700";

  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${style}`}>
      {label}
    </span>
  );
}

function formatarResponsavel(responsavel?: string | null) {
  if (responsavel === "qualidade") return "Qualidade";
  if (responsavel === "engenharia") return "Engenharia";
  if (responsavel === "producao") return "Produção";
  if (responsavel === "manutencao") return "Manutenção";
  if (responsavel === "diretoria") return "Diretoria";

  return responsavel || "-";
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