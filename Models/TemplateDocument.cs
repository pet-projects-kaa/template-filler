namespace TemplateFiller.Models;

public sealed class TemplateDocument
{
    public Guid Id { get; init; }
    public required string Name { get; set; }
    public required string ContentHtml { get; set; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed record SaveTemplateRequest(string Name, string? ContentHtml);

public sealed record TemplateListItem(
    Guid Id,
    string Name,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
