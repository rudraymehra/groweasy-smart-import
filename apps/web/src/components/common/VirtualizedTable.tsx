'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface VirtualizedTableProps<Row> {
  headers: ReactNode[];
  rows: Row[];
  renderCell: (row: Row, columnIndex: number) => ReactNode;
  /** Optional leading fixed column (e.g. row number). */
  rowLabel?: (row: Row) => ReactNode;
  columnWidth?: number;
  maxHeight?: string;
}

/**
 * Virtualized data grid: sticky header, horizontal + vertical scrolling, only
 * visible rows mounted — a 50k-row CSV scrolls as smoothly as a 50-row one.
 */
export function VirtualizedTable<Row>({
  headers,
  rows,
  renderCell,
  rowLabel,
  columnWidth = 168,
  maxHeight = '56vh',
}: VirtualizedTableProps<Row>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  const labelWidth = rowLabel ? 56 : 0;
  const gridTemplate = `${rowLabel ? `${labelWidth}px ` : ''}repeat(${headers.length}, minmax(${columnWidth}px, 1fr))`;
  const minWidth = labelWidth + headers.length * columnWidth;

  return (
    <div
      ref={scrollRef}
      role="table"
      aria-rowcount={rows.length}
      className="data-scroll overflow-auto rounded-xl border border-line bg-surface"
      style={{ maxHeight }}
    >
      <div style={{ minWidth }}>
        <div
          role="row"
          className="sticky top-0 z-10 grid border-b border-line bg-surface-2/95 backdrop-blur"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {rowLabel && (
            <div className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 font-mono text-[11px] font-medium text-muted">
              #
            </div>
          )}
          {headers.map((h, i) => (
            <div
              key={i}
              role="columnheader"
              className="truncate px-3 py-2.5 text-left text-xs font-semibold text-ink"
              title={typeof h === 'string' ? h : undefined}
            >
              {h}
            </div>
          ))}
        </div>

        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]!;
            return (
              <div
                key={virtualRow.key}
                role="row"
                className={cn(
                  'absolute top-0 left-0 grid w-full items-center border-b border-line/60',
                  virtualRow.index % 2 === 1 && 'bg-surface-2/40',
                )}
                style={{
                  gridTemplateColumns: gridTemplate,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rowLabel && (
                  <div
                    className={cn(
                      'sticky left-0 h-full content-center px-3 font-mono text-[11px] text-muted',
                      virtualRow.index % 2 === 1 ? 'bg-surface-2/40' : 'bg-surface',
                    )}
                  >
                    {rowLabel(row)}
                  </div>
                )}
                {headers.map((_, col) => (
                  <div
                    key={col}
                    role="cell"
                    className="truncate px-3 font-mono text-xs text-ink/90"
                  >
                    {renderCell(row, col)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
