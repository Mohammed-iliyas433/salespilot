/**
 * ============================================================================
 * STORAGE.TS - Client-Side Data Store & Activity Audit Logger
 * ============================================================================
 * 
 * PURPOSE:
 * Manages persistent storage for Leads, Proposals, and Activity Timeline Events.
 * It simulates a full database layer using LocalStorage and automatically
 * logs audit timeline events on each key lifecycle change (Intake, Proposal, Negotiation, Approval).
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Lead Data Model Interface
 * Represents an inbound sales lead registered in the system.
 */
export interface Lead {
  id: string;                                                      // Unique UUID identifier
  companyName: string;                                             // Client company name
  contactName: string;                                             // Primary stakeholder name
  email: string;                                                   // Contact email address
  userCount: number;                                               // Requested license / user seats
  intent: string;                                                  // Description of business need
  toolName: string;                                                // Selected CRM software from catalog
  status: 'intake' | 'proposal' | 'negotiation' | 'payment_pending' | 'closed' | 'rejected' | 'cancelled';
  ownerId: string;                                                 // Sales agent owner ID
  createdAt: string;                                               // ISO timestamp of creation
  updatedAt: string;                                               // ISO timestamp of last update
}

/**
 * Proposal Data Model Interface
 * Represents the commercial pricing proposal generated for a lead.
 */
export interface Proposal {
  id: string;                                                      // Unique proposal UUID
  leadId: string;                                                  // Associated lead UUID
  toolName: string;                                                // Associated CRM product
  basePrice: number;                                               // List price per user/mo
  discountPercent: number;                                         // Applied discount %
  finalPrice: number;                                              // Net price after discount
  terms: string;                                                   // Commercial terms and notes
  status: 'sent' | 'negotiation' | 'accepted' | 'rejected';        // Proposal lifecycle state
  negotiationHistory: any[];                                       // Transcript of negotiation chat turns
  ownerId: string;                                                 // Sales agent owner ID
  createdAt: string;                                               // Creation timestamp
  updatedAt: string;                                               // Last revision timestamp
}

/**
 * ActivityEvent Data Model Interface
 * Represents an event item displayed on the Activity Timeline & Audit Feed.
 */
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

// LocalStorage Storage Keys
const LEADS_KEY = 'sales_pilot_leads';
const PROPOSALS_KEY = 'sales_pilot_proposals';
const ACTIVITIES_KEY = 'sales_pilot_activities';

export const storage = {
  /**
   * FUNCTION: getLeads
   * PURPOSE: Retrieves all saved leads from LocalStorage.
   * RETURNS: Array of `Lead` objects (or empty array `[]` if none found).
   */
  getLeads: (): Lead[] => {
    const data = localStorage.getItem(LEADS_KEY);
    return data ? JSON.parse(data) : [];
  },

  /**
   * FUNCTION: saveLead
   * PURPOSE:
   * Creates a new Lead with a unique UUID, attaches creation timestamps,
   * saves it to LocalStorage, and automatically emits an audit activity event.
   * 
   * PARAMETERS:
   * - lead: Lead payload without id/createdAt/updatedAt.
   * 
   * RETURNS: Newly created `Lead` object.
   */
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

    // Automatically log timeline event for lead intake
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

  /**
   * FUNCTION: updateLead
   * PURPOSE: Updates specific fields of an existing lead by UUID and updates `updatedAt`.
   * 
   * PARAMETERS:
   * - id: UUID of lead to update.
   * - updates: Partial Lead object containing updated fields.
   * 
   * RETURNS: Updated `Lead` object or `null` if lead was not found.
   */
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

  /**
   * FUNCTION: getProposals
   * PURPOSE: Retrieves all proposals stored in LocalStorage.
   * RETURNS: Array of `Proposal` objects.
   */
  getProposals: (): Proposal[] => {
    const data = localStorage.getItem(PROPOSALS_KEY);
    return data ? JSON.parse(data) : [];
  },

  /**
   * FUNCTION: saveProposal
   * PURPOSE:
   * Saves a newly generated proposal to LocalStorage with UUID and timestamps,
   * and automatically logs a 'proposal_generated' activity event.
   * 
   * PARAMETERS:
   * - proposal: Proposal fields without id/createdAt/updatedAt.
   * 
   * RETURNS: Newly created `Proposal` object.
   */
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

    // Look up lead company name for activity feed enrichment
    const leads = storage.getLeads();
    const lead = leads.find(l => l.id === newProposal.leadId);
    const company = lead?.companyName || "Direct Client";

    // Automatically log timeline event for proposal generation
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

  /**
   * FUNCTION: updateProposal
   * PURPOSE: Updates an existing proposal (e.g. status changes, discounts, negotiation chat history).
   * 
   * PARAMETERS:
   * - id: UUID of proposal to update.
   * - updates: Partial Proposal object.
   * 
   * RETURNS: Updated `Proposal` object or `null` if not found.
   */
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

  /**
   * FUNCTION: getActivities
   * PURPOSE:
   * Retrieves all chronological timeline activities from LocalStorage.
   * If empty, automatically seeds initial timeline events from existing leads and proposals.
   * 
   * RETURNS: Sorted array of `ActivityEvent` (latest first).
   */
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

  /**
   * FUNCTION: logActivity
   * PURPOSE:
   * Prepends a new activity event to the timeline and retains up to 100 recent entries.
   * 
   * PARAMETERS:
   * - activity: ActivityEvent payload (excluding id and timestamp).
   * 
   * RETURNS: Created `ActivityEvent` with generated UUID and timestamp.
   */
  logActivity: (activity: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent => {
    const activities = storage.getActivities();
    const newActivity: ActivityEvent = {
      ...activity,
      id: uuidv4(),
      timestamp: new Date().toISOString()
    };
    // Add to beginning of array (latest first)
    activities.unshift(newActivity);
    // Keep last 100 activities for performance
    const trimmed = activities.slice(0, 100);
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(trimmed));
    return newActivity;
  },

  /**
   * FUNCTION: clearActivities
   * PURPOSE: Clears all activity records from LocalStorage.
   */
  clearActivities: (): void => {
    localStorage.removeItem(ACTIVITIES_KEY);
  }
};
