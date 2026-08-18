import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { 
  Send, 
  CheckCircle, 
  MessageCircle, 
  CreditCard, 
  Loader2,
  FileBadge,
  Download,
  ArrowRight,
  X
} from "lucide-react";
import { generateProposal, negotiateProposal } from "../lib/groq";
import { storage } from "../lib/storage";
import { useAlert } from "../lib/AlertContext";
import { StatusBadge } from "./Dashboard";

export default function LeadDetail({ leadId, onBack }: { leadId: string, onBack: () => void }) {
  const { showAlert, showError } = useAlert();
  const [lead, setLead] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [negotiationHistory, setNegotiationHistory] = useState<any[]>([]);
  const [pastHistory, setPastHistory] = useState<any[]>([]);
  const [userMsg, setUserMsg] = useState("");
  const [isActing, setIsActing] = useState(false);
  const [agentActionTrigger, setAgentActionTrigger] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = () => {
      const leads = storage.getLeads();
      const currentLead = leads.find(l => l.id === leadId);
      if (currentLead) setLead(currentLead);

      const proposals = storage.getProposals().filter(p => p.leadId === leadId);
      if (proposals.length > 0) {
        const docs = [...proposals].sort((a, b) => {
          const aTime = new Date(a.createdAt).getTime();
          const bTime = new Date(b.createdAt).getTime();
          return aTime - bTime;
        });

        const latest = docs[docs.length - 1];
        setProposal(latest);
        setNegotiationHistory(latest.negotiationHistory || []);
        
        const past = docs.slice(0, -1).reduce((acc: any[], p) => {
          return [...acc, ...(p.negotiationHistory || [])];
        }, []);
        setPastHistory(past);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [leadId]);

  const displayHistory = useMemo(() => {
    const combined = [...pastHistory, ...negotiationHistory];
    if (combined.length > 0) return combined;

    if (proposal) {
      const log: { role: string; content: string }[] = [];

      log.push({
        role: "user",
        content: lead?.intent 
          ? lead.intent 
          : `Inquiry submitted for ${proposal.toolName} (${lead?.userCount || 1} team seats) on behalf of ${lead?.companyName || "Direct Client"}.`
      });

      log.push({
        role: "agent",
        content: `Official terms proposal generated for ${proposal.toolName} (${lead?.userCount || 1} seats) at $${proposal.basePrice}/seat/mo with an authorized ${proposal.discountPercent}% discount, bringing the net monthly total to $${proposal.finalPrice}/month. ${proposal.terms || ""}`
      });

      if (lead?.status === "closed" || lead?.status === "payment_pending") {
        log.push({
          role: "user",
          content: "Proposal terms reviewed and approved. Proceed to billing settlement."
        });
        log.push({
          role: "agent",
          content: lead?.status === "closed"
            ? `Payment of $${proposal.finalPrice}/month authorized and confirmed. Deal closed and archived.`
            : `Deal approved at $${proposal.finalPrice}/month. Ready for payment authorization.`
        });
      } else if (lead?.status === "rejected" || lead?.status === "cancelled") {
        log.push({
          role: "user",
          content: "Terminate negotiation for this opportunity."
        });
        log.push({
          role: "agent",
          content: "Negotiation terminated. Opportunity has been cancelled and archived in system records."
        });
      }

      return log;
    }

    return [];
  }, [pastHistory, negotiationHistory, proposal, lead]);

  const handleAbortDeal = async () => {
    setIsActing(true);
    try {
      storage.updateLead(leadId, { status: 'rejected' });
      
      const currentHistory = (proposal?.negotiationHistory && proposal.negotiationHistory.length > 0)
        ? proposal.negotiationHistory
        : [
            {
              role: "user",
              content: lead?.intent || `Inquiry submitted for ${proposal?.toolName || lead?.toolName} (${lead?.userCount || 1} seats).`
            },
            {
              role: "agent",
              content: `Official terms proposal generated for ${proposal?.toolName || lead?.toolName} (${lead?.userCount || 1} seats) at $${proposal?.basePrice || 0}/seat/mo with an authorized ${proposal?.discountPercent || 0}% discount.`
            }
          ];

      const updatedHistory = [
        ...currentHistory,
        { role: "user", content: "Terminate negotiation for this opportunity." },
        { role: "agent", content: "Negotiation terminated. Opportunity has been cancelled and stored in archives." }
      ];

      if (proposal?.id) {
        storage.updateProposal(proposal.id, { 
          status: 'rejected',
          negotiationHistory: updatedHistory
        });
        setNegotiationHistory(updatedHistory);
      }

      storage.logActivity({
        leadId,
        proposalId: proposal?.id,
        companyName: lead?.companyName || "Direct Client",
        toolName: proposal?.toolName || lead?.toolName,
        type: 'deal_aborted',
        title: `Deal Terminated: ${lead?.companyName || 'Client'}`,
        description: `Negotiation ended and transaction archived.`
      });

      onBack();
    } catch (error) {
      console.error("TERMINATION_FAILURE:", error);
      showError("System Error", "An error occurred while terminating the negotiation.");
    } finally {
      setIsActing(false);
    }
  };

  const handleApproveDeal = async () => {
    setIsActing(true);
    try {
      const currentHistory = (proposal?.negotiationHistory && proposal.negotiationHistory.length > 0)
        ? proposal.negotiationHistory
        : [
            {
              role: "user",
              content: lead?.intent || `Inquiry submitted for ${proposal?.toolName || lead?.toolName} (${lead?.userCount || 1} seats).`
            },
            {
              role: "agent",
              content: `Official terms proposal generated for ${proposal?.toolName || lead?.toolName} (${lead?.userCount || 1} seats) at $${proposal?.basePrice || 0}/seat/mo with an authorized ${proposal?.discountPercent || 0}% discount ($${proposal?.finalPrice || 0}/month net).`
            }
          ];

      const updatedHistory = [
        ...currentHistory,
        { role: "user", content: "Proposal terms reviewed and approved." },
        { role: "agent", content: `Deal approved at $${proposal?.finalPrice}/month (${proposal?.discountPercent}% discount). Ready for payment authorization.` }
      ];

      if (proposal?.id) {
        storage.updateProposal(proposal.id, { 
          status: 'accepted',
          negotiationHistory: updatedHistory
        });
        setNegotiationHistory(updatedHistory);
      }
      storage.updateLead(leadId, { status: 'payment_pending' });

      storage.logActivity({
        leadId,
        proposalId: proposal?.id,
        companyName: lead?.companyName || "Direct Client",
        toolName: proposal?.toolName || lead?.toolName,
        type: 'deal_approved',
        title: `Deal Approved: ${lead?.companyName || 'Client'}`,
        description: `Authorized ${proposal?.toolName} terms at $${proposal?.finalPrice}/mo (${proposal?.discountPercent}% discount). Ready for payment.`,
        finalPrice: proposal?.finalPrice,
        discountPercent: proposal?.discountPercent
      });
    } catch (error) {
      console.error("ACCEPT_FAILURE:", error);
      showError("System Error", "An error occurred while approving the proposal.");
    } finally {
      setIsActing(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (!proposal) return;
    const subtotal = proposal.basePrice * (lead.userCount || 1);
    const discountAmount = subtotal * (proposal.discountPercent / 100);
    const finalMonthly = subtotal - discountAmount;
    const yearlyTotal = finalMonthly * 12;

    const content = `
============================================================
              SALESPILOT: OFFICIAL INVOICE
============================================================
INVOICE ID: INV-${proposal.id.slice(0, 8).toUpperCase()}
DATE: ${new Date().toLocaleDateString()}
DUE DATE: ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}

BILL TO:
Name: ${lead.contactName || "Executive"}
Entity: ${lead.companyName}
Contact: ${lead.email || "N/A"}

------------------------------------------------------------
DESCRIPTION                    QTY       PRICE      TOTAL
------------------------------------------------------------
${proposal.toolName} Subscription   ${lead.userCount || 1}       $${proposal.basePrice.toFixed(2)}    $${subtotal.toFixed(2)}

------------------------------------------------------------
SUBTOTAL:                                          $${subtotal.toFixed(2)}
DISCOUNT (${proposal.discountPercent}%):                                   -$${discountAmount.toFixed(2)}
------------------------------------------------------------
MONTHLY TOTAL:                                     $${finalMonthly.toFixed(2)}
ANNUAL TOTAL:                                      $${yearlyTotal.toFixed(2)}

TERMS & CONDITIONS:
- Team Seats: ${lead.userCount || 1}
- Billing Cycle: Monthly
- ${proposal.terms}

PAYMENT STATUS: PENDING
GENERATED BY: SALESPILOT
============================================================
    `;
    const blob = new Blob([content.trim()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `INVOICE_${lead.companyName.toUpperCase().replace(/\s+/g, '_')}.txt`;
    a.click();

    storage.logActivity({
      leadId,
      proposalId: proposal.id,
      companyName: lead.companyName,
      toolName: proposal.toolName,
      type: 'invoice_downloaded',
      title: `Invoice Generated: ${lead.companyName}`,
      description: `Official invoice INV-${proposal.id.slice(0, 8).toUpperCase()} downloaded for $${finalMonthly.toFixed(2)}/mo ($${yearlyTotal.toFixed(2)}/yr).`,
      finalPrice: finalMonthly
    });
  };

  const handleFinalizeAndClose = async () => {
    setIsActing(true);
    try {
      const currentHistory = (proposal?.negotiationHistory && proposal.negotiationHistory.length > 0)
        ? proposal.negotiationHistory
        : [
            {
              role: "user",
              content: lead?.intent || `Inquiry submitted for ${proposal?.toolName || lead?.toolName} (${lead?.userCount || 1} seats).`
            },
            {
              role: "agent",
              content: `Official terms proposal generated for ${proposal?.toolName || lead?.toolName} (${lead?.userCount || 1} seats) at $${proposal?.basePrice || 0}/seat/mo with an authorized ${proposal?.discountPercent || 0}% discount ($${proposal?.finalPrice || 0}/month net).`
            },
            {
              role: "user",
              content: "Proposal terms reviewed and approved."
            },
            {
              role: "agent",
              content: `Deal approved at $${proposal?.finalPrice}/month.`
            }
          ];

      const updatedHistory = [
        ...currentHistory,
        { role: "user", content: "Authorized and completed payment settlement." },
        { role: "agent", content: `Payment of $${proposal?.finalPrice}/month successfully processed. Transaction settled and archived.` }
      ];

      if (proposal?.id) {
        storage.updateProposal(proposal.id, { 
          status: 'accepted',
          negotiationHistory: updatedHistory
        });
        setNegotiationHistory(updatedHistory);
      }

      storage.updateLead(leadId, { status: 'closed' });

      storage.logActivity({
        leadId,
        proposalId: proposal?.id,
        companyName: lead?.companyName || "Direct Client",
        toolName: proposal?.toolName || lead?.toolName,
        type: 'payment_completed',
        title: `Deal Settled & Paid: ${lead?.companyName || 'Client'}`,
        description: `Successfully executed charge of $${proposal?.finalPrice}/mo for ${proposal?.toolName}.`,
        finalPrice: proposal?.finalPrice
      });

      showAlert({
        type: "success",
        title: "Settlement Completed",
        badge: "Completed",
        subtitle: `${lead?.companyName || "Direct Client"} • ${proposal?.toolName || lead?.toolName}`,
        message: "Payment successfully authorized and processed. The deal has been archived.",
        confirmText: "Acknowledge",
        onConfirm: () => {
          onBack();
        }
      });
    } catch (error) {
      console.error(error);
      showError("Execution Error", "Failed to finalize and close transaction.");
    } finally {
      setIsActing(false);
    }
  };

  const handleGenerateProposal = async () => {
    const uid = "local-operator";
    setIsActing(true);
    try {
      const data = await generateProposal(lead);
      if (data.error) {
        showError("Proposal Generation Failed", data.error);
        return;
      }
      
      const initialHistory = [
        {
          role: "user",
          content: lead?.intent || `Inquiry submitted for ${data.toolName} (${lead?.userCount || 1} seats).`
        },
        {
          role: "agent",
          content: `Official terms proposal generated for ${data.toolName} (${lead?.userCount || 1} seats) at $${data.basePrice}/seat/mo with an authorized ${data.discountPercent}% discount ($${data.finalPrice}/month net).`
        }
      ];

      storage.saveProposal({
        basePrice: data.basePrice,
        discountPercent: data.discountPercent,
        finalPrice: data.finalPrice,
        terms: data.terms,
        toolName: data.toolName,
        leadId,
        ownerId: uid,
        status: "sent",
        negotiationHistory: initialHistory
      });
      setNegotiationHistory(initialHistory);
      storage.updateLead(leadId, { status: "proposal" });
    } catch (error) {
      console.error(error);
    } finally {
      setIsActing(false);
    }
  };

  const handleNegotiate = async (overrideMsg?: string) => {
    const msgToProcess = overrideMsg || userMsg;
    if (!msgToProcess.trim()) return;
    setIsActing(true);
    setAgentActionTrigger(null);
    const newHistory = [...negotiationHistory, { role: "user", content: msgToProcess }];
    setNegotiationHistory(newHistory);
    if (!overrideMsg) setUserMsg("");

    try {
      const result = await negotiateProposal(proposal, msgToProcess, [...pastHistory, ...newHistory]);
      
      const updatedHistory = [...newHistory, { role: "agent", content: result.message }];
      setAgentActionTrigger(result.actionTrigger);
      
      if (result.status === 'accepted') {
        storage.updateProposal(proposal.id, {
          status: 'accepted',
          negotiationHistory: updatedHistory,
          discountPercent: result.newDiscountPercent,
          finalPrice: result.newFinalPrice
        });
        storage.updateLead(leadId, { status: "payment_pending" });
      } else if (result.status === 'rejected') {
        storage.updateProposal(proposal.id, {
          status: 'rejected',
          negotiationHistory: updatedHistory
        });
        storage.updateLead(leadId, { status: "rejected" });
      } else {
        storage.updateProposal(proposal.id, {
          discountPercent: result.newDiscountPercent,
          finalPrice: result.newFinalPrice,
          negotiationHistory: updatedHistory,
          status: 'sent'
        });
        storage.updateLead(leadId, { status: "negotiation" });
      }

      storage.logActivity({
        leadId,
        proposalId: proposal.id,
        companyName: lead.companyName,
        toolName: proposal.toolName,
        type: 'negotiation_message',
        title: `Negotiation Counter: ${lead.companyName}`,
        description: `Counter-offer: ${result.newDiscountPercent}% discount ($${result.newFinalPrice}/mo).`,
        finalPrice: result.newFinalPrice,
        discountPercent: result.newDiscountPercent
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsActing(false);
    }
  };

  if (!lead) return <div className="p-12 text-center text-[#6B6862] text-xs">Loading inquiry details...</div>;

  return (
    <div className="space-y-8">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button 
          onClick={onBack} 
          className="inline-flex items-center gap-2 text-xs text-[#6B6862] hover:text-[#0E0D0C] transition-colors cursor-pointer self-start"
        >
          <ArrowRight size={14} className="rotate-180" strokeWidth={1.5} />
          <span>Back to Inquiries</span>
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {(lead.status === 'proposal' || lead.status === 'negotiation') && (
            <>
              <button 
                onClick={handleApproveDeal}
                disabled={isActing || !proposal}
                className="h-9 px-5 rounded-lg text-xs font-medium border border-[#C9B183] bg-[#0E0D0C] text-[#C9B183] hover:bg-[#1A1917] transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                {isActing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} strokeWidth={1.5} />}
                <span>Approve Proposal</span>
              </button>
              <button 
                onClick={handleAbortDeal}
                disabled={isActing}
                className="h-9 px-5 rounded-lg text-xs font-medium border border-[#E5E4E1] bg-transparent text-[#4A4640] hover:text-[#0E0D0C] hover:border-[#0E0D0C]/30 transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                {isActing ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={1.5} />}
                <span>Cancel Deal</span>
              </button>
            </>
          )}

          {proposal && (
            <button 
              onClick={handleDownloadInvoice}
              className="h-9 px-4 border border-[#E5E4E1] bg-transparent text-[#6B6862] hover:text-[#0E0D0C] hover:border-[#0E0D0C]/30 rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={13} strokeWidth={1.5} />
              <span>Download Invoice</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Lead Info & Settlement */}
        <div className="space-y-6">
          <div className="luxury-card p-6 space-y-6">
            <div>
              <span className="eyebrow-label block mb-1">Corporate Client</span>
              <h2 className="font-serif text-2xl text-[#0E0D0C] font-normal leading-tight">{lead.companyName}</h2>
              <p className="text-xs text-[#6B6862] mt-1">{lead.contactName}{lead.email ? ` • ${lead.email}` : ''}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-4 border-t border-[#E5E4E1] text-xs">
              <div>
                <span className="eyebrow-label block mb-1">Business Requirement</span>
                <p className="text-[#0E0D0C]">{lead.intent || "Standard inquiries"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="eyebrow-label block mb-1">Selected Product</span>
                  <p className="font-medium text-[#C9B183]">{lead.toolName || "Software license"}</p>
                </div>
                <div>
                  <span className="eyebrow-label block mb-1">Team Seats</span>
                  <p className="font-medium text-[#0E0D0C]">{lead.userCount || 1} Seats</p>
                </div>
              </div>
              <div>
                <span className="eyebrow-label block mb-1">Current Lifecycle Status</span>
                <div className="mt-1">
                  <StatusBadge status={lead.status} />
                </div>
              </div>
            </div>
          </div>

          {lead.status === 'rejected' && (
            <div className="p-6 bg-[#EDEBE7] border border-[#E5E4E1] rounded-xl text-center space-y-1.5">
              <span className="eyebrow-label text-[#4A4640]">Archived Record</span>
              <h4 className="font-serif text-base text-[#4A4640] font-normal">Negotiation Cancelled</h4>
              <p className="text-xs text-[#6B6862]">This opportunity has been discontinued and stored in historical archives.</p>
            </div>
          )}

          {lead.status === 'payment_pending' && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="luxury-card p-6 space-y-5 border-[#C9B183]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E4E1]">
                <div className="flex items-center gap-2 text-[#0E0D0C]">
                  <CreditCard size={16} strokeWidth={1.5} />
                  <span className="font-medium text-xs">Settlement Authorization</span>
                </div>
                <span className="text-[10px] text-[#8A7442] font-medium bg-[#F7F1E2] px-2 py-0.5 rounded-full border border-[#8A7442]/20">
                  Approved
                </span>
              </div>
              
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-[#FFFFFF] border border-[#E5E4E1] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="eyebrow-label block mb-0.5">Total Payable</span>
                    <span className="font-serif text-2xl text-[#0E0D0C] font-normal">${proposal?.finalPrice}</span>
                    <span className="text-[11px] text-[#6B6862] block mt-0.5">Monthly billing</span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-[#C9B183] font-medium block">{proposal?.discountPercent}% Discount</span>
                    <span className="text-[#6B6862] text-[11px]">Authorized rate</span>
                  </div>
                </div>

                <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E4E1] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-5 rounded border border-[#E5E4E1] bg-[#F5F4F2] flex items-center justify-center text-[9px] font-medium text-[#6B6862]">
                      CARD
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[#0E0D0C]">Executive Mastercard</p>
                      <p className="text-[11px] text-[#6B6862]">Ending in 8842</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#6B6862]">Default</span>
                </div>

                <button 
                  onClick={handleFinalizeAndClose}
                  disabled={isActing}
                  className="w-full h-11 border border-[#C9B183] bg-[#0E0D0C] text-[#C9B183] hover:bg-[#1A1917] rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  {isActing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} strokeWidth={1.5} />}
                  <span>Authorize & Complete Payment</span>
                </button>
                
                <p className="text-[10px] text-center text-[#6B6862] leading-normal">
                  Authorizes immediate payment settlement via designated credit facility.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column: Proposal & Negotiation */}
        <div className="lg:col-span-2 space-y-6">
          {lead.status === 'intake' && (
            <div className="luxury-card p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border border-[#E5E4E1] bg-[#FFFFFF] flex items-center justify-center mx-auto text-[#6B6862]">
                <FileBadge size={22} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-serif text-xl text-[#0E0D0C] font-normal">Generate Terms Proposal</h3>
                <p className="text-xs text-[#6B6862] max-w-sm mx-auto mt-1.5 leading-relaxed">
                  Synthesize an executive pricing proposal aligned with catalog limits and required team seats.
                </p>
              </div>
              <button 
                onClick={handleGenerateProposal}
                disabled={isActing}
                className="h-10 px-6 border border-[#C9B183] bg-[#0E0D0C] text-[#C9B183] hover:bg-[#1A1917] rounded-lg text-xs font-medium transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-40"
              >
                {isActing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={1.5} />}
                <span>Generate Proposal</span>
              </button>
            </div>
          )}

          {(proposal || pastHistory.length > 0) && (
            <div className="space-y-6">
              {/* Proposal Metric Strip */}
              {proposal && (
                <div className="luxury-card p-6">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E5E4E1]">
                    <div>
                      <span className="eyebrow-label block mb-0.5">Active Agreement</span>
                      <h4 className="font-serif text-base text-[#0E0D0C] font-normal">{proposal.toolName} Proposal</h4>
                    </div>
                    <span className="font-mono text-[11px] text-[#6B6862]">REF-{proposal.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
                    <div>
                      <span className="eyebrow-label block mb-1">Catalog Base Price</span>
                      <p className="font-serif text-2xl text-[#0E0D0C] font-normal">${proposal.basePrice}<span className="text-xs font-sans text-[#6B6862]">/mo</span></p>
                    </div>
                    <div>
                      <span className="eyebrow-label block mb-1">Approved Discount</span>
                      <p className="font-serif text-2xl text-[#C9B183] font-normal">{proposal.discountPercent}%</p>
                    </div>
                    <div>
                      <span className="eyebrow-label block mb-1">Net Monthly Total</span>
                      <p className="font-serif text-2xl text-[#0E0D0C] font-normal">${proposal.finalPrice}<span className="text-xs font-sans text-[#6B6862]">/mo</span></p>
                    </div>
                  </div>
                </div>
              )}

              {/* Negotiation Transcript */}
              <div className="luxury-card flex flex-col h-[460px] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E5E4E1] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={15} strokeWidth={1.5} className="text-[#6B6862]" />
                    <span className="font-serif text-base text-[#0E0D0C] font-normal">Negotiation Transcript</span>
                  </div>
                  <span className="text-[10px] text-[#6B6862]">Encrypted Session</span>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                  {displayHistory.map((chat, i) => (
                    <div key={i} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-4 py-3 rounded-xl ${
                        chat.role === 'user' 
                          ? 'bg-[#FFFFFF] border border-[#E5E4E1] text-[#0E0D0C]' 
                          : 'bg-[#FBF6E8] border border-[#E5E4E1] text-[#0E0D0C]'
                      }`}>
                        <p className="eyebrow-label text-[9px] mb-1.5">{chat.role === 'user' ? 'Client' : 'Advisory AI'}</p>
                        <p className="leading-relaxed whitespace-pre-wrap">{chat.content}</p>
                      </div>
                    </div>
                  ))}
                  {isActing && (
                    <div className="flex justify-start">
                      <div className="text-xs text-[#C9B183] italic">
                        Evaluating parameters...
                      </div>
                    </div>
                  )}
                </div>

                {lead.status !== 'payment_pending' && lead.status !== 'rejected' && lead.status !== 'closed' && (
                  <div className="p-4 border-t border-[#E5E4E1] bg-[#FFFFFF]/70 space-y-3">
                    {agentActionTrigger && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-center gap-3"
                      >
                        {agentActionTrigger === 'cancel' && (
                          <button 
                            onClick={() => {
                              handleNegotiate("Confirm Cancellation");
                              setAgentActionTrigger(null);
                            }}
                            className="px-4 py-2 bg-[#EDEBE7] border border-[#E5E4E1] text-[#4A4640] hover:text-[#0E0D0C] rounded-lg text-xs font-medium transition-all"
                          >
                            Confirm Cancellation
                          </button>
                        )}
                        {agentActionTrigger === 'approve' && (
                          <button 
                            onClick={() => {
                              handleNegotiate("Confirm Approval");
                              setAgentActionTrigger(null);
                            }}
                            className="px-4 py-2 border border-[#C9B183] bg-[#0E0D0C] text-[#C9B183] hover:bg-[#1A1917] rounded-lg text-xs font-medium transition-all"
                          >
                            Confirm Approval
                          </button>
                        )}
                      </motion.div>
                    )}

                    <div className="relative flex items-center">
                      <input 
                        className="w-full h-10 pl-4 pr-12 bg-[#FFFFFF] border border-[#E5E4E1] rounded-lg text-xs text-[#0E0D0C] placeholder:text-[#6B6862] focus:outline-none focus:border-[#C9B183] transition-colors"
                        placeholder="State counter-offer or proposal inquiries..."
                        value={userMsg}
                        onChange={(e) => setUserMsg(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNegotiate()}
                        disabled={isActing}
                      />
                      <button 
                        onClick={() => handleNegotiate()}
                        disabled={isActing || !userMsg.trim()}
                        className="absolute right-2 text-[#C9B183] hover:text-[#0E0D0C] disabled:opacity-30 p-1 cursor-pointer transition-colors"
                      >
                        <ArrowRight size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
