using System.Text.Json.Serialization;
using Backend.Data;
using Backend.Services;
using Backend.Services.DataSources;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<ReportingDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("ReportingDatabase")));
builder.Services.AddScoped<IReportRepository, EfReportRepository>();

builder.Services.AddHttpClient();
builder.Services.AddDataProtection();
builder.Services.AddScoped<ICredentialProtector, CredentialProtector>();
builder.Services.AddScoped<IDataSourceProvider, SqlServerProvider>();
builder.Services.AddScoped<IDataSourceProvider, RestApiProvider>();
builder.Services.AddScoped<IDataSourceService, DataSourceService>();

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

app.UseAuthorization();
app.MapControllers();

app.Run();
