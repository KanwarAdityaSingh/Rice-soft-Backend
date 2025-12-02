// Junction table models for Purchase relationships

export interface PurchaseSauda {
  id: string;
  purchase_id: string;
  sauda_id: string;
  created_at: Date;
}

export interface PurchaseInwardSlipPass {
  id: string;
  purchase_id: string;
  inward_slip_pass_id: string;
  created_at: Date;
}

export interface PurchaseLot {
  id: string;
  purchase_id: string;
  lot_id: string;
  created_at: Date;
}

export interface InwardSlipPassSauda {
  id: string;
  inward_slip_pass_id: string;
  sauda_id: string;
  created_at: Date;
}

