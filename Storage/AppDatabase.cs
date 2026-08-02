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
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);

        var databasePath = Path.Combine(dataDirectory, "template-filler.db");
        _legacyJsonPath = Path.Combine(dataDirectory, "templates.json");

        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            ForeignKeys = true,
            Pooling = true
        }.ToString();
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_initialized)
        {
            return;
        }

        await _initializationGate.WaitAsync(cancellationToken);
        try
        {
            if (_initialized)
            {
                return;
            }

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

                CREATE INDEX IF NOT EXISTS IX_Templates_UpdatedAt
                    ON Templates (UpdatedAt DESC);

                CREATE TABLE IF NOT EXISTS AppMigrations (
                    Name TEXT NOT NULL PRIMARY KEY,
                    AppliedAt TEXT NOT NULL
                );
                """;
            await command.ExecuteNonQueryAsync(cancellationToken);

            await SeedInitialUserAsync(connection, cancellationToken);
            await RestoreInitialUserAccessAsync(connection, cancellationToken);
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
        command.CommandText = """
            SELECT Id, Name, CreatedAt, UpdatedAt
            FROM Templates
            ORDER BY UpdatedAt DESC;
            """;

        var result = new List<TemplateListItem>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new TemplateListItem(
                Guid.Parse(reader.GetString(0)),
                reader.GetString(1),
                ParseDate(reader.GetString(2)),
                ParseDate(reader.GetString(3))));
        }

        return result;
    }

    public async Task<TemplateDocument?> GetTemplateAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, ContentHtml, CreatedAt, UpdatedAt
            FROM Templates
            WHERE Id = $id;
            """;
        command.Parameters.AddWithValue("$id", id.ToString("D"));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadTemplate(reader);
    }

    public async Task<TemplateDocument> CreateTemplateAsync(
        SaveTemplateRequest request,
        CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var template = new TemplateDocument
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            ContentHtml = request.ContentHtml ?? string.Empty,
            CreatedAt = now,
            UpdatedAt = now
        };

        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO Templates (Id, Name, ContentHtml, CreatedAt, UpdatedAt)
            VALUES ($id, $name, $contentHtml, $createdAt, $updatedAt);
            """;
        AddTemplateParameters(command, template);
        await command.ExecuteNonQueryAsync(cancellationToken);
        return template;
    }

    public async Task<TemplateDocument?> UpdateTemplateAsync(
        Guid id,
        SaveTemplateRequest request,
        CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE Templates
            SET Name = $name,
                ContentHtml = $contentHtml,
                UpdatedAt = $updatedAt
            WHERE Id = $id;
            """;
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        command.Parameters.AddWithValue("$name", request.Name.Trim());
        command.Parameters.AddWithValue("$contentHtml", request.ContentHtml ?? string.Empty);
        command.Parameters.AddWithValue("$updatedAt", FormatDate(now));

        if (await command.ExecuteNonQueryAsync(cancellationToken) == 0)
        {
            return null;
        }

        return await GetTemplateAsync(id, cancellationToken);
    }

    public async Task<bool> DeleteTemplateAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Templates WHERE Id = $id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    public async Task<UserAuthRecord?> GetUserByUsernameAsync(
        string username,
        CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Username, PasswordHash, PasswordSalt, PasswordIterations, MustChangePassword
            FROM Users
            WHERE Username = $username COLLATE NOCASE;
            """;
        command.Parameters.AddWithValue("$username", username.Trim());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader) : null;
    }

    public async Task<UserAuthRecord?> GetUserByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Username, PasswordHash, PasswordSalt, PasswordIterations, MustChangePassword
            FROM Users
            WHERE Id = $id;
            """;
        command.Parameters.AddWithValue("$id", id.ToString("D"));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader) : null;
    }

    public async Task<bool> UpdatePasswordAsync(
        Guid userId,
        string newPassword,
        CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        var (hash, salt, iterations) = PasswordHasher.Hash(newPassword);

        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE Users
            SET PasswordHash = $hash,
                PasswordSalt = $salt,
                PasswordIterations = $iterations,
                MustChangePassword = 0,
                UpdatedAt = $updatedAt
            WHERE Id = $id;
            """;
        command.Parameters.AddWithValue("$id", userId.ToString("D"));
        command.Parameters.Add("$hash", SqliteType.Blob).Value = hash;
        command.Parameters.Add("$salt", SqliteType.Blob).Value = salt;
        command.Parameters.AddWithValue("$iterations", iterations);
        command.Parameters.AddWithValue("$updatedAt", FormatDate(DateTimeOffset.UtcNow));
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    private async Task EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        if (!_initialized)
        {
            await InitializeAsync(cancellationToken);
        }
    }

    private async Task<SqliteConnection> OpenConnectionAsync(CancellationToken cancellationToken)
    {
        var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;";
        await command.ExecuteNonQueryAsync(cancellationToken);
        return connection;
    }

    private static async Task SeedInitialUserAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using var existsCommand = connection.CreateCommand();
        existsCommand.CommandText = "SELECT 1 FROM Users WHERE Username = $username COLLATE NOCASE LIMIT 1;";
        existsCommand.Parameters.AddWithValue("$username", "01");
        var exists = await existsCommand.ExecuteScalarAsync(cancellationToken) is not null;
        if (exists)
        {
            return;
        }

        var (hash, salt, iterations) = PasswordHasher.Hash("pswd01");
        var now = FormatDate(DateTimeOffset.UtcNow);

        await using var insertCommand = connection.CreateCommand();
        insertCommand.CommandText = """
            INSERT INTO Users
                (Id, Username, PasswordHash, PasswordSalt, PasswordIterations, MustChangePassword, CreatedAt, UpdatedAt)
            VALUES
                ($id, $username, $hash, $salt, $iterations, 1, $createdAt, $updatedAt);
            """;
        insertCommand.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("D"));
        insertCommand.Parameters.AddWithValue("$username", "01");
        insertCommand.Parameters.Add("$hash", SqliteType.Blob).Value = hash;
        insertCommand.Parameters.Add("$salt", SqliteType.Blob).Value = salt;
        insertCommand.Parameters.AddWithValue("$iterations", iterations);
        insertCommand.Parameters.AddWithValue("$createdAt", now);
        insertCommand.Parameters.AddWithValue("$updatedAt", now);
        await insertCommand.ExecuteNonQueryAsync(cancellationToken);
    }


    private static async Task RestoreInitialUserAccessAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        const string migrationName = "2026-08-02-restore-initial-user-01";

        await using var migrationExistsCommand = connection.CreateCommand();
        migrationExistsCommand.CommandText =
            "SELECT 1 FROM AppMigrations WHERE Name = $name LIMIT 1;";
        migrationExistsCommand.Parameters.AddWithValue("$name", migrationName);

        if (await migrationExistsCommand.ExecuteScalarAsync(cancellationToken) is not null)
        {
            return;
        }

        var (hash, salt, iterations) = PasswordHasher.Hash("pswd01");
        var now = FormatDate(DateTimeOffset.UtcNow);

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await using (var restoreCommand = connection.CreateCommand())
        {
            restoreCommand.Transaction = (SqliteTransaction)transaction;
            restoreCommand.CommandText = """
                INSERT INTO Users
                    (Id, Username, PasswordHash, PasswordSalt, PasswordIterations, MustChangePassword, CreatedAt, UpdatedAt)
                VALUES
                    ($id, '01', $hash, $salt, $iterations, 1, $createdAt, $updatedAt)
                ON CONFLICT(Username) DO UPDATE SET
                    PasswordHash = excluded.PasswordHash,
                    PasswordSalt = excluded.PasswordSalt,
                    PasswordIterations = excluded.PasswordIterations,
                    MustChangePassword = 1,
                    UpdatedAt = excluded.UpdatedAt;
                """;
            restoreCommand.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("D"));
            restoreCommand.Parameters.Add("$hash", SqliteType.Blob).Value = hash;
            restoreCommand.Parameters.Add("$salt", SqliteType.Blob).Value = salt;
            restoreCommand.Parameters.AddWithValue("$iterations", iterations);
            restoreCommand.Parameters.AddWithValue("$createdAt", now);
            restoreCommand.Parameters.AddWithValue("$updatedAt", now);
            await restoreCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var markCommand = connection.CreateCommand())
        {
            markCommand.Transaction = (SqliteTransaction)transaction;
            markCommand.CommandText =
                "INSERT INTO AppMigrations (Name, AppliedAt) VALUES ($name, $appliedAt);";
            markCommand.Parameters.AddWithValue("$name", migrationName);
            markCommand.Parameters.AddWithValue("$appliedAt", now);
            await markCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    private async Task ImportLegacyTemplatesAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(_legacyJsonPath))
        {
            return;
        }

        await using var countCommand = connection.CreateCommand();
        countCommand.CommandText = "SELECT COUNT(*) FROM Templates;";
        var existingCount = Convert.ToInt32(
            await countCommand.ExecuteScalarAsync(cancellationToken),
            CultureInfo.InvariantCulture);
        if (existingCount > 0)
        {
            return;
        }

        List<TemplateDocument>? templates;
        try
        {
            await using var stream = File.OpenRead(_legacyJsonPath);
            templates = await JsonSerializer.DeserializeAsync<List<TemplateDocument>>(
                stream,
                new JsonSerializerOptions(JsonSerializerDefaults.Web),
                cancellationToken);
        }
        catch (JsonException)
        {
            return;
        }

        if (templates is null || templates.Count == 0)
        {
            return;
        }

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        foreach (var template in templates)
        {
            await using var insertCommand = connection.CreateCommand();
            insertCommand.Transaction = (SqliteTransaction)transaction;
            insertCommand.CommandText = """
                INSERT OR IGNORE INTO Templates (Id, Name, ContentHtml, CreatedAt, UpdatedAt)
                VALUES ($id, $name, $contentHtml, $createdAt, $updatedAt);
                """;
            AddTemplateParameters(insertCommand, template);
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        File.Move(_legacyJsonPath, $"{_legacyJsonPath}.migrated", overwrite: true);
    }

    private static void AddTemplateParameters(SqliteCommand command, TemplateDocument template)
    {
        command.Parameters.AddWithValue("$id", template.Id.ToString("D"));
        command.Parameters.AddWithValue("$name", template.Name);
        command.Parameters.AddWithValue("$contentHtml", template.ContentHtml);
        command.Parameters.AddWithValue("$createdAt", FormatDate(template.CreatedAt));
        command.Parameters.AddWithValue("$updatedAt", FormatDate(template.UpdatedAt));
    }

    private static TemplateDocument ReadTemplate(SqliteDataReader reader)
    {
        return new TemplateDocument
        {
            Id = Guid.Parse(reader.GetString(0)),
            Name = reader.GetString(1),
            ContentHtml = reader.GetString(2),
            CreatedAt = ParseDate(reader.GetString(3)),
            UpdatedAt = ParseDate(reader.GetString(4))
        };
    }

    private static UserAuthRecord ReadUser(SqliteDataReader reader)
    {
        return new UserAuthRecord(
            Guid.Parse(reader.GetString(0)),
            reader.GetString(1),
            (byte[])reader[2],
            (byte[])reader[3],
            reader.GetInt32(4),
            reader.GetInt32(5) != 0);
    }

    private static string FormatDate(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

    private static DateTimeOffset ParseDate(string value) =>
        DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
}
