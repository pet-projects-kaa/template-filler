using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using TemplateFiller.Export;
using TemplateFiller.Models;
using TemplateFiller.Security;
using TemplateFiller.Storage;

var builder = WebApplication.CreateBuilder(args);

if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    builder.WebHost.UseUrls("http://localhost:5080");
}

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 200L * 1024 * 1024;
});
builder.Services.AddSingleton<AppDatabase>();
builder.Services.AddSingleton<WordDocumentBuilder>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "template-filler-auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.Path = "/";
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context =>
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        }
        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        }
        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
});
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("login", limiter =>
    {
        limiter.PermitLimit = 8;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
});

var app = builder.Build();
var database = app.Services.GetRequiredService<AppDatabase>();
await database.InitializeAsync();
await BootstrapUserRepair.EnsureAsync(app.Environment);

app.UseForwardedHeaders();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.Use(async (context, next) =>
{
    var mustChangePassword = context.User.Identity?.IsAuthenticated == true &&
        string.Equals(context.User.FindFirstValue("must_change_password"), "true", StringComparison.OrdinalIgnoreCase);
    var isProtectedApi = context.Request.Path.StartsWithSegments("/api") &&
        !context.Request.Path.StartsWithSegments("/api/auth") &&
        !context.Request.Path.StartsWithSegments("/api/health");
    if (mustChangePassword && isProtectedApi)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { error = "Перед началом работы смените первоначальный пароль." });
        return;
    }
    await next();
});

var auth = app.MapGroup("/api/auth");
auth.MapPost("/login", async (LoginRequest request, HttpContext context, AppDatabase db, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrEmpty(request.Password))
        return Results.BadRequest(new { error = "Введите логин и пароль." });
    var user = await db.GetUserByUsernameAsync(request.Username, ct);
    if (user is null || !PasswordHasher.Verify(request.Password, user.PasswordSalt, user.PasswordHash, user.PasswordIterations))
    {
        await Task.Delay(250, ct);
        return Results.Json(new { error = "Неверный логин или пароль." }, statusCode: StatusCodes.Status401Unauthorized);
    }
    await SignInAsync(context, user, request.RememberMe);
    return Results.Ok(new AuthUserResponse(user.Username, user.MustChangePassword));
}).RequireRateLimiting("login");

auth.MapGet("/me", (ClaimsPrincipal principal) =>
{
    var username = principal.Identity?.Name;
    if (string.IsNullOrWhiteSpace(username)) return Results.Unauthorized();
    var mustChange = string.Equals(principal.FindFirstValue("must_change_password"), "true", StringComparison.OrdinalIgnoreCase);
    return Results.Ok(new AuthUserResponse(username, mustChange));
}).RequireAuthorization();

