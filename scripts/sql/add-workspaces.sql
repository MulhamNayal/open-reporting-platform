-- Applies AddWorkspaces to a ReportingDb that is otherwise up to date.
--
-- Migrations are never applied on startup, so a deploy ships code that expects this schema before
-- the schema exists. Run this against the target ReportingDb BEFORE (or immediately after) the
-- deploy that carries the workspaces code, or every /api/reports call fails with
-- "Invalid column name 'WorkspaceId'".
--
-- Idempotent: guarded on __EFMigrationsHistory, so re-running it is a no-op.
--
-- Order matters and is not what EF scaffolded. The seeded workspace is inserted BEFORE the column
-- and the FK, and WorkspaceId defaults to 1 rather than 0, so existing reports land on a row that
-- exists instead of failing the foreign key.

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260813043544_AddWorkspaces'
)
BEGIN
    CREATE TABLE [Workspaces] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [SortOrder] int NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_Workspaces] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260813043544_AddWorkspaces'
)
BEGIN

    SET IDENTITY_INSERT [Workspaces] ON;
    INSERT INTO [Workspaces] ([Id], [Name], [Description], [SortOrder], [IsActive], [CreatedAtUtc])
    VALUES (1, N'My workspace', N'Reports that haven''t been filed anywhere else.', 0, 1, '2026-08-13T00:00:00.000');
    SET IDENTITY_INSERT [Workspaces] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260813043544_AddWorkspaces'
)
BEGIN
    ALTER TABLE [Reports] ADD [WorkspaceId] int NOT NULL DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260813043544_AddWorkspaces'
)
BEGIN
    CREATE INDEX [IX_Reports_WorkspaceId] ON [Reports] ([WorkspaceId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260813043544_AddWorkspaces'
)
BEGIN
    ALTER TABLE [Reports] ADD CONSTRAINT [FK_Reports_Workspaces_WorkspaceId] FOREIGN KEY ([WorkspaceId]) REFERENCES [Workspaces] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260813043544_AddWorkspaces'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260813043544_AddWorkspaces', N'8.0.11');
END;
GO

COMMIT;
GO
