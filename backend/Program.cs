using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Backend.Data;
using Backend.Middleware;
using Backend.Services;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.Materialization;
using Backend.Services.ReportPages;
using Backend.Services.Reports;
using Backend.Services.Widgets;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.JsonSerializerOptions.Converters.Add(new DecimalAsStringJsonConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<ReportingDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("ReportingDatabase")));
builder.Services.AddScoped<IReportService, ReportService>();

builder.Services.AddHttpClient();
// Persists Data Protection keys to a stable, app-independent location (ProgramData,
// identical on any Windows machine). Without this, IIS-hosted apps can fall back to
// ephemeral in-memory keys that don't survive an app pool restart -- every connection's
// EncryptedCredentials (see CredentialProtector) becomes permanently undecryptable the
// next time the pool restarts, since the key used to encrypt it is gone. Confirmed live:
// a real connection's credentials broke with a fast 502 after a routine redeploy cycled
// the app pool. Deliberately outside C:\AspNetCoreWebApps\reporting itself, since that
// whole directory is robocopy /MIR'd (wiped and replaced) on every deploy.
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "OpenReportingPlatform", "keys")))
    .SetApplicationName("OpenReportingPlatform");
builder.Services.AddScoped<ICredentialProtector, CredentialProtector>();
builder.Services.Configure<SqlServerProviderOptions>(builder.Configuration.GetSection("DataSources:SqlServer"));
builder.Services.Configure<DatasetCacheOptions>(builder.Configuration.GetSection("DataSources:Cache"));
builder.Services.Configure<MaterializationOptions>(builder.Configuration.GetSection("Materialization"));
builder.Services.AddScoped<IMaterializationStore, SqlMaterializationStore>();
builder.Services.AddScoped<IMaterializationService, MaterializationService>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IDatasetResultCache, MemoryDatasetResultCache>();
builder.Services.AddScoped<IDataSourceProvider, SqlServerProvider>();
builder.Services.AddScoped<IDataSourceProvider, RestApiProvider>();
builder.Services.AddScoped<IDataSourceService, DataSourceService>();
builder.Services.AddScoped<IDatasetService, DatasetService>();
builder.Services.AddScoped<IWidgetBindingValidator, WidgetBindingValidator>();
builder.Services.AddScoped<IWidgetService, WidgetService>();
builder.Services.AddScoped<IReportPageService, ReportPageService>();

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors("Frontend");
}

app.UseExceptionHandler();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Required so WebApplicationFactory<Program> (used by integration tests) can reference the
// top-level-statement Program class, which the compiler otherwise generates as internal.
public partial class Program
{
}
