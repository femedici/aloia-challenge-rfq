import { Injectable } from '@nestjs/common';

export interface ErpOrderLine {
  lineNumber: number;
  partNumber: string;
  quantity: number;
  unit: string;
  unitPrice: string;
}

export interface ErpOrder {
  externalId: string;
  customerCode: string;
  currency: 'USD';
  lines: ErpOrderLine[];
}

export interface ErpOrderReceipt {
  id: string;
  externalId: string;
}

export class ErpHttpError extends Error {
  constructor(readonly status: number, reason: string, readonly retryAfterMs?: number) {
    super(`ERP ${status}: ${reason}`);
  }
}

@Injectable()
export class ErpClient {
  private readonly baseUrl = process.env.ERP_BASE_URL ?? 'http://localhost:4000';
  private readonly token = process.env.ERP_API_TOKEN ?? 'erp-dev-7f3a9c21';

  async createOrder(order: ErpOrder): Promise<ErpOrderReceipt> {
    const body = await this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
    return this.receipt(body, order.externalId);
  }

  async findOrders(externalId: string): Promise<ErpOrderReceipt[]> {
    const body = await this.request(`/orders?externalId=${encodeURIComponent(externalId)}`);
    if (!Array.isArray(body?.orders)) throw new Error('ERP invalid order response');
    return body.orders.map((order: unknown) => this.receipt(order, externalId));
  }

  private receipt(value: unknown, externalId: string): ErpOrderReceipt {
    if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' ||
      !value.id.trim() || !('externalId' in value) || value.externalId !== externalId) {
      throw new Error('ERP invalid order response');
    }
    return { id: value.id, externalId: value.externalId };
  }

  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const details = Array.isArray(body?.details) ? body.details.filter((value: unknown) => typeof value === 'string') : [];
        const reason = [typeof body?.error === 'string' ? body.error : 'request rejected', ...details]
          .join('; ').replaceAll(this.token, '[redacted]').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 550);
        const retryAfter = res.headers.get('retry-after');
        const delay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : Date.parse(retryAfter ?? '') - Date.now();
        throw new ErpHttpError(res.status, reason, Number.isFinite(delay) ? Math.max(0, delay) : undefined);
      }
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
