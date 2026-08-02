using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Http.Features;
using TemplateFiller.Export;
using TemplateFiller.Models;
using TemplateFiller.Security;
using TemplateFiller.Storage;

var builder = WebApplication.CreateBuilder(args);

if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    builder.WebHost.UseUrls("http://localhost:5080");
}

builder.Services.AddSingleton<AppDatabase>();
builder.Services.AddSingleton<WordDocumentBuilder>();

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "template-filler-auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.Cookie.Path = "/";
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

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 9 * 1024 * 1024;
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

await app.Services.GetRequiredService<AppDatabase>().InitializeAsync();
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
        await context.Response.WriteAsJsonAsync(new
        {
            error = "Перед началом работы смените первоначальный пароль."
        });
        return;
    }

    await next();
});

var auth = app.MapGroup("/api/auth");

auth.MapPost("/login", async (
    LoginRequest request,
    HttpContext httpContext,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrEmpty(request.Password))
    {
        return Results.BadRequest(new { error = "Введите логин и пароль." });
    }

    var user = await database.GetUserByUsernameAsync(request.Username, cancellationToken);
    if (user is null || !PasswordHasher.Verify(
            request.Password,
            user.PasswordSalt,
            user.PasswordHash,
            user.PasswordIterations))
    {
        await Task.Delay(250, cancellationToken);
        return Results.Json(
            new { error = "Неверный логин или пароль." },
            statusCode: StatusCodes.Status401Unauthorized);
    }

    await SignInAsync(httpContext, user, request.RememberMe);
    return Results.Ok(new AuthUserResponse(user.Username, user.MustChangePassword));
}).RequireRateLimiting("login");

auth.MapGet("/me", async (
    ClaimsPrincipal principal,
    HttpContext httpContext,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    var userIdValue = principal.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!Guid.TryParse(userIdValue, out var userId))
    {
        return Results.Unauthorized();
    }

    var user = await database.GetUserByIdAsync(userId, cancellationToken);
    if (user is null)
    {
        await httpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.Unauthorized();
    }

    var claimRequiresChange = string.Equals(
        principal.FindFirstValue("must_change_password"),
        "true",
        StringComparison.OrdinalIgnoreCase);

    if (claimRequiresChange != user.MustChangePassword ||
        !string.Equals(principal.Identity?.Name, user.Username, StringComparison.Ordinal))
    {
        await SignInAsync(httpContext, user, rememberMe: true);
    }

    return Results.Ok(new AuthUserResponse(user.Username, user.MustChangePassword));
}).RequireAuthorization();

auth.MapPost("/logout", async (HttpContext httpContext) =>
{
    await httpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization();

auth.MapPost("/change-password", async (
    ChangePasswordRequest request,
    ClaimsPrincipal principal,
    HttpContext httpContext,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrEmpty(request.NewPassword) || request.NewPassword.Length < 8)
    {
        return Results.BadRequest(new { error = "Новый пароль должен содержать не менее 8 символов." });
    }

    if (request.NewPassword.Length > 200)
    {
        return Results.BadRequest(new { error = "Новый пароль слишком длинный." });
    }

    var userIdValue = principal.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!Guid.TryParse(userIdValue, out var userId))
    {
        return Results.Unauthorized();
    }

    var user = await database.GetUserByIdAsync(userId, cancellationToken);
    if (user is null || !PasswordHasher.Verify(
            request.CurrentPassword,
            user.PasswordSalt,
            user.PasswordHash,
            user.PasswordIterations))
    {
        return Results.BadRequest(new { error = "Текущий пароль указан неверно." });
    }

    await database.UpdatePasswordAsync(user.Id, request.NewPassword, cancellationToken);
    var updatedUser = user with { MustChangePassword = false };
    await SignInAsync(httpContext, updatedUser, rememberMe: true);
    return Results.Ok(new AuthUserResponse(updatedUser.Username, false));
}).RequireAuthorization();

var templates = app.MapGroup("/api/templates").RequireAuthorization();

templates.MapGet("/", async (AppDatabase database, CancellationToken cancellationToken) =>
{
    var result = await database.GetTemplatesAsync(cancellationToken);
    return Results.Ok(result);
});

templates.MapGet("/{id:guid}", async (
    Guid id,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    var result = await database.GetTemplateAsync(id, cancellationToken);
    return result is null ? Results.NotFound() : Results.Ok(result);
});

templates.MapPost("/", async (
    SaveTemplateRequest request,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    var validationError = ValidateTemplate(request);
    if (validationError is not null)
    {
        return Results.BadRequest(new { error = validationError });
    }

    var created = await database.CreateTemplateAsync(request, cancellationToken);
    return Results.Created($"api/templates/{created.Id}", created);
});

