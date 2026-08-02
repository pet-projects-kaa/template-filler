using System.Text.Json;
using TemplateFiller.Models;

namespace TemplateFiller.Storage;

public sealed class TemplateRepository
{
    private readonly string _filePath;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };
    private readonly SemaphoreSlim _gate = new(1, 1);
    private List<TemplateDocument>? _templates;

    public TemplateRepository(IHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        _filePath = Path.Combine(dataDirectory, "templates.json");
    }

    public async Task<IReadOnlyList<TemplateListItem>> GetAllAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureLoadedAsync(cancellationToken);

            return _templates!
                .OrderByDescending(template => template.UpdatedAt)
                .Select(template => new TemplateListItem(
                    template.Id,
                    template.Name,
                    template.CreatedAt,
                    template.UpdatedAt))
                .ToArray();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<TemplateDocument?> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureLoadedAsync(cancellationToken);
            return Clone(_templates!.FirstOrDefault(template => template.Id == id));
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<TemplateDocument> CreateAsync(
        SaveTemplateRequest request,
        CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureLoadedAsync(cancellationToken);

            var now = DateTimeOffset.UtcNow;
            var template = new TemplateDocument
            {
                Id = Guid.NewGuid(),
                Name = request.Name.Trim(),
                ContentHtml = request.ContentHtml ?? string.Empty,
                CreatedAt = now,
                UpdatedAt = now
            };

            _templates!.Add(template);
            await SaveAsync(cancellationToken);
            return Clone(template)!;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<TemplateDocument?> UpdateAsync(
        Guid id,
        SaveTemplateRequest request,
        CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureLoadedAsync(cancellationToken);

            var template = _templates!.FirstOrDefault(item => item.Id == id);
            if (template is null)
            {
                return null;
            }

            template.Name = request.Name.Trim();
            template.ContentHtml = request.ContentHtml ?? string.Empty;
            template.UpdatedAt = DateTimeOffset.UtcNow;

            await SaveAsync(cancellationToken);
            return Clone(template);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureLoadedAsync(cancellationToken);

            var removed = _templates!.RemoveAll(template => template.Id == id) > 0;
            if (removed)
            {
                await SaveAsync(cancellationToken);
            }

            return removed;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task EnsureLoadedAsync(CancellationToken cancellationToken)
    {
        if (_templates is not null)
        {
            return;
        }

        if (!File.Exists(_filePath))
        {
            _templates = [];
            return;
        }

        try
        {
            await using var stream = File.OpenRead(_filePath);
            _templates = await JsonSerializer.DeserializeAsync<List<TemplateDocument>>(
                stream,
                _jsonOptions,
                cancellationToken) ?? [];
        }
        catch (JsonException)
        {
            var brokenFile = $"{_filePath}.broken-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
            File.Move(_filePath, brokenFile, overwrite: true);
            _templates = [];
        }
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        var temporaryFile = $"{_filePath}.tmp";

        await using (var stream = File.Create(temporaryFile))
        {
            await JsonSerializer.SerializeAsync(stream, _templates, _jsonOptions, cancellationToken);
            await stream.FlushAsync(cancellationToken);
        }

        File.Move(temporaryFile, _filePath, overwrite: true);
    }

    private static TemplateDocument? Clone(TemplateDocument? template)
    {
        if (template is null)
        {
            return null;
        }

        return new TemplateDocument
        {
            Id = template.Id,
            Name = template.Name,
            ContentHtml = template.ContentHtml,
            CreatedAt = template.CreatedAt,
            UpdatedAt = template.UpdatedAt
        };
    }
}
