/**
 * Utility for exporting structured data to CSV files with UTF-8 BOM support.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (item: T) => string | number | boolean | null | undefined;
}

export function exportToCsv<T>(filename: string, data: T[], columns: CsvColumn<T>[]): void {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const escapeCsvValue = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  // Header row
  const headerRow = columns.map((col) => escapeCsvValue(col.header)).join(',');

  // Data rows
  const rows = data.map((item) =>
    columns.map((col) => escapeCsvValue(col.accessor(item))).join(',')
  );

  const csvContent = '\uFEFF' + [headerRow, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
