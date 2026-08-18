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
  Check,
  CheckCircle,
  CreditCard,
  Download,
  Clock
} from "lucide-react";
import toolsDb from "../lib/tools-db.json";
import { extractLeadInfo, generateProposal } from "../lib/groq";
import { storage, ActivityEvent } from "../lib/storage";
import { useAlert } from "../lib/AlertContext";
import ActivityTimelineModal from "./ActivityTimelineModal";

export default function Dashboard({ onSelectLead }: { onSelectLead: (id: string) => void }) {
  const { showError, showWarning } = useAlert();
  const [leads, setLeads] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");

  const getUserId = () => "local-operator";

  useEffect(() => {
    const fetchData = () => {
      const data = storage.getLeads();
      setLeads(data);
      const acts = storage.getActivities();
      setActivities(acts);
      setLoadingLeads(false);
    };
    
    fetchData();
    const interval = setInterval(fetchData, 2000);
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
      setProcessingStep("Registering lead...");
      const newLead = storage.saveLead({
        ...data,
        status: "intake",
        ownerId: uid
      });

      setProcessingStep("Synthesizing proposal...");
      const proposalData = await generateProposal({ ...data, id: newLead.id });

      if (proposalData.error) {
        throw new Error(proposalData.error);
      }

      setProcessingStep("Finalizing record...");
      storage.saveProposal({
        basePrice: proposalData.basePrice,
        discountPercent: proposalData.discountPercent,
        finalPrice: proposalData.finalPrice,
        terms: proposalData.terms,
        toolName: proposalData.toolName,
        leadId: newLead.id,
        ownerId: uid,
        status: "negotiation",
        negotiationHistory: [
          {
            role: "user",
            content: data.intent || `Inquiry submitted for ${proposalData.toolName} (${data.userCount || 1} seats) on behalf of ${data.companyName || "Direct Client"}.`
          },
          {
            role: "agent",
            content: `Official terms proposal generated for ${proposalData.toolName} (${data.userCount || 1} seats) at $${proposalData.basePrice}/seat/mo with an authorized ${proposalData.discountPercent}% discount, bringing the net monthly total to $${proposalData.finalPrice}/month.`
          }
        ]
      });

      storage.updateLead(newLead.id, {
        status: "proposal"
      });

      setLeads(storage.getLeads());
      setPendingIntake(null);
      setAwaitingConfirmation(false);
      setInputText("");
      setProcessingStep("");
    } catch (error: any) {
      console.error("Critical failure in intake flow:", error);
      showError("Intake Protocol Failed", error.message || "Unknown error occurred during intake execution.");
      setProcessingStep("");
    }
  };

  const processIntakeResult = async (result: any, isFollowUp = false) => {
    if (result.error) {
      showError("Intake Error", result.error);
      return;
    }
    
    if (!result.toolFound && result.isComplete) {
      showWarning(
        "Access Denied",
        `SalesPilot does not currently provide service for the requested tool. Authorized catalog: ${toolsDb.map(t => t.name).join(", ")}`,
        { badge: "Catalog Notice" }
      );
      return;
    }

    if (!result.isComplete) {
      setPendingIntake(result);
      setInputText("");
      return;
    }

    if (isFollowUp || pendingIntake) {
      setPendingIntake(result);
      setAwaitingConfirmation(true);
      setInputText("");
    } else {
      await executeIntakeAndProposal(result.data);
    }
  };

  const handleLeadAndProposalFlow = async (text: string, filePart?: { mimeType: string, data: string }, isFollowUp = false) => {
    setIsProcessing(true);
    setProcessingStep("Analyzing requirements...");
    try {
      const result = await extractLeadInfo(text, filePart);
      await processIntakeResult(result, isFollowUp);
    } catch (error) {
      console.error("Extraction failure:", error);
      showError("System Error", "Failed to process intake protocol. Please try again.");
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
      const fileName = selectedFile.name.toLowerCase();
      if (
        selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.endsWith(".docx")
      ) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const response = await fetch("/api/docx-to-text", {
          method: "POST",
          body: formData
        });
        
        if (!response.ok) throw new Error("Server failed to parse DOCX document");
        
        const parseResult = await response.json();
        await handleLeadAndProposalFlow(inputText + "\n" + (parseResult.text || ""));
      } else if (selectedFile.type === "application/pdf" || fileName.endsWith(".pdf")) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const response = await fetch("/api/pdf-to-text", {
          method: "POST",
          body: formData
        });
        
        if (!response.ok) throw new Error("Server failed to parse PDF document");
        
        const parseResult = await response.json();
        await handleLeadAndProposalFlow(inputText + "\n" + (parseResult.text || ""));
      } else if (selectedFile.type.startsWith("image/")) {
        const base64 = await fileToBase64(selectedFile);
        await handleLeadAndProposalFlow(
          inputText || `Uploaded image: ${selectedFile.name}`,
          { mimeType: selectedFile.type || "image/png", data: base64 }
        );
      } else {
        const text = await selectedFile.text();
        await handleLeadAndProposalFlow(inputText + "\n" + text);
      }
    } catch (error: any) {
      console.error("File upload error:", error);
      showError("File Upload Error", error.message || "Failed to process uploaded file.");
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };

  type ViewMode = 'all' | 'active' | 'closed' | 'cancelled';
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [searchQuery, setSearchQuery] = useState("");

  const activeCount = leads.filter(l => l.status !== 'closed' && l.status !== 'rejected' && l.status !== 'cancelled').length;
  const closedCount = leads.filter(l => l.status === 'closed').length;
  const cancelledCount = leads.filter(l => l.status === 'rejected' || l.status === 'cancelled').length;

  const filteredLeads = leads
    .filter(l => {
      if (viewMode === 'all') return true;
      if (viewMode === 'active') return l.status !== 'closed' && l.status !== 'rejected' && l.status !== 'cancelled';
      if (viewMode === 'closed') return l.status === 'closed';
      if (viewMode === 'cancelled') return l.status === 'rejected' || l.status === 'cancelled';
      return true;
    })
    .filter(l => 
      l.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      l.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.toolName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="space-y-10">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard 
          label="Total Inquiries" 
          value={leads.length} 
          progress={100}
          active={viewMode === 'all'}
          onClick={() => setViewMode('all')}
        />
        <StatCard 
          label="Active Proposals" 
          value={activeCount} 
          progress={leads.length ? (activeCount / leads.length) * 100 : 0}
          active={viewMode === 'active'}
          onClick={() => setViewMode('active')}
        />
        <StatCard 
          label="Closed Deals" 
          value={closedCount} 
          progress={leads.length ? (closedCount / leads.length) * 100 : 0}
          active={viewMode === 'closed'}
          onClick={() => setViewMode('closed')}
        />
        <StatCard 
          label="Cancelled Deals" 
          value={cancelledCount} 
          progress={leads.length ? (cancelledCount / leads.length) * 100 : 0}
          active={viewMode === 'cancelled'}
          onClick={() => setViewMode('cancelled')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Intake Area + Leads Table */}
        <div className="lg:col-span-2 space-y-8">
          {/* Intake Area */}
          <div className="luxury-card p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="eyebrow-label block mb-1">Inquiry Intake</span>
                <h2 className="font-serif text-xl text-[#0E0D0C] font-normal">
                  {awaitingConfirmation ? "Confirm Lead Details" : pendingIntake ? "Clarification Required" : "Register New Lead"}
                </h2>
              </div>
              {(pendingIntake || awaitingConfirmation) && (
                <button 
                  onClick={() => {
                    setPendingIntake(null);
                    setAwaitingConfirmation(false);
                  }}
                  className="text-xs text-[#6B6862] hover:text-[#0E0D0C] transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              {awaitingConfirmation && pendingIntake && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-[#FFFFFF] border border-[#E5E4E1] rounded-xl text-xs">
                    <div>
                      <span className="eyebrow-label block mb-1">Company</span>
                      <p className="font-medium text-[#0E0D0C]">{pendingIntake.data.companyName || "Direct Client"}</p>
                    </div>
                    <div>
                      <span className="eyebrow-label block mb-1">Contact</span>
                      <p className="font-medium text-[#0E0D0C]">{pendingIntake.data.contactName || "Lead Representative"}</p>
                    </div>
                    <div>
                      <span className="eyebrow-label block mb-1">Selected Product</span>
                      <p className="font-medium text-[#C9B183]">{pendingIntake.data.toolName}</p>
                    </div>
                    <div>
                      <span className="eyebrow-label block mb-1">Team Seats</span>
                      <p className="font-medium text-[#0E0D0C]">{pendingIntake.data.userCount} Seats</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="eyebrow-label block mb-1">Requirements</span>
                      <p className="font-medium text-[#6B6862] truncate">{pendingIntake.data.intent || "Standard inquiries"}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[#6B6862]">All requirements synthesized. Ready to proceed with proposal creation?</p>
                </div>
              )}

              {!awaitingConfirmation && pendingIntake && (
                <div className="space-y-4">
                  <div className="p-5 bg-[#FBF6E8] border border-[#E5E4E1] rounded-xl text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="eyebrow-label text-[#8A6E1F]">Information Required</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                      <div>
                        <span className="text-[#6B6862] block text-[11px]">Contact:</span>
                        <span className={pendingIntake.data?.contactName ? "text-[#0E0D0C] font-medium" : "text-[#8A6E1F] font-medium"}>
                          {pendingIntake.data?.contactName || "Missing"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#6B6862] block text-[11px]">Seats:</span>
                        <span className={pendingIntake.data?.userCount > 0 ? "text-[#0E0D0C] font-medium" : "text-[#8A6E1F] font-medium"}>
                          {pendingIntake.data?.userCount > 0 ? `${pendingIntake.data?.userCount} Seats` : "Missing"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#6B6862] block text-[11px]">Product:</span>
                        <span className={pendingIntake.data?.toolName ? "text-[#0E0D0C] font-medium" : "text-[#8A6E1F] font-medium"}>
                          {pendingIntake.data?.toolName || "Missing"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#6B6862] block text-[11px]">Entity:</span>
                        <span className="text-[#0E0D0C] font-medium">{pendingIntake.data?.companyName || "Direct Client"}</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-[#E5E4E1]/80">
                      <p className="text-xs text-[#0E0D0C] leading-relaxed">
                        {pendingIntake.followUpPrompt}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {!awaitingConfirmation && (
                <textarea 
                  className="w-full h-28 p-4 bg-[#FFFFFF] border border-[#E5E4E1] rounded-xl text-xs text-[#0E0D0C] focus:outline-none focus:border-[#C9B183] resize-none placeholder:text-[#6B6862] transition-colors"
                  placeholder={pendingIntake ? "Provide required clarification here..." : "Paste an executive memo, email thread, or client specification..."}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              )}
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                <div>
                   {!pendingIntake && !awaitingConfirmation && (
                     <label className="cursor-pointer h-10 px-4 bg-transparent border border-[#E5E4E1] text-[#6B6862] hover:text-[#0E0D0C] hover:border-[#0E0D0C]/30 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all">
                      <Upload size={14} strokeWidth={1.5} />
                      <span>Upload Document</span>
                      <input type="file" className="hidden" accept=".pdf,.docx,.txt,image/*" onChange={handleFileUpload} />
                    </label>
                   )}
                </div>
                <button 
                  onClick={awaitingConfirmation ? handleConfirmIntake : pendingIntake ? handleFollowUp : handleTextIntake}
                  disabled={isProcessing || (!awaitingConfirmation && !inputText.trim())}
                  className="h-10 px-6 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all border border-[#C9B183] bg-[#0E0D0C] text-[#C9B183] hover:bg-[#1A1917] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={13} className="animate-spin" />
                      <span className="text-xs">{processingStep || "Processing..."}</span>
                    </div>
                  ) : (
                    <>
                      {awaitingConfirmation ? <Check size={14} /> : pendingIntake ? <ArrowRight size={14} /> : <Plus size={14} />}
                      <span>{awaitingConfirmation ? "Confirm & Proceed" : pendingIntake ? "Submit Answer" : "Register Lead"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Recent Leads Table */}
          <div className="luxury-card overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[#E5E4E1] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-5 overflow-x-auto whitespace-nowrap pb-1 xl:pb-0">
                <button 
                  onClick={() => setViewMode('all')}
                  className={`font-serif text-sm sm:text-base transition-colors cursor-pointer pb-1 shrink-0 ${viewMode === 'all' ? 'text-[#0E0D0C] font-normal border-b-2 border-[#C9B183]' : 'text-[#6B6862] hover:text-[#0E0D0C]'}`}
                >
                  All Inquiries <span className="text-xs font-sans opacity-70">({leads.length})</span>
                </button>
                <button 
                  onClick={() => setViewMode('active')}
                  className={`font-serif text-sm sm:text-base transition-colors cursor-pointer pb-1 shrink-0 ${viewMode === 'active' ? 'text-[#0E0D0C] font-normal border-b-2 border-[#C9B183]' : 'text-[#6B6862] hover:text-[#0E0D0C]'}`}
                >
                  Active <span className="text-xs font-sans opacity-70">({activeCount})</span>
                </button>
                <button 
                  onClick={() => setViewMode('closed')}
                  className={`font-serif text-sm sm:text-base transition-colors cursor-pointer pb-1 shrink-0 ${viewMode === 'closed' ? 'text-[#0E0D0C] font-normal border-b-2 border-[#C9B183]' : 'text-[#6B6862] hover:text-[#0E0D0C]'}`}
                >
                  Closed <span className="text-xs font-sans opacity-70">({closedCount})</span>
                </button>
                <button 
                  onClick={() => setViewMode('cancelled')}
                  className={`font-serif text-sm sm:text-base transition-colors cursor-pointer pb-1 shrink-0 ${viewMode === 'cancelled' ? 'text-[#0E0D0C] font-normal border-b-2 border-[#C9B183]' : 'text-[#6B6862] hover:text-[#0E0D0C]'}`}
                >
                  Cancelled <span className="text-xs font-sans opacity-70">({cancelledCount})</span>
                </button>
              </div>
              <div className="relative w-full xl:w-56 shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6862]" />
                <input 
                  className="h-9 w-full pl-9 pr-3 bg-[#FFFFFF] border border-[#E5E4E1] rounded-lg text-xs text-[#0E0D0C] placeholder:text-[#6B6862] focus:outline-none focus:border-[#C9B183]"
                  placeholder="Filter inquiries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#FFFFFF] text-[#6B6862] font-normal border-b border-[#E5E4E1]">
                  <tr>
                    <th className="px-6 py-3.5 eyebrow-label">Company</th>
                    <th className="px-6 py-3.5 eyebrow-label">Contact</th>
                    <th className="px-6 py-3.5 eyebrow-label">Status</th>
                    <th className="px-6 py-3.5 eyebrow-label text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4E1] bg-[#FFFFFF]/50">
                  {loadingLeads ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-[#6B6862] italic">Loading records...</td>
                    </tr>
                  ) : filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-[#6B6862]">
                        {searchQuery 
                          ? "No matching inquiries found." 
                          : viewMode === 'all'
                          ? "No inquiry records registered yet."
                          : viewMode === 'active' 
                          ? "No active pipeline records." 
                          : viewMode === 'closed'
                          ? "No closed deals recorded yet."
                          : "No cancelled deals recorded yet."}
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-[#FFFFFF] transition-colors group">
                        <td className="px-6 py-4 font-medium text-[#0E0D0C]">{lead.companyName || "Direct Client"}</td>
                        <td className="px-6 py-4">
                          <p className="text-[#0E0D0C]">{lead.contactName || "Representative"}</p>
                          <p className="text-[11px] text-[#6B6862] truncate max-w-xs">{lead.toolName || lead.email || "Software evaluation"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={lead.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => onSelectLead(lead.id)}
                            className="p-1.5 text-[#C9B183] hover:text-[#0E0D0C] transition-colors"
                            title="View details"
                          >
                            <ArrowRight size={15} strokeWidth={1.5} />
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

        {/* Right Col: Live Activity Feed */}
        <div className="space-y-6">
          <div className="luxury-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <span className="eyebrow-label block mb-1">Audit Stream</span>
                <h3 className="font-serif text-lg text-[#0E0D0C] font-normal">Live Activity</h3>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(true)}
                className="text-xs text-[#C9B183] hover:underline font-normal cursor-pointer"
              >
                View all →
              </button>
            </div>

            <div className="space-y-3">
              {activities.length === 0 ? (
                <div className="p-6 text-center text-[#6B6862] text-xs">
                  No activity events recorded yet.
                </div>
              ) : (
                activities.slice(0, 5).map((act) => (
                  <div
                    key={act.id}
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E4E1] hover:border-[#C9B183]/50 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-[#0E0D0C] truncate">{act.title}</p>
                      <span className="text-[10px] text-[#6B6862]">{formatRelativeTime(act.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-[#6B6862] line-clamp-2 leading-relaxed">{act.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Timeline Modal */}
      <ActivityTimelineModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        activities={activities}
        onSelectLead={onSelectLead}
      />
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  progress, 
  active,
  onClick 
}: { 
  label: string; 
  value: string | number; 
  progress: number; 
  active?: boolean;
  onClick?: () => void; 
}) {
  return (
    <div 
      onClick={onClick}
      className={`luxury-card p-6 transition-all select-none ${
        onClick ? 'cursor-pointer hover:border-[#0E0D0C]/40' : ''
      } ${
        active 
          ? 'border-[#C9B183] bg-[#FFFFFF] shadow-sm ring-1 ring-[#C9B183]/30' 
          : 'bg-[#F5F4F2]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow-label">{label}</span>
        {active && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#C9B183]" />
        )}
      </div>
      <h3 className="font-serif text-3xl text-[#0E0D0C] font-normal tracking-tight">{value}</h3>
      {/* Thin 2px progress-bar accent in champagne gold */}
      <div className="h-0.5 w-full bg-[#E5E4E1] mt-4 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${active ? 'bg-[#C9B183]' : 'bg-[#C9B183]/70'}`}
          style={{ width: `${Math.min(100, Math.max(10, progress))}%` }} 
        />
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'closed':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-normal bg-[#F7F1E2] text-[#8A7442] border border-[#8A7442]/20">
          Completed
        </span>
      );
    case 'rejected':
    case 'cancelled':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-normal bg-[#EDEBE7] text-[#4A4640] border border-[#E5E4E1]">
          Cancelled
        </span>
      );
    case 'payment_pending':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-normal bg-[#FBF6E8] text-[#8A6E1F] border border-[#8A6E1F]/20">
          Payment Pending
        </span>
      );
    case 'proposal':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-normal bg-[#FBF6E8] text-[#8A6E1F] border border-[#8A6E1F]/20">
          Proposal Sent
        </span>
      );
    case 'negotiation':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-normal bg-[#FBF6E8] text-[#8A6E1F] border border-[#8A6E1F]/20">
          Negotiating
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-normal bg-[#F5F4F2] text-[#6B6862] border border-[#E5E4E1]">
          {status}
        </span>
      );
  }
}

function formatRelativeTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return "Recent";
  }
}
