
import { Mistral } from "@mistralai/mistralai";
import { SYSTEM_PROMPT, MISTRAL_MODEL_NAME } from "../constants.ts";
import { Language, ParseResponse } from "../types.ts";

export interface FileData {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export const parseDocumentWithMistral = async (
  language: Language,
  text?: string,
  file?: FileData
): Promise<ParseResponse> => {
  const client = new Mistral({ apiKey: process.env.API_KEY || '' });
  const langLabel = language === 'en' ? 'English' : 'Arabic';

  // Construct message parts
  // Mistral Large supports text. For vision/multimodal, pixtral is usually preferred,
  // but since mistral-large-latest is requested, we will handle text and pass file data if applicable.
  // Note: Mistral's SDK handles content as string or array of parts.
  
  let userMessageContent = `Target Language: ${langLabel}. Extract the structure from this UAE regulatory document. Return JSON only.`;
  
  if (text) {
    userMessageContent += `\n\nReference Text (OCR):\n\n${text}`;
  }

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessageContent }
  ];

  // If there's a file, we add it as an image_url if the model supports it.
  // mistral-large-latest is primarily text. If it fails vision, we provide the text context.
  if (file && (file.inlineData.mimeType.startsWith('image/') || file.inlineData.mimeType === 'application/pdf')) {
    messages[1].content = [
      { type: "text", text: userMessageContent },
      { 
        type: "image_url", 
        imageUrl: `data:${file.inlineData.mimeType};base64,${file.inlineData.data}` 
      }
    ];
  }

  try {
    const response = await client.chat.complete({
      model: MISTRAL_MODEL_NAME,
      messages,
      responseFormat: { type: "json_object" },
      temperature: 0,
    });

    const resultText = response.choices?.[0]?.message?.content;
    if (!resultText || typeof resultText !== 'string') {
      throw new Error("Mistral returned an empty response.");
    }

    const parsed: ParseResponse = JSON.parse(resultText);
    return parsed;
  } catch (error: any) {
    console.error("Mistral API Error:", error);
    if (error.status === 401) {
      throw new Error("Mistral API Key Unauthorized. Please check your credentials.");
    }
    throw new Error(error.message || "An unexpected error occurred during Mistral processing.");
  }
};
