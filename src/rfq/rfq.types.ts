export interface RfqCreatedEvent {
  eventId: string;
  type: 'rfq.created';
  occurredAt: string;
  data: {
    rfqId: string;
    customer: { code: string; name: string };
    items: {
      lineNumber: number;
      partNumber: string;
      description?: string;
      quantity: number;
      unit: string;
      requiredBy?: string;
    }[];
  };
}

export interface RfqCanceledEvent {
  eventId: string;
  type: 'rfq.item_canceled';
  occurredAt: string;
  data: { rfqId: string; lineNumber: number; reason: string };
}

export type RfqEvent = RfqCreatedEvent | RfqCanceledEvent;

export interface QuoteInput {
  supplier: string;
  currency: string;
  unitCost: string;
  moq: number;
  freight?: string;
  otherCharges?: string;
  customs?: string;
  marginPercent: string;
}
