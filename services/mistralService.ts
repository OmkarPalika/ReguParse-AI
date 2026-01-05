
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

  let contentToParse = text || '';

  // If a file is provided, we MUST extract text/structure from it first.
  // Mistral Large is a text model. For PDFs/Images, we use Mistral OCR.
  if (file) {
    try {
      // Determine document type for OCR
      const isPdf = file.inlineData.mimeType === 'application/pdf';
      const isImage = file.inlineData.mimeType.startsWith('image/');

      if (!isPdf && !isImage) {
        throw new Error(`Unsupported file type: ${file.inlineData.mimeType}`);
      }

      // Prepare document for OCR
      // For base64 inputs, we use the specific chunk types. 
      // Note: Mistral SDK expects base64 in documentUrl (or imageUrl) for simple usage if valid data URI.
      // If the SDK strictly requires 'https', this might fail, but recent updates allow data URIs.
      const documentEndpoint = isPdf
        ? { type: "document_url", documentUrl: `data:${file.inlineData.mimeType};base64,${file.inlineData.data}` }
        : { type: "image_url", imageUrl: `data:${file.inlineData.mimeType};base64,${file.inlineData.data}` };

      // Call Mistral OCR
      const ocrResponse = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: documentEndpoint as any
      });

      // Aggregate markdown from all pages
      const ocrMarkdown = ocrResponse.pages.map(p => p.markdown).join('\n\n');
      console.log("OCR Markdown extracted:", ocrMarkdown.substring(0, 200) + "...");

      contentToParse = `[START OF DOCUMENT OCR]\n${ocrMarkdown}\n[END OF DOCUMENT OCR]\n\n${contentToParse}`;

    } catch (ocrError: any) {
      console.error("Mistral OCR Error:", ocrError);
      throw new Error(`OCR Failed: ${ocrError.body?.message || ocrError.message || "Unknown error"}. Ensure your API key supports Mistral OCR.`);
    }
  }

  // Now use Mistral Large to structure the extracted text
  const userMessageContent = `Target Language: ${langLabel}. Extract the structure from this UAE regulatory document text. 
  The text provides the raw content. You must organize it into the hierarchical JSON format specified.
  \n\n${contentToParse}`;

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessageContent }
  ];

  try {
    const response = await client.chat.complete({
      model: MISTRAL_MODEL_NAME, // mistral-large-latest
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
