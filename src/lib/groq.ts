import Groq from "groq-sdk";
import toolsDb from "./tools-db.json";

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

function parseJsonSafely(text: string | null | undefined): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // Strip markdown code blocks if present
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*$/gi, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

// Active Production Groq Models
const DEFAULT_TEXT_MODELS = [
  process.env.GROQ_MODEL,
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
].filter(Boolean) as string[];

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
      // Stop immediately on authentication errors (401)
      if (err?.status === 401) {
        throw new Error("Invalid GROQ_API_KEY. Please verify your API key in .env");
      }
    }
  }
  throw lastError || new Error("All Groq model candidates failed.");
}

export async function extractLeadInfo(
  text: string,
  filePart?: { mimeType: string; data: string }
) {
  try {
    const groq = getGroqClient();

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

    // Extract previous context if this is a follow-up answer
    let prevContext: any = {};
    const prevMatch = (text || "").match(/Previous Context:\s*(\{.*?\})/s);
    if (prevMatch) {
      try {
        prevContext = JSON.parse(prevMatch[1]);
      } catch {}
    }

    // Check for explicit catalog tool match in text, image, or previous context
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

    // Contact name validation and merging
    let contactName = (parsed.contactName || "").trim();
    if (!contactName || contactName.toLowerCase() === "lead representative" || contactName.toLowerCase() === "unknown" || contactName.toLowerCase() === "n/a") {
      contactName = (prevContext.contactName || "").trim();
    }

    // User count validation and merging
    let userCount = Math.max(0, Number(parsed.userCount) || 0);
    if (userCount <= 0 && prevContext.userCount) {
      userCount = Math.max(0, Number(prevContext.userCount) || 0);
    }

    const hasTool = Boolean(finalToolName);
    const hasUsers = userCount > 0;
    const hasContact = Boolean(contactName && contactName.length > 0);

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
