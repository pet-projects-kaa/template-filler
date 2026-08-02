using TemplateFiller.Models;
using TemplateFiller.Storage;

var builder = WebApplication.CreateBuilder(args);

if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    builder.WebHost.UseUrls("http://localhost:5080");
}

builder.Services.AddSingleton<TemplateRepository>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

var templates = app.MapGroup("/api/templates");

templates.MapGet("/", async (TemplateRepository repository, CancellationToken cancellationToken) =>
{
    var result = await repository.GetAllAsync(cancellationToken);
    return Results.Ok(result);
});

templates.MapGet("/{id:guid}", async (Guid id, TemplateRepository repository, CancellationToken cancellationToken) =>
{
    var result = await repository.GetByIdAsync(id, cancellationToken);
    return result is null ? Results.NotFound() : Results.Ok(result);
});

templates.MapPost("/", async (
    SaveTemplateRequest request,
    TemplateRepository repository,
    CancellationToken cancellationToken) =>
{
    var validationError = Validate(request);
    if (validationError is not null)
    {
        return Results.BadRequest(new { error = validationError });
    }

    var created = await repository.CreateAsync(request, cancellationToken);
    return Results.Created($"api/templates/{created.Id}", created);
});

templates.MapPut("/{id:guid}", async (
    Guid id,
    SaveTemplateRequest request,
    TemplateRepository repository,
    CancellationToken cancellationToken) =>
{
    var validationError = Validate(request);
    if (validationError is not null)
    {
        return Results.BadRequest(new { error = validationError });
    }

    var updated = await repository.UpdateAsync(id, request, cancellationToken);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

templates.MapDelete("/{id:guid}", async (
    Guid id,
    TemplateRepository repository,
    CancellationToken cancellationToken) =>
{
    var deleted = await repository.DeleteAsync(id, cancellationToken);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "template-filler",
    utc = DateTimeOffset.UtcNow
}));

app.MapFallbackToFile("index.html");

app.Run();

static string? Validate(SaveTemplateRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return "Укажите название шаблона.";
    }

    if (request.Name.Trim().Length > 120)
    {
        return "Название шаблона не должно быть длиннее 120 символов.";
    }

    if (request.ContentHtml?.Length > 2_000_000)
    {
        return "Шаблон слишком большой. Максимальный размер — 2 МБ.";
    }

    return null;
}
