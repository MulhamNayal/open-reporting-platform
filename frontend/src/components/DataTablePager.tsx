import "./dataTablePager.css";

export interface DataTablePagerProps {
  page: number;
  rowsPerPage: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  rowsPerPageOptions?: number[];
}

function DataTablePager({
  page, rowsPerPage, totalRows, onPageChange, onRowsPerPageChange, rowsPerPageOptions = [10, 25, 50],
}: DataTablePagerProps) {
  const from = totalRows === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min(totalRows, page * rowsPerPage + rowsPerPage);
  const hasNextPage = to < totalRows;

  return (
    <div className="pager">
      <button
        type="button"
        className="pbtn"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        ‹ Prev
      </button>
      <button
        type="button"
        className="pbtn"
        aria-label="Next page"
        disabled={!hasNextPage}
        onClick={() => onPageChange(page + 1)}
      >
        Next ›
      </button>
      <span className="rng">{from}–{to} of {totalRows}</span>
      <span className="spacer" />
      <div className="prpp">
        {rowsPerPageOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={rowsPerPage === option ? "on" : ""}
            aria-label={`${option} rows per page`}
            aria-pressed={rowsPerPage === option}
            onClick={() => onRowsPerPageChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DataTablePager;
