import type { RfqListOptions, RfqSortField } from './api';

export type RfqListState = Required<RfqListOptions> & { page: number };
export type RfqFilters = Pick<RfqListState, 'customer' | 'rfq' | 'status'>;
export type RfqListAction = { type: 'filter'; filters: RfqFilters }
  | { type: 'sort'; field: RfqSortField }
  | { type: 'page'; page: number };

export const initialRfqListState: RfqListState = {
  page: 1, customer: '', rfq: '', status: '', sortBy: 'createdAt', sortDirection: 'desc',
};

export function rfqListReducer(state: RfqListState, action: RfqListAction): RfqListState {
  switch (action.type) {
    case 'filter':
      return { ...state, ...action.filters, customer: action.filters.customer.trim(), rfq: action.filters.rfq.trim(), page: 1 };
    case 'sort':
      return { ...state, sortBy: action.field, sortDirection: state.sortBy === action.field && state.sortDirection === 'asc' ? 'desc' : 'asc', page: 1 };
    case 'page':
      return { ...state, page: action.page };
  }
}
