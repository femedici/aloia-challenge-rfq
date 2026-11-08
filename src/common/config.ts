export function validateConfig(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of ['DATABASE_URL', 'ERP_BASE_URL', 'ERP_API_TOKEN', 'INTERNAL_API_KEY', 'WEBHOOK_SECRET']) {
    if (!env[name]?.trim()) throw new Error(`${name} é obrigatório`);
  }
  for (const [name, protocols] of [
    ['DATABASE_URL', ['postgres:', 'postgresql:']],
    ['ERP_BASE_URL', ['http:', 'https:']],
  ] as const) {
    let url: URL;
    try { url = new URL(env[name]!); } catch { throw new Error(`${name} deve ser uma URL válida`); }
    if (!(protocols as readonly string[]).includes(url.protocol) || !url.hostname) {
      throw new Error(`${name} possui protocolo ou host inválido`);
    }
  }
  const port = env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535');
  }
}
