using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddReportActiveAndUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // true, not EF's generated default of false: every report that already exists
            // predates this flag and is by definition not archived. Defaulting to false would
            // silently hide the entire catalogue on upgrade.
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Reports",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastViewedAtUtc",
                table: "Reports",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ViewCount",
                table: "Reports",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.UpdateData(
                table: "Reports",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "IsActive", "LastViewedAtUtc", "ViewCount" },
                values: new object[] { true, null, 0 });

            migrationBuilder.UpdateData(
                table: "Reports",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "IsActive", "LastViewedAtUtc", "ViewCount" },
                values: new object[] { true, null, 0 });

            migrationBuilder.UpdateData(
                table: "Reports",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "IsActive", "LastViewedAtUtc", "ViewCount" },
                values: new object[] { true, null, 0 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Reports");

            migrationBuilder.DropColumn(
                name: "LastViewedAtUtc",
                table: "Reports");

            migrationBuilder.DropColumn(
                name: "ViewCount",
                table: "Reports");
        }
    }
}