templates.MapPut("/{id:guid}", async (
    Guid id,
    SaveTemplateRequest request,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    var validationError = ValidateTemplate(request);
    if (validationError is not null)
    {
        return Results.BadRequest(new { error = validationError });
    }

    var updated = await database.UpdateTemplateAsync(id, request, cancellationToken);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

templates.MapDelete("/{id:guid}", async (
    Guid id,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    var deleted = await database.DeleteTemplateAsync(id, cancellationToken);
    return deleted ? Results.NoContent() : Results.NotFound();
});

var fonts = app.MapGroup("/api/fonts").RequireAuthorization();

fonts.MapGet("/", async (
    ClaimsPrincipal principal,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var result = await database.GetUploadedFontsAsync(userId, cancellationToken);
    return Results.Ok(result);
});

fonts.MapGet("/{id:guid}/file", async (
    Guid id,
    ClaimsPrincipal principal,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var font = await database.GetUploadedFontFileAsync(userId, id, cancellationToken);
    if (font is null)
    {
        return Results.NotFound();
    }

    return Results.File(font.Data, font.ContentType);
});

fonts.MapPost("/", async (
    HttpRequest request,
    ClaimsPrincipal principal,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    const long maxFontSize = 8 * 1024 * 1024;

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Ожидается файл шрифта." });
    }

    IFormCollection form;
    try
    {
        form = await request.ReadFormAsync(cancellationToken);
    }
    catch (InvalidDataException)
    {
        return Results.BadRequest(new { error = "Файл шрифта должен быть не больше 8 МБ." });
    }

    var file = form.Files.GetFile("file");
    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "Выберите файл шрифта." });
    }

    if (file.Length > maxFontSize)
    {
        return Results.BadRequest(new { error = "Файл шрифта должен быть не больше 8 МБ." });
    }

    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    var contentType = extension switch
    {
        ".ttf" => "font/ttf",
        ".otf" => "font/otf",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        _ => null
    };

    if (contentType is null)
    {
        return Results.BadRequest(new { error = "Поддерживаются только TTF, OTF, WOFF и WOFF2." });
    }

    await using var input = file.OpenReadStream();
    using var buffer = new MemoryStream((int)file.Length);
    await input.CopyToAsync(buffer, cancellationToken);
    var data = buffer.ToArray();

    if (!HasValidFontSignature(data, extension))
    {
        return Results.BadRequest(new { error = "Файл не похож на шрифт указанного формата." });
    }

    var requestedName = form["name"].ToString();
    var displayName = NormalizeFontName(
        string.IsNullOrWhiteSpace(requestedName)
            ? Path.GetFileNameWithoutExtension(file.FileName)
            : requestedName);

    var originalFileName = Path.GetFileName(file.FileName);
    var created = await database.CreateUploadedFontAsync(
        userId,
        displayName,
        originalFileName,
        contentType,
        extension,
        data,
        cancellationToken);

    return Results.Created($"api/fonts/{created.Id}", created);
});

fonts.MapDelete("/{id:guid}", async (
    Guid id,
    ClaimsPrincipal principal,
    AppDatabase database,
    CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var deleted = await database.DeleteUploadedFontAsync(userId, id, cancellationToken);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapPost("/api/export/word", (
    WordExportRequest request,
    WordDocumentBuilder documentBuilder) =>
{
    try
    {
        var document = documentBuilder.Build(request);
        var fileName = WordDocumentBuilder.NormalizeFileName(request.FileName);
        return Results.File(
            document,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileName);
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
}).RequireAuthorization();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "template-filler",
    storage = "sqlite",
    utc = DateTimeOffset.UtcNow
}));

app.MapFallbackToFile("index.html");
app.Run();

static async Task SignInAsync(HttpContext context, UserAuthRecord user, bool rememberMe)
{
    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString("D")),
        new Claim(ClaimTypes.Name, user.Username),
        new Claim("must_change_password", user.MustChangePassword ? "true" : "false")
    };

    var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
    var principal = new ClaimsPrincipal(identity);
    var properties = new AuthenticationProperties
    {
        IsPersistent = rememberMe,
        AllowRefresh = true
    };

    if (rememberMe)
    {
        properties.ExpiresUtc = DateTimeOffset.UtcNow.AddDays(30);
    }

    await context.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        principal,
        properties);
}

static string? ValidateTemplate(SaveTemplateRequest request)
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

static bool TryGetUserId(ClaimsPrincipal principal, out Guid userId) =>
    Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

static string NormalizeFontName(string value)
{
    var normalized = new string(value
        .Where(character => !char.IsControl(character))
        .ToArray())
        .Trim();

    if (string.IsNullOrWhiteSpace(normalized))
    {
        normalized = "Мой шрифт";
    }

    return normalized.Length > 80 ? normalized[..80] : normalized;
}

static bool HasValidFontSignature(byte[] data, string extension)
{
    if (data.Length < 4)
    {
        return false;
    }

    return extension switch
    {
        ".ttf" =>
            data.AsSpan(0, 4).SequenceEqual(new byte[] { 0x00, 0x01, 0x00, 0x00 }) ||
            data.AsSpan(0, 4).SequenceEqual("true"u8) ||
            data.AsSpan(0, 4).SequenceEqual("typ1"u8),
        ".otf" => data.AsSpan(0, 4).SequenceEqual("OTTO"u8),
        ".woff" => data.AsSpan(0, 4).SequenceEqual("wOFF"u8),
        ".woff2" => data.AsSpan(0, 4).SequenceEqual("wOF2"u8),
        _ => false
    };
}

