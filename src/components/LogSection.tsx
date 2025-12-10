import type { SheetLogResponse } from "../services/sheets";
import type { EntryType, SubmitState } from "../types";
import { formatDateDDMMYYYY } from "../utils";
import {
  LogSection as StyledLogSection,
  Tabs,
  Tab,
  LogHeader,
  LogList,
  LogRowContainer,
  Helper,
  Button,
  Input,
  DeleteButton,
  Row,
} from "../styles";
import { SelectionControls } from "./SelectionControls";
import { LogRow } from "./LogRow";

interface LogSectionProps {
  activeTab: "recent" | "filter";
  recentLogs: SheetLogResponse | null;
  logs: SheetLogResponse | null;
  logState: SubmitState;
  selectedItems: Set<string>;
  dateFrom: string;
  dateTo: string;
  onTabChange: (tab: "recent" | "filter") => void;
  onFetchRecentItems: () => void;
  onFetchLogs: () => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDeleteMultiple: () => void;
  onToggleSelection: (id: string, type: EntryType) => void;
  onDeleteEntry: (id: string, type: EntryType) => void;
}

export function LogSection({
  activeTab,
  recentLogs,
  logs,
  logState,
  selectedItems,
  dateFrom,
  dateTo,
  onTabChange,
  onFetchRecentItems,
  onFetchLogs,
  onDateFromChange,
  onDateToChange,
  onSelectAll,
  onClearSelection,
  onDeleteMultiple,
  onToggleSelection,
  onDeleteEntry,
}: LogSectionProps) {
  return (
    <StyledLogSection>
      <Tabs>
        <Tab
          type="button"
          $active={activeTab === "recent"}
          onClick={() => onTabChange("recent")}
        >
          Bản ghi gần đây
        </Tab>
        <Tab
          type="button"
          $active={activeTab === "filter"}
          onClick={() => onTabChange("filter")}
        >
          Lọc theo ngày
        </Tab>
      </Tabs>

      {activeTab === "recent" && (
        <>
          <LogHeader>
            <h3 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>
              Bản ghi trong 2 ngày qua
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
            <>
              {(recentLogs.spending?.length || recentLogs.receiving?.length) && (
                <SelectionControls
                  selectedCount={selectedItems.size}
                  onSelectAll={onSelectAll}
                  onClearSelection={onClearSelection}
                  onDeleteSelected={onDeleteMultiple}
                />
              )}
              <LogList>
                <div>
                  <Row>
                    <strong>Chi tiền:</strong>
                    <strong style={{color: 'red'}}>Tổng chi: {recentLogs.spending?.reduce((acc, item) => acc + item.amount, 0).toLocaleString("vi-VN")}</strong>
                  </Row>
                  {recentLogs.spending?.length ? (
                    <LogRowContainer>
                      {recentLogs.spending.map((item, idx) => (
                        <LogRow
                          key={`sp-${item.id || idx}`}
                          item={item}
                          entryType="spending"
                          isSelected={selectedItems.has(`spending:${item.id}`)}
                          onSelect={() => onToggleSelection(item.id, "spending")}
                          onDelete={() => onDeleteEntry(item.id, "spending")}
                        />
                      ))}
                    </LogRowContainer>
                  ) : (
                    <Helper>Không có bản ghi chi tiêu.</Helper>
                  )}
                </div>
                <div>
                  <Row>
                    <strong>Nhận tiền:</strong>
                    <strong style={{color: 'green'}}>Tổng nhận: {recentLogs.receiving?.reduce((acc, item) => acc + item.amount, 0).toLocaleString("vi-VN")}</strong>
                  </Row>
                  {recentLogs.receiving?.length ? (
                    <LogRowContainer>
                      {recentLogs.receiving.map((item, idx) => (
                        <LogRow
                          key={`rc-${item.id || idx}`}
                          item={item}
                          entryType="receiving"
                          isSelected={selectedItems.has(`receiving:${item.id}`)}
                          onSelect={() => onToggleSelection(item.id, "receiving")}
                          onDelete={() => onDeleteEntry(item.id, "receiving")}
                        />
                      ))}
                    </LogRowContainer>
                  ) : (
                    <Helper>Không có bản ghi nhận tiền.</Helper>
                  )}
                </div>
              </LogList>
            </>
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
              onChange={(e) => onDateFromChange(e.target.value)}
            />
            <span style={{ color: "#64748b", textAlign: 'center' }}>đến</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
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
            <>
              {(logs.spending?.length || logs.receiving?.length) && (
                <SelectionControls
                  selectedCount={selectedItems.size}
                  onSelectAll={onSelectAll}
                  onClearSelection={onClearSelection}
                  onDeleteSelected={onDeleteMultiple}
                />
              )}
              <LogList>
                <div>
                  <Row>
                    <strong>Chi tiền:</strong>
                    <strong style={{color: 'red'}}>Tổng chi: {logs.spending?.reduce((acc, item) => acc + item.amount, 0).toLocaleString("vi-VN")}</strong>
                  </Row>
                  {logs.spending?.length ? (
                    <LogRowContainer>
                      {logs.spending.map((item, idx) => (
                        <LogRow
                          key={`sp-${item.id || idx}`}
                          item={item}
                          entryType="spending"
                          isSelected={selectedItems.has(`spending:${item.id}`)}
                          onSelect={() => onToggleSelection(item.id, "spending")}
                          onDelete={() => onDeleteEntry(item.id, "spending")}
                        />
                      ))}
                    </LogRowContainer>
                  ) : (
                    <Helper>Không có bản ghi chi tiêu.</Helper>
                  )}
                </div>
                <div>
                  <Row>
                    <strong>Nhận tiền:</strong>
                    <strong style={{color: 'green'}}>Tổng nhận: {logs.receiving?.reduce((acc, item) => acc + item.amount, 0).toLocaleString("vi-VN")}</strong>
                  </Row>
                  {logs.receiving?.length ? (
                    <LogRowContainer>
                      {logs.receiving.map((item, idx) => (
                        <LogRow
                          key={`rc-${item.id || idx}`}
                          item={item}
                          entryType="receiving"
                          isSelected={selectedItems.has(`receiving:${item.id}`)}
                          onSelect={() => onToggleSelection(item.id, "receiving")}
                          onDelete={() => onDeleteEntry(item.id, "receiving")}
                        />
                      ))}
                    </LogRowContainer>
                  ) : (
                    <Helper>Không có bản ghi nhận tiền.</Helper>
                  )}
                </div>
              </LogList>
            </>
          )}
        </>
      )}
    </StyledLogSection>
  );
}
