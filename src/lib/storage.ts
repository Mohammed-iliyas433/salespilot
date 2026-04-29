import { v4 as uuidv4 } from 'uuid';

export interface Lead {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  userCount: number;
  intent: string;
  toolName: string;
  status: 'intake' | 'proposal' | 'negotiation' | 'payment_pending' | 'closed' | 'rejected' | 'cancelled';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  leadId: string;
  toolName: string;
  basePrice: number;
  discountPercent: number;
  finalPrice: number;
  terms: string;
  status: 'sent' | 'negotiation' | 'accepted' | 'rejected';
  negotiationHistory: any[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

const LEADS_KEY = 'sales_pilot_leads';
const PROPOSALS_KEY = 'sales_pilot_proposals';

export const storage = {
  getLeads: (): Lead[] => {
    const data = localStorage.getItem(LEADS_KEY);
    return data ? JSON.parse(data) : [];
  },
  
  saveLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Lead => {
    const leads = storage.getLeads();
    const newLead: Lead = {
      ...lead,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    leads.push(newLead);
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
    return newLead;
  },

  updateLead: (id: string, updates: Partial<Lead>): Lead | null => {
    const leads = storage.getLeads();
    const index = leads.findIndex(l => l.id === id);
    if (index === -1) return null;
    
    leads[index] = { 
      ...leads[index], 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
    return leads[index];
  },

  getProposals: (): Proposal[] => {
    const data = localStorage.getItem(PROPOSALS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveProposal: (proposal: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>): Proposal => {
    const proposals = storage.getProposals();
    const newProposal: Proposal = {
      ...proposal,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    proposals.push(newProposal);
    localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals));
    return newProposal;
  },

  updateProposal: (id: string, updates: Partial<Proposal>): Proposal | null => {
    const proposals = storage.getProposals();
    const index = proposals.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    proposals[index] = { 
      ...proposals[index], 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals));
    return proposals[index];
  }
};