auth.MapPost("/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization();

auth.MapPost("/change-password", async (ChangePasswordRequest request, ClaimsPrincipal principal, HttpContext context, AppDatabase db, CancellationToken ct) =>
{
    if (string.IsNullOrEmpty(request.NewPassword) || request.NewPassword.Length < 8)
        return Results.BadRequest(new { error = "Новый пароль должен содержать не менее 8 символов." });
    if (request.NewPassword.Length > 200) return Results.BadRequest(new { error = "Новый пароль слишком длинный." });
    if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var user = await db.GetUserByIdAsync(userId, ct);
    if (user is null || !PasswordHasher.Verify(request.CurrentPassword, user.PasswordSalt, user.PasswordHash, user.PasswordIterations))
        return Results.BadRequest(new { error = "Текущий пароль указан неверно." });
    await db.UpdatePasswordAsync(user.Id, request.NewPassword, ct);
    var updated = user with { MustChangePassword = false };
    await SignInAsync(context, updated, true);
    return Results.Ok(new AuthUserResponse(updated.Username, false));
}).RequireAuthorization();

var templates = app.MapGroup("/api/templates").RequireAuthorization();
templates.MapGet("/", async (AppDatabase db, CancellationToken ct) => Results.Ok(await db.GetTemplatesAsync(ct)));
templates.MapGet("/{id:guid}", async (Guid id, AppDatabase db, CancellationToken ct) =>
{
    var item = await db.GetTemplateAsync(id, ct);
    return item is null ? Results.NotFound() : Results.Ok(item);
});
templates.MapPost("/", async (SaveTemplateRequest request, AppDatabase db, CancellationToken ct) =>
{
    var error = ValidateTemplate(request);
    if (error is not null) return Results.BadRequest(new { error });
    var created = await db.CreateTemplateAsync(request, ct);
    return Results.Created($"api/templates/{created.Id}", created);
});
templates.MapPut("/{id:guid}", async (Guid id, SaveTemplateRequest request, AppDatabase db, CancellationToken ct) =>
{
    var error = ValidateTemplate(request);
    if (error is not null) return Results.BadRequest(new { error });
    var updated = await db.UpdateTemplateAsync(id, request, ct);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
templates.MapDelete("/{id:guid}", async (Guid id, AppDatabase db, CancellationToken ct) =>
    await db.DeleteTemplateAsync(id, ct) ? Results.NoContent() : Results.NotFound());

app.MapPost("/api/export/word", (WordExportRequest request, WordDocumentBuilder documentBuilder) =>
{
    try
    {
        var document = documentBuilder.Build(request);
        return Results.File(document, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", WordDocumentBuilder.NormalizeFileName(request.FileName));
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
}).RequireAuthorization();

var assets = app.MapGroup("/api/assets").RequireAuthorization();
assets.MapGet("/", async (string? type, AppDatabase db, CancellationToken ct) => Results.Ok(await db.GetAssetsAsync(NormalizeAssetType(type), ct)));
assets.MapGet("/{id:guid}/file", async (Guid id, AppDatabase db, CancellationToken ct) =>
{
    var asset = await db.GetAssetAsync(id, ct);
    if (asset is null) return Results.NotFound();
    var path = Path.Combine(db.AssetsDirectory, asset.Type, asset.FileName);
    return File.Exists(path) ? Results.File(path, asset.ContentType, enableRangeProcessing: true) : Results.NotFound();
});
assets.MapPost("/{type}", async (string type, HttpRequest request, AppDatabase db, CancellationToken ct) =>
{
    type = NormalizeAssetType(type) ?? string.Empty;
    if (type is not ("signature" or "font" or "background")) return Results.BadRequest(new { error = "Неизвестный тип объекта." });
    if (!request.HasFormContentType) return Results.BadRequest(new { error = "Ожидалась multipart-форма." });
    var form = await request.ReadFormAsync(ct);
    if (form.Files.Count == 0) return Results.BadRequest(new { error = "Файлы не выбраны." });
    if (form.Files.Count > 200) return Results.BadRequest(new { error = "За один раз можно загрузить не более 200 файлов." });

    var directory = Path.Combine(db.AssetsDirectory, type);
    Directory.CreateDirectory(directory);
    var created = new List<AssetRecord>();
    foreach (var file in form.Files)
    {
        var validation = ValidateAsset(type, file);
        if (validation is not null) return Results.BadRequest(new { error = $"{file.FileName}: {validation}" });
        var id = Guid.NewGuid();
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var storedName = id.ToString("N") + extension;
        var path = Path.Combine(directory, storedName);
        await using (var stream = File.Create(path)) await file.CopyToAsync(stream, ct);
        var displayName = Path.GetFileNameWithoutExtension(file.FileName);
        var record = await db.AddAssetAsync(type, displayName, storedName, NormalizeContentType(type, extension, file.ContentType), file.Length, ct);
        created.Add(record);
    }
    return Results.Ok(created);
});
assets.MapDelete("/{id:guid}", async (Guid id, AppDatabase db, CancellationToken ct) =>
{
    var asset = await db.DeleteAssetAsync(id, ct);
    if (asset is null) return Results.NotFound();
    var path = Path.Combine(db.AssetsDirectory, asset.Type, asset.FileName);
    if (File.Exists(path)) File.Delete(path);
    return Results.NoContent();
});

var gallery = app.MapGroup("/api/documents").RequireAuthorization();
gallery.MapGet("/", async (AppDatabase db, CancellationToken ct) => Results.Ok(await db.GetGalleryDocumentsAsync(ct)));
gallery.MapGet("/{id:guid}/file", async (Guid id, AppDatabase db, CancellationToken ct) =>
{
    var document = await db.GetGalleryDocumentAsync(id, ct);
    if (document is null) return Results.NotFound();
    var path = Path.Combine(db.DocumentsDirectory, document.FileName);
    return File.Exists(path) ? Results.File(path, document.ContentType, document.Title + Path.GetExtension(document.FileName), enableRangeProcessing: true) : Results.NotFound();
});
gallery.MapPost("/", async (HttpRequest request, AppDatabase db, CancellationToken ct) =>
{
    if (!request.HasFormContentType) return Results.BadRequest(new { error = "Ожидалась multipart-форма." });
    var form = await request.ReadFormAsync(ct);
    var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
    if (file is null || file.Length == 0) return Results.BadRequest(new { error = "Документ не передан." });
    if (file.Length > 50L * 1024 * 1024) return Results.BadRequest(new { error = "Документ должен быть не больше 50 МБ." });
    var kind = (form["kind"].ToString().Trim().ToLowerInvariant()) switch
    {
        "handwriting" => "handwriting",
        "template" => "template",
        _ => "document"
    };
    var title = form["title"].ToString().Trim();
    if (string.IsNullOrWhiteSpace(title)) title = Path.GetFileNameWithoutExtension(file.FileName);
    title = title.Length > 160 ? title[..160] : title;
    Guid? templateId = Guid.TryParse(form["templateId"], out var parsed) ? parsed : null;
    var extension = SafeDocumentExtension(file.FileName, file.ContentType);
    var storedName = Guid.NewGuid().ToString("N") + extension;
    var path = Path.Combine(db.DocumentsDirectory, storedName);
    await using (var stream = File.Create(path)) await file.CopyToAsync(stream, ct);
    var created = await db.AddGalleryDocumentAsync(kind, title, storedName, file.ContentType ?? "application/octet-stream", file.Length, templateId, ct);
    return Results.Ok(created);
});
gallery.MapDelete("/{id:guid}", async (Guid id, AppDatabase db, CancellationToken ct) =>
{
    var document = await db.DeleteGalleryDocumentAsync(id, ct);
    if (document is null) return Results.NotFound();
    var path = Path.Combine(db.DocumentsDirectory, document.FileName);
    if (File.Exists(path)) File.Delete(path);
    return Results.NoContent();
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "template-filler", storage = "sqlite", utc = DateTimeOffset.UtcNow }));
app.MapFallbackToFile("index.html");
app.Run();

static async Task SignInAsync(HttpContext context, UserAuthRecord user, bool rememberMe)
{
    var identity = new ClaimsIdentity(new[]
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString("D")),
        new Claim(ClaimTypes.Name, user.Username),
        new Claim("must_change_password", user.MustChangePassword ? "true" : "false")
    }, CookieAuthenticationDefaults.AuthenticationScheme);
    var properties = new AuthenticationProperties { IsPersistent = rememberMe, AllowRefresh = true };
    if (rememberMe) properties.ExpiresUtc = DateTimeOffset.UtcNow.AddDays(30);
    await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), properties);
}

