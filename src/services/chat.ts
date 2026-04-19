export interface ChatRequest {
  userId: string;
  message: string;
}

export interface ChatResponse {
  text: string;
  refresh?: boolean;
  error?: boolean;
}

const endpoint = import.meta.env.VITE_CHAT_API_URL;
const sharedSecret = import.meta.env.VITE_CHAT_API_SECRET;

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  if (!endpoint) {
    throw new Error("Thieu URL chatbot (VITE_CHAT_API_URL).");
  }
  if (!sharedSecret) {
    throw new Error("Thieu mat khau chatbot (VITE_CHAT_API_SECRET).");
  }

  const url = endpoint.replace(/\/$/, "") + "/chat";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Chat-Secret": sharedSecret,
    },
    body: JSON.stringify(req),
  });

  let data: ChatResponse | null = null;
  try {
    data = (await response.json()) as ChatResponse;
  } catch {
    /* fall through */
  }

  if (!response.ok) {
    const message = data?.text || `Loi chatbot (${response.status}).`;
    throw new Error(message);
  }
  if (!data) {
    throw new Error("Phan hoi chatbot khong hop le.");
  }
  return data;
}
