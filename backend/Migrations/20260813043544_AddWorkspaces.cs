using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-ordered. EF scaffolded this as: add the column with defaultValue 0, fix only the
            // three seeded reports, insert the workspace, then add the foreign key. On any real
            // database that fails at the foreign key, because every report that isn't one of the
            // three seeds is left pointing at workspace 0, which doesn't exist.
            //
            // The table and its default row therefore have to exist before the column references
            // them, and the column's default has to be that row's id.
            migrationBuilder.CreateTable(
                name: "Workspaces",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                });

            // IDENTITY_INSERT so the default workspace really is id 1, which Report.DefaultWorkspaceId
            // and the column default below both rely on.
            migrationBuilder.Sql(@"
SET IDENTITY_INSERT [Workspaces] ON;
INSERT INTO [Workspaces] ([Id], [Name], [Description], [SortOrder], [IsActive], [CreatedAtUtc])
VALUES (1, N'My workspace', N'Reports that haven''t been filed anywhere else.', 0, 1, '2026-08-13T00:00:00.000');
SET IDENTITY_INSERT [Workspaces] OFF;");

            migrationBuilder.AddColumn<int>(
                name: "WorkspaceId",
                table: "Reports",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_Reports_WorkspaceId",
                table: "Reports",
                column: "WorkspaceId");

            migrationBuilder.AddForeignKey(
                name: "FK_Reports_Workspaces_WorkspaceId",
                table: "Reports",
                column: "WorkspaceId",
                principalTable: "Workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Reports_Workspaces_WorkspaceId",
                table: "Reports");

            migrationBuilder.DropIndex(
                name: "IX_Reports_WorkspaceId",
                table: "Reports");

            migrationBuilder.DropColumn(
                name: "WorkspaceId",
                table: "Reports");

            migrationBuilder.DropTable(
                name: "Workspaces");
        }
    }
}