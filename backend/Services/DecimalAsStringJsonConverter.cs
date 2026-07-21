using System.Text.Json;
using System.Text.Json.Serialization;

namespace Backend.Services;

public class DecimalAsStringJsonConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return reader.TokenType == JsonTokenType.String
            ? decimal.Parse(reader.GetString()!)
            : reader.GetDecimal();
    }

    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }
}
