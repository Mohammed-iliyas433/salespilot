import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  LayoutDashboard, 
  Users, 
  BadgeDollarSign,
  FileText, 
  Menu,
  X
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import LeadDetail from "./components/LeadDetail";
import ClosedDeals from "./components/ClosedDeals";
import ServiceCatalog from "./components/ServiceCatalog";
import AlertModal from "./components/AlertModal";
import { AlertProvider } from "./lib/AlertContext";

export default function App() {
  return (
    <AlertProvider>
      <AppContent />
      <AlertModal />
    </AlertProvider>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [user] = useState<any>({
    displayName: "Executive Operator",
    email: "operator@salespilot.io",
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleSelectLead = (id: string) => {
    setSelectedLeadId(id);
    setActiveTab("leads");
    setIsSidebarOpen(false);
  };

  const getPageTitle = (tab: string) => {
    switch (tab) {
      case "dashboard": return "Executive Dashboard";
      case "leads": return "Deal Negotiation";
      case "catalog": return "Service Catalog";
      case "proposals": return "Invoices & Settlement";
      default: return "Dashboard";
    }
  };

  return (
    <div className="flex h-screen bg-[#FFFFFF] text-[#0E0D0C] overflow-hidden antialiased">
      {/* Mobile Toggle */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed top-5 left-5 z-50 p-2.5 bg-[#0E0D0C] border border-[#E5E4E1] rounded-lg text-[#EFE9DD]"
      >
        {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-[#0E0D0C]/40 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed lg:relative top-0 left-0 h-full w-68 bg-[#0E0D0C] border-r border-[#E5E4E1]/15 flex flex-col p-6 z-40 transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Brand Header */}
        <div className="flex items-center gap-3.5 mb-10 pt-1">
          {/* Diamond Line-Art Glyph */}
          <div className="w-8 h-8 rounded-lg border border-[#C9B183]/40 bg-[#C9B183]/5 flex items-center justify-center">
            <div className="w-3 h-3 border border-[#C9B183] rotate-45"></div>
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-lg tracking-tight text-[#EFE9DD] font-normal leading-none">SalesPilot</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-[#C9B183] mt-1 font-sans">Private Advisory</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          <SidebarItem 
            icon={<LayoutDashboard size={17} strokeWidth={1.5} />} 
            label="Dashboard" 
            active={activeTab === "dashboard"} 
            onClick={() => { setActiveTab("dashboard"); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Users size={17} strokeWidth={1.5} />} 
            label="Negotiation" 
            active={activeTab === "leads"} 
            onClick={() => { setActiveTab("leads"); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<FileText size={17} strokeWidth={1.5} />} 
            label="Service Catalog" 
            active={activeTab === "catalog"} 
            onClick={() => { setActiveTab("catalog"); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<BadgeDollarSign size={17} strokeWidth={1.5} />} 
            label="Invoices" 
            active={activeTab === "proposals"} 
            onClick={() => { setActiveTab("proposals"); setIsSidebarOpen(false); }} 
          />
        </nav>

        {/* Sidebar Footer */}
        <div className="pt-6 border-t border-[#E5E4E1]/10">
          <div className="flex items-center gap-3 px-2">
            <div className="w-7 h-7 rounded-full bg-[#C9B183]/10 border border-[#C9B183]/30 flex items-center justify-center text-[10px] font-serif text-[#C9B183]">
              EO
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[#EFE9DD] truncate font-medium">{user.displayName}</p>
              <p className="text-[10px] text-[#75726A] truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto flex flex-col relative w-full bg-[#FFFFFF]">
        <header className="h-20 border-b border-[#E5E4E1] px-6 md:px-12 flex items-center justify-between sticky top-0 bg-[#FFFFFF]/90 backdrop-blur-md z-20">
          <div className="flex items-center gap-3 pl-12 lg:pl-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C9B183]" />
            <h1 className="font-serif text-xl sm:text-2xl text-[#0E0D0C] tracking-tight font-normal">{getPageTitle(activeTab)}</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <span className="eyebrow-label block mb-0.5">Authorization Level</span>
              <p className="text-xs font-medium text-[#0E0D0C]">Director Tier</p>
            </div>
          </div>
        </header>

        <div className="p-6 md:p-12 flex-1 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (selectedLeadId || "")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "dashboard" && <Dashboard onSelectLead={handleSelectLead} />}
              {activeTab === "leads" && (
                selectedLeadId ? (
                  <LeadDetail leadId={selectedLeadId} onBack={() => setSelectedLeadId(null)} />
                ) : (
                  <div className="luxury-card p-12 text-center">
                    <div className="w-12 h-12 rounded-full border border-[#E5E4E1] bg-[#FFFFFF] mx-auto mb-4 flex items-center justify-center text-[#6B6862]">
                      <Users size={20} strokeWidth={1.5} />
                    </div>
                    <h3 className="font-serif text-lg text-[#0E0D0C] font-normal mb-2">No Active Negotiation Selected</h3>
                    <p className="text-xs text-[#6B6862] max-w-md mx-auto leading-relaxed">
                      Select a lead from the <button onClick={() => setActiveTab("dashboard")} className="text-[#C9B183] hover:underline font-medium">dashboard</button> to review proposal terms and engage in counter-negotiations.
                    </p>
                  </div>
                )
              )}
              {activeTab === "catalog" && <ServiceCatalog />}
              {activeTab === "proposals" && <ClosedDeals />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Boardroom Footer */}
        <footer className="h-12 border-t border-[#E5E4E1] px-6 md:px-12 flex items-center justify-between text-[11px] text-[#6B6862]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[#8A7442] rounded-full" />
              <span>System operational</span>
            </div>
            <span>Encrypted settlement layer</span>
          </div>
          <div>
            SalesPilot Advisory Protocol
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
      className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-md transition-all duration-150 text-xs text-left ${
        active 
          ? "border-l-2 border-[#C9B183] bg-gradient-to-r from-[#C9B183]/10 to-transparent text-[#EFE9DD] font-medium pl-3" 
          : "border-l-2 border-transparent text-[#75726A] hover:text-[#EFE9DD] hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={active ? "text-[#C9B183]" : "text-[#75726A]"}>{icon}</span>
        <span>{label}</span>
      </div>
    </button>
  );
}
