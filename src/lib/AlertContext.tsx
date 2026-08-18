import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type AlertType = "success" | "error" | "warning" | "info";

export interface AlertOptions {
  type?: AlertType;
  title: string;
  subtitle?: string;
  badge?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  autoCloseMs?: number;
}

interface AlertContextType {
  alertState: (AlertOptions & { isOpen: boolean }) | null;
  showAlert: (options: AlertOptions | string) => void;
  showSuccess: (title: string, message: ReactNode, options?: Partial<AlertOptions>) => void;
  showError: (title: string, message: ReactNode, options?: Partial<AlertOptions>) => void;
  showWarning: (title: string, message: ReactNode, options?: Partial<AlertOptions>) => void;
  showInfo: (title: string, message: ReactNode, options?: Partial<AlertOptions>) => void;
  closeAlert: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<(AlertOptions & { isOpen: boolean }) | null>(null);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => (prev ? { ...prev, isOpen: false } : null));
    // Clear state after animation completes
    setTimeout(() => {
      setAlertState(null);
    }, 250);
  }, []);

  const showAlert = useCallback((options: AlertOptions | string) => {
    if (typeof options === "string") {
      // Parse string formats like "MISSION_COMPLETE: Deal successfully closed and archived."
      let title = "Notification";
      let message = options;
      let type: AlertType = "info";
      let badge = "Notification";

      if (options.startsWith("MISSION_COMPLETE") || options.startsWith("DEAL_COMPLETE")) {
        type = "success";
        title = "Deal Completed";
        badge = "Completed";
        message = options.replace(/^(MISSION_COMPLETE|DEAL_COMPLETE):\s*/, "");
      } else if (options.startsWith("ACCESS_DENIED") || options.startsWith("SYSTEM_RESTRICTED") || options.startsWith("SYSTEM_RESTRICED")) {
        type = "warning";
        title = options.startsWith("ACCESS_DENIED") ? "Access Denied" : "Notice";
        badge = "Access Restricted";
        message = options.replace(/^(ACCESS_DENIED|SYSTEM_RESTRICTED|SYSTEM_RESTRICED):\s*/, "");
      } else if (options.toLowerCase().includes("fail") || options.toLowerCase().includes("error")) {
        type = "error";
        title = "Error";
        badge = "Error";
      }

      setAlertState({
        isOpen: true,
        type,
        title,
        badge,
        message,
        confirmText: "Acknowledge",
      });
    } else {
      setAlertState({
        isOpen: true,
        type: options.type || "info",
        title: options.title,
        subtitle: options.subtitle,
        badge: options.badge || (
          options.type === "success" ? "Completed" :
          options.type === "error" ? "Error" :
          options.type === "warning" ? "Notice" :
          "Notification"
        ),
        message: options.message,
        confirmText: options.confirmText || "Acknowledge",
        cancelText: options.cancelText,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
        autoCloseMs: options.autoCloseMs,
      });
    }
  }, []);

  const showSuccess = useCallback((title: string, message: ReactNode, options?: Partial<AlertOptions>) => {
    showAlert({
      type: "success",
      title,
      badge: "Completed",
      message,
      confirmText: "Acknowledge",
      ...options,
    });
  }, [showAlert]);

  const showError = useCallback((title: string, message: ReactNode, options?: Partial<AlertOptions>) => {
    showAlert({
      type: "error",
      title,
      badge: "Error",
      message,
      confirmText: "Dismiss",
      ...options,
    });
  }, [showAlert]);

  const showWarning = useCallback((title: string, message: ReactNode, options?: Partial<AlertOptions>) => {
    showAlert({
      type: "warning",
      title,
      badge: "Notice",
      message,
      confirmText: "Understood",
      ...options,
    });
  }, [showAlert]);

  const showInfo = useCallback((title: string, message: ReactNode, options?: Partial<AlertOptions>) => {
    showAlert({
      type: "info",
      title,
      badge: "Notification",
      message,
      confirmText: "Continue",
      ...options,
    });
  }, [showAlert]);

  return (
    <AlertContext.Provider
      value={{
        alertState,
        showAlert,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        closeAlert,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
}
