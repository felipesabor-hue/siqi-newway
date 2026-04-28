import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

type Action = {
  id: string;
  occurrence_id: string;
  description: string;
  status: string;
  due_date: string | null;
  effectiveness_result: string | null;
  responsible_role: string | null;
  responsible_name: string | null;
  responsible_user_id: string | null;
  created_at: string | null;
  completed_at: string | null;
  occurrences: {
    occurrence_number: string;
    status: string;
  } | null;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  is_active: boolean;
};

type GrupoAlerta = {
  nome: string;
  email: string;
  roles: string[];
  receberTudo?: boolean;
};

const GRUPOS_ALERTA: GrupoAlerta[] = [
  {
    nome: "Qualidade",
    email: "qualidade@newwaygroup.com.br",
    roles: ["qualidade"],
  },
  {
    nome: "Fábrica",
    email: "fabrica@newwaygroup.com.br",
    roles: ["producao", "produção", "fabrica", "fábrica", "manutencao", "manutenção"],
  },
  {
    nome: "Desenvolvimento",
    email: "desenvolvimento@newwaygroup.com.br",
    roles: ["engenharia", "desenvolvimento"],
  },
  {
    nome: "Diretoria",
    email: "manuel@newwaygroup.com.br",
    roles: ["diretoria", "admin"],
    receberTudo: true,
  },
];

