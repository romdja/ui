import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "edge";
export const maxDuration = 30;

// PlanB API configuration
const PLANB_API_BASE_URL = process.env["PLANB_API_BASE_URL"] || "http://localhost:5169";

// Interface definitions for PlanB API
interface ChatMessage {
  role: string;
  content: string;
  createdAt: string;
}

interface ChatResponse {
  threadId: string;
  messages: ChatMessage[];
  status: string;
}

interface PlanBChatRequest {
  message: string;
  additionalInstructions?: string;
}

// Function to interact with PlanB chat API
async function queryPlanBAPI(messages: any[]): Promise<ChatResponse> {
  try {
    // Get the last user message to send to PlanB API
    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
    if (!lastUserMessage) {
      throw new Error("No user message found");
    }

    // Extract text content from the message structure
    let messageContent: string;
    if (typeof lastUserMessage.content === 'string') {
      messageContent = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      // Handle the structured content format: [{"type":"text","text":"actual message"}]
      const textContent = lastUserMessage.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join(' ');
      messageContent = textContent || JSON.stringify(lastUserMessage.content);
    } else {
      messageContent = JSON.stringify(lastUserMessage.content);
    }

    const requestBody: PlanBChatRequest = {
      message: messageContent
    };

    // Log what we're sending for debugging
    console.log("Sending to PlanB API:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${PLANB_API_BASE_URL}/chat/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("PlanB API error response:", errorText);
      throw new Error(`PlanB API error: ${response.status} - ${errorText}`);
    }

    const data: ChatResponse = await response.json();
    console.log("PlanB API response:", JSON.stringify(data, null, 2));
    return data;

  } catch (error) {
    console.error("PlanB API query failed:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();
    
    // Log incoming messages for debugging
    console.log("Incoming messages:", JSON.stringify(messages, null, 2));
    
    // Try PlanB API first
    try {
      const planBResponse = await queryPlanBAPI(messages);
      
      // Get the last assistant message from PlanB response
      const assistantMessage = planBResponse.messages
        .filter(msg => msg.role === 'assistant')
        .pop();
      
      if (!assistantMessage) {
        throw new Error("No assistant response from PlanB API");
      }
      
      // Create a simple streaming response that works with assistant-ui
      return new Response(
        new ReadableStream({
          start(controller) {
            // Send the complete response in the AI SDK format
            const encoder = new TextEncoder();
            const content = assistantMessage.content;
            
            // Send content as a single chunk in the correct format
            controller.enqueue(encoder.encode(`0:"${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"\n`));
            
            // Send the completion marker
            controller.enqueue(encoder.encode('d:\n'));
            
            // Close the stream
            controller.close();
          }
        }),
        {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'x-vercel-ai-data-stream': 'v1',
          },
        }
      );
      
    } catch (planBError) {
      console.error("PlanB API failed, falling back to OpenAI:", planBError);
      
      // Fallback to OpenAI if PlanB fails
      const result = await streamText({
        model: openai("gpt-3.5-turbo"),
        messages,
        system: "You are a helpful assistant. Note: The PlanB API is currently unavailable, so you're responding as a fallback assistant.",
      });

      return result.toDataStreamResponse();
    }
    
  } catch (error) {
    console.error("API Error:", error);
    
    // Return error as streaming response
    return new Response(
      new ReadableStream({
        start(controller) {
          const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
          controller.enqueue(new TextEncoder().encode(`0:"${errorMessage}"\n`));
          controller.enqueue(new TextEncoder().encode('d:\n'));
          controller.close();
        }
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-vercel-ai-data-stream': 'v1',
        },
      }
    );
  }
}
