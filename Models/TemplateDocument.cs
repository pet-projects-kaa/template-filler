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

public sealed record LoginRequest(string Username, string Password, bool RememberMe = true);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record AuthUserResponse(string Username, bool MustChangePassword);

public sealed record UserAuthRecord(
    Guid Id,
    string Username,
    byte[] PasswordHash,
    byte[] PasswordSalt,
    int PasswordIterations,
    bool MustChangePassword);

public sealed record WordExportRequest(string? FileName, IReadOnlyList<WordBlock>? Blocks);

public sealed record WordBlock(
    string Kind,
    WordParagraph? Paragraph,
    IReadOnlyList<IReadOnlyList<WordParagraph>>? Rows);

public sealed record WordParagraph(
    string? Alignment,
    int? HeadingLevel,
    IReadOnlyList<WordRun>? Runs);

public sealed record WordRun(
    string? Text,
    bool Bold,
    bool Italic,
    bool Underline,
    bool Strike,
    int? FontSize,
    string? Color,
    bool Break = false);

public sealed record UploadedFontListItem(
    Guid Id,
    string Name,
    string OriginalFileName,
    string FileExtension,
    long SizeBytes,
    DateTimeOffset CreatedAt);

public sealed record UploadedFontFile(
    byte[] Data,
    string ContentType,
    string OriginalFileName,
    string FileExtension);