function normalizarTexto(valor?: string | null) {
  return (valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
function diasAtePrazo(dueDate: string | null) {
  if (!dueDate) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const prazo = new Date(dueDate);
  prazo.setHours(0, 0, 0, 0);

  return Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function formatarData(data: string | null) {
  if (!data) return "-";

  return new Date(data).toLocaleDateString("pt-BR");
}

function classificarAcao(acao: Action) {
  const dias = diasAtePrazo(acao.due_date);

  if (acao.status === "concluida") {
    if (!acao.effectiveness_result || acao.effectiveness_result === "pendente") {
      return "eficacia_pendente";
    }

    return "concluida";
  }

  if (dias === null) return "sem_prazo";
  if (dias < 0) return "atrasada";
  if (dias <= 2) return "vencendo";

  return "no_prazo";
}

function montarLinkOcorrencia(occurrenceId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return `${baseUrl}/ocorrencias/${occurrenceId}`;
}

function identificarGrupoDaAcao(acao: Action) {
  const roleNormalizada = normalizarTexto(acao.responsible_role);
  const nomeNormalizado = normalizarTexto(acao.responsible_name);

  const grupo = GRUPOS_ALERTA.find((grupo) => {
    if (grupo.receberTudo) return false;

    return grupo.roles.some((role) => {
      const roleGrupo = normalizarTexto(role);

      return (
        roleNormalizada.includes(roleGrupo) ||
        nomeNormalizado.includes(roleGrupo)
      );
    });
  });

  return grupo || null;
}

function separarAcoesPorGrupo(acoes: Action[]) {
  const resultado = GRUPOS_ALERTA.map((grupo) => ({
    grupo,
    acoes: grupo.receberTudo
      ? acoes
      : acoes.filter((acao) => identificarGrupoDaAcao(acao)?.email === grupo.email),
  }));

  return resultado;
}
function gerarLinhaAcao(acao: Action, tipo: string) {
  const dias = diasAtePrazo(acao.due_date);

  const prazoTexto =
    dias === null
      ? "Sem prazo"
      : dias < 0
      ? `${Math.abs(dias)} dia(s) em atraso`
      : dias === 0
      ? "vence hoje"
      : `vence em ${dias} dia(s)`;

  return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${acao.occurrences?.occurrence_number || "RNC"}</strong><br />
        <span style="font-size: 12px; color: #6b7280;">${tipo}</span>
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${acao.description || "-"}
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${acao.responsible_name || acao.responsible_role || "-"}
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${formatarData(acao.due_date)}<br />
        <span style="font-size: 12px; color: #6b7280;">${prazoTexto}</span>
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <a href="${montarLinkOcorrencia(
          acao.occurrence_id
        )}" style="color: #1d4ed8; font-weight: bold;">
          Abrir RNC
        </a>
      </td>
    </tr>
  `;
}

function montarTabela(titulo: string, acoes: Action[], tipo: string) {
  if (acoes.length === 0) return "";

  return `
    <h3 style="margin-top: 28px; color: #111827;">${titulo}</h3>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background: #f9fafb;">
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">RNC</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Ação</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Responsável</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Prazo</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Link</th>
        </tr>
      </thead>

      <tbody>
        ${acoes.map((acao) => gerarLinhaAcao(acao, tipo)).join("")}
      </tbody>
    </table>
  `;
}
function montarHtmlEmail({
  grupoNome,
  atrasadas,
  vencendo,
  eficaciaPendente,
}: {
  grupoNome: string;
  atrasadas: Action[];
  vencendo: Action[];
  eficaciaPendente: Action[];
}) {
  const totalAlertas =
    atrasadas.length + vencendo.length + eficaciaPendente.length;

  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0;">SGQ New Way — Alertas de RNC</h2>
        <p style="margin: 8px 0 0; color: #6b7280;">
          Resumo automático de ações críticas para: <strong>${grupoNome}</strong>.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="border: 1px solid #fecaca; background: #fef2f2; padding: 16px; border-radius: 10px;">
          <p style="margin: 0; font-size: 12px; color: #991b1b; font-weight: bold;">ATRASADAS</p>
          <p style="margin: 6px 0 0; font-size: 28px; font-weight: bold; color: #991b1b;">${atrasadas.length}</p>
        </div>

        <div style="border: 1px solid #fde68a; background: #fffbeb; padding: 16px; border-radius: 10px;">
          <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: bold;">VENCENDO</p>
          <p style="margin: 6px 0 0; font-size: 28px; font-weight: bold; color: #92400e;">${vencendo.length}</p>
        </div>

        <div style="border: 1px solid #bfdbfe; background: #eff6ff; padding: 16px; border-radius: 10px;">
          <p style="margin: 0; font-size: 12px; color: #1e40af; font-weight: bold;">EFICÁCIA PENDENTE</p>
          <p style="margin: 6px 0 0; font-size: 28px; font-weight: bold; color: #1e40af;">${eficaciaPendente.length}</p>
        </div>
      </div>

      ${
        totalAlertas === 0
          ? `
            <div style="border: 1px solid #bbf7d0; background: #f0fdf4; padding: 16px; border-radius: 10px;">
              <p style="margin: 0; color: #166534; font-weight: bold;">
                Nenhuma ação crítica encontrada no momento.
              </p>
            </div>
          `
          : ""
      }

      ${montarTabela("Ações atrasadas", atrasadas, "Atrasada")}
      ${montarTabela("Ações vencendo em até 2 dias", vencendo, "Vencendo")}
      ${montarTabela(
        "Ações aguardando verificação de eficácia",
        eficaciaPendente,
        "Eficácia pendente"
      )}

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">
          Este email foi gerado automaticamente pelo sistema SGQ/RNC da New Way.
        </p>
      </div>
    </div>
  `;
}
async function enviarEmailGrupo({
  grupo,
  acoes,
  from,
}: {
  grupo: GrupoAlerta;
  acoes: Action[];
  from: string;
}) {
  const atrasadas = acoes.filter(
    (acao) => classificarAcao(acao) === "atrasada"
  );

  const vencendo = acoes.filter(
    (acao) => classificarAcao(acao) === "vencendo"
  );

  const eficaciaPendente = acoes.filter(
    (acao) => classificarAcao(acao) === "eficacia_pendente"
  );

  const totalAlertas =
    atrasadas.length + vencendo.length + eficaciaPendente.length;

  if (totalAlertas === 0 && !grupo.receberTudo) {
    return {
      grupo: grupo.nome,
      email: grupo.email,
      enviado: false,
      motivo: "Nenhum alerta para este grupo.",
      totalAlertas: 0,
    };
  }

  const html = montarHtmlEmail({
    grupoNome: grupo.nome,
    atrasadas,
    vencendo,
    eficaciaPendente,
  });

  const subject =
    totalAlertas > 0
      ? `SGQ New Way: ${totalAlertas} alerta(s) para ${grupo.nome}`
      : `SGQ New Way: nenhum alerta crítico para ${grupo.nome}`;

  const result = await resend.emails.send({
    from,
    to: grupo.email,
    subject,
    html,
  });

  if (result.error) {
    return {
      grupo: grupo.nome,
      email: grupo.email,
      enviado: false,
      erro: result.error.message,
      totalAlertas,
    };
  }

  return {
    grupo: grupo.nome,
    email: grupo.email,
    enviado: true,
    totalAlertas,
    atrasadas: atrasadas.length,
    vencendo: vencendo.length,
    eficacia_pendente: eficaciaPendente.length,
    result,
  };
}

export async function GET() {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY não configurada." },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada." },
        { status: 500 }
      );
    }

    const from = process.env.ALERT_EMAIL_FROM;

    if (!from) {
      return NextResponse.json(
        { ok: false, error: "ALERT_EMAIL_FROM não configurado." },
        { status: 500 }
      );
    }
        const { data: actionsData, error: actionsError } = await supabaseAdmin
      .from("corrective_actions")
      .select(`
        id,
        occurrence_id,
        description,
        status,
        due_date,
        effectiveness_result,
        responsible_role,
        responsible_name,
        responsible_user_id,
        created_at,
        completed_at,
        occurrences (
          occurrence_number,
          status
        )
      `)
      .order("due_date", { ascending: true });

    if (actionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao buscar ações: " + actionsError.message,
        },
        { status: 500 }
      );
    }

    const actions = (actionsData || []) as unknown as Action[];

    const acoesCriticas = actions.filter((acao) => {
      const classificacao = classificarAcao(acao);

      return (
        classificacao === "atrasada" ||
        classificacao === "vencendo" ||
        classificacao === "eficacia_pendente"
      );
    });

    const gruposComAcoes = separarAcoesPorGrupo(acoesCriticas);

    const resultados = [];

    for (const item of gruposComAcoes) {
      const resultado = await enviarEmailGrupo({
        grupo: item.grupo,
        acoes: item.acoes,
        from,
      });

      resultados.push(resultado);
    }

    const enviados = resultados.filter((item) => item.enviado).length;
    const falhas = resultados.filter((item) => item.erro).length;

    return NextResponse.json({
      ok: falhas === 0,
      message:
        falhas === 0
          ? "Alertas por responsável enviados/processados com sucesso."
          : "Alguns alertas falharam.",
      total_acoes_criticas: acoesCriticas.length,
      emails_enviados: enviados,
      falhas,
      resultados,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Erro ao enviar alertas por responsável.",
      },
      { status: 500 }
    );
  }
}

