using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class RedesignReportDataModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DatasetId",
                table: "WidgetBindings");

            migrationBuilder.RenameColumn(
                name: "ReportId",
                table: "Widgets",
                newName: "ReportPageId");

            migrationBuilder.AddColumn<string>(
                name: "FormatOptions",
                table: "WidgetBindings",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<int>(
                name: "DatasetId",
                table: "Reports",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsSaved",
                table: "Datasets",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "ReportPages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ReportId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    FilterState = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportPages", x => x.Id);
                });

            migrationBuilder.UpdateData(
                table: "Reports",
                keyColumn: "Id",
                keyValue: 1,
                column: "DatasetId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Reports",
                keyColumn: "Id",
                keyValue: 2,
                column: "DatasetId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Reports",
                keyColumn: "Id",
                keyValue: 3,
                column: "DatasetId",
                value: null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReportPages");

            migrationBuilder.DropColumn(
                name: "FormatOptions",
                table: "WidgetBindings");

            migrationBuilder.DropColumn(
                name: "DatasetId",
                table: "Reports");

            migrationBuilder.DropColumn(
                name: "IsSaved",
                table: "Datasets");

            migrationBuilder.RenameColumn(
                name: "ReportPageId",
                table: "Widgets",
                newName: "ReportId");

            migrationBuilder.AddColumn<int>(
                name: "DatasetId",
                table: "WidgetBindings",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }
    }
}
