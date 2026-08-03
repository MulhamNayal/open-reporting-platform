using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddDatasetStorageMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LastMaterializeError",
                table: "Datasets",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastMaterializedAtUtc",
                table: "Datasets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaterializedRowCount",
                table: "Datasets",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MaterializedTableName",
                table: "Datasets",
                type: "nvarchar(max)",
                nullable: true);

            // 0 = DirectQuery, deliberately for every existing dataset regardless of query mode:
            // that is exactly how they behave today, and switching one to Import is the author's
            // decision to make per dataset, not something a migration should do on their behalf.
            migrationBuilder.AddColumn<int>(
                name: "StorageMode",
                table: "Datasets",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastMaterializeError",
                table: "Datasets");

            migrationBuilder.DropColumn(
                name: "LastMaterializedAtUtc",
                table: "Datasets");

            migrationBuilder.DropColumn(
                name: "MaterializedRowCount",
                table: "Datasets");

            migrationBuilder.DropColumn(
                name: "MaterializedTableName",
                table: "Datasets");

            migrationBuilder.DropColumn(
                name: "StorageMode",
                table: "Datasets");
        }
    }
}
