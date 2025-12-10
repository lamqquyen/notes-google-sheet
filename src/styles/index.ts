import styled, { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
  :root {
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: radial-gradient(circle at 20% 20%, #f7faff, #eef2ff 45%, #e6ecff);
    color: #0f172a;
    min-height: 100vh;
  }
`;

export const Page = styled.main`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
`;

export const Card = styled.section`
  width: min(960px, 100%);
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 20px 80px rgba(15, 23, 42, 0.1),
    0 4px 20px rgba(15, 23, 42, 0.04);
  padding: 32px;
  display: grid;
  gap: 24px;

  @media (max-width: 720px) {
    padding: 20px;
  }
`;

export const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

export const Title = styled.div`
  display: grid;
  gap: 6px;

  h1 {
    margin: 0;
    font-size: clamp(24px, 3vw, 30px);
    color: #0f172a;
  }

  p {
    margin: 0;
    color: #475569;
    font-size: 15px;
  }
`;

export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-weight: 600;
  font-size: 14px;
`;

export const Form = styled.form`
  display: grid;
  gap: 20px;
`;

export const Grid = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

export const Field = styled.label`
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: #1f2937;
`;

export const Input = styled.input`
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font-size: 15px;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }
`;

export const SelectRow = styled.div`
  display: inline-flex;
  padding: 4px;
  border-radius: 12px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  gap: 6px;
  width: fit-content;
`;

export const SelectButton = styled.button<{ $active: boolean }>`
  border: 0;
  background: ${({ $active }) => ($active ? "#111827" : "transparent")};
  color: ${({ $active }) => ($active ? "#ffffff" : "#0f172a")};
  padding: 10px 14px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ $active }) => ($active ? "#111827" : "#e5e7eb")};
  }
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

export const Button = styled.button`
  border: 0;
  border-radius: 12px;
  padding: 12px 18px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  width: 100%;
  
  &:hover {
    transform: translateY(-1px);
    opacity: 0.7;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

export const Status = styled.div<{ $tone: "success" | "error" | "muted" }>`
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 600;
  color: ${({ $tone }) =>
    $tone === "success"
      ? "#166534"
      : $tone === "error"
      ? "#991b1b"
      : "#475569"};
  background: ${({ $tone }) =>
    $tone === "success"
      ? "rgba(22, 101, 52, 0.1)"
      : $tone === "error"
      ? "rgba(153, 27, 27, 0.1)"
      : "#f8fafc"};
  border: 1px solid
    ${({ $tone }) =>
      $tone === "success"
        ? "rgba(22, 101, 52, 0.2)"
        : $tone === "error"
        ? "rgba(153, 27, 27, 0.2)"
        : "#e2e8f0"};
`;

export const Helper = styled.span`
  font-size: 13px;
  margin-left: 12px;
  color: #64748b;
  display: block;
  margin-top: 4px;
  margin-left: 0;
`;

export const LogSection = styled.section`
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
`;

export const LogHeader = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

export const Tabs = styled.div`
  display: flex;
  gap: 8px;
  border-bottom: 2px solid #e2e8f0;
  margin-bottom: 16px;
`;

export const Tab = styled.button<{ $active: boolean }>`
  border: 0;
  background: transparent;
  color: ${({ $active }) => ($active ? "#6366f1" : "#64748b")};
  padding: 12px 16px;
  font-weight: ${({ $active }) => ($active ? "600" : "500")};
  font-size: 14px;
  cursor: pointer;
  border-bottom: 2px solid ${({ $active }) => ($active ? "#6366f1" : "transparent")};
  margin-bottom: -2px;
  transition: all 0.2s ease;

  &:hover {
    color: ${({ $active }) => ($active ? "#6366f1" : "#475569")};
  }
`;

export const LogList = styled.div`
  display: grid;
  gap: 8px;
`;

export const LogRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  font-size: 14px;
  color: #0f172a;
`;

export const DeleteButton = styled.button`
  border: 0;
  background: #fee2e2;
  color: #991b1b;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: #fecaca;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const RemoveButton = styled.button`
  border: 0;
  background: #fee2e2;
  color: #991b1b;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  align-self: flex-end;

  &:hover {
    background: #fecaca;
  }
`;

export const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #6366f1;
`;

export const SelectionControls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  margin-bottom: 12px;
  border: 1px solid #e2e8f0;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

export const SelectionActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

export const ItemRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
`;

export const LogRowContainer = styled.div`
  flex-direction: column;
  gap: 8px;
  display: flex;
  margin: 8px 0;
`;

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

export const TotalDisplay = styled.div`
  padding: 20px;
  border-radius: 14px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  text-align: center;
  margin-bottom: 24px;
  
  h2 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    opacity: 0.9;
  }
  
  .amount {
    font-size: 32px;
    font-weight: 700;
    margin: 0;
  }
`;

export const LoadingOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

export const Spinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
