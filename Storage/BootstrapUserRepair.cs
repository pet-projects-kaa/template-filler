using System.Globalization;
using Microsoft.Data.Sqlite;
using TemplateFiller.Security;

namespace TemplateFiller.Storage;

/// <summary>
/// One-time repair for the bootstrap account in databases created by earlier builds.
/// It does not reset the password again after the migration has been applied.
/// </summary>
public static class BootstrapUserRepair
{
    private const string MigrationName = "2026-08-02-repair-bootstrap-user-01-v2";
    private const string BootstrapUsername = "01";
    private const string BootstrapPassword = "pswd01";

    public static async Task EnsureAsync(
        IHostEnvironment environment,
        CancellationToken cancellationToken = default)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);

        var databasePath = Path.Combine(dataDirectory, "template-filler.db");
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            ForeignKeys = true,
            Pooling = true
        }.ToString();

        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        await using (var prepareCommand = connection.CreateCommand())
        {
            prepareCommand.CommandText = """
                PRAGMA busy_timeout = 5000;
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS AppMigrations (
                    Name TEXT NOT NULL PRIMARY KEY,
                    AppliedAt TEXT NOT NULL
                );
                """;
            await prepareCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var migrationCommand = connection.CreateCommand())
        {
            migrationCommand.CommandText =
                "SELECT 1 FROM AppMigrations WHERE Name = $name LIMIT 1;";
            migrationCommand.Parameters.AddWithValue("$name", MigrationName);

            if (await migrationCommand.ExecuteScalarAsync(cancellationToken) is not null)
            {
                return;
            }
        }

        var (hash, salt, iterations) = PasswordHasher.Hash(BootstrapPassword);
        var now = DateTimeOffset.UtcNow
            .ToUniversalTime()
            .ToString("O", CultureInfo.InvariantCulture);

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await using (var repairCommand = connection.CreateCommand())
        {
            repairCommand.Transaction = (SqliteTransaction)transaction;
            repairCommand.CommandText = """
                INSERT INTO Users
                    (Id, Username, PasswordHash, PasswordSalt, PasswordIterations,
                     MustChangePassword, CreatedAt, UpdatedAt)
                VALUES
                    ($id, $username, $hash, $salt, $iterations, 0, $createdAt, $updatedAt)
                ON CONFLICT(Username) DO UPDATE SET
                    PasswordHash = excluded.PasswordHash,
                    PasswordSalt = excluded.PasswordSalt,
                    PasswordIterations = excluded.PasswordIterations,
                    MustChangePassword = 0,
                    UpdatedAt = excluded.UpdatedAt;
                """;
            repairCommand.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("D"));
            repairCommand.Parameters.AddWithValue("$username", BootstrapUsername);
            repairCommand.Parameters.Add("$hash", SqliteType.Blob).Value = hash;
            repairCommand.Parameters.Add("$salt", SqliteType.Blob).Value = salt;
            repairCommand.Parameters.AddWithValue("$iterations", iterations);
            repairCommand.Parameters.AddWithValue("$createdAt", now);
            repairCommand.Parameters.AddWithValue("$updatedAt", now);
            await repairCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var markCommand = connection.CreateCommand())
        {
            markCommand.Transaction = (SqliteTransaction)transaction;
            markCommand.CommandText =
                "INSERT INTO AppMigrations (Name, AppliedAt) VALUES ($name, $appliedAt);";
            markCommand.Parameters.AddWithValue("$name", MigrationName);
            markCommand.Parameters.AddWithValue("$appliedAt", now);
            await markCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }
}
