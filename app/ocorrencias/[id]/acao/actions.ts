
import { supabase } from '@/lib/supabase'

// 🔹 Criar ação
export async function criarAcao(data: {
  occurrence_id: string
  action_type: 'contencao' | 'corretiva' | 'preventiva'
  description: string
  responsible_role: string
  due_date: string
}) {
  const { error } = await supabase.from('corrective_actions').insert({
    occurrence_id: data.occurrence_id,
    action_type: data.action_type,
    description: data.description,
    responsible_role: data.responsible_role,
    due_date: data.due_date,
    status: 'pendente',
  })

  if (error) {
    console.error(error)
    throw new Error('Erro ao criar ação')
  }
}

// 🔹 Listar ações da ocorrência
export async function listarAcoes(occurrence_id: string) {
  const { data, error } = await supabase
    .from('corrective_actions')
    .select('*')
    .eq('occurrence_id', occurrence_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    throw new Error('Erro ao listar ações')
  }

  return data
}

// 🔹 Atualizar ação
export async function atualizarAcao(data: {
  id: string
  description: string
  responsible_role: string
  due_date: string
}) {
  const { error } = await supabase
    .from('corrective_actions')
    .update({
      description: data.description,
      responsible_role: data.responsible_role,
      due_date: data.due_date,
    })
    .eq('id', data.id)

  if (error) {
    console.error(error)
    throw new Error('Erro ao atualizar ação')
  }
}

// 🔹 Concluir ação
export async function concluirAcao(data: {
  id: string
  completion_description: string
  evidence_description: string
}) {
  const { error } = await supabase
    .from('corrective_actions')
    .update({
      status: 'concluida',
      completion_description: data.completion_description,
      evidence_description: data.evidence_description,
      completed_at: new Date().toISOString(),
    })
    .eq('id', data.id)

  if (error) {
    console.error(error)
    throw new Error('Erro ao concluir ação')
  }
}

// 🔹 Cancelar ação
export async function cancelarAcao(id: string) {
  const { error } = await supabase
    .from('corrective_actions')
    .update({
      status: 'cancelada',
    })
    .eq('id', id)

  if (error) {
    console.error(error)
    throw new Error('Erro ao cancelar ação')
  }
}