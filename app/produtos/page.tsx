"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Company = {
  id: string;
  name: string;
};

type Customer = {
  id: string;
  name: string;
};

type Process = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  company_id: string | null;
  customer_id: string | null;
  process_id: string | null;
  part_number: string | null;
  drawing_number: string | null;
  revision: string | null;
  status: string;
  created_at: string;
  companies: { name: string } | null;
  customers: { name: string } | null;
  processes: { name: string } | null;
};

type ProductForm = {
  code: string;
  name: string;
  description: string;
  company_id: string;
  customer_id: string;
  process_id: string;
  part_number: string;
  drawing_number: string;
  revision: string;
  status: string;
};

const initialForm: ProductForm = {
  code: "",
  name: "",
  description: "",
  company_id: "",
  customer_id: "",
  process_id: "",
  part_number: "",
  drawing_number: "",
  revision: "",
  status: "ativo",
};

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);

  const [form, setForm] = useState<ProductForm>(initialForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [companyFilter, setCompanyFilter] = useState("todos");
  const [customerFilter, setCustomerFilter] = useState("todos");

  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [
        productsResult,
        companiesResult,
        customersResult,
        processesResult,
      ] = await Promise.all([
        supabase
          .from("products")
          .select(
            `
            id,
            code,
            name,
            description,
            company_id,
            customer_id,
            process_id,
            part_number,
            drawing_number,
            revision,
            status,
            created_at,
            companies(name),
            customers(name),
            processes(name)
          `
          )
          .order("created_at", { ascending: false }),

        supabase.from("companies").select("id, name").order("name"),
        supabase.from("customers").select("id, name").order("name"),
        supabase.from("processes").select("id, name").order("name"),
      ]);

      if (productsResult.error) {
        throw productsResult.error;
      }

      if (companiesResult.error) {
        throw companiesResult.error;
      }

      if (customersResult.error) {
        throw customersResult.error;
      }

      if (processesResult.error) {
        throw processesResult.error;
      }

      setProducts((productsResult.data || []) as Product[]);
      setCompanies((companiesResult.data || []) as Company[]);
      setCustomers((customersResult.data || []) as Customer[]);
      setProcesses((processesResult.data || []) as Process[]);
    } catch (error: any) {
      setErrorMessage(
        error?.message ||
          "Não foi possível carregar os dados de produtos."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleChange(
    field: keyof ProductForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setMessage(null);
    setErrorMessage(null);
  }

  function validateForm() {
    if (!form.code.trim()) {
      return "Informe o código interno do produto.";
    }

    if (!form.name.trim()) {
      return "Informe o nome do produto.";
    }

    if (!form.company_id) {
      return "Selecione a empresa responsável.";
    }

    if (!form.customer_id) {
      return "Selecione o cliente.";
    }

    if (!form.process_id) {
      return "Selecione o processo principal.";
    }

    return null;
  }
    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      setMessage(null);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setMessage(null);

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      company_id: form.company_id || null,
      customer_id: form.customer_id || null,
      process_id: form.process_id || null,
      part_number: form.part_number.trim() || null,
      drawing_number: form.drawing_number.trim() || null,
      revision: form.revision.trim() || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingProductId) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId);

        if (error) {
          throw error;
        }

        setMessage("Produto atualizado com sucesso.");
      } else {
        const { error } = await supabase.from("products").insert(payload);

        if (error) {
          throw error;
        }

        setMessage("Produto cadastrado com sucesso.");
      }

      setForm(initialForm);
      setEditingProductId(null);
      await loadInitialData();
    } catch (error: any) {
      setErrorMessage(
        error?.message ||
          "Não foi possível salvar o produto. Verifique os dados e tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(product: Product) {
    setEditingProductId(product.id);

    setForm({
      code: product.code || "",
      name: product.name || "",
      description: product.description || "",
      company_id: product.company_id || "",
      customer_id: product.customer_id || "",
      process_id: product.process_id || "",
      part_number: product.part_number || "",
      drawing_number: product.drawing_number || "",
      revision: product.revision || "",
      status: product.status || "ativo",
    });

    setMessage(null);
    setErrorMessage(null);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleCancelEdit() {
    setEditingProductId(null);
    setForm(initialForm);
    setMessage(null);
    setErrorMessage(null);
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const searchText = search.trim().toLowerCase();

      const matchesSearch =
        !searchText ||
        product.code?.toLowerCase().includes(searchText) ||
        product.name?.toLowerCase().includes(searchText) ||
        product.part_number?.toLowerCase().includes(searchText) ||
        product.drawing_number?.toLowerCase().includes(searchText) ||
        product.customers?.name?.toLowerCase().includes(searchText);

      const matchesStatus =
        statusFilter === "todos" || product.status === statusFilter;

      const matchesCompany =
        companyFilter === "todos" || product.company_id === companyFilter;

      const matchesCustomer =
        customerFilter === "todos" || product.customer_id === customerFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCompany &&
        matchesCustomer
      );
    });
  }, [products, search, statusFilter, companyFilter, customerFilter]);

  const totalProducts = products.length;

  const activeProducts = products.filter(
    (product) => product.status === "ativo"
  ).length;

  const inactiveProducts = products.filter(
    (product) => product.status === "inativo"
  ).length;

  const productsWithoutRevision = products.filter(
    (product) => !product.revision
  ).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-slate-600">
              Carregando cadastro de produtos...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Engenharia da Qualidade
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">
                Cadastro de Produtos e Peças
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Base para conectar RNC, FMEA, Plano de Controle e PPAP por
                produto, cliente, processo e revisão.
              </p>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <p className="font-semibold">Próxima evolução</p>
              <p>Produto → Fluxo de Processo → FMEA → Plano de Controle → PPAP</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">
              Total
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalProducts}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">
              Ativos
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-700">
              {activeProducts}
            </p>
          </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">
              Inativos
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-700">
              {inactiveProducts}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">
              Sem revisão
            </p>
            <p className="mt-2 text-3xl font-bold text-amber-700">
              {productsWithoutRevision}
            </p>
          </div>
        </section>

        {(message || errorMessage) && (
          <section
            className={`rounded-2xl border p-4 text-sm ${
              errorMessage
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {errorMessage || message}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            {editingProductId ? "Editar produto" : "Novo produto"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Código interno *
              </label>
              <input
                value={form.code}
                onChange={(event) => handleChange("code", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Ex: COIFA-MQB-270"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Nome do produto *
              </label>
              <input
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Ex: Coifa soprada MQB VW 270"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Empresa *
              </label>
              <select
                value={form.company_id}
                onChange={(event) =>
                  handleChange("company_id", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Selecione</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Cliente *
              </label>
              <select
                value={form.customer_id}
                onChange={(event) =>
                  handleChange("customer_id", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Selecione</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Processo principal *
              </label>
              <select
                value={form.process_id}
                onChange={(event) =>
                  handleChange("process_id", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Selecione</option>
                {processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(event) => handleChange("status", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Part number
              </label>
              <input
                value={form.part_number}
                onChange={(event) =>
                  handleChange("part_number", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Ex: VW-270-MQB"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Número do desenho
              </label>
              <input
                value={form.drawing_number}
                onChange={(event) =>
                  handleChange("drawing_number", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Ex: DWG-270-001"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Revisão
              </label>
              <input
                value={form.revision}
                onChange={(event) =>
                  handleChange("revision", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Ex: Rev. A"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700">
                Descrição
              </label>
              <textarea
                value={form.description}
                onChange={(event) =>
                  handleChange("description", event.target.value)
                }
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Descrição técnica, aplicação, família do produto ou observações."
              />
            </div>

            <div className="flex gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Salvando..."
                  : editingProductId
                  ? "Salvar alterações"
                  : "Cadastrar produto"}
              </button>

              {editingProductId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Produtos cadastrados
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Use os filtros para localizar produtos por código, cliente,
                desenho ou revisão.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Buscar..."
              />

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="todos">Todos status</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>

              <select
                value={companyFilter}
                onChange={(event) => setCompanyFilter(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="todos">Todas empresas</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>

              <select
                value={customerFilter}
                onChange={(event) => setCustomerFilter(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="todos">Todos clientes</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Produto
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Processo
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Revisão
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {product.code}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div>
                          <p className="font-medium text-slate-900">
                            {product.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {product.part_number || "Sem part number"} ·{" "}
                            {product.drawing_number || "Sem desenho"}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {product.companies?.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {product.customers?.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {product.processes?.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {product.revision || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            product.status === "ativo"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleEdit(product)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}