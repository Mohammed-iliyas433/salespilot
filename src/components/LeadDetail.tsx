import React, { useState, useEffect } from "react";
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
  XCircle
} from "lucide-react";
import { generateProposal, negotiateProposal } from "../lib/gemini";
import { storage } from "../lib/storage";

export default function LeadDetail({ leadId, onBack }: { leadId: string, onBack: () => void }) {
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
        // Sort docs by createdAt in memory
        const docs = [...proposals].sort((a, b) => {
          const aTime = new Date(a.createdAt).getTime();
          const bTime = new Date(b.createdAt).getTime();
          return aTime - bTime;
        });

        // Latest proposal
        const latest = docs[docs.length - 1];
        setProposal(latest);
        setNegotiationHistory(latest.negotiationHistory || []);
        
        // Aggregate past history from previous proposals
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

  const handleAbortDeal = async () => {
    setIsActing(true);
    try {
      storage.updateLead(leadId, { status: 'rejected' });
      
      if (proposal?.id) {
        storage.updateProposal(proposal.id, { status: 'rejected' });
      }

      onBack();
    } catch (error) {
      console.error("TERMINATION_FAILURE:", error);
      alert("SYSTEM_RESTRICED: An error occurred while aborting the deal.");
    } finally {
      setIsActing(false);
    }
  };

  const handleApproveDeal = async () => {
    setIsActing(true);
    try {
      if (proposal?.id) {
        storage.updateProposal(proposal.id, { status: 'accepted' });
      }
      storage.updateLead(leadId, { status: 'payment_pending' });
    } catch (error) {
      console.error("ACCEPT_FAILURE:", error);
      alert("SYSTEM_RESTRICED: An error occurred while approving the deal.");
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
              SALESPILOT AI: OFFICIAL INVOICE
============================================================
INVOICE_ID: INV-${proposal.id.slice(0, 8).toUpperCase()}
DATE: ${new Date().toLocaleDateString()}
DUE_DATE: ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}

BILL_TO:
Name: ${lead.contactName || "N/A"}
Entity: ${lead.companyName}
Contact: ${lead.email}

------------------------------------------------------------
DESCRIPTION                    QTY       PRICE      TOTAL
------------------------------------------------------------
${proposal.toolName} Subscription   ${lead.userCount || 1}       $${proposal.basePrice.toFixed(2)}    $${subtotal.toFixed(2)}

------------------------------------------------------------
SUBTOTAL:                                          $${subtotal.toFixed(2)}
SYSTEM_DISCOUNT (${proposal.discountPercent}%):                           -$${discountAmount.toFixed(2)}
------------------------------------------------------------
MONTHLY_NET_TOTAL:                                 $${finalMonthly.toFixed(2)}
YEARLY_COMMITMENT:                                 $${yearlyTotal.toFixed(2)}

TERMS & CONDITIONS:
- Authorized Seat Count: ${lead.userCount || 1}
- Billing Cycle: Monthly
- ${proposal.terms}

PAYMENT_STATUS: PENDING_AUTHORIZATION
GENERATED_BY: SALESPILOT_AI_SECURE_AGENT_NODE_76
============================================================
    `;
    const blob = new Blob([content.trim()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `INVOICE_${lead.companyName.toUpperCase().replace(/\s+/g, '_')}.txt`;
    a.click();
  };

  const handleFinalizeAndClose = async () => {
    setIsActing(true);
    try {
      storage.updateLead(leadId, { status: 'closed' });
      alert("MISSION_COMPLETE: Deal successfully closed and archived.");
      onBack();
    } catch (error) {
      console.error(error);
    } finally {
      setIsActing(false);
    }
  };

  const handleGenerateProposal = async () => {
    const uid = "local-operator";
    setIsActing(true);
    try {
      const data = await generateProposal(lead);
      
      storage.saveProposal({
        ...data,
        leadId,
        ownerId: uid,
        status: "sent",
        negotiationHistory: []
      });
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
    } catch (error) {
      console.error(error);
    } finally {
      setIsActing(false);
    }
  };

  if (!lead) return <div className="p-8 text-center text-gray-500">Loading lead details...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 lg:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button onClick={onBack} className="technical-label flex items-center gap-2 hover:text-brand-primary transition-colors self-start">
          <ArrowRight size={14} className="rotate-180" />
          RETURN_TO_FLOW
        </button>
        <div className="flex flex-wrap items-center gap-2 lg:gap-4">
          {(lead.status === 'proposal' || lead.status === 'negotiation') && (
            <div className="flex flex-1 sm:flex-none gap-2 w-full sm:w-auto">
              <button 
                onClick={handleApproveDeal}
                disabled={isActing || !proposal}
                className="flex-1 sm:flex-none h-10 px-4 lg:px-6 bg-emerald-500 text-white rounded font-bold uppercase tracking-widest text-[9px] lg:text-[10px] hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 glow-indigo disabled:opacity-50"
              >
                {isActing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Approve_Deal
              </button>
              <button 
                onClick={handleAbortDeal}
                disabled={isActing}
                className="flex-1 sm:flex-none h-10 px-4 lg:px-6 border border-red-500/30 text-red-400 rounded font-bold uppercase tracking-widest text-[9px] lg:text-[10px] hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isActing ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Abort_Deal
              </button>
            </div>
          )}
          {proposal && (
            <button 
              onClick={handleDownloadInvoice}
              className="h-10 px-4 lg:px-6 border border-brand-border rounded font-bold uppercase tracking-widest text-[9px] lg:text-[10px] hover:bg-brand-card transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Download size={14} />
              Invoice
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Info */}
        <div className="space-y-4 lg:space-y-6">
          <div className="glass-card p-4 lg:p-6 text-center sm:text-left">
            <h2 className="text-xl lg:text-2xl font-bold mb-1 truncate">{lead.companyName}</h2>
            <p className="text-gray-500 text-xs mb-6 truncate">{lead.contactName} &bull; {lead.email}</p>
            
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 text-left">
              <InfoItem label="Intent" value={lead.intent || "N/A"} />
              <InfoItem label="Users" value={lead.userCount || "—"} />
              <div className="col-span-2 lg:col-span-1">
                <InfoItem label="Status" value={<span className={`font-bold border-b-2 ${lead.status === 'rejected' ? 'border-red-500 text-red-400' : 'border-brand-primary'}`}>{lead.status.toUpperCase()}</span>} />
              </div>
            </div>
          </div>

          {lead.status === 'rejected' && (
            <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl text-center space-y-2">
              <XCircle size={32} className="text-red-500 mx-auto" />
              <h3 className="text-xs font-bold text-red-500 uppercase tracking-widest">Deal_Aborted</h3>
              <p className="text-[10px] text-red-400 font-mono italic opacity-70">This operation has been terminated and moved to archives.</p>
            </div>
          )}

          {lead.status === 'payment_pending' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card overflow-hidden border-emerald-500/30"
            >
              <div className="bg-emerald-500/10 px-6 py-4 border-b border-emerald-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CreditCard size={18} />
                  <span className="font-bold uppercase tracking-widest text-xs">Secure_Payment_Gateway</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-emerald-500/70">AUTHORIZED_NODE</span>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="technical-label">Billing_Entity</p>
                        <p className="text-sm font-bold text-brand-zinc-100">{lead.companyName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="technical-label">Service_Allocation</p>
                        <p className="text-sm text-brand-zinc-500">{proposal?.toolName} &times; {lead.userCount} Nodes</p>
                      </div>
                    </div>
                    
                    <div className="bg-brand-bg/80 border border-brand-border p-4 rounded-lg flex flex-col items-center justify-center min-w-0">
                      <p className="technical-label mb-1">Total_Payable</p>
                      <p className="text-2xl sm:text-3xl font-mono font-bold text-emerald-600 whitespace-nowrap">${proposal?.finalPrice}</p>
                      <p className="text-[10px] text-brand-zinc-400 mt-2">DUE_UPON_RECEIPT</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-brand-sidebar/50 border border-brand-border rounded flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-6 shrink-0 bg-brand-bg rounded border border-brand-border flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-orange-500/50" />
                        <div className="w-4 h-4 rounded-full bg-red-500/50 -ml-2" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-brand-zinc-100 uppercase tracking-wider truncate">Corporate_Vault_Mastercard</p>
                        <p className="text-[10px] font-mono text-brand-zinc-500">**** **** **** 8842</p>
                      </div>
                    </div>
                    <span className="text-[8px] font-mono bg-zinc-800/10 border border-zinc-800/10 px-2 py-1 rounded text-zinc-500 uppercase shrink-0">Default</span>
                  </div>
                </div>

                <button 
                  onClick={handleFinalizeAndClose}
                  disabled={isActing}
                  className="w-full h-12 bg-emerald-500 text-white rounded font-bold uppercase tracking-widest text-xs hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 glow-indigo disabled:opacity-50"
                >
                  {isActing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                  Execute_Final_Charge
                </button>
                
                <p className="text-[9px] text-center text-brand-zinc-500 font-mono italic">
                  By clicking Execute_Final_Charge, you authorize SalesPilot AI to initiate a transfer of ${proposal?.finalPrice} from the linked corporate account.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column: Agents */}
        <div className="lg:col-span-2 space-y-6">
          {lead.status === 'intake' && (
            <div className="glass-card p-8 lg:p-12 text-center space-y-6">
              <div className="w-16 h-16 lg:w-20 lg:h-20 bg-brand-sidebar rounded-full flex items-center justify-center mx-auto text-brand-primary">
                <FileBadge size={32} lg:size={40} />
              </div>
              <div>
                <h3 className="text-lg lg:text-xl font-bold uppercase tracking-tight">Proposal_Generation</h3>
                <p className="text-gray-500 max-w-sm mx-auto mt-2 text-xs lg:text-sm">Ready to synthesize custom model based on extracted metadata.</p>
              </div>
              <button 
                onClick={handleGenerateProposal}
                disabled={isActing}
                className="w-full sm:w-auto h-12 px-10 bg-brand-primary text-white rounded font-bold uppercase tracking-widest text-[10px] lg:text-xs hover:opacity-90 transition-all flex items-center justify-center gap-3 mx-auto glow-indigo"
              >
                {isActing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Invoke_Agent
              </button>
            </div>
          )}

          {(proposal || pastHistory.length > 0) && (
            <div className="space-y-6">
              {/* Proposal Summary */}
              {proposal && (
                <div className="glass-card overflow-hidden">
                  <div className="bg-brand-sidebar px-6 py-4 border-b border-brand-border flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                      <FileBadge size={16} />
                      Current Proposal
                    </h3>
                    <span className="text-xs font-mono uppercase bg-white px-2 py-1 rounded border border-brand-border">ID: {proposal.id.slice(0, 8)}</span>
                  </div>
                  <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 text-center">
                    <div className="border-b sm:border-b-0 sm:border-r border-brand-border pb-4 sm:pb-0">
                      <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest mb-1">Base Price</p>
                      <p className="text-lg md:text-xl font-bold">${proposal.basePrice}</p>
                    </div>
                    <div className="border-b sm:border-b-0 sm:border-r border-brand-border pb-4 sm:pb-0">
                      <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest mb-1">Discount</p>
                      <p className="text-lg md:text-xl font-bold text-green-600">{proposal.discountPercent}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest mb-1">Final Price</p>
                      <p className="text-lg md:text-xl font-bold">${proposal.finalPrice}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Negotiation Agent */}
              <div className="glass-card flex flex-col h-[400px] lg:h-[500px]">
                <div className="px-4 lg:px-6 py-4 border-b border-brand-border font-bold flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs lg:text-sm">
                    <MessageCircle size={14} lg:size={16} />
                    Negotiation History
                  </div>
                  <div className="text-[8px] lg:text-[10px] font-mono text-brand-zinc-500">ENCRYPTION: AES-256</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 font-mono text-[10px] lg:text-xs">
                  {[...pastHistory, ...negotiationHistory].map((chat, i) => (
                    <div key={i} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] sm:max-w-[80%] px-3 lg:px-4 py-2 lg:py-3 rounded ${
                        chat.role === 'user' 
                          ? 'bg-brand-primary/10 border border-brand-primary/20 text-brand-primary' 
                          : 'bg-brand-card border border-brand-border text-brand-zinc-400'
                      }`}>
                        <p className="opacity-50 text-[8px] lg:text-[10px] mb-1 leading-none">{chat.role === 'user' ? 'YOU' : 'AGENT'}</p>
                        {chat.content}
                      </div>
                    </div>
                  ))}
                  {isActing && (
                    <div className="flex justify-start">
                      <div className="text-brand-primary animate-pulse italic text-[10px]">
                        // AGENT_PROCESSING...
                      </div>
                    </div>
                  )}
                </div>
                {lead.status !== 'payment_pending' && lead.status !== 'rejected' && lead.status !== 'closed' && (
                  <div className="p-3 lg:p-4 border-t border-brand-border bg-brand-bg/50 space-y-3 lg:space-y-4">
                    {agentActionTrigger && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-wrap justify-center gap-2"
                      >
                        {agentActionTrigger === 'cancel' && (
                          <button 
                            onClick={() => {
                              handleNegotiate("Confirm Cancellation");
                              setAgentActionTrigger(null);
                            }}
                            className="flex-1 sm:flex-none px-4 lg:px-6 py-2 bg-red-500 text-white rounded font-bold uppercase tracking-widest text-[9px] lg:text-[10px] hover:opacity-90 transition-all flex items-center justify-center gap-2"
                          >
                            <XCircle size={14} />
                            Cancellation
                          </button>
                        )}
                        {agentActionTrigger === 'approve' && (
                          <button 
                            onClick={() => {
                              handleNegotiate("Confirm Approval");
                              setAgentActionTrigger(null);
                            }}
                            className="flex-1 sm:flex-none px-4 lg:px-6 py-2 bg-emerald-500 text-white rounded font-bold uppercase tracking-widest text-[9px] lg:text-[10px] hover:opacity-90 transition-all flex items-center justify-center gap-2"
                          >
                            <CheckCircle size={14} />
                            Acceptance
                          </button>
                        )}
                      </motion.div>
                    )}
                    <div className="relative">
                      <input 
                        className="w-full h-10 lg:h-12 pl-4 pr-12 bg-brand-sidebar/50 border border-brand-border rounded font-mono text-[10px] lg:text-xs text-brand-zinc-100 focus:outline-none focus:border-brand-primary placeholder:text-brand-zinc-600"
                        placeholder="Type message..."
                        value={userMsg}
                        onChange={(e) => setUserMsg(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNegotiate()}
                        disabled={isActing}
                      />
                      <button 
                        onClick={() => handleNegotiate()}
                        disabled={isActing || !userMsg.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-brand-primary disabled:opacity-30"
                      >
                        <ArrowRight size={18} lg:size={20} />
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

function InfoItem({ label, value }: { label: string, value: any }) {
  return (
    <div className="space-y-1">
      <p className="technical-label">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
