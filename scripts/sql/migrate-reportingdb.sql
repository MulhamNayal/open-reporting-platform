IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720120729_InitialCreate'
)
BEGIN
    CREATE TABLE [Reports] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_Reports] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720120729_InitialCreate'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Description', N'Name') AND [object_id] = OBJECT_ID(N'[Reports]'))
        SET IDENTITY_INSERT [Reports] ON;
    EXEC(N'INSERT INTO [Reports] ([Id], [Description], [Name])
    VALUES (1, N''Sales totals grouped by month'', N''Monthly Sales''),
    (2, N''Agents ranked by closed deals'', N''Top Agents''),
    (3, N''Open deals by stage'', N''Pipeline Overview'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Description', N'Name') AND [object_id] = OBJECT_ID(N'[Reports]'))
        SET IDENTITY_INSERT [Reports] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720120729_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260720120729_InitialCreate', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721034223_AddDataSourceConnections'
)
BEGIN
    CREATE TABLE [DataSourceConnections] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(max) NOT NULL,
        [Type] int NOT NULL,
        [Host] nvarchar(max) NOT NULL,
        [DatabaseName] nvarchar(max) NULL,
        [EncryptedCredentials] nvarchar(max) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_DataSourceConnections] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721034223_AddDataSourceConnections'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260721034223_AddDataSourceConnections', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721071558_AddDatasets'
)
BEGIN
    CREATE TABLE [Datasets] (
        [Id] int NOT NULL IDENTITY,
        [DataSourceConnectionId] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NULL,
        [Mode] int NOT NULL,
        [Definition] nvarchar(max) NOT NULL,
        [RowLimit] int NULL,
        [Columns] nvarchar(max) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_Datasets] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721071558_AddDatasets'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260721071558_AddDatasets', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721102033_AddWidgets'
)
BEGIN
    CREATE TABLE [Widgets] (
        [Id] int NOT NULL IDENTITY,
        [ReportId] int NOT NULL,
        [Type] int NOT NULL,
        [X] int NOT NULL,
        [Y] int NOT NULL,
        [W] int NOT NULL,
        [H] int NOT NULL,
        [Title] nvarchar(max) NOT NULL,
        [Content] nvarchar(max) NULL,
        CONSTRAINT [PK_Widgets] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721102033_AddWidgets'
)
BEGIN
    CREATE TABLE [WidgetBindings] (
        [Id] int NOT NULL IDENTITY,
        [WidgetId] int NOT NULL,
        [DatasetId] int NOT NULL,
        [CategoryField] nvarchar(max) NULL,
        [ValueFields] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_WidgetBindings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_WidgetBindings_Widgets_WidgetId] FOREIGN KEY ([WidgetId]) REFERENCES [Widgets] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721102033_AddWidgets'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WidgetBindings_WidgetId] ON [WidgetBindings] ([WidgetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721102033_AddWidgets'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260721102033_AddWidgets', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    DECLARE @var0 sysname;
    SELECT @var0 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[WidgetBindings]') AND [c].[name] = N'DatasetId');
    IF @var0 IS NOT NULL EXEC(N'ALTER TABLE [WidgetBindings] DROP CONSTRAINT [' + @var0 + '];');
    ALTER TABLE [WidgetBindings] DROP COLUMN [DatasetId];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    EXEC sp_rename N'[Widgets].[ReportId]', N'ReportPageId', N'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    ALTER TABLE [WidgetBindings] ADD [FormatOptions] nvarchar(max) NOT NULL DEFAULT N'{}';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    ALTER TABLE [Reports] ADD [DatasetId] int NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    ALTER TABLE [Datasets] ADD [IsSaved] bit NOT NULL DEFAULT CAST(1 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    CREATE TABLE [ReportPages] (
        [Id] int NOT NULL IDENTITY,
        [ReportId] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [SortOrder] int NOT NULL,
        [FilterState] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_ReportPages] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    EXEC(N'UPDATE [Reports] SET [DatasetId] = NULL
    WHERE [Id] = 1;
    SELECT @@ROWCOUNT');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    EXEC(N'UPDATE [Reports] SET [DatasetId] = NULL
    WHERE [Id] = 2;
    SELECT @@ROWCOUNT');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    EXEC(N'UPDATE [Reports] SET [DatasetId] = NULL
    WHERE [Id] = 3;
    SELECT @@ROWCOUNT');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721181055_RedesignReportDataModel'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260721181055_RedesignReportDataModel', N'8.0.11');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729155033_AddWidgetDatasetId'
)
BEGIN
    ALTER TABLE [Widgets] ADD [DatasetId] int NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729155033_AddWidgetDatasetId'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260729155033_AddWidgetDatasetId', N'8.0.11');
END;
GO

COMMIT;
GO

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

