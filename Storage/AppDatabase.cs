using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TemplateFiller.Models;
using TemplateFiller.Security;

namespace TemplateFiller.Storage;

public sealed class AppDatabase
{
    private readonly string _connectionString;
    private readonly string _legacyJsonPath;
    private readonly SemaphoreSlim _initializationGate = new(1, 1);
    private bool _initialized;

    public AppDatabase(IHostEnvironment environment)
    {
        DataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        AssetsDirectory = Path.Combine(DataDirectory, "assets");
        DocumentsDirectory = Path.Combine(DataDirectory, "documents");
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(AssetsDirectory);
        Directory.CreateDirectory(DocumentsDirectory);

        var databasePath = Path.Combine(DataDirectory, "template-filler.db");
        _legacyJsonPath = Path.Combine(DataDirectory, "templates.json");
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            ForeignKeys = true,
            Pooling = true
        }.ToString();
    }

    public string DataDirectory { get; }
    public string AssetsDirectory { get; }
    public string DocumentsDirectory { get; }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_initialized) return;
        await _initializationGate.WaitAsync(cancellationToken);
        try
        {
            if (_initialized) return;
            await using var connection = await OpenConnectionAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS Users (
                    Id TEXT NOT NULL PRIMARY KEY,
                    Username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    PasswordHash BLOB NOT NULL,
                    PasswordSalt BLOB NOT NULL,
                    PasswordIterations INTEGER NOT NULL,
                    MustChangePassword INTEGER NOT NULL DEFAULT 0,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS Templates (
                    Id TEXT NOT NULL PRIMARY KEY,
                    Name TEXT NOT NULL,
                    ContentHtml TEXT NOT NULL,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS Assets (
                    Id TEXT NOT NULL PRIMARY KEY,
                    Type TEXT NOT NULL,
                    Name TEXT NOT NULL,
                    FileName TEXT NOT NULL,
                    ContentType TEXT NOT NULL,
                    Size INTEGER NOT NULL,
                    CreatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS GalleryDocuments (
                    Id TEXT NOT NULL PRIMARY KEY,
                    Kind TEXT NOT NULL,
                    Title TEXT NOT NULL,
                    FileName TEXT NOT NULL,
                    ContentType TEXT NOT NULL,
                    Size INTEGER NOT NULL,
                    TemplateId TEXT NULL,
                    CreatedAt TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS IX_Templates_UpdatedAt ON Templates (UpdatedAt DESC);
                CREATE INDEX IF NOT EXISTS IX_Assets_Type_CreatedAt ON Assets (Type, CreatedAt DESC);
                CREATE INDEX IF NOT EXISTS IX_GalleryDocuments_CreatedAt ON GalleryDocuments (CreatedAt DESC);
                """;
            await command.ExecuteNonQueryAsync(cancellationToken);
            await SeedInitialUserAsync(connection, cancellationToken);
            await ImportLegacyTemplatesAsync(connection, cancellationToken);
            _initialized = true;
        }
        finally
        {
            _initializationGate.Release();
        }
    }

    public async Task<IReadOnlyList<TemplateListItem>> GetTemplatesAsync(CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, CreatedAt, UpdatedAt FROM Templates ORDER BY UpdatedAt DESC;";
        var result = new List<TemplateListItem>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new TemplateListItem(Guid.Parse(reader.GetString(0)), reader.GetString(1), ParseDate(reader.GetString(2)), ParseDate(reader.GetString(3))));
        }
        return result;
    }

    public async Task<TemplateDocument?> GetTemplateAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, ContentHtml, CreatedAt, UpdatedAt FROM Templates WHERE Id = $id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadTemplate(reader) : null;
    }

    public async Task<TemplateDocument> CreateTemplateAsync(SaveTemplateRequest request, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var template = new TemplateDocument
        {
            Id = Guid.NewGuid(), Name = request.Name.Trim(), ContentHtml = request.ContentHtml ?? string.Empty,
            CreatedAt = now, UpdatedAt = now
        };
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO Templates (Id, Name, ContentHtml, CreatedAt, UpdatedAt) VALUES ($id,$name,$html,$created,$updated);";
        command.Parameters.AddWithValue("$id", template.Id.ToString("D"));
        command.Parameters.AddWithValue("$name", template.Name);
        command.Parameters.AddWithValue("$html", template.ContentHtml);
        command.Parameters.AddWithValue("$created", FormatDate(template.CreatedAt));
        command.Parameters.AddWithValue("$updated", FormatDate(template.UpdatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken);
        return template;
    }

    public async Task<TemplateDocument?> UpdateTemplateAsync(Guid id, SaveTemplateRequest request, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE Templates SET Name=$name, ContentHtml=$html, UpdatedAt=$updated WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        command.Parameters.AddWithValue("$name", request.Name.Trim());
        command.Parameters.AddWithValue("$html", request.ContentHtml ?? string.Empty);
        command.Parameters.AddWithValue("$updated", FormatDate(DateTimeOffset.UtcNow));
        if (await command.ExecuteNonQueryAsync(cancellationToken) == 0) return null;
        return await GetTemplateAsync(id, cancellationToken);
    }

    public async Task<bool> DeleteTemplateAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Templates WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    public async Task<UserAuthRecord?> GetUserByUsernameAsync(string username, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id,Username,PasswordHash,PasswordSalt,PasswordIterations,MustChangePassword FROM Users WHERE Username=$username COLLATE NOCASE;";
        command.Parameters.AddWithValue("$username", username.Trim());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader) : null;
    }

    public async Task<UserAuthRecord?> GetUserByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id,Username,PasswordHash,PasswordSalt,PasswordIterations,MustChangePassword FROM Users WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader) : null;
    }

    public async Task<bool> UpdatePasswordAsync(Guid userId, string newPassword, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        var (hash, salt, iterations) = PasswordHasher.Hash(newPassword);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE Users SET PasswordHash=$hash,PasswordSalt=$salt,PasswordIterations=$iterations,MustChangePassword=0,UpdatedAt=$updated WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", userId.ToString("D"));
        command.Parameters.Add("$hash", SqliteType.Blob).Value = hash;
        command.Parameters.Add("$salt", SqliteType.Blob).Value = salt;
        command.Parameters.AddWithValue("$iterations", iterations);
        command.Parameters.AddWithValue("$updated", FormatDate(DateTimeOffset.UtcNow));
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    public async Task<IReadOnlyList<AssetRecord>> GetAssetsAsync(string? type, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = string.IsNullOrWhiteSpace(type)
            ? "SELECT Id,Type,Name,FileName,ContentType,Size,CreatedAt FROM Assets ORDER BY CreatedAt DESC;"
            : "SELECT Id,Type,Name,FileName,ContentType,Size,CreatedAt FROM Assets WHERE Type=$type ORDER BY CreatedAt DESC;";
        if (!string.IsNullOrWhiteSpace(type)) command.Parameters.AddWithValue("$type", type);
        var result = new List<AssetRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) result.Add(ReadAsset(reader));
        return result;
    }

    public async Task<AssetRecord?> GetAssetAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id,Type,Name,FileName,ContentType,Size,CreatedAt FROM Assets WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadAsset(reader) : null;
    }

    public async Task<AssetRecord> AddAssetAsync(string type, string name, string fileName, string contentType, long size, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        var record = new AssetRecord(Guid.NewGuid(), type, name, fileName, contentType, size, DateTimeOffset.UtcNow);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO Assets (Id,Type,Name,FileName,ContentType,Size,CreatedAt) VALUES ($id,$type,$name,$file,$content,$size,$created);";
        command.Parameters.AddWithValue("$id", record.Id.ToString("D"));
        command.Parameters.AddWithValue("$type", record.Type);
        command.Parameters.AddWithValue("$name", record.Name);
        command.Parameters.AddWithValue("$file", record.FileName);
        command.Parameters.AddWithValue("$content", record.ContentType);
        command.Parameters.AddWithValue("$size", record.Size);
        command.Parameters.AddWithValue("$created", FormatDate(record.CreatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken);
        return record;
    }

    public async Task<AssetRecord?> DeleteAssetAsync(Guid id, CancellationToken cancellationToken)
    {
        var asset = await GetAssetAsync(id, cancellationToken);
        if (asset is null) return null;
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Assets WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken);
        return asset;
    }

    public async Task<IReadOnlyList<GalleryDocumentRecord>> GetGalleryDocumentsAsync(CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id,Kind,Title,FileName,ContentType,Size,TemplateId,CreatedAt FROM GalleryDocuments ORDER BY CreatedAt DESC;";
        var result = new List<GalleryDocumentRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) result.Add(ReadGalleryDocument(reader));
        return result;
    }

    public async Task<GalleryDocumentRecord?> GetGalleryDocumentAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id,Kind,Title,FileName,ContentType,Size,TemplateId,CreatedAt FROM GalleryDocuments WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadGalleryDocument(reader) : null;
    }

    public async Task<GalleryDocumentRecord> AddGalleryDocumentAsync(string kind, string title, string fileName, string contentType, long size, Guid? templateId, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        var record = new GalleryDocumentRecord(Guid.NewGuid(), kind, title, fileName, contentType, size, templateId, DateTimeOffset.UtcNow);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO GalleryDocuments (Id,Kind,Title,FileName,ContentType,Size,TemplateId,CreatedAt) VALUES ($id,$kind,$title,$file,$content,$size,$template,$created);";
        command.Parameters.AddWithValue("$id", record.Id.ToString("D"));
        command.Parameters.AddWithValue("$kind", record.Kind);
        command.Parameters.AddWithValue("$title", record.Title);
        command.Parameters.AddWithValue("$file", record.FileName);
        command.Parameters.AddWithValue("$content", record.ContentType);
        command.Parameters.AddWithValue("$size", record.Size);
        command.Parameters.AddWithValue("$template", record.TemplateId?.ToString("D") ?? (object)DBNull.Value);
        command.Parameters.AddWithValue("$created", FormatDate(record.CreatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken);
        return record;
    }

    public async Task<GalleryDocumentRecord?> DeleteGalleryDocumentAsync(Guid id, CancellationToken cancellationToken)
    {
        var document = await GetGalleryDocumentAsync(id, cancellationToken);
        if (document is null) return null;
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM GalleryDocuments WHERE Id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken);
        return document;
    }

    private async Task EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        if (!_initialized) await InitializeAsync(cancellationToken);
    }

    private async Task<SqliteConnection> OpenConnectionAsync(CancellationToken cancellationToken)
    {
        var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;";
        await command.ExecuteNonQueryAsync(cancellationToken);
        return connection;
    }

    private static async Task SeedInitialUserAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        await using var exists = connection.CreateCommand();
        exists.CommandText = "SELECT 1 FROM Users WHERE Username='01' COLLATE NOCASE LIMIT 1;";
        if (await exists.ExecuteScalarAsync(cancellationToken) is not null) return;
        var (hash, salt, iterations) = PasswordHasher.Hash("pswd01");
        var now = FormatDate(DateTimeOffset.UtcNow);
        await using var insert = connection.CreateCommand();
        insert.CommandText = "INSERT INTO Users (Id,Username,PasswordHash,PasswordSalt,PasswordIterations,MustChangePassword,CreatedAt,UpdatedAt) VALUES ($id,'01',$hash,$salt,$iterations,0,$created,$updated);";
        insert.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("D"));
        insert.Parameters.Add("$hash", SqliteType.Blob).Value = hash;
        insert.Parameters.Add("$salt", SqliteType.Blob).Value = salt;
        insert.Parameters.AddWithValue("$iterations", iterations);
        insert.Parameters.AddWithValue("$created", now);
        insert.Parameters.AddWithValue("$updated", now);
        await insert.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task ImportLegacyTemplatesAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        if (!File.Exists(_legacyJsonPath)) return;
        await using var count = connection.CreateCommand();
        count.CommandText = "SELECT COUNT(*) FROM Templates;";
        if (Convert.ToInt32(await count.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) > 0) return;
        try
        {
            var json = await File.ReadAllTextAsync(_legacyJsonPath, cancellationToken);
            var legacy = JsonSerializer.Deserialize<List<TemplateDocument>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
            foreach (var item in legacy)
            {
                await using var insert = connection.CreateCommand();
                insert.CommandText = "INSERT OR IGNORE INTO Templates (Id,Name,ContentHtml,CreatedAt,UpdatedAt) VALUES ($id,$name,$html,$created,$updated);";
                insert.Parameters.AddWithValue("$id", item.Id == Guid.Empty ? Guid.NewGuid().ToString("D") : item.Id.ToString("D"));
                insert.Parameters.AddWithValue("$name", string.IsNullOrWhiteSpace(item.Name) ? "Шаблон" : item.Name);
                insert.Parameters.AddWithValue("$html", item.ContentHtml ?? string.Empty);
                insert.Parameters.AddWithValue("$created", FormatDate(item.CreatedAt == default ? DateTimeOffset.UtcNow : item.CreatedAt));
                insert.Parameters.AddWithValue("$updated", FormatDate(item.UpdatedAt == default ? DateTimeOffset.UtcNow : item.UpdatedAt));
                await insert.ExecuteNonQueryAsync(cancellationToken);
            }
            File.Move(_legacyJsonPath, _legacyJsonPath + ".migrated", true);
        }
        catch { }
    }

    private static TemplateDocument ReadTemplate(SqliteDataReader reader) => new()
    {
        Id = Guid.Parse(reader.GetString(0)), Name = reader.GetString(1), ContentHtml = reader.GetString(2),
        CreatedAt = ParseDate(reader.GetString(3)), UpdatedAt = ParseDate(reader.GetString(4))
    };

    private static UserAuthRecord ReadUser(SqliteDataReader reader) => new(
        Guid.Parse(reader.GetString(0)), reader.GetString(1), (byte[])reader[2], (byte[])reader[3], reader.GetInt32(4), reader.GetInt32(5) != 0);

    private static AssetRecord ReadAsset(SqliteDataReader reader) => new(
        Guid.Parse(reader.GetString(0)), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetInt64(5), ParseDate(reader.GetString(6)));

    private static GalleryDocumentRecord ReadGalleryDocument(SqliteDataReader reader) => new(
        Guid.Parse(reader.GetString(0)), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetInt64(5),
        reader.IsDBNull(6) ? null : Guid.Parse(reader.GetString(6)), ParseDate(reader.GetString(7)));

    private static string FormatDate(DateTimeOffset value) => value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    private static DateTimeOffset ParseDate(string value) => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
}
