"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  is_active: boolean;
};

export default function AcaoPage() {
  const params = useParams();
  const router = useRouter();
  const occurrenceId = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [usuarios, setUsuarios] = useState<Profile[]>([]);

  const [authLoading, setAuthLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [form, setForm] = useState({
    description: "",
    responsible_role: "qualidade",
    responsible_user_id: "",
    due_date: "",
    action_type: "contencao",
    evidence_description: "",
  });

  useEffect(() => {
    verificarUsuarioECarregarUsuarios();
  }, []);

  async function verificarUsuarioECarregarUsuarios() {
    setAuthLoading(true);
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
      return;
    }

    if (!profileData?.is_active) {
      await supabase.auth.signOut();
      router.push("/login");
      return;
    }

    setProfile(profileData as Profile);

    const { data: usuariosData, error: usuariosError } = await supabase
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

    if (usuariosError) {
      setErro("Erro ao carregar usuários: " + usuariosError.message);
      setAuthLoading(false);
      return;
    }

    setUsuarios((usuariosData || []) as Profile[]);
    setAuthLoading(false);
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErro("Não foi possível sair do sistema: " + error.message);
      return;
    }

    router.push("/login");
  }

  function handleChange(campo: string, valor: string) {
    setErro(null);

    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const prazoSelecionado = form.due_date ? new Date(form.due_date) : null;

  const prazoNoPassado = prazoSelecionado
    ? prazoSelecionado.getTime() < hoje.getTime()
    : false;
  const descricaoMinima = form.description.trim().length >= 10;
  const evidenciaMinima = form.evidence_description.trim().length >= 10;
  const responsavelSelecionado = !!form.responsible_user_id;

  const usuarioResponsavelSelecionado = useMemo(() => {
    return usuarios.find((user) => user.id === form.responsible_user_id) || null;
  }, [usuarios, form.responsible_user_id]);

  const podeSalvar =
    descricaoMinima &&
    form.responsible_role.trim() &&
    responsavelSelecionado &&
    form.due_date &&
    !prazoNoPassado &&
    form.action_type &&
    evidenciaMinima &&
    !salvando;

  const tipoLabel = useMemo(() => {
    if (form.action_type === "corretiva") return "Ação corretiva";
    if (form.action_type === "preventiva") return "Ação preventiva";
    return "Ação de contenção";
  }, [form.action_type]);

  const responsavelLabel = useMemo(() => {
    if (form.responsible_role === "qualidade") return "Qualidade";
    if (form.responsible_role === "engenharia") return "Engenharia";
    if (form.responsible_role === "diretoria") return "Diretoria";
    if (form.responsible_role === "producao") return "Produção";
    if (form.responsible_role === "manutencao") return "Manutenção";
    return form.responsible_role || "-";
  }, [form.responsible_role]);

  const responsavelCompleto = useMemo(() => {
    if (!usuarioResponsavelSelecionado) return "-";

    return `${usuarioResponsavelSelecionado.full_name} (${responsavelLabel})`;
  }, [usuarioResponsavelSelecionado, responsavelLabel]);

  const statusFormulario = useMemo(() => {
    if (prazoNoPassado) return "Prazo inválido";
    if (!responsavelSelecionado) return "Responsável pendente";
    if (!descricaoMinima || !evidenciaMinima) return "Preenchimento pendente";
    if (podeSalvar) return "Ação pronta";
    return "Preenchimento pendente";
  }, [
    prazoNoPassado,
    responsavelSelecionado,
    descricaoMinima,
    evidenciaMinima,
    podeSalvar,
  ]);

  const statusFormularioStyle = prazoNoPassado
    ? "bg-red-100 text-red-800"
    : podeSalvar
    ? "bg-green-100 text-green-800"
    : "bg-yellow-100 text-yellow-800";

  function montarPayload() {
    return {
      occurrence_id: occurrenceId,
      description: form.description.trim(),
      responsible_role: form.responsible_role.trim(),
      responsible_user_id: form.responsible_user_id,
      responsible_name: usuarioResponsavelSelecionado?.full_name || null,
      due_date: form.due_date,
      action_type: form.action_type,
      evidence_description: form.evidence_description.trim(),
      status: "pendente",
      effectiveness_result: "pendente",
    };
  }

  async function registrarAuditoria({
    actionId,
    eventType,
    eventLabel,
    description,
    beforeData = null,
    afterData,
  }: {
    actionId?: string | null;
    eventType: string;
    eventLabel: string;
    description: string;
    beforeData?: any | null;
    afterData: any;
  }) {
    const { error } = await supabase.from("quality_audit_logs").insert({
      occurrence_id: occurrenceId,
      action_id: actionId || null,
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
  async function handleSalvar() {
    setErro(null);

    if (!podeSalvar) {
      if (prazoNoPassado) {
        setErro("O prazo da ação não pode ser anterior à data de hoje.");
        return;
      }

      if (!responsavelSelecionado) {
        setErro("Selecione o usuário responsável pela execução da ação.");
        return;
      }

      setErro(
        "Preencha todos os campos obrigatórios. A descrição da ação e a evidência esperada precisam ter pelo menos 10 caracteres."
      );
      return;
    }

    setSalvando(true);

    const payload = montarPayload();

    try {
      const { data, error } = await supabase
        .from("corrective_actions")
        .insert([payload])
        .select("id")
        .single();

      if (error) {
        setErro("Erro ao criar ação: " + error.message);
        setSalvando(false);
        return;
      }

      await registrarAuditoria({
        actionId: data.id,
        eventType: "action_created",
        eventLabel: "Ação criada",
        description: form.description.trim(),
        afterData: {
          id: data.id,
          ...payload,
          action_type_label: tipoLabel,
          responsible_role_label: responsavelLabel,
          responsible_user_name:
            usuarioResponsavelSelecionado?.full_name || null,
          responsible_user_email:
            usuarioResponsavelSelecionado?.email || null,
          responsible_user_role:
            usuarioResponsavelSelecionado?.role || null,
          responsible_user_department:
            usuarioResponsavelSelecionado?.department || null,
          responsible_full_label: responsavelCompleto,
        },
      });

      const { error: occurrenceError } = await supabase
        .from("occurrences")
        .update({ status: "acao_definida" })
        .eq("id", occurrenceId);

      if (occurrenceError) {
        setErro(
          "Ação criada, mas houve erro ao atualizar status da RNC: " +
            occurrenceError.message
        );
        setSalvando(false);
        return;
      }

      await registrarAuditoria({
        actionId: data.id,
        eventType: "occurrence_status_changed",
        eventLabel: "RNC com ação definida",
        description: "A RNC foi atualizada para status de ação definida.",
        afterData: {
          status: "acao_definida",
        },
      });

      router.push(`/ocorrencias/${occurrenceId}`);
    } catch (error: any) {
      setErro(error.message || "Erro ao criar ação.");
      setSalvando(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 text-black">
        <div className="mx-auto max-w-6xl rounded-xl bg-white p-6 shadow">
          Carregando criação de ação...
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

            <h1 className="mt-4 text-2xl font-bold">Nova ação da RNC</h1>

            <p className="mt-2 text-sm text-gray-600">
              Defina uma ação de contenção, corretiva ou preventiva com prazo,
              responsável real do sistema e evidência esperada.
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
              <p className="font-semibold text-gray-700">Status do formulário</p>
              <p
                className={`mt-1 rounded-full px-3 py-1 text-xs font-bold ${statusFormularioStyle}`}
              >
                {statusFormulario}
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

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-xl border p-5">
              <h2 className="text-lg font-bold">1. Tipo e responsabilidade</h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Campo
                  label="Tipo de ação"
                  ajuda="Contenção segura o problema agora. Corretiva elimina a causa. Preventiva reduz risco futuro."
                  obrigatorio
                >
                  <select
                    className="w-full rounded border bg-white p-3 text-black"
                    value={form.action_type}
                    onChange={(e) => handleChange("action_type", e.target.value)}
                  >
                    <option value="contencao">Ação de contenção</option>
                    <option value="corretiva">Ação corretiva</option>
                    <option value="preventiva">Ação preventiva</option>
                  </select>
                </Campo>

                <Campo
                  label="Setor responsável"
                  ajuda="Setor responsável pela execução da ação."
                  obrigatorio
                >
                  <select
                    className="w-full rounded border bg-white p-3 text-black"
                    value={form.responsible_role}
                    onChange={(e) =>
                      handleChange("responsible_role", e.target.value)
                    }
                  >
                    <option value="qualidade">Qualidade</option>
                    <option value="engenharia">Engenharia</option>
                    <option value="producao">Produção</option>
                    <option value="manutencao">Manutenção</option>
                    <option value="diretoria">Diretoria</option>
                  </select>
                </Campo>

                <div className="md:col-span-2">
                  <Campo
                    label="Responsável"
                    ajuda="Selecione o usuário real responsável pela execução da ação."
                    obrigatorio
                  >
                    <select
                      className="w-full rounded border bg-white p-3 text-black"
                      value={form.responsible_user_id}
                      onChange={(e) =>
                        handleChange("responsible_user_id", e.target.value)
                      }
                    >
                      <option value="">Selecione um usuário</option>

                      {usuarios.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name} ({formatarPerfil(user.role)}
                          {user.department ? ` • ${user.department}` : ""})
                        </option>
                      ))}
                    </select>

                    {!responsavelSelecionado && (
                      <p className="mt-1 text-xs text-red-700">
                        Selecione um responsável.
                      </p>
                    )}
                  </Campo>
                </div>
              </div>
            </div>
            <div className="rounded-xl border p-5">
              <h2 className="text-lg font-bold">2. Execução planejada</h2>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <Campo
                  label="Descrição da ação"
                  ajuda="Descreva de forma objetiva o que será feito, onde será feito e qual causa será tratada."
                  obrigatorio
                >
                  <textarea
                    className="w-full rounded border bg-white p-3 text-black placeholder-gray-500"
                    rows={5}
                    placeholder="Ex: Revisar o plano de controle da peça X, incluir inspeção dimensional a cada início de lote e treinar operadores no novo padrão."
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                  />

                  {form.description && !descricaoMinima && (
                    <p className="mt-1 text-xs text-red-700">
                      A descrição precisa ter pelo menos 10 caracteres.
                    </p>
                  )}
                </Campo>

                <Campo
                  label="Prazo"
                  ajuda="Data limite para execução da ação."
                  obrigatorio
                >
                  <input
                    type="date"
                    className="w-full rounded border bg-white p-3 text-black"
                    value={form.due_date}
                    onChange={(e) => handleChange("due_date", e.target.value)}
                  />

                  {prazoNoPassado && (
                    <p className="mt-1 text-xs text-red-700">
                      O prazo não pode ser anterior à data de hoje.
                    </p>
                  )}
                </Campo>

                <Campo
                  label="Evidência esperada"
                  ajuda="Defina qual prova objetiva deverá ser anexada na conclusão."
                  obrigatorio
                >
                  <textarea
                    className="w-full rounded border bg-white p-3 text-black placeholder-gray-500"
                    rows={4}
                    placeholder="Ex: Foto da seleção, checklist preenchido, plano de controle revisado, treinamento realizado ou relatório assinado."
                    value={form.evidence_description}
                    onChange={(e) =>
                      handleChange("evidence_description", e.target.value)
                    }
                  />

                  {form.evidence_description && !evidenciaMinima && (
                    <p className="mt-1 text-xs text-red-700">
                      A evidência esperada precisa ter pelo menos 10 caracteres.
                    </p>
                  )}
                </Campo>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-5">
            <h2 className="text-lg font-bold">Resumo da ação</h2>

            <div className="mt-4 space-y-3 text-sm">
              <Resumo label="Tipo" value={tipoLabel} />
              <Resumo label="Setor responsável" value={responsavelLabel} />
              <Resumo
                label="Responsável"
                value={usuarioResponsavelSelecionado?.full_name}
              />
              <Resumo
                label="E-mail do responsável"
                value={usuarioResponsavelSelecionado?.email}
              />
              <Resumo
                label="Perfil do responsável"
                value={formatarPerfil(usuarioResponsavelSelecionado?.role)}
              />
              <Resumo
                label="Responsável completo"
                value={responsavelCompleto}
              />
              <Resumo label="Prazo" value={form.due_date} />
              <Resumo label="Descrição" value={form.description} />
              <Resumo
                label="Evidência esperada"
                value={form.evidence_description}
              />
              <Resumo label="Status inicial" value="pendente" />
              <Resumo label="Eficácia inicial" value="pendente" />
            </div>
            <div className="mt-6 rounded-lg border bg-white p-3 text-xs text-gray-600">
              Ao criar a ação, o sistema registrará o responsável real, o usuário
              que criou o registro e atualizará a RNC para ação definida.
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
                {salvando ? "Criando ação..." : "Criar ação"}
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
  if (role === "manutencao") return "Manutenção";

  return role || "-";
}