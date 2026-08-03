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

            // 0 = DirectQuery, which keeps every existing dataset behaving exactly as it does today.
            migrationBuilder.AddColumn<int>(
                name: "StorageMode",
                table: "Datasets",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // ...except stored-procedure and REST datasets, for which DirectQuery is not a legal
            // combination — their result sets can't be filtered or paged at the source. Leaving them
            // on the default would make every one of them fail validation on the next edit.
            // Mode: 2 = StoredProcedure, 3 = RestQuery.  StorageMode: 1 = Import.
            migrationBuilder.Sql("UPDATE [Datasets] SET [StorageMode] = 1 WHERE [Mode] IN (2, 3);");
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
