export type AdminStep = 
  | 'WAITING_FOR_FILE'
  | 'WAITING_FOR_PRICE'
  | 'WAITING_FOR_NAME'
  | 'WAITING_FOR_DESCRIPTION'
  | 'WAITING_FOR_EDIT_NAME'
  | 'WAITING_FOR_EDIT_DESC'
  | 'WAITING_FOR_EDIT_PRICE'
  | 'WAITING_FOR_REPLACE_FILE';

export interface AdminState {
  step: AdminStep;
  payload: Record<string, any>;
}
