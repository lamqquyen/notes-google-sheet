import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import styled, { createGlobalStyle } from "styled-components";
import {
  deleteEntry,
  fetchLogsByDateRange,
  fetchRecentItems,
  fetchTotal,
  logEntry,
  type SheetLogResponse,
} from "./services/sheets";

type EntryType = "spending" | "receiving";

type FormValues = {
  occurredAt: string;
  amount: number;
  description: string;
};

type SpendingItem = {
  id: string;
  description: string;
  amount: number;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const GlobalStyle = createGlobalStyle`
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

const Page = styled.main`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
`;

const Card = styled.section`
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

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const Title = styled.div`
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

const Badge = styled.span`
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

const Form = styled.form`
  display: grid;
  gap: 20px;
`;

const Grid = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

const Field = styled.label`
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: #1f2937;
`;

const Input = styled.input`
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

const SelectRow = styled.div`
  display: inline-flex;
  padding: 4px;
  border-radius: 12px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  gap: 6px;
  width: fit-content;
`;

const SelectButton = styled.button<{ $active: boolean }>`
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

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const Button = styled.button`
  border: 0;
  border-radius: 12px;
  padding: 12px 18px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  box-shadow: 0 12px 30px rgba(99, 102, 241, 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  width: 100%;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 36px rgba(99, 102, 241, 0.45);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const Status = styled.div<{ $tone: "success" | "error" | "muted" }>`
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

const Helper = styled.span`
  font-size: 13px;
  margin-left: 12px;
  color: #64748b;
`;

const LogSection = styled.section`
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
`;

const LogHeader = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const Tabs = styled.div`
  display: flex;
  gap: 8px;
  border-bottom: 2px solid #e2e8f0;
  margin-bottom: 16px;
`;

const Tab = styled.button<{ $active: boolean }>`
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

const LogList = styled.div`
  display: grid;
  gap: 8px;
`;

const LogRow = styled.div`
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

const DeleteButton = styled.button`
  border: 0;
  background: #fee2e2;
  color: #991b1b;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #fecaca;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const RemoveButton = styled.button`
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

const ItemRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
`;

const LogRowContainer = styled.div`
  flex-direction: column;
  gap: 8px;
  display: flex;
  margin: 8px 0;
`;

const TotalDisplay = styled.div`
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

const requiredMessage = "Trường này là bắt buộc";

function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  // If already in dd/MM/yyyy format, return as is
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dateStr;
  }
  return dateStr;
}

function convertDDMMYYYYToYYYYMMDD(dateStr: string): string {
  if (!dateStr) return "";
  // If already in YYYY-MM-DD format, return as is
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  // Convert from dd/MM/yyyy to yyyy-MM-dd
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function convertYYYYMMDDToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return "";
  // If already in dd/MM/yyyy format, return as is
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dateStr;
  }
  // Convert from yyyy-MM-dd to dd/MM/yyyy
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function getTodayVNT(): string {
  // Get current date in Vietnam timezone (Asia/Ho_Chi_Minh, UTC+7)
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Returns YYYY-MM-DD format
  return formatter.format(now);
}

function getTodayVNTFormatted(): string {
  return convertYYYYMMDDToDDMMYYYY(getTodayVNT());
}

function getDefaultDateRange() {
  const todayVNT = getTodayVNT();
  const todayParts = todayVNT.split('-');
  const todayDate = new Date(parseInt(todayParts[0]), parseInt(todayParts[1]) - 1, parseInt(todayParts[2]));
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setDate(todayDate.getDate() - 7);
  
  const year = sevenDaysAgo.getFullYear();
  const month = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
  const day = String(sevenDaysAgo.getDate()).padStart(2, '0');
  const sevenDaysAgoVNT = `${year}-${month}-${day}`;
  
  return {
    from: sevenDaysAgoVNT,
    to: todayVNT,
  };
}

