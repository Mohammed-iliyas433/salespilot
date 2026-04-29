import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Plus, 
  Upload, 
  Search, 
  ArrowRight,
  Loader2,
  FileText,
  Users,
  MessageSquare,
  Check
} from "lucide-react";
import toolsDb from "../lib/tools-db.json";
import { extractLeadInfo, generateProposal } from "../lib/gemini";
import { storage } from "../lib/storage";

export default function Dashboard({ onSelectLead }: { onSelectLead: (id: string) => void }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const getUserId = () => "local-operator";

  useEffect(() => {
    const fetchLeads = () => {
      const data = storage.getLeads();
      setLeads(data);
      setLoadingLeads(false);
    };
    
    fetchLeads();
    
    // Simple polling for "mock" real-time updates from other parts of the app
    const interval = setInterval(fetchLeads, 2000);
    return () => clearInterval(interval);
  }, []);

  const [pendingIntake, setPendingIntake] = useState<any>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const executeIntakeAndProposal = async (data: any) => {
    const uid = getUserId();
    try {
      setProcessingStep("Registering Lead...");
      const newLead = storage.saveLead({
        ...data,
        status: "intake",
        ownerId: uid
      });

      setProcessingStep("Architecting Proposal...");
      const proposalData = await generateProposal({ ...data, id: newLead.id });

      if (proposalData.error) {
        throw new Error(proposalData.error);
      }

      setProcessingStep("Finalizing Deployment...");
      storage.saveProposal({
        ...proposalData,
        leadId: newLead.id,
        ownerId: uid,
        status: "negotiation",
        negotiationHistory: []
      });

      storage.updateLead(newLead.id, {
        status: "proposal"
      });

      // Refresh list
      setLeads(storage.getLeads());
      
      setPendingIntake(null);
      setAwaitingConfirmation(false);
      setInputText("");
      setProcessingStep("");
    } catch (error: any) {
      console.error("Critical failure in intake flow:", error);
      alert("Intake Protocol Failed: " + (error.message || "Unknown error"));
      setProcessingStep("");
    }
  };

  const processIntakeResult = async (result: any, isFollowUp = false) => {
    if (result.error) {
      alert(result.error);
      return;
    }
    
    if (!result.toolFound && result.isComplete) {
      alert(`ACCESS_DENIED: SalesPilot does not currently provide service for the requested tool. Authorized catalog: ${toolsDb.map(t => t.name).join(", ")}`);
      return;
    }

    if (!result.isComplete) {
      setPendingIntake(result);
      setInputText("");
      return;
    }

    // If we reach here, it's complete
    if (isFollowUp || pendingIntake) {
      setPendingIntake(result); // Update with final data
      setAwaitingConfirmation(true);
      setInputText("");
    } else {
      await executeIntakeAndProposal(result.data);
    }
  };

  const handleLeadAndProposalFlow = async (text: string, filePart?: { mimeType: string, data: string }, isFollowUp = false) => {
    setIsProcessing(true);
    setProcessingStep("Analyzing Input...");
    try {
      const result = await extractLeadInfo(text, filePart);
      await processIntakeResult(result, isFollowUp);
    } catch (error) {
      console.error("Extraction failure:", error);
      alert("System Error: Failed to process intake protocol.");
    } finally {
      setIsProcessing(false);
      if (!pendingIntake && !awaitingConfirmation) {
        setProcessingStep("");
      }
    }
  };

  const handleFollowUp = async () => {
    if (!inputText.trim() || !pendingIntake) return;
    const combinedText = `Previous Context: ${JSON.stringify(pendingIntake.data)}\nFollow-up Answer: ${inputText}`;
    await handleLeadAndProposalFlow(combinedText, undefined, true);
  };

  const handleTextIntake = async () => {
    if (!inputText.trim()) return;
    await handleLeadAndProposalFlow(inputText);
  };

  const handleConfirmIntake = async () => {
    if (!pendingIntake) return;
    setIsProcessing(true);
    try {
      await executeIntakeAndProposal(pendingIntake.data);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setIsProcessing(true);
    try {
      if (selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const response = await fetch("/api/docx-to-text", {
          method: "POST",
          body: formData
        });
        
        if (!response.ok) throw new Error("Server failed to parse DOCX");
        
        const parseResult = await response.json();
        await handleLeadAndProposalFlow(inputText + "\n" + (parseResult.text || ""));
      } else if (selectedFile.type === "application/pdf") {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const response = await fetch("/api/pdf-to-text", {
          method: "POST",
          body: formData
        });

        if (!response.ok) throw new Error("Server failed to parse PDF");

        const parseResult = await response.json();
        await handleLeadAndProposalFlow(inputText + "\n" + (parseResult.text || ""));
      } else if (selectedFile.type.startsWith("image/")) {
        const base64 = await fileToBase64(selectedFile);
        await handleLeadAndProposalFlow(inputText, { mimeType: selectedFile.type, data: base64 });
      } else {
        const text = await selectedFile.text();
        await handleLeadAndProposalFlow(inputText + "\n" + text);
      }
    } catch (error: any) {
      console.error("File upload error:", error);
      alert(error.message || "Failed to process uploaded file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLeads = leads
    .filter(l => viewMode === 'active' ? (l.status !== 'closed' && l.status !== 'rejected' && l.status !== 'cancelled') : (l.status === 'closed' || l.status === 'rejected' || l.status === 'cancelled'))
    .filter(l => 
      l.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      l.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard 
          title="Total Leads" 
          value={leads.length} 
          change="+12%" 
        />
        <StatCard 
          title="Active Proposals" 
          value={leads.filter(l => l.status !== 'closed' && l.status !== 'rejected' && l.status !== 'cancelled').length} 
          change="+5%" 
          onClick={() => setViewMode('active')}
        />
        <StatCard 
          title="Closed Deals" 
          value={leads.filter(l => l.status === 'closed').length} 
          change="+8%" 
          onClick={() => setViewMode('archived')}
        />
        <StatCard 
          title="Cancelled Deals" 
          value={leads.filter(l => l.status === 'rejected' || l.status === 'cancelled').length} 
          change="-3%" 
          onClick={() => setViewMode('archived')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Intake Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <h3 className="text-base md:text-lg font-bold">
                {awaitingConfirmation ? "Confirm Deployment Info" : pendingIntake ? "Clarification Required" : "Intake Lead"}
              </h3>
              {(pendingIntake || awaitingConfirmation) && (
                <button 
                  onClick={() => {
                    setPendingIntake(null);
                    setAwaitingConfirmation(false);
                  }}
                  className="text-[9px] md:text-[10px] font-bold text-brand-zinc-500 hover:text-brand-primary uppercase tracking-widest text-left sm:text-right"
                >
                  // Reset_Intake
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              {awaitingConfirmation && pendingIntake && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-brand-bg border border-brand-border rounded font-mono text-[9px] md:text-[10px]">
                      <div>
                        <p className="text-brand-primary/60 mb-1 uppercase tracking-tighter">Entity_Name</p>
                        <p className="font-bold">{pendingIntake.data.companyName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-brand-primary/60 mb-1 uppercase tracking-tighter">Contact_Officer</p>
                        <p className="font-bold">{pendingIntake.data.contactName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-brand-primary/60 mb-1 uppercase tracking-tighter">Tool_Allocation</p>
                        <p className="text-brand-primary font-bold">{pendingIntake.data.toolName}</p>
                      </div>
                      <div>
                        <p className="text-brand-primary/60 mb-1 uppercase tracking-tighter">Seat_Count</p>
                        <p className="font-bold">{pendingIntake.data.userCount}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-brand-primary/60 mb-1 uppercase tracking-tighter">Primary_Endpoint</p>
                        <p className="font-bold truncate">{pendingIntake.data.email}</p>
                      </div>
                    </div>
                  <p className="text-[10px] md:text-xs font-bold text-brand-zinc-300 px-1">All requirements gathered. Are you OK to proceed with this deployment?</p>
                </div>
              )}

              {!awaitingConfirmation && pendingIntake && (
                <div className="space-y-4">
                  <div className="p-3 md:p-4 bg-brand-primary/10 border border-brand-primary/30 rounded font-mono text-[10px] md:text-xs text-brand-primary">
                    <p className="opacity-70 mb-1 font-bold">// PARTIAL_DATA_EXTRACTED:</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-[8px] md:text-[10px] opacity-80">
                      <div>Company: {pendingIntake.data?.companyName || "???"}</div>
                      <div>Contact: {pendingIntake.data?.contactName || "???"}</div>
                      <div>Email: {pendingIntake.data?.email || "???"}</div>
                      <div>Users: {pendingIntake.data?.userCount || "???"}</div>
                      <div>Tool: {pendingIntake.data?.toolName || "???"}</div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-brand-primary/20 animate-pulse">
                      <p className="opacity-70 mb-1">// AGENT_FOLLOWUP:</p>
                      {pendingIntake.followUpPrompt}
                    </div>
                  </div>
                </div>
              )}
              
              {!awaitingConfirmation && (
                <textarea 
                  className="w-full h-32 p-4 bg-brand-sidebar/50 border border-brand-border rounded font-mono text-[10px] md:text-xs text-brand-zinc-100 focus:outline-none focus:border-brand-primary resize-none placeholder:text-brand-zinc-600 shadow-inner"
                  placeholder={pendingIntake ? "Provide missing details here..." : "Paste an email, chat transcript, or type notes about a new lead..."}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              )}
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-2">
                   {!pendingIntake && !awaitingConfirmation && (
                     <label className="flex-1 sm:flex-none cursor-pointer h-10 md:h-12 px-4 md:px-6 bg-transparent border border-brand-primary/50 text-indigo-400 rounded font-bold uppercase tracking-widest text-[10px] md:text-[11px] flex items-center justify-center gap-2 hover:bg-brand-primary/10 hover:border-brand-primary transition-all">
                      <Upload size={14} />
                      <span className="truncate">Upload_Doc</span>
                      <input type="file" className="hidden" accept=".pdf,.docx,.txt,image/*" onChange={handleFileUpload} />
                    </label>
                   )}
                </div>
                <button 
                  onClick={awaitingConfirmation ? handleConfirmIntake : pendingIntake ? handleFollowUp : handleTextIntake}
                  disabled={isProcessing || (!awaitingConfirmation && !inputText.trim())}
                  className={`h-10 md:h-12 px-6 md:px-8 rounded font-bold uppercase tracking-widest text-[10px] md:text-[11px] flex items-center justify-center gap-2 transition-all glow-indigo disabled:opacity-30 disabled:cursor-not-allowed min-w-[140px] ${
                    awaitingConfirmation ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-brand-primary text-white hover:bg-brand-primary/90"
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-[8px] animate-pulse">{processingStep || "Wait..."}</span>
                    </div>
                  ) : (
                    <>
                      {awaitingConfirmation ? <Check size={14} /> : pendingIntake ? <ArrowRight size={14} /> : <Plus size={14} />}
                      {awaitingConfirmation ? "Authorize" : pendingIntake ? "Submit" : "Execute_Intake"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="p-4 md:p-6 border-b border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setViewMode('active')}
                  className={`text-base md:text-lg font-bold transition-all ${viewMode === 'active' ? 'text-brand-primary underline decoration-brand-primary decoration-4 underline-offset-8 font-extrabold' : 'text-brand-zinc-500 hover:text-brand-primary/70'}`}
                >
                  Recent Leads
                </button>
                <button 
                  onClick={() => setViewMode('archived')}
                  className={`text-base md:text-lg font-bold transition-all ${viewMode === 'archived' ? 'text-brand-primary underline decoration-brand-primary decoration-4 underline-offset-8 font-extrabold' : 'text-brand-zinc-500 hover:text-brand-primary/70'}`}
                >
                  Archive
                </button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  className="h-9 w-full pl-9 pr-4 bg-brand-sidebar border border-brand-border rounded-lg text-sm focus:outline-none"
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm text-left">
                <thead className="bg-brand-sidebar text-gray-500 font-medium">
                  <tr>
                    <th className="px-6 py-3 min-w-[120px]">Company</th>
                    <th className="px-6 py-3 min-w-[200px]">Contact</th>
                    <th className="px-6 py-3 min-w-[100px]">Status</th>
                    <th className="px-6 py-3 min-w-[60px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {loadingLeads ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-400 italic">Loading leads...</td>
                    </tr>
                  ) : filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-400 italic">
                        {searchQuery ? "No matching leads found." : viewMode === 'active' ? "No active leads found." : "No archived deals found."}
                      </td>
                    </tr>
                  ) : (
                    filteredLeads
                      .map((lead) => (
                        <tr key={lead.id} className="hover:bg-brand-sidebar/50 transition-colors group">
                          <td className="px-6 py-4 font-medium truncate">{lead.companyName || "Unknown"}</td>
                          <td className="px-6 py-4">
                            <p className="font-bold">{lead.contactName || "—"}</p>
                            <p className="text-[11px] text-gray-500 truncate">{lead.email}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap border ${getStatusStyle(lead.status)}`}>
                              {lead.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => onSelectLead(lead.id)}
                              className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-brand-border text-brand-primary"
                            >
                              <ArrowRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="space-y-6">
          <div className="glass-card p-4 md:p-6">
            <h3 className="text-base md:text-lg font-bold mb-4">Live Activity</h3>
            <div className="space-y-4">
              <ActivityItem icon={<Users size={14} />} text="New lead extracted from email" time="2m ago" />
              <ActivityItem icon={<FileText size={14} />} text="Proposal generated for Acme Corp" time="15m ago" />
              <ActivityItem icon={<MessageSquare size={14} />} text="Negotiation started with Spark Inc" time="1h ago" />
              <ActivityItem icon={<Users size={14} />} text="Contact updated for Global Tech" time="3h ago" />
            </div>
            <button className="w-full mt-6 py-2 text-xs font-medium text-gray-500 hover:text-brand-primary transition-colors">
              View all history
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

 function StatCard({ title, value, change, onClick }: { title: string, value: string | number, change: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`glass-card p-4 lg:p-6 overflow-hidden relative transition-all ${onClick ? 'cursor-pointer hover:border-brand-primary/50 group' : ''}`}
    >
      <div className="absolute -right-4 -top-4 w-16 h-16 bg-brand-primary/5 rounded-full blur-xl group-hover:bg-brand-primary/10"></div>
      <p className="technical-label mb-2 text-[8px] lg:text-[10px] group-hover:text-brand-primary transition-colors">{title}</p>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1">
        <h4 className="text-xl lg:text-3xl font-bold font-mono tracking-tighter leading-none">{value}</h4>
        <span className={`text-[8px] lg:text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded self-start sm:self-auto ${change.includes('+') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-brand-zinc-500/20 text-brand-zinc-400'}`}>
          {change}
        </span>
      </div>
    </div>
  );
}

function ActivityItem({ icon, text, time }: { icon: React.ReactNode, text: string, time: string }) {
  return (
    <div className="flex gap-4 group">
      <div className="w-10 h-10 rounded border border-brand-border bg-brand-bg flex items-center justify-center shrink-0 group-hover:border-brand-primary/50 transition-colors">
        <span className="text-brand-primary">{icon}</span>
      </div>
      <div>
        <p className="text-sm font-bold text-brand-zinc-100 leading-tight mb-1">{text}</p>
        <p className="text-[10px] font-mono text-brand-zinc-500 uppercase">{time} // LOG_EVENT</p>
      </div>
    </div>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'intake': return 'bg-blue-600/10 text-blue-700 border border-blue-600/20';
    case 'proposal': return 'bg-amber-600/10 text-amber-700 border border-amber-600/20';
    case 'negotiation': return 'bg-purple-600/10 text-purple-700 border border-purple-600/20';
    case 'payment_pending': return 'bg-orange-600/10 text-orange-700 border border-orange-600/20';
    case 'closed': return 'bg-emerald-600/10 text-emerald-700 border border-emerald-600/20';
    case 'rejected':
    case 'cancelled': 
      return 'bg-red-600/10 text-red-700 border border-red-600/20';
    default: return 'bg-zinc-600/10 text-zinc-700 border border-zinc-600/20';
  }
}
