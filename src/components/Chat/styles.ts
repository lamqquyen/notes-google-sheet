import styled, { keyframes } from "styled-components";

export const FloatingButton = styled.button`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 0;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(79, 70, 229, 0.35);
  z-index: 1000;
  transition: transform 0.15s ease;

  &:hover {
    transform: translateY(-2px);
  }
`;

export const Panel = styled.div`
  position: fixed;
  bottom: 96px;
  right: 24px;
  width: min(380px, calc(100vw - 32px));
  height: min(560px, calc(100vh - 140px));
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1000;
`;

export const Header = styled.div`
  padding: 14px 16px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    margin: 0;
    font-size: 15px;
  }

  button {
    background: transparent;
    border: 0;
    color: #ffffff;
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
  }
`;

export const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #f8fafc;
`;

export const Bubble = styled.div<{ $role: "user" | "bot" | "error" }>`
  align-self: ${({ $role }) => ($role === "user" ? "flex-end" : "flex-start")};
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  background: ${({ $role }) =>
    $role === "user" ? "#4f46e5" : $role === "error" ? "#fee2e2" : "#ffffff"};
  color: ${({ $role }) =>
    $role === "user" ? "#ffffff" : $role === "error" ? "#991b1b" : "#0f172a"};
  border: ${({ $role }) =>
    $role === "user" ? "0" : $role === "error" ? "1px solid #fecaca" : "1px solid #e2e8f0"};
`;

export const InputRow = styled.form`
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
`;

export const TextInput = styled.input`
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }
`;

export const SendButton = styled.button`
  border: 0;
  border-radius: 10px;
  padding: 0 16px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const blink = keyframes`
  0%, 80%, 100% { opacity: 0.2; }
  40%           { opacity: 1; }
`;

export const TypingDots = styled.div`
  display: inline-flex;
  gap: 4px;
  padding: 10px 14px;
  align-self: flex-start;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #94a3b8;
    animation: ${blink} 1.2s infinite ease-in-out both;
  }
  span:nth-child(2) { animation-delay: 0.15s; }
  span:nth-child(3) { animation-delay: 0.3s; }
`;
