import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Clock,
  Search,
  Users,
  FileText,
  MessageSquare,
  CheckCircle,
  CreditCard,
  Download,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { ActivityEvent } from "../lib/storage";

interface ActivityTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities: ActivityEvent[];
  onSelectLead?: (leadId: string) => void;
}

export default function ActivityTimelineModal({
  isOpen,
  onClose,
  activities,
  onSelectLead,
}: ActivityTimelineModalProps) {
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredActivities = useMemo(() => {
    return activities
      .filter((act) => {
        if (filterType === "all") return true;
        if (filterType === "intake") return act.type === "lead_intake";
        if (filterType === "proposal") return act.type === "proposal_generated";
        if (filterType === "negotiation") return act.type === "negotiation_message";
        if (filterType === "closed") return act.type === "deal_approved" || act.type === "payment_completed";
        if (filterType === "aborted") return act.type === "deal_aborted";
        return true;
      })
      .filter((act) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          act.companyName?.toLowerCase().includes(q) ||
          act.title?.toLowerCase().includes(q) ||
          act.description?.toLowerCase().includes(q) ||
          act.toolName?.toLowerCase().includes(q)
        );
      });
  }, [activities, filterType, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: activities.length,
      intakes: activities.filter((a) => a.type === "lead_intake").length,
      proposals: activities.filter((a) => a.type === "proposal_generated").length,
      negotiations: activities.filter((a) => a.type === "negotiation_message").length,
      closed: activities.filter((a) => a.type === "deal_approved" || a.type === "payment_completed").length,
    };
  }, [activities]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-10">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#0E0D0C]/40 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-[#FFFFFF] border border-[#E5E4E1] rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10"
        >
          {/* Header */}
          <div className="p-6 sm:p-7 border-b border-[#E5E4E1] bg-[#F5F4F2] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="eyebrow-label block mb-1">Audit Trail</span>
                <h2 className="font-serif text-xl sm:text-2xl text-[#0E0D0C] font-normal">
                  Activity Stream & Audit Log
                </h2>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg border border-[#E5E4E1] bg-[#FFFFFF] text-[#6B6862] hover:text-[#0E0D0C] hover:border-[#0E0D0C]/30 transition-colors cursor-pointer"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
              <MiniStat label="Total Events" value={stats.total} />
              <MiniStat label="Lead Inquiries" value={stats.intakes} />
              <MiniStat label="Proposals" value={stats.proposals} />
              <MiniStat label="Negotiations" value={stats.negotiations} />
              <MiniStat label="Closed Deals" value={stats.closed} isHighlight />
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                <FilterPill
                  label="All"
                  count={stats.total}
                  active={filterType === "all"}
                  onClick={() => setFilterType("all")}
                />
                <FilterPill
                  label="Inquiries"
                  count={stats.intakes}
                  active={filterType === "intake"}
                  onClick={() => setFilterType("intake")}
                />
                <FilterPill
                  label="Proposals"
                  count={stats.proposals}
                  active={filterType === "proposal"}
                  onClick={() => setFilterType("proposal")}
                />
                <FilterPill
                  label="Negotiations"
                  count={stats.negotiations}
                  active={filterType === "negotiation"}
                  onClick={() => setFilterType("negotiation")}
                />
                <FilterPill
                  label="Closed"
                  count={stats.closed}
                  active={filterType === "closed"}
                  onClick={() => setFilterType("closed")}
                />
              </div>

              <div className="relative w-full sm:w-60">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6862]" />
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 bg-[#FFFFFF] border border-[#E5E4E1] rounded-lg text-xs text-[#0E0D0C] placeholder:text-[#6B6862] focus:outline-none focus:border-[#C9B183]"
                />
              </div>
            </div>
          </div>

          {/* Timeline Content */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-4">
            {filteredActivities.length === 0 ? (
              <div className="p-12 text-center text-[#6B6862] text-xs">
                No matching events in the audit log.
              </div>
            ) : (
              filteredActivities.map((act) => {
                const badge = getActivityBadgeConfig(act.type);
                const time = formatTimelineDate(act.timestamp);
                return (
                  <div
                    key={act.id}
                    className="p-4 rounded-xl border border-[#E5E4E1] bg-[#F5F4F2] hover:bg-[#FFFFFF] transition-colors space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-normal border ${badge.tagStyle}`}>
                          {badge.label}
                        </span>
                        <span className="font-medium text-[#0E0D0C]">{act.companyName || "Direct Client"}</span>
                      </div>
                      <span className="text-[10px] text-[#6B6862]">{time.relative}</span>
                    </div>
                    <p className="text-xs text-[#0E0D0C] font-normal">{act.title}</p>
                    <p className="text-[11px] text-[#6B6862] leading-relaxed">{act.description}</p>
                    {act.leadId && onSelectLead && (
                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => {
                            onSelectLead(act.leadId!);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-[#C9B183] hover:underline font-medium cursor-pointer"
                        >
                          <span>View inquiry</span>
                          <ArrowRight size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#E5E4E1] bg-[#F5F4F2] flex items-center justify-between text-[11px] text-[#6B6862]">
            <span>{filteredActivities.length} events displayed</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-[#E5E4E1] bg-[#FFFFFF] text-[#0E0D0C] hover:bg-[#F5F4F2] transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function MiniStat({ label, value, isHighlight }: { label: string; value: number; isHighlight?: boolean }) {
  return (
    <div className="p-2.5 rounded-lg border border-[#E5E4E1] bg-[#FFFFFF] text-left">
      <span className="eyebrow-label block text-[9px] mb-0.5">{label}</span>
      <span className={`font-serif text-lg font-normal ${isHighlight ? 'text-[#8A7442]' : 'text-[#0E0D0C]'}`}>
        {value}
      </span>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
        active
          ? "bg-[#0E0D0C] text-[#EFE9DD] border border-[#0E0D0C]"
          : "bg-[#FFFFFF] border border-[#E5E4E1] text-[#6B6862] hover:text-[#0E0D0C]"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-70">({count})</span>
    </button>
  );
}

function getActivityBadgeConfig(type: ActivityEvent["type"]) {
  switch (type) {
    case "lead_intake":
      return {
        label: "Inquiry",
        tagStyle: "bg-[#FBF6E8] text-[#8A6E1F] border-[#8A6E1F]/20",
      };
    case "proposal_generated":
      return {
        label: "Proposal",
        tagStyle: "bg-[#FBF6E8] text-[#8A6E1F] border-[#8A6E1F]/20",
      };
    case "negotiation_message":
      return {
        label: "Negotiation",
        tagStyle: "bg-[#FBF6E8] text-[#8A6E1F] border-[#8A6E1F]/20",
      };
    case "deal_approved":
    case "payment_completed":
      return {
        label: "Settled",
        tagStyle: "bg-[#F7F1E2] text-[#8A7442] border-[#8A7442]/20",
      };
    case "invoice_downloaded":
      return {
        label: "Invoice",
        tagStyle: "bg-[#F5F4F2] text-[#6B6862] border-[#E5E4E1]",
      };
    case "deal_aborted":
      return {
        label: "Cancelled",
        tagStyle: "bg-[#EDEBE7] text-[#4A4640] border-[#E5E4E1]",
      };
    default:
      return {
        label: "Event",
        tagStyle: "bg-[#F5F4F2] text-[#6B6862] border-[#E5E4E1]",
      };
  }
}

function formatTimelineDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    let relative = "Just now";
    if (diffSec >= 60 && diffSec < 3600) {
      relative = `${Math.floor(diffSec / 60)}m ago`;
    } else if (diffSec >= 3600 && diffSec < 86400) {
      relative = `${Math.floor(diffSec / 3600)}h ago`;
    } else if (diffSec >= 86400) {
      relative = `${Math.floor(diffSec / 86400)}d ago`;
    }

    const full = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { relative, full };
  } catch {
    return { relative: "Recent", full: "" };
  }
}