function App() {
  const [type, setType] = useState<EntryType>("spending");
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });
  const [total, setTotal] = useState<number | null>(null);
  const defaultDateRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultDateRange.from);
  const [dateTo, setDateTo] = useState(defaultDateRange.to);
  const [logs, setLogs] = useState<SheetLogResponse | null>(null);
  const [recentLogs, setRecentLogs] = useState<SheetLogResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"recent" | "filter">("recent");
  const [logState, setLogState] = useState<SubmitState>({ status: "idle" });
  const [lastSubmittedDate, setLastSubmittedDate] = useState<string | null>(null);
  const [spendingItems, setSpendingItems] = useState<SpendingItem[]>([
    { id: "1", description: "", amount: 0 }
  ]);
  const {
    register,
    handleSubmit,
    reset,
    resetField,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      amount: 0,
      description: "",
      occurredAt: getTodayVNT(), // Use YYYY-MM-DD format for date input
    },
    shouldUnregister: true,
  });

  // Fetch total and recent items on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [totalValue, recentData] = await Promise.all([
          fetchTotal(),
          fetchRecentItems(10)
        ]);
        setTotal(totalValue);
        setRecentLogs(recentData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };
    loadData();
  }, []);

  const onFetchRecentItems = async () => {
    setLogState({ status: "submitting" });
    try {
      const data = await fetchRecentItems(10);
      setRecentLogs(data);
      setLogState({ status: "success", message: "Đã tải dữ liệu." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tải dữ liệu.";
      setLogState({ status: "error", message });
    }
  };

  const statusTone = useMemo(() => {
    if (submitState.status === "success") return "success";
    if (submitState.status === "error") return "error";
    return "muted";
  }, [submitState.status]);

  const addSpendingItem = () => {
    setSpendingItems([...spendingItems, { id: Date.now().toString(), description: "", amount: 0 }]);
  };

  const removeSpendingItem = (id: string) => {
    if (spendingItems.length > 1) {
      setSpendingItems(spendingItems.filter(item => item.id !== id));
    }
  };

  const updateSpendingItem = (id: string, field: "description" | "amount", value: string | number) => {
    setSpendingItems(spendingItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const onSubmit = handleSubmit(async (data) => {
    setSubmitState({ status: "submitting" });
    try {
      // Convert date from dd/MM/yyyy to yyyy-MM-dd for API
      const dateForAPI = convertDDMMYYYYToYYYYMMDD(data.occurredAt);
      
      if (type === "spending") {
        // Submit all spending items
        const validItems = spendingItems.filter(item => item.description.trim() && item.amount > 0);
        if (validItems.length === 0) {
          setSubmitState({ status: "error", message: "Vui lòng nhập ít nhất một mục chi tiêu hợp lệ." });
          return;
        }
        
        // Submit all items in parallel
        await Promise.all(
          validItems.map(item =>
            logEntry({
              type: "spending",
              occurredAt: dateForAPI,
              amount: item.amount,
              description: item.description,
            })
          )
        );
      } else {
        // Submit single receiving item
        await logEntry({
          ...data,
          occurredAt: dateForAPI,
          type,
        });
      }

      setSubmitState({
        status: "success",
        message: `Lưu thành công ${type === "spending" ? spendingItems.filter(item => item.description.trim() && item.amount > 0).length : 1} mục!`,
      });
      
      // Keep the date for "add more" functionality
      const currentDate = data.occurredAt;
      setLastSubmittedDate(currentDate);
      
      // Reset form
      if (type === "spending") {
        setSpendingItems([{ id: Date.now().toString(), description: "", amount: 0 }]);
      } else {
        reset({
          amount: 0,
          description: "",
          occurredAt: currentDate,
        });
        resetField("amount", { defaultValue: 0 });
      }
      
      // Switch to recent tab and refetch recent items and total in parallel
      setActiveTab("recent");
      try {
        const [recentData, totalValue] = await Promise.all([
          fetchRecentItems(10),
          fetchTotal()
        ]);
        setRecentLogs(recentData);
        setTotal(totalValue);
      } catch (e) {
        console.error("Failed to refresh data:", e);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Hiện chưa thể ghi giao dịch.";
      setSubmitState({ status: "error", message });
    }
  });

  const onFetchLogs = async () => {
    if (!dateFrom || !dateTo) {
      setLogState({ status: "error", message: "Chọn khoảng ngày cần tra cứu." });
      return;
    }
    if (dateFrom > dateTo) {
      setLogState({ status: "error", message: "Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc." });
      return;
    }
    setLogState({ status: "submitting" });
    try {
      const data = await fetchLogsByDateRange(dateFrom, dateTo);
      setLogs(data);
      setLogState({ status: "success", message: "Đã tải dữ liệu." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tải dữ liệu.";
      setLogState({ status: "error", message });
    }
  };

  const onDeleteEntry = async (id: string, entryType: EntryType) => {
    if (!confirm("Bạn có chắc muốn xóa bản ghi này?")) return;
    setLogState({ status: "submitting" });
    try {
      await deleteEntry(id, entryType);
      // Refresh data based on active tab
      if (activeTab === "recent") {
        const data = await fetchRecentItems(10);
        setRecentLogs(data);
      } else if (dateFrom && dateTo) {
        const data = await fetchLogsByDateRange(dateFrom, dateTo);
        setLogs(data);
      }
      // Fetch updated total
      try {
        const totalValue = await fetchTotal();
        setTotal(totalValue);
      } catch (e) {
        console.error("Failed to refresh total:", e);
      }
      setLogState({ status: "success", message: "Đã xóa bản ghi." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể xóa bản ghi.";
      setLogState({ status: "error", message });
    }
  };


  return (
    <>
      <GlobalStyle />
      <Page>
        <Card>
          <Header>
            <Title>
              <h1>Sổ Ghi Tiền</h1>
            </Title>
            <Badge>Quản Lý Chi Tiêu</Badge>
          </Header>

          {total !== null && (
            <TotalDisplay>
              <h2>Tổng còn lại</h2>
              <p className="amount">{total.toLocaleString("vi-VN")} đ</p>
            </TotalDisplay>
          )}

          <Form onSubmit={onSubmit} noValidate>
            <Field>
              Loại giao dịch
              <SelectRow>
                <SelectButton
                  type="button"
                  onClick={() => {
                    setType("spending");
                    setSpendingItems([{ id: Date.now().toString(), description: "", amount: 0 }]);
                  }}
                  $active={type === "spending"}
                >
                  Chi tiền
                </SelectButton>
                <SelectButton
                  type="button"
                  onClick={() => {
                    setType("receiving");
                    setSpendingItems([{ id: Date.now().toString(), description: "", amount: 0 }]);
                  }}
                  $active={type === "receiving"}
                >
                  Nhận tiền
                </SelectButton>
              </SelectRow>
              <Helper>Chọn loại nhãn cho khoản này.</Helper>
            </Field>

            <Field>
              Ngày
              <Input
                type="date"
                {...register("occurredAt", { 
                  required: requiredMessage
                })}
              />
              {errors.occurredAt && (
                <Helper>{errors.occurredAt.message}</Helper>
              )}
            </Field>

            {type === "spending" ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {spendingItems.map((item, index) => (
                  <ItemRow key={item.id}>
                    <div style={{ display: "grid", gap: "8px" }}>
                      <Field>
                        Dùng cho việc gì?
                        <Input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateSpendingItem(item.id, "description", e.target.value)}
                          placeholder="Mô tả chi tiêu"
                        />
                      </Field>
                      <Field>
                        Số tiền
                        <Input
                          type="number"
                          step="1000"
                          min="1"
                          placeholder="0"
                          value={item.amount || ""}
                          onChange={(e) => updateSpendingItem(item.id, "amount", Number(e.target.value) || 0)}
                        />
                      </Field>
                    </div>
                    {spendingItems.length > 1 && (
                      <RemoveButton
                        type="button"
                        onClick={() => removeSpendingItem(item.id)}
                      >
                        Xóa
                      </RemoveButton>
                    )}
                  </ItemRow>
                ))}
                <Button
                  type="button"
                  onClick={addSpendingItem}
                  style={{ background: "#e0e7ff", color: "#4338ca" }}
                >
                  + Thêm mục
                </Button>
              </div>
            ) : (
              <Field>
                Số tiền
                <Input
                  type="number"
                  step="1000"
                  min="1000"
                  placeholder="0"
                  {...register("amount", {
                    required: requiredMessage,
                    valueAsNumber: true,
                    min: { value: 1, message: "Giá trị phải lớn hơn 0" },
                  })}
                />
                {errors.amount && <Helper>{errors.amount.message}</Helper>}
              </Field>
            )}

            <Actions>
              <Button
                type="submit"
                disabled={submitState.status === "submitting"}
              >
                {submitState.status === "submitting"
                  ? "Đang lưu…"
                  : "Lưu"}
              </Button>
            </Actions>
          </Form>

          {submitState.status !== "idle" && <Status $tone={statusTone}>
            {submitState.status === "submitting" &&
              "Đang gửi lên Google Sheets…"}
            {submitState.status === "success" && submitState.message}
            {submitState.status === "error" && submitState.message}
          </Status>}


          <LogSection>
            <Tabs>
              <Tab
                type="button"
                $active={activeTab === "recent"}
                onClick={() => {
                  setActiveTab("recent");
                  if (!recentLogs) {
                    onFetchRecentItems();
                  }
                }}
              >
                Bản ghi gần đây
              </Tab>
              <Tab
                type="button"
                $active={activeTab === "filter"}
                onClick={() => setActiveTab("filter")}
              >
                Lọc theo ngày
              </Tab>
            </Tabs>

            {activeTab === "recent" && (
              <>
                <LogHeader>
                  <h3 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>
                    Top 10 bản ghi gần đây
                  </h3>
                  <Button
                    type="button"
                    onClick={onFetchRecentItems}
                    disabled={logState.status === "submitting"}
                  >
                    {logState.status === "submitting" ? "Đang tải…" : "Làm mới"}
                  </Button>
                </LogHeader>

                {logState.status === "error" && <Helper>{logState.message}</Helper>}
                {logState.status === "success" && (
                  <Helper>{logState.message}</Helper>
                )}

                {recentLogs && logState.status !== "submitting" && (
                  <LogList>
                    <div>
                      <strong>Chi tiền</strong>
                      {recentLogs.spending?.length ? (
                        <LogRowContainer>
                          {recentLogs.spending.map((item, idx) => (
                            <LogRow key={`sp-${item.id || idx}`}>
                              <span>{formatDateDDMMYYYY(item.date)}</span>
                              <span>{item.description || "—"}</span>
                              <strong>{item.amount.toLocaleString("vi-VN")}</strong>
                              <DeleteButton
                                type="button"
                                onClick={() => onDeleteEntry(item.id, "spending")}
                              >
                                Xóa
                              </DeleteButton>
                            </LogRow>
                          ))}
                        </LogRowContainer>
                      ) : (
                        <Helper>Không có bản ghi chi tiêu.</Helper>
                      )}
                    </div>
                    <div>
                      <strong>Nhận tiền</strong>
                      {recentLogs.receiving?.length ? (
                        <LogRowContainer>
                          {recentLogs.receiving.map((item, idx) => (
                            <LogRow key={`rc-${item.id || idx}`}>
                              <span>{formatDateDDMMYYYY(item.date)}</span>
                              <strong>{item.amount.toLocaleString("vi-VN")}</strong>
                              <DeleteButton
                                type="button"
                                onClick={() => onDeleteEntry(item.id, "receiving")}
                              >
                                Xóa
                              </DeleteButton>
                            </LogRow>
                          ))}
                        </LogRowContainer>
                      ) : (
                        <Helper>Không có bản ghi nhận tiền.</Helper>
                      )}
                    </div>
                  </LogList>
                )}
              </>
            )}

            {activeTab === "filter" && (
              <>
                <LogHeader>
                  <h3 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>
                    Tra cứu theo ngày
                  </h3>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span style={{ color: "#64748b", textAlign: 'center' }}>đến</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={onFetchLogs}
                    disabled={logState.status === "submitting"}
                  >
                    {logState.status === "submitting" ? "Đang tải…" : "Tra cứu"}
                  </Button>
                </LogHeader>

                {logState.status === "error" && <Helper>{logState.message}</Helper>}
                {logState.status === "success" && (
                  <Helper>{logState.message}</Helper>
                )}

                {logs && logState.status !== "submitting" && (
                  <LogList>
                    <div>
                      <strong>Chi tiền</strong>
                      {logs.spending?.length ? (
                        <LogRowContainer>
                          {logs.spending.map((item, idx) => (
                            <LogRow key={`sp-${item.id || idx}`}>
                              <span>{formatDateDDMMYYYY(item.date)}</span>
                              <span>{item.description || "—"}</span>
                              <strong>{item.amount.toLocaleString("vi-VN")}</strong>
                              <DeleteButton
                                type="button"
                                onClick={() => onDeleteEntry(item.id, "spending")}
                              >
                                Xóa
                              </DeleteButton>
                            </LogRow>
                          ))}
                        </LogRowContainer>
                      ) : (
                        <Helper>Không có bản ghi chi tiêu.</Helper>
                      )}
                    </div>
                    <div>
                      <strong>Nhận tiền</strong>
                      {logs.receiving?.length ? (
                        <LogRowContainer>
                          {logs.receiving.map((item, idx) => (
                            <LogRow key={`rc-${item.id || idx}`}>
                              <span>{formatDateDDMMYYYY(item.date)}</span>
                              <strong>{item.amount.toLocaleString("vi-VN")}</strong>
                              <DeleteButton
                                type="button"
                                onClick={() => onDeleteEntry(item.id, "receiving")}
                              >
                                Xóa
                              </DeleteButton>
                            </LogRow>
                          ))}
                        </LogRowContainer>
                      ) : (
                        <Helper>Không có bản ghi nhận tiền.</Helper>
                      )}
                    </div>
                  </LogList>
                )}
              </>
            )}
          </LogSection>
        </Card>
      </Page>
    </>
  );
}

export default App;
