"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Option = {
  id: string;
  name: string;
};

export default function NovaOcorrenciaPage() {
  const router = useRouter();

  const [companies, setCompanies] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [processes, setProcesses] = useState<Option[]>([]);
  const [defects, setDefects] = useState<Option[]>([]);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_id: "",
    customer_id: "",
    process_id: "",
    defect_id: "",
    origin: "interno",
    lote: "",
    quantidade: "",
  });

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);
    setErro(null);

    const [companiesResult, processesResult, defectsResult] = await Promise.all([
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("processes").select("id, name").order("name"),
      supabase.from("defects").select("id, name").order("name"),
    ]);

    if (companiesResult.error) {
      setErro("Erro ao carregar empresas: " + companiesResult.error.message);
      setLoading(false);
      return;
    }

    if (processesResult.error) {
      setErro("Erro ao carregar processos: " + processesResult.error.message);
      setLoading(false);
      return;
    }

    if (defectsResult.error) {
      setErro("Erro ao carregar defeitos: " + defectsResult.error.message);
      setLoading(false);
      return;
    }

    setCompanies(companiesResult.data || []);
    setProcesses(processesResult.data || []);
    const defectsUnicos = Array.from(
  new Map((defectsResult.data || []).map((item) => [item.name, item])).values()
);

