"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Occurrence = {
  id: string;
  occurrence_number: string;
  status: string;
  origin: string;
  lot_number: string | null;
  suspected_quantity: number | null;
  opened_at: string;
  closed_at: string | null;
  companies: { name: string } | null;
  customers: { name: string } | null;
  processes: { name: string } | null;
  defects: { name: string } | null;
};

type CorrectiveAction = {
  occurrence_id: string;
  status: string;
  due_date: string | null;
  effectiveness_result: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  is_active: boolean;
};

type OccurrenceView = Occurrence & {
  diasEmAberto: number;
  temAcaoAtrasada: boolean;
  aguardandoEficacia: boolean;
};

export default function OcorrenciasPage() {
  const router = useRouter();

  const [ocorrencias, setOcorrencias] = useState<Occurrence[]>([]);
  const [acoes, setAcoes] = useState<CorrectiveAction[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [empresaFiltro, setEmpresaFiltro] = useState("todas");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [atalhoFiltro, setAtalhoFiltro] = useState("todas");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    verificarUsuarioECarregarDados();
  }, []);

  async function verificarUsuarioECarregarDados() {
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

    await carregarDados();
  }

  async function carregarDados() {
    setLoading(true);
    setErro(null);

    const { data: ocorrenciasData, error: ocorrenciasError } = await supabase
      .from("occurrences")
      .select(`
        id,
        occurrence_number,
        status,
        origin,
        lot_number,
        suspected_quantity,
        opened_at,
        closed_at,
        companies(name),
        customers(name),
        processes(name),
        defects(name)
      `)
      .order("opened_at", { ascending: false });

    if (ocorrenciasError) {
      setErro("Erro ao carregar ocorrências: " + ocorrenciasError.message);
      setLoading(false);
      return;
    }

    const { data: acoesData, error: acoesError } = await supabase
      .from("corrective_actions")
      .select("occurrence_id, status, due_date, effectiveness_result");

    if (acoesError) {
      setErro("Erro ao carregar ações: " + acoesError.message);
      setLoading(false);
      return;
    }

    setOcorrencias((ocorrenciasData || []) as Occurrence[]);
    setAcoes((acoesData || []) as CorrectiveAction[]);
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

  function calcularDias(inicio: string, fim?: string | null) {
    const dataInicio = new Date(inicio);
    const dataFim = fim ? new Date(fim) : new Date();

    const diff = dataFim.getTime() - dataInicio.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  const ocorrenciasComIndicadores: OccurrenceView[] = useMemo(() => {
    return ocorrencias.map((item) => {
      const acoesDaOcorrencia = acoes.filter(
        (acao) => acao.occurrence_id === item.id
      );

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const temAcaoAtrasada = acoesDaOcorrencia.some((acao) => {
        if (!acao.due_date) return false;
        if (acao.status === "concluida") return false;
        const prazo = new Date(acao.due_date);
        prazo.setHours(0, 0, 0, 0);

        return prazo < hoje;
      });

      const aguardandoEficacia = acoesDaOcorrencia.some(
        (acao) =>
          acao.status === "concluida" &&
          (!acao.effectiveness_result ||
            acao.effectiveness_result === "pendente")
      );

      return {
        ...item,
        diasEmAberto: calcularDias(item.opened_at, item.closed_at),
        temAcaoAtrasada,
        aguardandoEficacia,
      };
    });
  }, [ocorrencias, acoes]);

  const empresas = useMemo(() => {
    return Array.from(
      new Set(
        ocorrencias.map((item) => item.companies?.name).filter(Boolean)
      )
    ) as string[];
  }, [ocorrencias]);

  const statuses = useMemo(() => {
    return Array.from(new Set(ocorrencias.map((item) => item.status)));
  }, [ocorrencias]);

  function prioridadeStatus(item: OccurrenceView) {
    if (item.status === "reaberta") return 1;
    if (item.temAcaoAtrasada) return 2;
    if (item.status === "verificacao_eficacia") return 3;
    if (item.aguardandoEficacia) return 4;
    if (item.status === "em_analise") return 5;
    if (item.status === "acao_definida") return 6;
    if (item.status === "aberta") return 7;
    if (item.status === "concluida") return 99;
    return 50;
  }

  const ocorrenciasFiltradas = useMemo(() => {
    return ocorrenciasComIndicadores
      .filter((item) => {
        const empresaOk =
          empresaFiltro === "todas" || item.companies?.name === empresaFiltro;

        const statusOk =
          statusFiltro === "todos" || item.status === statusFiltro;

        const atalhoOk =
          atalhoFiltro === "todas"
            ? true
            : atalhoFiltro === "abertas"
            ? item.status !== "concluida"
            : atalhoFiltro === "reabertas"
            ? item.status === "reaberta"
            : atalhoFiltro === "aguardando_eficacia"
            ? item.status === "verificacao_eficacia" ||
              item.aguardandoEficacia
            : atalhoFiltro === "atrasadas"
            ? item.temAcaoAtrasada
            : atalhoFiltro === "concluidas"
            ? item.status === "concluida"
            : true;

        const textoBusca = busca.toLowerCase().trim();

        const buscaOk =
          !textoBusca ||
          item.occurrence_number?.toLowerCase().includes(textoBusca) ||
          item.companies?.name?.toLowerCase().includes(textoBusca) ||
          item.customers?.name?.toLowerCase().includes(textoBusca) ||
          item.processes?.name?.toLowerCase().includes(textoBusca) ||
          item.defects?.name?.toLowerCase().includes(textoBusca) ||
          item.lot_number?.toLowerCase().includes(textoBusca) ||
          item.origin?.toLowerCase().includes(textoBusca);

        return empresaOk && statusOk && atalhoOk && buscaOk;
      })
      .sort((a, b) => {
        const prioridadeA = prioridadeStatus(a);
        const prioridadeB = prioridadeStatus(b);

        if (prioridadeA !== prioridadeB) {
          return prioridadeA - prioridadeB;
        }

        return (
          new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()
        );
      });
  }, [
    ocorrenciasComIndicadores,
    empresaFiltro,
    statusFiltro,
    atalhoFiltro,
    busca,
  ]);

  const totalFiltrado = ocorrenciasFiltradas.length;
  const abertasFiltradas = ocorrenciasFiltradas.filter(
    (item) => item.status !== "concluida"
  ).length;
  const reabertasFiltradas = ocorrenciasFiltradas.filter(
    (item) => item.status === "reaberta"
  ).length;
  const atrasadasFiltradas = ocorrenciasFiltradas.filter(
    (item) => item.temAcaoAtrasada
  ).length;
  const concluidasFiltradas = ocorrenciasFiltradas.filter(
    (item) => item.status === "concluida"
  ).length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 text-black">
        <div className="mx-auto max-w-7xl rounded-xl bg-white p-6 shadow">
          Carregando ocorrências de qualidade...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-black">
      <div className="mx-auto max-w-7xl rounded-xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Ocorrências de Qualidade</h1>

            <p className="mt-2 text-gray-600">
              Gestão de RNCs, ações corretivas, eficácia e histórico de
              auditoria.
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

          <div className="flex flex-wrap gap-3">
            <a
              href="/dashboard-qualidade"
              className="rounded border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Dashboard da Qualidade
            </a>

            <a
              href="/nova-ocorrencia"
              className="rounded bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Nova RNC
            </a>

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

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-5">
          <ResumoCard label="Total filtrado" value={totalFiltrado} />
          <ResumoCard label="Abertas" value={abertasFiltradas} />
          <ResumoCard label="Reabertas" value={reabertasFiltradas} />
          <ResumoCard label="Ações atrasadas" value={atrasadasFiltradas} />
          <ResumoCard label="Concluídas" value={concluidasFiltradas} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <AtalhoFiltro
            ativo={atalhoFiltro === "todas"}
            onClick={() => setAtalhoFiltro("todas")}
          >
            Todas
          </AtalhoFiltro>

          <AtalhoFiltro
            ativo={atalhoFiltro === "abertas"}
            onClick={() => setAtalhoFiltro("abertas")}
          >
            Abertas
          </AtalhoFiltro>

          <AtalhoFiltro
            ativo={atalhoFiltro === "reabertas"}
            onClick={() => setAtalhoFiltro("reabertas")}
          >
            Reabertas
          </AtalhoFiltro>

          <AtalhoFiltro
            ativo={atalhoFiltro === "aguardando_eficacia"}
            onClick={() => setAtalhoFiltro("aguardando_eficacia")}
          >
            Aguardando eficácia
          </AtalhoFiltro>

          <AtalhoFiltro
            ativo={atalhoFiltro === "atrasadas"}
            onClick={() => setAtalhoFiltro("atrasadas")}
          >
            Ações atrasadas
          </AtalhoFiltro>

          <AtalhoFiltro
            ativo={atalhoFiltro === "concluidas"}
            onClick={() => setAtalhoFiltro("concluidas")}
          >
            Concluídas
          </AtalhoFiltro>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Empresa
            </label>
            <select
              className="w-full rounded border bg-white px-3 py-2 text-sm text-black"
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
            >
              <option value="todas">Todas as empresas</option>
              {empresas.map((empresa) => (
                <option key={empresa} value={empresa}>
                  {empresa}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Status
            </label>
            <select
              className="w-full rounded border bg-white px-3 py-2 text-sm text-black"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
            >
              <option value="todos">Todos os status</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Buscar
            </label>
            <input
              className="w-full rounded border bg-white px-3 py-2 text-sm text-black"
              placeholder="Buscar por RNC, cliente, defeito, lote..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <p>
            Exibindo <strong>{ocorrenciasFiltradas.length}</strong> de{" "}
            <strong>{ocorrencias.length}</strong> ocorrências.
          </p>

          <button
            onClick={() => {
              setEmpresaFiltro("todas");
              setStatusFiltro("todos");
              setAtalhoFiltro("todas");
              setBusca("");
            }}
            className="text-sm font-semibold text-blue-700"
          >
            Limpar filtros
          </button>
        </div>

        {ocorrenciasFiltradas.length === 0 ? (
          <p className="mt-6 text-gray-500">Nenhuma ocorrência encontrada.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="p-3">Número</th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Processo</th>
                  <th className="p-3">Defeito</th>
                  <th className="p-3">Lote</th>
                  <th className="p-3">Qtd.</th>
                  <th className="p-3">Origem</th>
                  <th className="p-3">Dias</th>
                  <th className="p-3">Pendência</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Data</th>
                </tr>
              </thead>

              <tbody>
                {ocorrenciasFiltradas.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() =>
                      (window.location.href = `/ocorrencias/${item.id}`)
                    }
                    className={`cursor-pointer border-b hover:bg-gray-50 ${
                      item.status === "reaberta"
                        ? "bg-red-50"
                        : item.temAcaoAtrasada
                        ? "bg-orange-50"
                        : ""
                    }`}
                  >
                    <td className="p-3 font-semibold">
                      {item.occurrence_number}
                    </td>

                    <td className="p-3">{item.companies?.name || "-"}</td>
                    <td className="p-3">{item.customers?.name || "-"}</td>
                    <td className="p-3">{item.processes?.name || "-"}</td>
                    <td className="p-3">{item.defects?.name || "-"}</td>
                    <td className="p-3">{item.lot_number || "-"}</td>
                    <td className="p-3">{item.suspected_quantity || "-"}</td>
                    <td className="p-3">{item.origin || "-"}</td>

                    <td className="p-3 font-semibold">
                      {item.diasEmAberto}d
                    </td>

                    <td className="p-3">
                      {item.temAcaoAtrasada ? (
                        <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                          ação atrasada
                        </span>
                      ) : item.aguardandoEficacia ? (
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                          aguarda eficácia
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    <td className="p-3">
                      <StatusBadge status={item.status} />
                    </td>

                    <td className="p-3">
                      {new Date(item.opened_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
function AtalhoFiltro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${
        ativo
          ? "bg-black text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function statusLabel(status: string) {
  if (status === "aberta") return "Aberta";
  if (status === "concluida") return "Concluída";
  if (status === "em_analise") return "Em análise";
  if (status === "acao_definida") return "Ação definida";
  if (status === "verificacao_eficacia") return "Verificação de eficácia";
  if (status === "reaberta") return "Reaberta";

  return status;
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "concluida"
      ? "bg-green-100 text-green-800"
      : status === "reaberta"
      ? "bg-red-100 text-red-800"
      : status === "verificacao_eficacia"
      ? "bg-orange-100 text-orange-800"
      : status === "acao_definida"
      ? "bg-blue-100 text-blue-800"
      : status === "em_analise"
      ? "bg-yellow-100 text-yellow-800"
      : status === "aberta"
      ? "bg-gray-100 text-gray-700"
      : "bg-gray-100 text-gray-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      {statusLabel(status)}
    </span>
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