static string? ValidateTemplate(SaveTemplateRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Name)) return "Укажите название шаблона.";
    if (request.Name.Trim().Length > 120) return "Название шаблона не должно быть длиннее 120 символов.";
    if (request.ContentHtml?.Length > 2_000_000) return "Шаблон слишком большой. Максимальный размер — 2 МБ.";
    return null;
}

static string? NormalizeAssetType(string? type)
{
    var value = type?.Trim().ToLowerInvariant();
    return value is "signature" or "font" or "background" ? value : null;
}

static string? ValidateAsset(string type, IFormFile file)
{
    if (file.Length <= 0) return "пустой файл";
    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    var max = type == "background" ? 20L * 1024 * 1024 : 10L * 1024 * 1024;
    if (file.Length > max) return $"размер превышает {max / 1024 / 1024} МБ";
    var allowed = type switch
    {
        "signature" => new[] { ".png", ".webp" },
        "font" => new[] { ".ttf", ".otf", ".woff", ".woff2" },
        "background" => new[] { ".png", ".jpg", ".jpeg", ".webp" },
        _ => Array.Empty<string>()
    };
    return allowed.Contains(extension) ? null : "неподдерживаемый формат";
}

static string NormalizeContentType(string type, string extension, string? supplied) => extension switch
{
    ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".webp" => "image/webp",
    ".ttf" => "font/ttf", ".otf" => "font/otf", ".woff" => "font/woff", ".woff2" => "font/woff2",
    _ => string.IsNullOrWhiteSpace(supplied) ? "application/octet-stream" : supplied
};

static string SafeDocumentExtension(string fileName, string? contentType)
{
    var extension = Path.GetExtension(fileName).ToLowerInvariant();
    if (extension is ".pdf" or ".docx" or ".html" or ".htm") return extension;
    return contentType switch
    {
        "application/pdf" => ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
        "text/html" => ".html",
        _ => ".bin"
    };
}
