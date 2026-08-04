BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260731155418_AddDatasetDefinitionVersion'
)
BEGIN
    ALTER TABLE [Datasets] ADD [DefinitionVersion] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260731155418_AddDatasetDefinitionVersion'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260731155418_AddDatasetDefinitionVersion', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260731160852_AddWidgetBindingAggregations'
)
BEGIN
    ALTER TABLE [WidgetBindings] ADD [Aggregations] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260731160852_AddWidgetBindingAggregations'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260731160852_AddWidgetBindingAggregations', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803102149_AddReportActiveAndUsage'
)
BEGIN
    ALTER TABLE [Reports] ADD [IsActive] bit NOT NULL DEFAULT CAST(1 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803102149_AddReportActiveAndUsage'
)
BEGIN
    ALTER TABLE [Reports] ADD [LastViewedAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803102149_AddReportActiveAndUsage'
)
BEGIN
    ALTER TABLE [Reports] ADD [ViewCount] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803102149_AddReportActiveAndUsage'
)
BEGIN
    EXEC(N'UPDATE [Reports] SET [IsActive] = CAST(1 AS bit), [LastViewedAtUtc] = NULL, [ViewCount] = 0
    WHERE [Id] = 1;
    SELECT @@ROWCOUNT');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803102149_AddReportActiveAndUsage'
)
BEGIN
    EXEC(N'UPDATE [Reports] SET [IsActive] = CAST(1 AS bit), [LastViewedAtUtc] = NULL, [ViewCount] = 0
    WHERE [Id] = 2;
    SELECT @@ROWCOUNT');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803102149_AddReportActiveAndUsage'
)
BEGIN
    EXEC(N'UPDATE [Reports] SET [IsActive] = CAST(1 AS bit), [LastViewedAtUtc] = NULL, [ViewCount] = 0
    WHERE [Id] = 3;
    SELECT @@ROWCOUNT');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803102149_AddReportActiveAndUsage'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260803102149_AddReportActiveAndUsage', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803145523_AddDatasetStorageMode'
)
BEGIN
    ALTER TABLE [Datasets] ADD [LastMaterializeError] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803145523_AddDatasetStorageMode'
)
BEGIN
    ALTER TABLE [Datasets] ADD [LastMaterializedAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803145523_AddDatasetStorageMode'
)
BEGIN
    ALTER TABLE [Datasets] ADD [MaterializedRowCount] int NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803145523_AddDatasetStorageMode'
)
BEGIN
    ALTER TABLE [Datasets] ADD [MaterializedTableName] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803145523_AddDatasetStorageMode'
)
BEGIN
    ALTER TABLE [Datasets] ADD [StorageMode] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803145523_AddDatasetStorageMode'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260803145523_AddDatasetStorageMode', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803164637_AddDatasetRefreshInterval'
)
BEGIN
    ALTER TABLE [Datasets] ADD [RefreshIntervalMinutes] int NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803164637_AddDatasetRefreshInterval'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260803164637_AddDatasetRefreshInterval', N'8.0.11');
END;
GO

COMMIT;
GO

