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

@Injectable()
export class ErpClient {
  private readonly baseUrl = process.env.ERP_BASE_URL ?? 'http://localhost:4000';
  private readonly token = process.env.ERP_API_TOKEN ?? 'erp-dev-7f3a9c21';

  async createOrder(order: ErpOrder): Promise<{ id: string; externalId: string }> {
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify(order),
    });
    if (!res.ok) throw new Error(`ERP respondeu ${res.status}`);
    return res.json();
  }
}
