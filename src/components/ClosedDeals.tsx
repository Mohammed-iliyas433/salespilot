import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  FileText,
  BadgeDollarSign,
  Briefcase,
  Download
} from "lucide-react";
import { storage } from "../lib/storage";

export default function ClosedDeals() {
  const [closedLeads, setClosedLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClosedDeals = () => {
      const allLeads = storage.getLeads();
      const filteredLeads = allLeads.filter(l => ["closed", "rejected"].includes(l.status));
      
      const allProposals = storage.getProposals();
      
      const leadsWithProposals = filteredLeads.map(lead => {
        const proposal = allProposals.find(p => p.leadId === lead.id);
        return { ...lead, proposal };
      });

      setClosedLeads(leadsWithProposals);
      setLoading(false);
    };

    fetchClosedDeals();
    const interval = setInterval(fetchClosedDeals, 2000);
    return () => clearInterval(interval);
  }, []);

  const downloadInvoice = (lead: any, proposal: any) => {
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

PAYMENT_STATUS: PAID_AND_ARCHIVED
GENERATED_BY: SALESPILOT_AI_SECURE_AGENT_NODE_76
============================================================
    `;
    const blob = new Blob([content.trim()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `INVOICE_ARCHIVE_${lead.companyName.toUpperCase().replace(/\s+/g, '_')}.txt`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-base md:text-lg font-bold uppercase tracking-widest text-brand-zinc-100 flex items-center gap-3">
          <BadgeDollarSign size={18} md:size={20} className="text-brand-primary" />
          Invoice_Archive
        </h3>
        <div className="technical-label opacity-40 text-[9px] md:text-[10px]">Financial_Records_Vault</div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] md:text-xs text-left font-mono min-w-[800px] md:min-w-[900px]">
            <thead className="bg-brand-card/50 text-brand-zinc-500 font-bold uppercase tracking-widest border-b border-brand-border">
              <tr>
                <th className="px-4 md:px-6 py-3 md:py-4 truncate max-w-[100px]">Entity_ID</th>
                <th className="px-4 md:px-6 py-3 md:py-4">Client_Metadata</th>
                <th className="px-4 md:px-6 py-3 md:py-4">Deployed_Solution</th>
                <th className="px-4 md:px-6 py-3 md:py-4">Financial_Output</th>
                <th className="px-4 md:px-6 py-3 md:py-4">Terminal_Status</th>
                <th className="px-4 md:px-6 py-3 md:py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {loading ? (
                <tr>
                   <td colSpan={6} className="px-6 py-12 text-center text-brand-zinc-500 italic">Querying archive database...</td>
                </tr>
              ) : closedLeads.length === 0 ? (
                <tr>
                   <td colSpan={6} className="px-6 py-12 text-center text-brand-zinc-500 italic text-[10px] md:text-xs">No historical records found in this sector.</td>
                </tr>
              ) : (
                closedLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-brand-primary/5 transition-colors group">
                    <td className="px-4 md:px-6 py-3 md:py-4 text-brand-zinc-500">
                      {lead.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <div className="font-bold text-brand-zinc-100 mb-0.5 truncate max-w-[150px] md:max-w-none">{lead.companyName}</div>
                      <div className="text-[9px] md:text-[10px] text-brand-zinc-500 truncate max-w-[150px] md:max-w-none">{lead.contactName || "N/A"}</div>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <div className="text-brand-primary font-bold">{lead.toolName || "Generic_Unit"}</div>
                      <div className="text-[9px] md:text-[10px] text-brand-zinc-500">{lead.userCount} Seats Deployed</div>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {lead.proposal ? (
                        <>
                          <div className="font-bold">$ {lead.proposal.finalPrice.toFixed(2)} / mo</div>
                          <div className="text-[9px] md:text-[10px] text-emerald-500">DISCOUNT: {lead.proposal.discountPercent}%</div>
                        </>
                      ) : (
                        <div className="text-brand-zinc-500 italic shadow-sm">NO_FINANCIAL_LOG</div>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${
                        lead.status === 'closed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {lead.status === 'closed' ? 'SUCCESS' : 'ABORTED'}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {lead.status === 'closed' && lead.proposal && (
                        <button 
                          onClick={() => downloadInvoice(lead, lead.proposal)}
                          className="p-1.5 md:p-2 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded transition-all"
                          title="Download Invoice"
                        >
                          <Download size={12} md:size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
