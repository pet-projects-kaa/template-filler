using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using TemplateFiller.Models;

namespace TemplateFiller.Export;

public sealed class WordDocumentBuilder
{
    private static readonly XNamespace W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static readonly XNamespace R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static readonly XNamespace Rel = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static readonly XNamespace Ct = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static readonly XNamespace Xml = XNamespace.Xml;
    private static readonly Regex SafeColor = new("^[0-9A-Fa-f]{6}$", RegexOptions.Compiled);

    public byte[] Build(WordExportRequest request)
    {
        var blocks = request.Blocks ?? [];
        if (blocks.Count > 2_000)
        {
            throw new InvalidOperationException("Документ слишком большой для экспорта.");
        }

        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteXmlEntry(archive, "[Content_Types].xml", BuildContentTypes());
            WriteXmlEntry(archive, "_rels/.rels", BuildRootRelationships());
            WriteXmlEntry(archive, "word/document.xml", BuildDocument(blocks));
        }

        return stream.ToArray();
    }

    public static string NormalizeFileName(string? fileName)
    {
        var value = string.IsNullOrWhiteSpace(fileName) ? "Документ" : fileName.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            value = value.Replace(invalid, '_');
        }

        value = value.Trim().Trim('.');
        if (value.Length == 0)
        {
            value = "Документ";
        }

        if (value.Length > 100)
        {
            value = value[..100];
        }

        return value.EndsWith(".docx", StringComparison.OrdinalIgnoreCase)
            ? value
            : $"{value}.docx";
    }

    private static XDocument BuildContentTypes()
    {
        return new XDocument(
            new XElement(Ct + "Types",
                new XElement(Ct + "Default",
                    new XAttribute("Extension", "rels"),
                    new XAttribute("ContentType", "application/vnd.openxmlformats-package.relationships+xml")),
                new XElement(Ct + "Default",
                    new XAttribute("Extension", "xml"),
                    new XAttribute("ContentType", "application/xml")),
                new XElement(Ct + "Override",
                    new XAttribute("PartName", "/word/document.xml"),
                    new XAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"))));
    }

    private static XDocument BuildRootRelationships()
    {
        return new XDocument(
            new XElement(Rel + "Relationships",
                new XElement(Rel + "Relationship",
                    new XAttribute("Id", "rId1"),
                    new XAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"),
                    new XAttribute("Target", "word/document.xml"))));
    }

    private static XDocument BuildDocument(IReadOnlyList<WordBlock> blocks)
    {
        var body = new XElement(W + "body");

        foreach (var block in blocks)
        {
            if (string.Equals(block.Kind, "table", StringComparison.OrdinalIgnoreCase))
            {
                body.Add(BuildTable(block.Rows));
            }
            else
            {
                body.Add(BuildParagraph(block.Paragraph ?? new WordParagraph(null, null, [])));
            }
        }

        body.Add(
            new XElement(W + "sectPr",
                new XElement(W + "pgSz",
                    new XAttribute(W + "w", "11906"),
                    new XAttribute(W + "h", "16838")),
                new XElement(W + "pgMar",
                    new XAttribute(W + "top", "1134"),
                    new XAttribute(W + "right", "1134"),
                    new XAttribute(W + "bottom", "1134"),
                    new XAttribute(W + "left", "1134"),
                    new XAttribute(W + "header", "708"),
                    new XAttribute(W + "footer", "708"),
                    new XAttribute(W + "gutter", "0"))));

        return new XDocument(
            new XDeclaration("1.0", "UTF-8", "yes"),
            new XElement(W + "document",
                new XAttribute(XNamespace.Xmlns + "w", W),
                new XAttribute(XNamespace.Xmlns + "r", R),
                body));
    }

    private static XElement BuildTable(IReadOnlyList<IReadOnlyList<WordParagraph>>? rows)
    {
        var table = new XElement(W + "tbl",
            new XElement(W + "tblPr",
                new XElement(W + "tblW",
                    new XAttribute(W + "w", "0"),
                    new XAttribute(W + "type", "auto")),
                new XElement(W + "tblBorders",
                    Border("top"),
                    Border("left"),
                    Border("bottom"),
                    Border("right"),
                    Border("insideH"),
                    Border("insideV"))));

        foreach (var row in rows ?? [])
        {
            var tr = new XElement(W + "tr");
            foreach (var cell in row)
            {
                tr.Add(new XElement(W + "tc",
                    new XElement(W + "tcPr",
                        new XElement(W + "tcW",
                            new XAttribute(W + "w", "0"),
                            new XAttribute(W + "type", "auto"))),
                    BuildParagraph(cell)));
            }

            table.Add(tr);
        }

        if (rows is null || rows.Count == 0)
        {
            table.Add(new XElement(W + "tr",
                new XElement(W + "tc", BuildParagraph(new WordParagraph(null, null, [])))));
        }

        return table;
    }

    private static XElement Border(string name) =>
        new(W + name,
            new XAttribute(W + "val", "single"),
            new XAttribute(W + "sz", "4"),
            new XAttribute(W + "space", "0"),
            new XAttribute(W + "color", "B7BCC5"));

    private static XElement BuildParagraph(WordParagraph paragraph)
    {
        var p = new XElement(W + "p");
        var pPr = new XElement(W + "pPr");
        var alignment = NormalizeAlignment(paragraph.Alignment);
        if (alignment is not null)
        {
            pPr.Add(new XElement(W + "jc", new XAttribute(W + "val", alignment)));
        }

        pPr.Add(new XElement(W + "spacing",
            new XAttribute(W + "after", "160"),
            new XAttribute(W + "line", "276"),
            new XAttribute(W + "lineRule", "auto")));
        p.Add(pPr);

        var runs = paragraph.Runs ?? [];
        if (runs.Count == 0)
        {
            p.Add(BuildRun(new WordRun(string.Empty, false, false, false, false, 12, null), paragraph.HeadingLevel));
            return p;
        }

        foreach (var run in runs)
        {
            p.Add(BuildRun(run, paragraph.HeadingLevel));
        }

        return p;
    }

    private static XElement BuildRun(WordRun run, int? headingLevel)
    {
        var r = new XElement(W + "r");
        var rPr = new XElement(W + "rPr");
        rPr.Add(new XElement(W + "rFonts",
            new XAttribute(W + "ascii", "PT Astra Serif"),
            new XAttribute(W + "hAnsi", "PT Astra Serif"),
            new XAttribute(W + "cs", "PT Astra Serif")));

        var isHeading = headingLevel is >= 1 and <= 3;
        if (run.Bold || isHeading)
        {
            rPr.Add(new XElement(W + "b"));
        }

        if (run.Italic)
        {
            rPr.Add(new XElement(W + "i"));
        }

        if (run.Underline)
        {
            rPr.Add(new XElement(W + "u", new XAttribute(W + "val", "single")));
        }

        if (run.Strike)
        {
            rPr.Add(new XElement(W + "strike"));
        }

        var fontSize = run.FontSize ?? headingLevel switch
        {
            1 => 20,
            2 => 17,
            3 => 14,
            _ => 12
        };
        fontSize = Math.Clamp(fontSize, 8, 72);
        var halfPoints = (fontSize * 2).ToString();
        rPr.Add(new XElement(W + "sz", new XAttribute(W + "val", halfPoints)));
        rPr.Add(new XElement(W + "szCs", new XAttribute(W + "val", halfPoints)));

        var color = NormalizeColor(run.Color);
        if (color is not null)
        {
            rPr.Add(new XElement(W + "color", new XAttribute(W + "val", color)));
        }

        r.Add(rPr);
        if (run.Break)
        {
            r.Add(new XElement(W + "br"));
        }

        var text = run.Text ?? string.Empty;
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (index > 0)
            {
                r.Add(new XElement(W + "br"));
            }

            r.Add(new XElement(W + "t",
                new XAttribute(Xml + "space", "preserve"),
                lines[index]));
        }

        return r;
    }

    private static string? NormalizeAlignment(string? alignment) => alignment?.ToLowerInvariant() switch
    {
        "center" => "center",
        "right" or "end" => "right",
        "justify" => "both",
        _ => null
    };

    private static string? NormalizeColor(string? color)
    {
        var normalized = color?.Trim().TrimStart('#');
        return normalized is not null && SafeColor.IsMatch(normalized)
            ? normalized.ToUpperInvariant()
            : null;
    }

    private static void WriteXmlEntry(ZipArchive archive, string path, XDocument document)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
        using var stream = entry.Open();
        document.Save(stream);
    }
}
