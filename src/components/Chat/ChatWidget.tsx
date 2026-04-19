import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../../services/chat";
import {
  Bubble,
  FloatingButton,
  Header,
  InputRow,
  MessageList,
  Panel,
  SendButton,
  TextInput,
  TypingDots,
} from "./styles";

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "bot"; text: string }
  | { id: string; role: "error"; text: string };

interface ChatWidgetProps {
  /** Called whenever the bot reports a successful write so the UI can refresh totals/logs. */
  onDataChanged?: () => void;
}

const STORAGE_KEY = "notes-chat-user-id";

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "web";
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = `web-${crypto.randomUUID()}`;
  window.localStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function ChatWidget({ onDataChanged }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot",
      text: "Xin chao! Bạn có thể nhắn ví dụ: \"chi 50k an trua\" hoac \"thu 2tr luong\". Gho /help de xem huong dan.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string>(getOrCreateUserId());

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, busy, open]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: trimmed },
    ]);
    setInput("");
    setBusy(true);

    try {
      const reply = await sendChatMessage({ userId: userIdRef.current, message: trimmed });
      setMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: "bot", text: reply.text },
      ]);
      if (reply.refresh && onDataChanged) onDataChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Co loi xay ra.";
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "error", text: message },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <>
      <FloatingButton
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Dong chatbot" : "Mo chatbot"}
        title={open ? "Dong chatbot" : "Mo chatbot"}
      >
        {open ? "x" : "?"}
      </FloatingButton>

      {open && (
        <Panel role="dialog" aria-label="Chatbot">
          <Header>
            <h3>Tro ly Chi Tieu</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="Dong">
              x
            </button>
          </Header>

          <MessageList ref={listRef}>
            {messages.map((m) => (
              <Bubble key={m.id} $role={m.role}>
                {m.text}
              </Bubble>
            ))}
            {busy && (
              <TypingDots aria-label="Bot dang nhap">
                <span />
                <span />
                <span />
              </TypingDots>
            )}
          </MessageList>

          <InputRow onSubmit={onSubmit}>
            <TextInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="vd: chi 50k an trua"
              autoFocus
              disabled={busy}
            />
            <SendButton type="submit" disabled={busy || !input.trim()}>
              Gui
            </SendButton>
          </InputRow>
        </Panel>
      )}
    </>
  );
}
