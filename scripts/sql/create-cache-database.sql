-- Creates the materialisation cache database for an environment that doesn't have one yet.
--
-- This database holds one mat.Dataset_{id} table per Import dataset. Every table in it is
-- created and dropped at runtime and holds nothing but the output of a query the platform can
-- re-run, so it is deliberately NOT under EF migrations and does not need backing up.
--
-- Nothing is seeded here. The schema is the only thing this script creates.
--
-- IMPORTANT — pick a name that can't collide on a shared server.
-- The staging instance already has an unrelated, company-owned database called ReportingDb.
-- Name this after whatever THIS application's database is called, with "Cache" appended, so it
-- is unambiguously owned by this app. If the app's database is OpenReportingPlatform, use
-- OpenReportingPlatformCache.
--
-- Run against the same SQL Server instance the application database lives on, as a login with
-- CREATE DATABASE rights, then set the connection string (see below).

DECLARE @CacheDbName sysname = N'CHANGE_ME_Cache';   -- <<< set this before running

IF DB_ID(@CacheDbName) IS NULL
BEGIN
    DECLARE @sql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@CacheDbName) + N';';
    EXEC sp_executesql @sql;
    PRINT 'Created ' + @CacheDbName;
END
ELSE
BEGIN
    PRINT @CacheDbName + ' already exists — nothing to do.';
END;
GO

-- The mat schema is also created on demand by the application, so this is belt and braces.
-- Re-run this part against the cache database itself:
--
--   USE [<your cache database>];
--   IF SCHEMA_ID('mat') IS NULL EXEC('CREATE SCHEMA mat');
--
-- Then configure the application. Either add a connection string named
-- ConnectionStrings:ReportingCacheDatabase, or leave it unset — the platform falls back to the
-- application database's own connection with the database name suffixed "Cache", which is why
-- the naming rule above matters.
--
-- Until this exists, everything works except Import datasets. DirectQuery datasets — which is
-- every dataset by default — are unaffected.
