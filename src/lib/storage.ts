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

export interface ActivityEvent {
  id: string;
  leadId?: string;
  proposalId?: string;
  companyName: string;
  contactName?: string;
  toolName?: string;
  type: 'lead_intake' | 'proposal_generated' | 'negotiation_message' | 'deal_approved' | 'deal_aborted' | 'payment_completed' | 'invoice_downloaded';
  title: string;
  description: string;
  timestamp: string;
  userCount?: number;
  finalPrice?: number;
  discountPercent?: number;
}

const LEADS_KEY = 'sales_pilot_leads';
const PROPOSALS_KEY = 'sales_pilot_proposals';
const ACTIVITIES_KEY = 'sales_pilot_activities';

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

    // Automatically log activity
    storage.logActivity({
      leadId: newLead.id,
      companyName: newLead.companyName,
      contactName: newLead.contactName,
      toolName: newLead.toolName,
      type: 'lead_intake',
      title: `New Lead Intake: ${newLead.companyName}`,
      description: `Registered lead for ${newLead.toolName || 'CRM'} (${newLead.userCount || 1} seats). ${newLead.intent || ''}`,
      userCount: newLead.userCount
    });

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

    // Look up lead company name
    const leads = storage.getLeads();
    const lead = leads.find(l => l.id === newProposal.leadId);
    const company = lead?.companyName || "Direct Client";

    // Automatically log activity
    storage.logActivity({
      leadId: newProposal.leadId,
      proposalId: newProposal.id,
      companyName: company,
      toolName: newProposal.toolName,
      type: 'proposal_generated',
      title: `Proposal Generated for ${company}`,
      description: `Synthesized initial terms for ${newProposal.toolName} at $${newProposal.finalPrice}/mo with ${newProposal.discountPercent}% discount.`,
      finalPrice: newProposal.finalPrice,
      discountPercent: newProposal.discountPercent
    });

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
  },

  getActivities: (): ActivityEvent[] => {
    const data = localStorage.getItem(ACTIVITIES_KEY);
    if (data) {
      return JSON.parse(data);
    }
    // Seed initial activities from existing leads & proposals if empty
    const leads = storage.getLeads();
    const proposals = storage.getProposals();
    const initialActivities: ActivityEvent[] = [];

    leads.forEach((l) => {
      initialActivities.push({
        id: uuidv4(),
        leadId: l.id,
        companyName: l.companyName,
        contactName: l.contactName,
        toolName: l.toolName,
        type: 'lead_intake',
        title: `Lead Registered: ${l.companyName}`,
        description: `Intake processed for ${l.toolName || 'CRM'} (${l.userCount} seats). ${l.intent || ''}`,
        timestamp: l.createdAt || new Date().toISOString(),
        userCount: l.userCount
      });
    });

    proposals.forEach((p) => {
      const lead = leads.find(l => l.id === p.leadId);
      const company = lead?.companyName || "Client Org";
      initialActivities.push({
        id: uuidv4(),
        leadId: p.leadId,
        proposalId: p.id,
        companyName: company,
        toolName: p.toolName,
        type: p.status === 'accepted' ? 'deal_approved' : p.status === 'rejected' ? 'deal_aborted' : 'proposal_generated',
        title: p.status === 'accepted' ? `Deal Approved: ${company}` : p.status === 'rejected' ? `Deal Aborted: ${company}` : `Proposal Synthesized: ${company}`,
        description: `${p.toolName} proposal priced at $${p.finalPrice}/mo (${p.discountPercent}% discount). Status: ${p.status}.`,
        timestamp: p.updatedAt || p.createdAt || new Date().toISOString(),
        finalPrice: p.finalPrice,
        discountPercent: p.discountPercent
      });
    });

    // Sort descending (latest first)
    initialActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (initialActivities.length > 0) {
      localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(initialActivities));
    }
    return initialActivities;
  },

  logActivity: (activity: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent => {
    const activities = storage.getActivities();
    const newActivity: ActivityEvent = {
      ...activity,
      id: uuidv4(),
      timestamp: new Date().toISOString()
    };
    // Add to beginning of array
    activities.unshift(newActivity);
    // Keep last 100 activities
    const trimmed = activities.slice(0, 100);
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(trimmed));
    return newActivity;
  },

  clearActivities: (): void => {
    localStorage.removeItem(ACTIVITIES_KEY);
  }
};
