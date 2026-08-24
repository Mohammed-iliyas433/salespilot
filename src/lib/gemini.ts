/**
 * ============================================================================
 * GEMINI.TS - AI Model Compatibility & Re-export Layer
 * ============================================================================
 * 
 * PURPOSE:
 * Provides backwards compatibility for components that previously imported from
 * the Gemini integration. Seamlessly re-exports the high-performance Groq AI
 * implementations for lead extraction, proposal creation, and negotiation.
 */

// Re-export Groq AI implementations
export { extractLeadInfo, generateProposal, negotiateProposal } from "./groq";