type Action = {
  id: string;
  occurrence_id: string;
  description: string;
  status: string;
  due_date: string | null;
  effectiveness_result: string | null;
  responsible_role: string | null;
  responsible_name: string | null;
  responsible_user_id: string | null;
  created_at: string | null;
  completed_at: string | null;
  occurrences: {
    occurrence_number: string;
    status: string;
  } | null;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  is_active: boolean;
};

function diasAtePrazo(dueDate: string | null) {
  if (!dueDate) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const prazo = new Date(dueDate);
  prazo.setHours(0, 0, 0, 0);

  return Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function formatarData(data: string | null) {
  if (!data) return "-";

  return new Date(data).toLocaleDateString("pt-BR");
}
function classificarAcao(acao: Action) {
  const dias = diasAtePrazo(acao.due_date);

  if (acao.status === "concluida") {
    if (!acao.effectiveness_result || acao.effectiveness_result === "pendente") {
      return "eficacia_pendente";
    }

    return "concluida";
  }

  if (dias === null) return "sem_prazo";
  if (dias < 0) return "atrasada";
  if (dias <= 2) return "vencendo";

  return "no_prazo";
}

function montarLinkOcorrencia(occurrenceId: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return `${baseUrl}/ocorrencias/${occurrenceId}`;
}

function gerarLinhaAcao(acao: Action, tipo: string) {
  const dias = diasAtePrazo(acao.due_date);

  const prazoTexto =
    dias === null
      ? "Sem prazo"
      : dias < 0
      ? `${Math.abs(dias)} dia(s) em atraso`
      : dias === 0
      ? "vence hoje"
      : `vence em ${dias} dia(s)`;

  return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${acao.occurrences?.occurrence_number || "RNC"}</strong><br />
        <span style="font-size: 12px; color: #6b7280;">${tipo}</span>
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${acao.description || "-"}
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${acao.responsible_name || acao.responsible_role || "-"}
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${formatarData(acao.due_date)}<br />
        <span style="font-size: 12px; color: #6b7280;">${prazoTexto}</span>
      </td>

      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <a href="${montarLinkOcorrencia(acao.occurrence_id)}" style="color: #1d4ed8; font-weight: bold;">
          Abrir RNC
        </a>
      </td>
    </tr>
  `;
}

function montarTabela(titulo: string, acoes: Action[], tipo: string) {
  if (acoes.length === 0) return "";

  return `
    <h3 style="margin-top: 28px; color: #111827;">${titulo}</h3>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background: #f9fafb;">
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">RNC</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Ação</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Responsável</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Prazo</th>
          <th align="left" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Link</th>
        </tr>
      </thead>

      <tbody>
        ${acoes.map((acao) => gerarLinhaAcao(acao, tipo)).join("")}
      </tbody>
    </table>
  `;
}
function montarHtmlEmail({
  atrasadas,
  vencendo,
  eficaciaPendente,
}: {
  atrasadas: Action[];
  vencendo: Action[];
  eficaciaPendente: Action[];
}) {
  const totalAlertas =
    atrasadas.length + vencendo.length + eficaciaPendente.length;

  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0;">SGQ New Way — Alertas de RNC</h2>
        <p style="margin: 8px 0 0; color: #6b7280;">
          Resumo automático de ações críticas do sistema de qualidade.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="border: 1px solid #fecaca; background: #fef2f2; padding: 16px; border-radius: 10px;">
          <p style="margin: 0; font-size: 12px; color: #991b1b; font-weight: bold;">ATRASADAS</p>
          <p style="margin: 6px 0 0; font-size: 28px; font-weight: bold; color: #991b1b;">${atrasadas.length}</p>
        </div>

        <div style="border: 1px solid #fde68a; background: #fffbeb; padding: 16px; border-radius: 10px;">
          <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: bold;">VENCENDO</p>
          <p style="margin: 6px 0 0; font-size: 28px; font-weight: bold; color: #92400e;">${vencendo.length}</p>
        </div>

        <div style="border: 1px solid #bfdbfe; background: #eff6ff; padding: 16px; border-radius: 10px;">
          <p style="margin: 0; font-size: 12px; color: #1e40af; font-weight: bold;">EFICÁCIA PENDENTE</p>
          <p style="margin: 6px 0 0; font-size: 28px; font-weight: bold; color: #1e40af;">${eficaciaPendente.length}</p>
        </div>
      </div>

      ${
        totalAlertas === 0
          ? `
            <div style="border: 1px solid #bbf7d0; background: #f0fdf4; padding: 16px; border-radius: 10px;">
              <p style="margin: 0; color: #166534; font-weight: bold;">
                Nenhuma ação crítica encontrada no momento.
              </p>
            </div>
          `
          : ""
      }

      ${montarTabela("Ações atrasadas", atrasadas, "Atrasada")}
      ${montarTabela("Ações vencendo em até 2 dias", vencendo, "Vencendo")}
      ${montarTabela("Ações aguardando verificação de eficácia", eficaciaPendente, "Eficácia pendente")}

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">
          Este email foi gerado automaticamente pelo sistema SGQ/RNC da New Way.
        </p>
      </div>
    </div>
  `;
}

function obterDestinatarios() {
  const envTo = process.env.ALERT_EMAIL_TEST_TO;

  if (envTo) {
    return envTo
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }

  return [
    "qualidade@newwaygroup.com.br",
    "fabrica@newwaygroup.com.br",
    "desenvolvimento@newwaygroup.com.br",
    "manuel@newwaygroup.com.br",
  ];
}
export async function GET() {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY não configurada." },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada." },
        { status: 500 }
      );
    }

    const from = process.env.ALERT_EMAIL_FROM;

    if (!from) {
      return NextResponse.json(
        { ok: false, error: "ALERT_EMAIL_FROM não configurado." },
        { status: 500 }
      );
    }

    const { data: actionsData, error: actionsError } = await supabaseAdmin
      .from("corrective_actions")
      .select(`
        id,
        occurrence_id,
        description,
        status,
        due_date,
        effectiveness_result,
        responsible_role,
        responsible_name,
        responsible_user_id,
        created_at,
        completed_at,
        occurrences (
          occurrence_number,
          status
        )
      `)
      .order("due_date", { ascending: true });

    if (actionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao buscar ações: " + actionsError.message,
        },
        { status: 500 }
      );
    }

    const actions = (actionsData || []) as unknown as Action[];

    const atrasadas = actions.filter(
      (acao) => classificarAcao(acao) === "atrasada"
    );

    const vencendo = actions.filter(
      (acao) => classificarAcao(acao) === "vencendo"
    );

    const eficaciaPendente = actions.filter(
      (acao) => classificarAcao(acao) === "eficacia_pendente"
    );
    const destinatarios = obterDestinatarios();

    if (destinatarios.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nenhum destinatário configurado." },
        { status: 500 }
      );
    }

    const totalAlertas =
      atrasadas.length + vencendo.length + eficaciaPendente.length;

    const html = montarHtmlEmail({
      atrasadas,
      vencendo,
      eficaciaPendente,
    });

    const subject =
      totalAlertas > 0
        ? `SGQ New Way: ${totalAlertas} alerta(s) de qualidade`
        : "SGQ New Way: nenhum alerta crítico";

    const result = await resend.emails.send({
      from,
      to: destinatarios,
      subject,
      html,
    });

    if (result.error) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error.message,
          result,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Alertas enviados com sucesso.",
      total_alertas: totalAlertas,
      atrasadas: atrasadas.length,
      vencendo: vencendo.length,
      eficacia_pendente: eficaciaPendente.length,
      destinatarios,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Erro ao enviar alertas.",
      },
      { status: 500 }
    );
  }
}