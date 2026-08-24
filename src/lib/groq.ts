/**
 * ============================================================================
 * GROQ.TS - AI Core Engine & Sales Intelligence Logic
 * ============================================================================
 * 
 * PURPOSE:
 * This module powers all AI interactions for SalesPilot via Groq LLMs.
 * It contains:
 * 1. Groq Client Initialization & Authentication handling.
 * 2. Safe JSON Parsing utility (handles markdown fences and raw text).
 * 3. Model Fallback Engine (gracefully falls back if a specific model is busy or rate-limited).
 * 4. extractLeadInfo: Natural Language / Document Lead Intake & Missing Info Detector.
 * 5. generateProposal: Pricing & Commercial Proposal Generator based on Catalog rules.
 * 6. negotiateProposal: AI Negotiation Officer enforcing pricing boundaries (min/max discount).
 */

import Groq from "groq-sdk";
import toolsDb from "./tools-db.json";

/**
 * FUNCTION: getGroqClient
 * PURPOSE:
 * Validates and retrieves the Groq API key from environment variables,
 * then instantiates and returns an authenticated Groq SDK client instance.
 * 
 * THROWS:
 * An Error if the GROQ_API_KEY is missing or unconfigured in .env.
 */
function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey.trim() === "" || apiKey === "API_KEY") {
    throw new Error(
      "GROQ_API_KEY is not configured. Please add your Groq API key (gsk_...) to the .env file."
    );
  }
  return new Groq({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

/**
 * FUNCTION: parseJsonSafely
 * PURPOSE:
 * Robustly parses JSON strings returned by LLMs.
 * LLMs often wrap JSON in markdown code fences (```json ... ```) or return minor whitespace.
 * This function strips markdown wrappers and parses the inner JSON payload safely.
 * 
 * PARAMETERS:
 * - text (string | null | undefined): The raw LLM text response.
 * 
 * RETURNS:
 * Parsed JavaScript object, or an empty object `{}` if input is invalid/empty.
 */
function parseJsonSafely(text: string | null | undefined): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // Strip markdown code fences if present (e.g. ```json ... ```)
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*$/gi, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

/**
 * ACTIVE PRODUCTION GROQ MODELS
 * Defines the priority order of high-performance models used for chat completion
 * and structured data extraction. If the primary model fails, the fallback engine
 * automatically cascades down this list.
 */
const DEFAULT_TEXT_MODELS = [
  process.env.GROQ_MODEL,
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
].filter(Boolean) as string[];

/**
 * FUNCTION: createChatWithFallback
 * PURPOSE:
 * Resilience wrapper around `groq.chat.completions.create`.
 * Iterates through candidate models in order. If a model encounters a rate limit (429),
 * temporary outage (503), or deprecation, it automatically retries with the next candidate.
 * 
 * PARAMETERS:
 * - groq (Groq): Initialized Groq SDK client instance.
 * - candidateModels (string[]): Ordered array of model names to try.
 * - params (object): Standard Groq Chat Completion request parameters (messages, temperature, etc.).
 * 
 * RETURNS:
 * The successful Chat Completion response from the first functioning model.
 */
async function createChatWithFallback(
  groq: Groq,
  candidateModels: string[],
  params: {
    messages: any[];
    response_format?: { type: "json_object" | "text" };
    temperature?: number;
    [key: string]: any;
  }
) {
  let lastError: any = null;
  for (const model of candidateModels) {
    try {
      const response = await groq.chat.completions.create({
        ...params,
        model,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[Groq] Model "${model}" failed (${err?.status || err?.code || err?.message}). Trying fallback...`
      );
      // Stop immediately on authentication errors (401) to prevent wasteful retries
      if (err?.status === 401) {
        throw new Error("Invalid GROQ_API_KEY. Please verify your API key in .env");
      }
    }
  }
  throw lastError || new Error("All Groq model candidates failed.");
}

/**
 * FUNCTION: extractLeadInfo
 * PURPOSE:
 * Analyzes unstructured incoming sales leads from text messages, emails, or uploaded documents/images.
 * Extracts structured data: Company Name, Contact Name, User Seat Count, and Target Tool Name.
 * 
 * KEY FEATURES & VALIDATION:
 * 1. Multimodal Support: Handles base64 images via vision models or text documents.
 * 2. Strict Catalog Matching: Matches against `tools-db.json` (e.g., Salesforce, HubSpot, Zendesk).
 * 3. Completeness Verification (`isComplete`):
 *    Ensures all 3 required fields exist (toolName, userCount > 0, contactName).
 * 4. Intelligent Follow-up Formulation:
 *    If any required field is missing, crafts a precise follow-up question to prompt the customer.
 * 
 * PARAMETERS:
 * - text (string): Raw intake text or email inquiry.
 * - filePart (optional object): Base64 encoded image or document data with mimeType.
 * 
 * RETURNS:
 * Object containing `{ data, isComplete, toolFound, followUpPrompt }` or `{ error }`.
 */
export async function extractLeadInfo(
  text: string,
  filePart?: { mimeType: string; data: string }
) {
  try {
    const groq = getGroqClient();

    // Build tool catalog listing with base prices for system prompt context
    const catalogList = toolsDb
      .map((t) => `- "${t.name}": ${t.usage} (Base price: $${t.price}/user/mo)`)
      .join("\n");

    const systemPrompt = `You are a precise sales intake analyst for SalesPilot.
Analyze the user's intake message or uploaded image/document and extract lead details into structured JSON format.

Authorized Tool Catalog:
${catalogList}

STRICT EXTRACTION RULES:
1. toolName:
   - Identify if one of the Authorized Tool Catalog tools is explicitly requested (${toolsDb.map(t => t.name).join(", ")}).
   - Match accurately:
     * "Salesforce", "sfdc" -> "Salesforce CRM"
     * "HubSpot", "sales hub" -> "HubSpot Sales Hub"
     * "Creatio" -> "Creatio"
     * "Zendesk", "zendesk sell" -> "Zendesk Sell"
     * "Monday", "monday crm" -> "Monday Sales CRM"
     * "Zoho" -> "Zoho CRM"
     * "Insightly" -> "Insightly CRM"
     * "Freshworks", "freshsales" -> "Freshworks CRM"
     * "Pipedrive" -> "Pipedrive"
     * "Vtiger" -> "Vtiger CRM"
   - CRITICAL: If the user says "a tool", "CRM", "software", or does NOT mention a specific catalog tool, return "" (empty string). DO NOT guess or pick a random tool!
2. userCount:
   - The number of user seats/licenses explicitly requested (integer).
   - If not mentioned in the intake, return 0. DO NOT assume or invent a number.
3. contactName:
   - Full name or moniker of the contact person (from signature, "From", "I am [Name]", or introduction).
   - If no name is mentioned in the intake, return "" (empty string). DO NOT invent a name.
4. companyName:
   - Name of lead's company or entity. If not mentioned, return "Direct Client".
5. intent:
   - Concise summary of their business need.
6. email:
   - Extract if present; otherwise return "" (empty string).
7. isComplete:
   - Set to true ONLY if ALL THREE of the following are present in the intake:
     1. toolName (must be one of the catalog tools)
     2. userCount (must be > 0)
     3. contactName (must not be empty)
   - If ANY of these three is missing, set isComplete to false.
8. followUpPrompt:
   - If isComplete is false, formulate a polite, specific question asking ONLY for the specific missing item(s) (e.g. which tool they want, how many seats, or their name).

Return strictly valid JSON:
{
  "companyName": string,
  "contactName": string,
  "email": string,
  "userCount": number,
  "intent": string,
  "toolName": string,
  "isComplete": boolean,
  "toolFound": boolean,
  "followUpPrompt": string
}`;

    const isImage = Boolean(filePart && filePart.mimeType.startsWith("image/"));
    let completion: any;

    // Route 1: Image / Vision Processing
    if (isImage) {
      try {
        completion = await createChatWithFallback(groq, ["qwen/qwen3.6-27b"], {
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Intake context:\n${text || "Extract lead requirements, contact name, user count, and tool name from this image."}`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${filePart.mimeType};base64,${filePart.data}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });
      } catch (visionErr: any) {
        console.warn("[Groq Vision] Vision call failed, falling back to text models:", visionErr.message);
        completion = await createChatWithFallback(groq, DEFAULT_TEXT_MODELS, {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Intake context:\n${text || "Attached image lead intake"}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });
      }
    } else {
      // Route 2: Standard Text / Document Processing
      const userTextParts: string[] = [];
      if (text) {
        userTextParts.push(`Intake content:\n${text}`);
      }
      if (filePart) {
        userTextParts.push(`[Attached Document Data (${filePart.mimeType})]`);
      }
      const userMessageContent = userTextParts.join("\n\n") || "No input provided";

      completion = await createChatWithFallback(groq, DEFAULT_TEXT_MODELS, {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessageContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
    }

    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = parseJsonSafely(content);

    // Check if this input carries forward context from a prior multi-turn question
    let prevContext: any = {};
    const prevMatch = (text || "").match(/Previous Context:\s*(\{.*?\})/s);
    if (prevMatch) {
      try {
        prevContext = JSON.parse(prevMatch[1]);
      } catch {}
    }

    // Resolve exact catalog tool name from user input, aliases, or previous conversation context
    const lowerInput = (text || "").toLowerCase();
    let resolvedToolName = "";

    if (lowerInput.includes("insightly")) {
      resolvedToolName = "Insightly CRM";
    } else if (lowerInput.includes("creatio")) {
      resolvedToolName = "Creatio";
    } else if (lowerInput.includes("freshworks") || lowerInput.includes("freshsales")) {
      resolvedToolName = "Freshworks CRM";
    } else if (lowerInput.includes("vtiger")) {
      resolvedToolName = "Vtiger CRM";
    } else if (lowerInput.includes("monday")) {
      resolvedToolName = "Monday Sales CRM";
    } else if (lowerInput.includes("zoho")) {
      resolvedToolName = "Zoho CRM";
    } else if (lowerInput.includes("pipedrive")) {
      resolvedToolName = "Pipedrive";
    } else if (lowerInput.includes("hubspot")) {
      resolvedToolName = "HubSpot Sales Hub";
    } else if (lowerInput.includes("zendesk")) {
      resolvedToolName = "Zendesk Sell";
    } else if (lowerInput.includes("salesforce") || lowerInput.includes("sfdc")) {
      resolvedToolName = "Salesforce CRM";
    } else if (prevContext.toolName) {
      resolvedToolName = prevContext.toolName;
    } else if (parsed.toolName) {
      const matched = toolsDb.find((t) => t.name.toLowerCase() === parsed.toolName.toLowerCase() || t.name.toLowerCase().includes(parsed.toolName.toLowerCase()));
      if (matched) resolvedToolName = matched.name;
    }

    const matchedTool = toolsDb.find(
      (t) =>
        t.name.toLowerCase() === (resolvedToolName || "").toLowerCase() ||
        resolvedToolName.toLowerCase().includes(t.name.toLowerCase())
    );

    const finalToolName = matchedTool ? matchedTool.name : "";

    // Contact name validation and fallback merging
    let contactName = (parsed.contactName || "").trim();
    if (!contactName || contactName.toLowerCase() === "lead representative" || contactName.toLowerCase() === "unknown" || contactName.toLowerCase() === "n/a") {
      contactName = (prevContext.contactName || "").trim();
    }

    // User count validation and fallback merging
    let userCount = Math.max(0, Number(parsed.userCount) || 0);
    if (userCount <= 0 && prevContext.userCount) {
      userCount = Math.max(0, Number(prevContext.userCount) || 0);
    }

    const hasTool = Boolean(finalToolName);
    const hasUsers = userCount > 0;
    const hasContact = Boolean(contactName && contactName.length > 0);

    // Identify which required fields are missing
    const missingItems: string[] = [];
    if (!hasTool) {
      missingItems.push(`which CRM tool from our catalog (${toolsDb.map(t => t.name).join(", ")}) you are interested in`);
    }
    if (!hasUsers) {
      missingItems.push("the number of user seats/licenses needed");
    }
    if (!hasContact) {
      missingItems.push("your name or contact person's name");
    }

    const isComplete = hasTool && hasUsers && hasContact;

    // Formulate a polite, dynamic follow-up prompt if any information is lacking
    let followUpPrompt = "";
    if (!isComplete) {
      if (missingItems.length === 1) {
        followUpPrompt = `Could you please specify ${missingItems[0]}?`;
      } else {
        followUpPrompt = `To prepare your proposal, could you please provide ${missingItems.slice(0, -1).join(", ")} and ${missingItems[missingItems.length - 1]}?`;
      }
    }

    return {
      data: {
        companyName: parsed.companyName || prevContext.companyName || "Direct Client",
        contactName: contactName,
        email: parsed.email || prevContext.email || "",
        userCount: userCount,
        intent: parsed.intent || prevContext.intent || (hasTool ? `Inquiry for ${finalToolName}` : "Software inquiry"),
        toolName: finalToolName,
      },
      isComplete,
      toolFound: hasTool,
      followUpPrompt,
    };
  } catch (error: any) {
    console.error("Groq Extraction Error:", error);
    return { error: error.message || "Failed to extract lead info via Groq" };
  }
}

/**
 * FUNCTION: generateProposal
 * PURPOSE:
 * Synthesizes a formal commercial proposal for an approved lead based on catalog rules.
 * Computes base price, initial discount percentage, and final monthly license cost.
 * 
 * PARAMETERS:
 * - lead (object): The lead record containing `toolName`, `userCount`, `companyName`, etc.
 * 
 * RETURNS:
 * Proposal object containing `{ basePrice, discountPercent, finalPrice, terms, toolName }` or `{ error }`.
 */
export async function generateProposal(lead: any) {
  try {
    const groq = getGroqClient();
    const tool = toolsDb.find((t) => t.name === lead.toolName) || toolsDb[0];

    const systemPrompt = `You are an automated sales proposal architect for SalesPilot.
Generate a structured, professional proposal based on the lead requirements and tool catalog constraints.

Tool Catalog Details:
- Name: ${tool.name}
- Base Price: $${tool.price}/user/month
- Allowable Discount Range: ${tool.minDiscount}% to ${tool.maxDiscount}%

Pricing Rules:
- Base Price = $${tool.price}
- Initial discount should be conservative (near ${tool.minDiscount}%).
- Final Price = basePrice * (1 - discountPercent / 100) * (lead.userCount || 1) [or unit monthly price after discount]
- Terms: Clear summary of payment terms, seat count (${lead.userCount || 1} users), and billing schedule.

Return strictly valid JSON with:
{
  "basePrice": number,
  "discountPercent": number,
  "finalPrice": number,
  "terms": string
}`;

    const userPrompt = `Lead information:\n${JSON.stringify(lead, null, 2)}`;

    const completion = await createChatWithFallback(groq, DEFAULT_TEXT_MODELS, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = parseJsonSafely(content);

    return {
      basePrice: Number(parsed.basePrice) || tool.price,
      discountPercent: Number(parsed.discountPercent) || tool.minDiscount,
      finalPrice: Number(parsed.finalPrice) || tool.price * (1 - (parsed.discountPercent || tool.minDiscount) / 100),
      terms: parsed.terms || `Standard ${tool.name} license terms for ${lead.userCount || 1} seats.`,
      toolName: tool.name,
    };
  } catch (error: any) {
    console.error("Groq Proposal Error:", error);
    return { error: error.message || "Failed to generate proposal via Groq" };
  }
}

/**
 * FUNCTION: negotiateProposal
 * PURPOSE:
 * Acts as the AI Sales Negotiation Officer during live client negotiations.
 * Analyzes the client's counter-offer or objection, verifies policy boundaries,
 * adjusts discounts within allowable limits (minDiscount% to maxDiscount%), and determines deal status.
 * 
 * GUARDRAILS & STATUS CODES:
 * 1. Discount Ceiling: Strictly prevents discounts above `tool.maxDiscount%`.
 * 2. Status 'accepted': When client agrees to current price/terms -> triggers deal approval (`approve`).
 * 3. Status 'rejected': When client cancels or terminates conversation -> triggers cancellation (`cancel`).
 * 4. Status 'negotiation': Ongoing back-and-forth counter-offers.
 * 
 * PARAMETERS:
 * - proposal (object): Current active proposal state with pricing and terms.
 * - userMessage (string): The latest message or counter-offer from the client.
 * - history (array): Full transcript of prior negotiation messages.
 * 
 * RETURNS:
 * Object with `{ message, newDiscountPercent, newFinalPrice, status, actionTrigger }` or `{ error }`.
 */
export async function negotiateProposal(
  proposal: any,
  userMessage: string,
  history: any[]
) {
  try {
    const groq = getGroqClient();
    const tool = toolsDb.find((t) => t.name === proposal.toolName) || toolsDb[0];

    const systemPrompt = `You are an AI sales negotiation officer for ${tool.name}.
Tool Parameters:
- Base Price: $${tool.price}/user/month
- Strict Min Discount: ${tool.minDiscount}%
- Strict Max Discount: ${tool.maxDiscount}%

STRICT POLICY:
1. You MUST NEVER offer or agree to a discount higher than ${tool.maxDiscount}% or lower than ${tool.minDiscount}%.
2. If the user asks for a discount exceeding ${tool.maxDiscount}% or free, politely decline and offer the maximum authorized limit (${tool.maxDiscount}%).
3. If the user agrees to the current terms, set status to 'accepted' and actionTrigger to 'approve'.
4. If the user explicitly cancels or terminates negotiation, set status to 'rejected' and actionTrigger to 'cancel'.
5. Otherwise set status to 'negotiation' and actionTrigger to null.

Calculate finalPrice as: (basePrice * (1 - newDiscountPercent / 100)).

You MUST respond strictly with valid JSON:
{
  "message": string,
  "newDiscountPercent": number,
  "newFinalPrice": number,
  "status": "negotiation" | "accepted" | "rejected",
  "actionTrigger": null | "cancel" | "approve"
}`;

    const contextPayload = {
      currentProposal: proposal,
      userMessage,
      conversationHistory: history,
      constraints: {
        toolName: tool.name,
        minDiscount: tool.minDiscount,
        maxDiscount: tool.maxDiscount,
        basePrice: tool.price,
      },
    };

    const completion = await createChatWithFallback(groq, DEFAULT_TEXT_MODELS, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(contextPayload, null, 2) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = parseJsonSafely(content);

    return {
      message: parsed.message || "Thank you for your response. Let us continue our discussion.",
      newDiscountPercent: typeof parsed.newDiscountPercent === "number" ? parsed.newDiscountPercent : proposal.discountPercent,
      newFinalPrice: typeof parsed.newFinalPrice === "number" ? parsed.newFinalPrice : proposal.finalPrice,
      status: ["negotiation", "accepted", "rejected"].includes(parsed.status) ? parsed.status : "negotiation",
      actionTrigger: ["cancel", "approve"].includes(parsed.actionTrigger) ? parsed.actionTrigger : null,
    };
  } catch (error: any) {
    console.error("Groq Negotiation Error:", error);
    return { error: error.message || "Negotiation protocol failure with Groq" };
  }
}
