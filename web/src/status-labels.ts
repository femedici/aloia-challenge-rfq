import type { Submission } from './api';

export const quotationLabels: Record<string, string> = {
  OPEN: 'Aberta — sem cotação', IN_PROGRESS: 'Em cotação', READY: 'Pronta para envio',
  CLOSED: 'Encerrada — sem cotação', INVALID: 'Sem itens válidos',
};

export const quotationDescriptions: Record<string, string> = {
  OPEN: 'Todos os itens válidos aguardam cotação. Isso não indica envio ao ERP.',
  IN_PROGRESS: 'Parte dos itens foi tratada e ainda existem itens pendentes.',
  READY: 'Não há itens pendentes e pelo menos um foi cotado. A cotação pode ser enviada ao ERP.',
  CLOSED: 'Não há itens pendentes nem cotados. Não há cotação para enviar.',
  INVALID: 'Nenhum item é válido para cotação.',
};

export const submissionLabels: Record<Submission['status'], string> = {
  not_sent: 'Não enviado', pending: 'Aguardando envio', sending: 'Enviando ao ERP',
  retry_wait: 'Nova tentativa agendada', reconciling: 'Confirmando recebimento',
  sent: 'Enviado com sucesso', failed: 'Falha definitiva',
};

export function rfqStatusLabel(status: string, submissionStatus: Submission['status']): string {
  if (submissionStatus === 'sent') return 'Cotação enviada ao ERP';
  if (submissionStatus !== 'not_sent') return submissionLabels[submissionStatus];
  return quotationLabels[status] ?? status;
}
