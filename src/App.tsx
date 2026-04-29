import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  LayoutDashboard, 
  Users, 
  BadgeDollarSign,
  FileText, 
  Settings, 
  LogOut, 
  ChevronRight,
  TrendingUp,
  MessageSquare,
  Menu,
  XCircle
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import LeadDetail from "./components/LeadDetail";
import ClosedDeals from "./components/ClosedDeals";
import ServiceCatalog from "./components/ServiceCatalog";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [user, setUser] = useState<any>({
    uid: "local-operator",
    displayName: "Local Operator",
    email: "operator@salespilot.local",
  });
  const [authLoading, setAuthLoading] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // No auth needed for local-only operation
  }, []);

  const handleSelectLead = (id: string) => {
    setSelectedLeadId(id);
    setActiveTab("leads");
    setIsSidebarOpen(false);
  };

  if (authLoading) {
    return (
      <div className="flex h-screen bg-brand-bg items-center justify-center">
        <div className="text-brand-primary animate-pulse font-mono tracking-widest uppercase">Initializing_Secure_Layer...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-brand-bg text-brand-zinc-100 overflow-hidden">
      {/* Mobile Toggle */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed top-6 left-6 z-50 p-2 bg-brand-bg border border-brand-border rounded shadow-lg text-brand-zinc-100"
      >
        {isSidebarOpen ? <XCircle size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-brand-zinc-100/20 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed lg:relative top-0 left-0 h-full w-72 bg-brand-bg border-r border-brand-border flex flex-col p-6 z-40 transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 mb-12">
          <div className="w-8 h-8 bg-brand-primary rounded flex items-center justify-center">
            <div className="w-3 h-3 border-2 border-white rotate-45"></div>
          </div>
          <span className="font-bold text-lg tracking-tight uppercase">SalesPilot <span className="text-brand-primary text-[10px] align-top ml-1">OS</span></span>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem 
            icon={<LayoutDashboard size={18} />} 
            label="Dashboard" 
            active={activeTab === "dashboard"} 
            onClick={() => { setActiveTab("dashboard"); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Users size={18} />} 
            label="Negotiation" 
            active={activeTab === "leads"} 
            onClick={() => { setActiveTab("leads"); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<FileText size={18} />} 
            label="Service Catalog" 
            active={activeTab === "catalog"} 
            onClick={() => { setActiveTab("catalog"); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<BadgeDollarSign size={18} />} 
            label="Invoice" 
            active={activeTab === "proposals"} 
            onClick={() => { setActiveTab("proposals"); setIsSidebarOpen(false); }} 
          />
        </nav>

        <div className="mt-auto pt-6 border-t border-brand-border space-y-4">
          <div className="flex items-center gap-3 px-4 py-2 bg-brand-primary/5 rounded border border-brand-border/30">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-[8px] font-mono text-brand-primary/60 uppercase tracking-tighter leading-none mb-1">AI_CORE_ACTIVE</p>
              <p className="text-[10px] font-bold text-brand-zinc-300 truncate uppercase">
                {process.env.GROK_API_KEY ? "XAI_GROK_2" : process.env.GROQ_API_KEY ? "GROQ_LLAMA_3" : "GEMINI_3_FLASH"}
              </p>
            </div>
          </div>
          <SidebarItem 
            icon={<Settings size={18} />} 
            label="System Settings" 
            active={activeTab === "settings"} 
            onClick={() => { setActiveTab("settings"); setIsSidebarOpen(false); }} 
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col relative w-full">
        <header className="h-20 border-b border-brand-border px-6 md:px-10 flex items-center justify-between sticky top-0 bg-brand-bg/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-4 pl-12 lg:pl-0">
            <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
            <h2 className="font-bold text-[10px] md:text-xs uppercase tracking-[0.2em]">{activeTab} // active_node</h2>
          </div>
          <div className="flex items-center gap-4 border-l border-brand-border pl-4 md:pl-6">
            <div className="text-right">
              <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest leading-none mb-1">{user.displayName || "Operator"}</p>
              <p className="text-[9px] text-brand-zinc-500 font-mono tracking-tight truncate max-w-30">{user.email}</p>
            </div>
          </div>
        </header>

        <div className="p-6 md:p-10 flex-1 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (selectedLeadId || "")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "dashboard" && <Dashboard onSelectLead={handleSelectLead} />}
              {activeTab === "leads" && (
                selectedLeadId ? (
                  <LeadDetail leadId={selectedLeadId} onBack={() => setSelectedLeadId(null)} />
                ) : (
                  <div className="glass-card p-8 md:p-12 text-center border-dashed">
                    <Users size={48} className="mx-auto text-brand-zinc-700 mb-4 opacity-20" />
                    <h3 className="text-sm font-bold text-brand-zinc-500 uppercase tracking-widest mb-2 italic">Waiting_For_Target_Selection</h3>
                    <p className="text-xs text-brand-zinc-600 font-mono">Select a lead from the <span className="text-brand-primary">System Flow</span> dashboard to initiate deep negotiation protocols.</p>
                  </div>
                )
              )}
              {activeTab === "catalog" && <ServiceCatalog />}
              {activeTab === "proposals" && <ClosedDeals />}
            </motion.div>
          </AnimatePresence>
        </div>


        {/* System Status Footer */}
        <footer className="h-auto md:h-12 border-t border-brand-border px-6 md:px-10 py-4 md:py-0 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0 technical-label opacity-80 text-[9px] md:text-[10px]">
          <div className="flex flex-wrap gap-4 md:gap-8 items-center justify-center">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></span>
              SYSTEM_ONLINE
            </div>
            <div>LATENCY: 42ms</div>
            <div>STABILITY: 99.9%</div>
          </div>
          <div className="font-mono text-center">
            // COORDINATOR_SECURE_LAYER_0 // EN-US
          </div>
        </footer>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-md transition-all duration-200 border ${
        active 
          ? "bg-brand-primary/10 border-brand-primary text-brand-primary shadow-sm" 
          : "border-transparent text-brand-zinc-500 hover:text-brand-zinc-100 hover:bg-brand-primary/5"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={active ? "text-brand-primary" : ""}>{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      {active && <div className="w-1 h-1 bg-brand-primary rounded-full"></div>}
    </button>
  );
}
