import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  deleteEntry,
  fetchLogsByDateRange,
  fetchTotal,
  logEntry,
  type SheetLogResponse,
} from "./services/sheets";
import type { EntryType, FormValues, SpendingItem, SubmitState } from "./types";
import {
  sortLogsByDateDesc,
  getTodayVNT,
  getDefaultDateRange,
  getPastTwoDaysRange,
  convertDDMMYYYYToYYYYMMDD,
  requiredMessage,
} from "./utils";
import {
  GlobalStyle,
  Page,
  Card,
  Header,
  Title,
  Badge,
} from "./styles";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { TotalDisplay } from "./components/TotalDisplay";
import { TransactionForm } from "./components/TransactionForm";
import { LogSection } from "./components/LogSection";


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
    { id: "1", description: "", amount: 0, amountError: undefined, descriptionError: undefined }
  ]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const {
    register,
    handleSubmit,
    reset,
    resetField,
    watch,
    setValue,
    trigger,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      amount: 0,
      description: "",
      occurredAt: getTodayVNT(), // Use YYYY-MM-DD format for date input
    },
    shouldUnregister: true,
  });
  
  const amountValue = watch("amount");


  // Helper function to fetch recent items by creation date (past 2 days)
  const fetchRecentItemsByCreationDate = async (): Promise<SheetLogResponse> => {
    const pastTwoDaysRange = getPastTwoDaysRange();
    // Backend now filters by creation date, so we can directly use the date range
    return fetchLogsByDateRange(pastTwoDaysRange.from, pastTwoDaysRange.to);
  };

  // Fetch total and recent items on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [totalValue, filteredData] = await Promise.all([
          fetchTotal(),
          fetchRecentItemsByCreationDate()
        ]);
        setTotal(totalValue);
        setRecentLogs(sortLogsByDateDesc(filteredData));
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadData();
  }, []);

  const onFetchRecentItems = async () => {
    setLogState({ status: "submitting" });
    try {
      const filteredData = await fetchRecentItemsByCreationDate();
      setRecentLogs(sortLogsByDateDesc(filteredData));
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
    setSpendingItems([...spendingItems, { id: Date.now().toString(), description: "", amount: 0, amountError: undefined, descriptionError: undefined }]);
  };

  const removeSpendingItem = (id: string) => {
    if (spendingItems.length > 1) {
      setSpendingItems(spendingItems.filter(item => item.id !== id));
    }
  };

  const updateSpendingItem = (id: string, field: "description" | "amount", value: string | number) => {
    setSpendingItems(prevItems => prevItems.map(item => {
      if (item.id === id) {
        // Don't validate on change, only update the value
        // Validation will happen on blur
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleSpendingItemBlur = (id: string, field: "description" | "amount", value: string | number) => {
    if (field === "description") {
      setSpendingItems(prevItems => prevItems.map(i => {
        if (i.id === id) {
          if (!String(value).trim()) {
            return { ...i, descriptionError: requiredMessage };
          } else {
            return { ...i, descriptionError: undefined };
          }
        }
        return i;
      }));
    } else if (field === "amount") {
      const numValue = typeof value === "number" ? value : parseFloat(String(value));
      setSpendingItems(prevItems => prevItems.map(i => {
        if (i.id === id) {
          if (!numValue || numValue <= 0 || isNaN(numValue)) {
            return { ...i, amountError: "Giá trị phải lớn hơn 0" };
          } else {
            return { ...i, amountError: undefined };
          }
        }
        return i;
      }));
    }
  };

  const handleTypeChange = (newType: EntryType) => {
    setType(newType);
    setSpendingItems([{ id: Date.now().toString(), description: "", amount: 0, amountError: undefined, descriptionError: undefined }]);
  };

  const onSubmit = handleSubmit(async (data) => {
    // For receiving type, ensure validation is triggered
    if (type === "receiving") {
      // Trigger validation for all fields
      const isValid = await trigger();
      if (!isValid) {
        // Validation failed, errors will be shown by react-hook-form
        return;
      }
    }
    
    // Convert date from dd/MM/yyyy to yyyy-MM-dd for API (needed for both types)
    const dateForAPI = convertDDMMYYYYToYYYYMMDD(data.occurredAt);
    const currentDate = data.occurredAt;
    
    // Validate spending items before submitting
    if (type === "spending") {
      // Validate all spending items and set errors
      let hasErrors = false;
      const updatedItems = spendingItems.map(item => {
        const updated = { ...item };
        if (!item.description.trim()) {
          updated.descriptionError = requiredMessage;
          hasErrors = true;
        } else {
          updated.descriptionError = undefined;
        }
        if (!item.amount || item.amount <= 0) {
          updated.amountError = "Giá trị phải lớn hơn 0";
          hasErrors = true;
        } else {
          updated.amountError = undefined;
        }
        return updated;
      });
      
      // Update state with errors so they display in UI
      setSpendingItems(updatedItems);
      
      if (hasErrors) {
        setSubmitState({ status: "error", message: "Vui lòng kiểm tra lại các trường đã nhập." });
        return;
      }
      
      const validItems = spendingItems.filter(item => item.description.trim() && item.amount > 0);
      if (validItems.length === 0) {
        setSubmitState({ status: "error", message: "Vui lòng nhập ít nhất một mục chi tiêu hợp lệ." });
        return;
      }
      
      // Proceed with submission for spending
      setSubmitState({ status: "submitting" });
      setIsOperationLoading(true);
      
      // Call API
      Promise.all(
        validItems.map((item: SpendingItem) =>
          logEntry({
            type: "spending",
            occurredAt: dateForAPI,
            amount: item.amount,
            description: item.description,
          })
        )
      )
        .then(async () => {
          // Refresh both recentLogs and total
          try {
            const [recentData, totalValue] = await Promise.all([
              fetchRecentItemsByCreationDate(),
              fetchTotal()
            ]);
            setRecentLogs(sortLogsByDateDesc(recentData));
            setTotal(totalValue);
          } catch (e) {
            console.error("Failed to refresh data:", e);
          } finally {
            setIsOperationLoading(false);
          }
          
          setSubmitState({
            status: "success",
            message: `Lưu thành công ${validItems.length} mục!`,
          });
          
          // Keep the date for "add more" functionality
          setLastSubmittedDate(currentDate);
          
          // Reset form
          setSpendingItems([{ id: Date.now().toString(), description: "", amount: 0, amountError: undefined, descriptionError: undefined }]);
          
          // Switch to recent tab
          setActiveTab("recent");
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Hiện chưa thể ghi giao dịch.";
          setSubmitState({ status: "error", message });
          setIsOperationLoading(false);
        });
    } else {
      // Receiving item - react-hook-form already validated via handleSubmit
      setSubmitState({ status: "submitting" });
      setIsOperationLoading(true);
      
      // Call API
      logEntry({
        ...data,
        occurredAt: dateForAPI,
        type,
      })
        .then(async () => {
          // Refresh both recentLogs and total
          try {
            const [recentData, totalValue] = await Promise.all([
              fetchRecentItemsByCreationDate(),
              fetchTotal()
            ]);
            setRecentLogs(sortLogsByDateDesc(recentData));
            setTotal(totalValue);
          } catch (e) {
            console.error("Failed to refresh data:", e);
          } finally {
            setIsOperationLoading(false);
          }
          
          setSubmitState({
            status: "success",
            message: `Lưu thành công 1 mục!`,
          });
          
          // Keep the date for "add more" functionality
          setLastSubmittedDate(currentDate);
          
          // Reset form
          reset({
            amount: 0,
            description: "",
            occurredAt: currentDate,
          });
          resetField("amount", { defaultValue: 0 });
          
          // Switch to recent tab
          setActiveTab("recent");
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Hiện chưa thể ghi giao dịch.";
          setSubmitState({ status: "error", message });
          setIsOperationLoading(false);
        });
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
      setLogs(sortLogsByDateDesc(data));
      setLogState({ status: "success", message: "Đã tải dữ liệu." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tải dữ liệu.";
      setLogState({ status: "error", message });
    }
  };

  const toggleItemSelection = (id: string, entryType: EntryType) => {
    const key = `${entryType}:${id}`;
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllItems = () => {
    const allItems = new Set<string>();
    if (activeTab === "recent" && recentLogs) {
      recentLogs.spending?.forEach(item => allItems.add(`spending:${item.id}`));
      recentLogs.receiving?.forEach(item => allItems.add(`receiving:${item.id}`));
    } else if (activeTab === "filter" && logs) {
      logs.spending?.forEach(item => allItems.add(`spending:${item.id}`));
      logs.receiving?.forEach(item => allItems.add(`receiving:${item.id}`));
    }
    setSelectedItems(allItems);
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const onDeleteMultipleEntries = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedItems.size} bản ghi đã chọn?`)) return;

    // Parse selected items into {id, type} pairs
    const itemsToDelete: Array<{ id: string; type: EntryType }> = [];

    selectedItems.forEach(key => {
      const [type, id] = key.split(':') as [EntryType, string];
      itemsToDelete.push({ id, type });
    });

    // Clear selection
    setSelectedItems(new Set());

    // Show loading overlay
    setIsOperationLoading(true);

    // Call backend
    Promise.all(itemsToDelete.map(({ id, type }) => deleteEntry(id, type)))
      .then(async () => {
        // Refresh both recentLogs and total, and filter tab logs if needed
        try {
          const promises: Promise<any>[] = [fetchTotal()];
          
          if (activeTab === "recent") {
            promises.push(fetchRecentItemsByCreationDate());
          } else if (activeTab === "filter" && dateFrom && dateTo) {
            promises.push(fetchLogsByDateRange(dateFrom, dateTo));
          }
          
          const results = await Promise.all(promises);
          setTotal(results[0]);
          
          if (activeTab === "recent" && results[1]) {
            setRecentLogs(sortLogsByDateDesc(results[1]));
          } else if (activeTab === "filter" && results[1]) {
            setLogs(sortLogsByDateDesc(results[1]));
          }
        } catch (e) {
          console.error("Failed to refresh data:", e);
        } finally {
          setIsOperationLoading(false);
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Không thể xóa bản ghi trên server.";
        setLogState({ status: "error", message });
        setIsOperationLoading(false);
      });
  };

  const onDeleteEntry = async (id: string, entryType: EntryType) => {
    if (!confirm("Bạn có chắc muốn xóa bản ghi này?")) return;
    
    // Show loading overlay
    setIsOperationLoading(true);
    
    // Call backend
    deleteEntry(id, entryType)
      .then(async () => {
        // Refresh both recentLogs and total, and filter tab logs if needed
        try {
          const promises: Promise<any>[] = [fetchTotal()];
          
          if (activeTab === "recent") {
            promises.push(fetchRecentItemsByCreationDate());
          } else if (activeTab === "filter" && dateFrom && dateTo) {
            promises.push(fetchLogsByDateRange(dateFrom, dateTo));
          }
          
          const results = await Promise.all(promises);
          setTotal(results[0]);
          
          if (activeTab === "recent" && results[1]) {
            setRecentLogs(sortLogsByDateDesc(results[1]));
          } else if (activeTab === "filter" && results[1]) {
            setLogs(sortLogsByDateDesc(results[1]));
          }
        } catch (e) {
          console.error("Failed to refresh data:", e);
        } finally {
          setIsOperationLoading(false);
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Không thể xóa bản ghi trên server.";
        setLogState({ status: "error", message });
        setIsOperationLoading(false);
      });
  };


  return (
    <>
      <GlobalStyle />
      {(isInitialLoading || isOperationLoading) && <LoadingOverlay />}
      {!isInitialLoading && (
        <Page>
          <Card>
          <Header>
            <Title>
              <h1>Sổ Ghi Tiền</h1>
            </Title>
            <Badge>Quản Lý Chi Tiêu</Badge>
          </Header>

          <TotalDisplay total={total} />

          <TransactionForm
            type={type}
            spendingItems={spendingItems}
            submitState={submitState}
            statusTone={statusTone}
            register={register}
            control={control}
            errors={errors}
            amountValue={amountValue}
            trigger={trigger}
            onTypeChange={handleTypeChange}
            onSpendingItemChange={updateSpendingItem}
            onSpendingItemBlur={handleSpendingItemBlur}
            onAddSpendingItem={addSpendingItem}
            onRemoveSpendingItem={removeSpendingItem}
            onSubmit={onSubmit}
          />

          <LogSection
            activeTab={activeTab}
            recentLogs={recentLogs}
            logs={logs}
            logState={logState}
            selectedItems={selectedItems}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setSelectedItems(new Set());
              if (tab === "recent" && !recentLogs) {
                onFetchRecentItems();
              }
            }}
            onFetchRecentItems={onFetchRecentItems}
            onFetchLogs={onFetchLogs}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onSelectAll={selectAllItems}
            onClearSelection={clearSelection}
            onDeleteMultiple={onDeleteMultipleEntries}
            onToggleSelection={toggleItemSelection}
            onDeleteEntry={onDeleteEntry}
          />
          </Card>
        </Page>
      )}
    </>
  );
}

export default App;
