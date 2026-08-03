using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Backend.Services.Datasets;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.Materialization;

public class MaterializationService : IMaterializationService
{
    /// <summary>
    /// The request-path row limit exists because rows are serialised to the browser. Nothing is
    /// serialised here, so materialisation deliberately takes the whole result.
    /// </summary>
    private const int NoRowLimit = int.MaxValue;

    private readonly ReportingDbContext _context;
    private readonly IDatasetService _datasetService;
    private readonly IMaterializationStore _store;

    public MaterializationService(ReportingDbContext context, IDatasetService datasetService, IMaterializationStore store)
    {
        _context = context;
        _datasetService = datasetService;
        _store = store;
    }

    public async Task<MaterializationResult> MaterializeAsync(int datasetId, CancellationToken cancellationToken = default)
    {
        var dataset = await GetDatasetAsync(datasetId);

        if (dataset.StorageMode != DatasetStorageMode.Import)
        {
            throw new InvalidOperationException(
                $"Dataset {datasetId} is {dataset.StorageMode}; only Import datasets are materialised.");
        }

        try
        {
            var result = await _datasetService.ExecuteRawAsync(datasetId, NoRowLimit, cancellationToken);

            // The staging table is always rebuilt from the result's own columns, so a source whose
            // shape has changed since the last refresh is handled by construction rather than
            // needing to be detected and repaired.
            await _store.CreateStagingTableAsync(datasetId, result.Columns, cancellationToken);
            await _store.BulkLoadStagingAsync(datasetId, result, cancellationToken);
            await _store.SwapStagingIntoPlaceAsync(datasetId, cancellationToken);

            var now = DateTime.UtcNow;
            dataset.MaterializedTableName = _store.TableNameFor(datasetId);
            dataset.LastMaterializedAtUtc = now;
            dataset.MaterializedRowCount = result.Rows.Count;
            dataset.LastMaterializeError = null;
            await _context.SaveChangesAsync(cancellationToken);

            return new MaterializationResult(result.Rows.Count, now);
        }
        catch (Exception ex)
        {
            // Record why, but leave MaterializedTableName and LastMaterializedAtUtc alone — the
            // previous copy is still in place and still servable, just stale.
            dataset.LastMaterializeError = ex.Message;
            await _context.SaveChangesAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task EnsureMaterializedAsync(int datasetId, CancellationToken cancellationToken = default)
    {
        var dataset = await GetDatasetAsync(datasetId);

        if (dataset.StorageMode != DatasetStorageMode.Import || dataset.MaterializedTableName is not null)
        {
            return;
        }

        await MaterializeAsync(datasetId, cancellationToken);
    }

    private async Task<Dataset> GetDatasetAsync(int id)
    {
        var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == id);
        if (dataset is null)
        {
            throw new NotFoundException($"No dataset found with id {id}.");
        }

        return dataset;
    }
}
