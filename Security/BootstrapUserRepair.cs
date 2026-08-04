using Microsoft.Data.Sqlite;

namespace TemplateFiller.Security;

public static class BootstrapUserRepair
{
    private const string Username = "01";
    private const string InitialPassword = "pswd01";
    private const string RepairMarkerFileName = ".bootstrap-user-repaired-v2";

    public static async Task EnsureAsync(IHostEnvironment environment, CancellationToken cancellationToken = default)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        var markerPath = Path.Combine(dataDirectory, RepairMarkerFileName);
        if (File.Exists(markerPath)) return;

        var databasePath = Path.Combine(dataDirectory, "template-filler.db");
        if (!File.Exists(databasePath))
        {
            await File.WriteAllTextAsync(markerPath, DateTimeOffset.UtcNow.ToString("O"), cancellationToken);
            return;
        }

        await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWrite,
            Cache = SqliteCacheMode.Shared,
            Pooling = true
        }.ToString());
        await connection.OpenAsync(cancellationToken);

        await using var select = connection.CreateCommand();
        select.CommandText = "SELECT Id, PasswordHash, PasswordSalt, PasswordIterations FROM Users WHERE Username = $username COLLATE NOCASE LIMIT 1;";
        select.Parameters.AddWithValue("$username", Username);

        string? id = null;
        byte[]? hash = null;
        byte[]? salt = null;
        var iterations = 0;
        await using (var reader = await select.ExecuteReaderAsync(cancellationToken))
        {
            if (await reader.ReadAsync(cancellationToken))
            {
                id = reader.GetString(0);
                hash = (byte[])reader[1];
                salt = (byte[])reader[2];
                iterations = reader.GetInt32(3);
            }
        }

        if (id is not null && hash is not null && salt is not null &&
            !PasswordHasher.Verify(InitialPassword, salt, hash, iterations))
        {
            var (newHash, newSalt, newIterations) = PasswordHasher.Hash(InitialPassword);
            await using var update = connection.CreateCommand();
            update.CommandText = "UPDATE Users SET PasswordHash=$hash, PasswordSalt=$salt, PasswordIterations=$iterations, MustChangePassword=0, UpdatedAt=$updatedAt WHERE Id=$id;";
            update.Parameters.AddWithValue("$id", id);
            update.Parameters.Add("$hash", SqliteType.Blob).Value = newHash;
            update.Parameters.Add("$salt", SqliteType.Blob).Value = newSalt;
            update.Parameters.AddWithValue("$iterations", newIterations);
            update.Parameters.AddWithValue("$updatedAt", DateTimeOffset.UtcNow.ToString("O"));
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await File.WriteAllTextAsync(markerPath, DateTimeOffset.UtcNow.ToString("O"), cancellationToken);
    }
}