setDefects(defectsUnicos);

    setLoading(false);
  }

  async function carregarClientesDaEmpresa(companyId: string) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name");

    if (error) {
      setErro("Erro ao carregar clientes: " + error.message);
      setCustomers([]);
      return;
    }

    setCustomers(data || []);
  }

  async function handleChange(campo: string, valor: string) {
    setErro(null);

    if (campo === "company_id") {
      setForm((prev) => ({
        ...prev,
        company_id: valor,
        customer_id: "",
      }));

      if (valor) {
        await carregarClientesDaEmpresa(valor);
      } else {
        setCustomers([]);
      }

      return;
    }

    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  const empresaSelecionada = useMemo(
    () => companies.find((item) => item.id === form.company_id),
    [companies, form.company_id]
  );

  const clienteSelecionado = useMemo(
    () => customers.find((item) => item.id === form.customer_id),
    [customers, form.customer_id]
  );

  const processoSelecionado = useMemo(
    () => processes.find((item) => item.id === form.process_id),
    [processes, form.process_id]
  );

  const defeitoSelecionado = useMemo(
    () => defects.find((item) => item.id === form.defect_id),
    [defects, form.defect_id]
  );

  const quantidadeValida =
    form.quantidade.trim() !== "" && Number(form.quantidade) > 0;

  const podeSalvar =
    form.company_id &&
    form.customer_id &&
    form.process_id &&
    form.defect_id &&
    form.origin &&
    form.lote.trim() &&
    quantidadeValida &&
    !salvando;

  async function registrarAuditoriaOcorrenciaCriada({
    occurrenceId,
    numero,
  }: {
    occurrenceId: string;
    numero: string;
  }) {
    const { error } = await supabase.from("quality_audit_logs").insert({
      occurrence_id: occurrenceId,
      event_type: "occurrence_created",
      event_label: "RNC criada",
      description: `Ocorrência ${numero} registrada no sistema.`,
      after_data: {
        occurrence_number: numero,
        company_id: form.company_id,
        company_name: empresaSelecionada?.name || null,
        customer_id: form.customer_id,
        customer_name: clienteSelecionado?.name || null,
        process_id: form.process_id,
        process_name: processoSelecionado?.name || null,
        defect_id: form.defect_id,
        defect_name: defeitoSelecionado?.name || null,
        lot_number: form.lote.trim(),
        suspected_quantity: Number(form.quantidade),
        origin: form.origin,
        status: "aberta",
      },
    });

    if (error) {
      throw new Error("Erro ao registrar auditoria: " + error.message);
    }
  }

  async function handleSalvar() {
    setErro(null);

    if (!podeSalvar) {
      setErro("Preencha todos os campos obrigatórios antes de abrir a RNC.");
      return;
    }

    setSalvando(true);

    const numero = `RNC-${new Date().getFullYear()}-${Date.now()
      .toString()
      .slice(-6)}`;

    const payload = {
      occurrence_number: numero,
      company_id: form.company_id,
      customer_id: form.customer_id,
      process_id: form.process_id,
      defect_id: form.defect_id,
      lot_number: form.lote.trim(),
      suspected_quantity: Number(form.quantidade),
      origin: form.origin,
      status: "aberta",
    };

    const { data, error } = await supabase
      .from("occurrences")
      .insert(payload)
      .select("id, occurrence_number")
      .single();

    if (error) {
      setErro("Erro ao criar ocorrência: " + error.message);
      setSalvando(false);
      return;
    }

    try {
      await registrarAuditoriaOcorrenciaCriada({
        occurrenceId: data.id,
        numero: data.occurrence_number,
      });

      router.push(`/ocorrencias/${data.id}`);
    } catch (error: any) {
      setErro(
        error.message ||
          "Ocorrência criada, mas houve erro ao registrar auditoria."
      );
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 text-black">
        <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
          Carregando formulário...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-black">
      <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.push("/ocorrencias")}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              ← Voltar para ocorrências
            </button>

            <h1 className="mt-4 text-2xl font-bold">Nova RNC</h1>

            <p className="mt-2 text-sm text-gray-600">
              Registro guiado de ocorrência de qualidade com rastreabilidade de
              auditoria.
            </p>
          </div>

          <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm">
            <p className="font-semibold text-gray-700">Status inicial</p>
            <p className="mt-1 rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800">
              aberta
            </p>
          </div>
        </div>

        {erro && (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            {erro}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-xl border p-5">
              <h2 className="text-lg font-bold">1. Identificação</h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Campo label="Empresa responsável" obrigatorio>
                  <select
                    className="w-full rounded border bg-white p-3 text-black"
                    value={form.company_id}
                    onChange={(e) => handleChange("company_id", e.target.value)}
                  >
                    <option value="">Selecione a empresa</option>
                    {companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Cliente" obrigatorio>
                  <select
                    className="w-full rounded border bg-white p-3 text-black disabled:bg-gray-100"
                    value={form.customer_id}
                    onChange={(e) =>
                      handleChange("customer_id", e.target.value)
                    }
                    disabled={!form.company_id}
                  >
                    <option value="">
                      {form.company_id
                        ? "Selecione o cliente"
                        : "Escolha a empresa primeiro"}
                    </option>

                    {customers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Origem da ocorrência" obrigatorio>
                  <select
                    className="w-full rounded border bg-white p-3 text-black"
                    value={form.origin}
                    onChange={(e) => handleChange("origin", e.target.value)}
                  >
                    <option value="interno">Interno</option>
                    <option value="cliente">Cliente</option>
                    <option value="fornecedor">Fornecedor</option>
                    <option value="auditoria">Auditoria</option>
                  </select>
                </Campo>

                <Campo label="Lote / OP / Identificação" obrigatorio>
                  <input
                    className="w-full rounded border bg-white p-3 text-black"
                    placeholder="Ex: Lote 0426 / OP 12345"
                    value={form.lote}
                    onChange={(e) => handleChange("lote", e.target.value)}
                  />
                </Campo>
              </div>
            </div>

            <div className="mt-6 rounded-xl border p-5">
              <h2 className="text-lg font-bold">2. Classificação técnica</h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Campo label="Processo" obrigatorio>
                  <select
                    className="w-full rounded border bg-white p-3 text-black"
                    value={form.process_id}
                    onChange={(e) =>
                      handleChange("process_id", e.target.value)
                    }
                  >
                    <option value="">Selecione o processo</option>
                    {processes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Defeito / não conformidade" obrigatorio>
                  <select
                    className="w-full rounded border bg-white p-3 text-black"
                    value={form.defect_id}
                    onChange={(e) => handleChange("defect_id", e.target.value)}
                  >
                    <option value="">Selecione o defeito</option>
                    {defects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Quantidade suspeita" obrigatorio>
                  <input
                    type="number"
                    min="1"
                    className="w-full rounded border bg-white p-3 text-black"
                    placeholder="Ex: 120"
                    value={form.quantidade}
                    onChange={(e) =>
                      handleChange("quantidade", e.target.value)
                    }
                  />

                  {form.quantidade && !quantidadeValida && (
                    <p className="mt-1 text-xs text-red-700">
                      A quantidade precisa ser maior que zero.
                    </p>
                  )}
                </Campo>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-5">
            <h2 className="text-lg font-bold">Resumo da abertura</h2>

            <div className="mt-4 space-y-3 text-sm">
              <Resumo label="Empresa" value={empresaSelecionada?.name} />
              <Resumo label="Cliente" value={clienteSelecionado?.name} />
              <Resumo label="Origem" value={form.origin} />
              <Resumo label="Processo" value={processoSelecionado?.name} />
              <Resumo label="Defeito" value={defeitoSelecionado?.name} />
              <Resumo label="Lote" value={form.lote} />
              <Resumo label="Quantidade" value={form.quantidade} />
            </div>

            <div className="mt-6 rounded-lg border bg-white p-3 text-xs text-gray-600">
              Ao abrir a RNC, o sistema criará automaticamente um registro no
              histórico de auditoria.
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleSalvar}
                disabled={!podeSalvar}
                className={`rounded px-4 py-3 text-sm font-bold text-white ${
                  podeSalvar
                    ? "bg-black hover:bg-gray-800"
                    : "cursor-not-allowed bg-gray-400"
                }`}
              >
                {salvando ? "Abrindo RNC..." : "Abrir RNC"}
              </button>

              <button
                onClick={() => router.push("/ocorrencias")}
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
  obrigatorio,
  children,
}: {
  label: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-gray-700">
        {label}{" "}
        {obrigatorio && <span className="text-red-600">*</span>}
      </label>

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