import React, { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  X, 
  ArrowRight,
  ShieldCheck
} from "lucide-react";
import { useAlert, AlertType } from "../lib/AlertContext";

interface TypeConfig {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badgeText: string;
  badgeBg: string;
  badgeBorder: string;
  accentColor: string;
  buttonBg: string;
  buttonText: string;
  buttonBorder: string;
}

const TYPE_CONFIGS: Record<AlertType, TypeConfig> = {
  success: {
    icon: CheckCircle2,
    badgeText: "text-[#8A7442]",
    badgeBg: "bg-[#F7F1E2]",
    badgeBorder: "border-[#8A7442]/20",
    accentColor: "text-[#8A7442]",
    buttonBg: "bg-[#0E0D0C]",
    buttonText: "text-[#C9B183]",
    buttonBorder: "border-[#C9B183]",
  },
  error: {
    icon: AlertTriangle,
    badgeText: "text-[#4A4640]",
    badgeBg: "bg-[#EDEBE7]",
    badgeBorder: "border-[#E5E4E1]",
    accentColor: "text-[#4A4640]",
    buttonBg: "bg-[#0E0D0C]",
    buttonText: "text-[#EFE9DD]",
    buttonBorder: "border-[#E5E4E1]",
  },
  warning: {
    icon: AlertTriangle,
    badgeText: "text-[#8A6E1F]",
    badgeBg: "bg-[#FBF6E8]",
    badgeBorder: "border-[#8A6E1F]/20",
    accentColor: "text-[#8A6E1F]",
    buttonBg: "bg-[#0E0D0C]",
    buttonText: "text-[#C9B183]",
    buttonBorder: "border-[#C9B183]",
  },
  info: {
    icon: Info,
    badgeText: "text-[#6B6862]",
    badgeBg: "bg-[#F5F4F2]",
    badgeBorder: "border-[#E5E4E1]",
    accentColor: "text-[#C9B183]",
    buttonBg: "bg-[#0E0D0C]",
    buttonText: "text-[#C9B183]",
    buttonBorder: "border-[#C9B183]",
  },
};

export default function AlertModal() {
  const { alertState, closeAlert } = useAlert();
  const config = TYPE_CONFIGS[alertState?.type || "info"];
  const IconComponent = config.icon;

  const handleConfirm = useCallback(() => {
    if (alertState?.onConfirm) {
      alertState.onConfirm();
    }
    closeAlert();
  }, [alertState, closeAlert]);

  const handleCancel = useCallback(() => {
    if (alertState?.onCancel) {
      alertState.onCancel();
    }
    closeAlert();
  }, [alertState, closeAlert]);

  useEffect(() => {
    if (!alertState?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [alertState?.isOpen, handleConfirm, handleCancel]);

  if (!alertState?.isOpen) return null;

  return (
    <AnimatePresence>
      {alertState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleCancel}
            className="fixed inset-0 bg-[#0E0D0C]/40 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-[#FFFFFF] border border-[#E5E4E1] rounded-2xl overflow-hidden shadow-2xl z-10"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-6 sm:p-7 space-y-6">
              {/* Header section with Badge & Close */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-normal border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
                  {alertState.badge || "Notification"}
                </span>

                <button
                  onClick={handleCancel}
                  className="p-1 rounded-md text-[#6B6862] hover:text-[#0E0D0C] transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-1.5">
                <h3 className="font-serif text-xl sm:text-2xl text-[#0E0D0C] font-normal tracking-tight">
                  {alertState.title}
                </h3>
                {alertState.subtitle && (
                  <p className="text-xs text-[#6B6862]">
                    {alertState.subtitle}
                  </p>
                )}
              </div>

              {/* Message Box */}
              <div className="p-4 bg-[#F5F4F2] border border-[#E5E4E1] rounded-xl text-xs text-[#0E0D0C] leading-relaxed select-text">
                {typeof alertState.message === "string" ? (
                  <p className="whitespace-pre-wrap">{alertState.message}</p>
                ) : (
                  alertState.message
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                {alertState.cancelText && (
                  <button
                    onClick={handleCancel}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[#E5E4E1] bg-transparent text-[#6B6862] hover:text-[#0E0D0C] hover:border-[#0E0D0C]/30 text-xs font-medium transition-colors cursor-pointer"
                  >
                    {alertState.cancelText}
                  </button>
                )}

                <button
                  onClick={handleConfirm}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-lg font-medium text-xs border ${config.buttonBorder} ${config.buttonBg} ${config.buttonText} hover:bg-[#1A1917] transition-all flex items-center justify-center gap-2 cursor-pointer`}
                >
                  <span>{alertState.confirmText || "Acknowledge"}</span>
                  <ArrowRight size={13} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Bottom Trim */}
            <div className="bg-[#F5F4F2] border-t border-[#E5E4E1] px-6 py-2.5 flex items-center justify-between text-[10px] text-[#6B6862]">
              <span>SalesPilot Advisory</span>
              <span>Press Esc or Enter</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
