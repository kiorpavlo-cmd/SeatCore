export function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  let delimiterQuoted = false,
    commas = 0,
    semicolons = 0;
  for (const char of text.split(/\r?\n/, 1)[0]) {
    if (char === '"') delimiterQuoted = !delimiterQuoted;
    else if (!delimiterQuoted) {
      if (char === ",") commas++;
      if (char === ";") semicolons++;
    }
  }
  const separator = semicolons > commas ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else throw new Error("Некорректные кавычки CSV");
    } else if (char === separator && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Незакрытые кавычки CSV");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((x) => x.trim());
  if (new Set(headers).size !== headers.length)
    throw new Error("Повторяющиеся заголовки CSV");
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error("Неверное число столбцов в строке " + (index + 2));
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}
export function toCSV(records, headers = Object.keys(records[0] || {})) {
  const quote = (value) =>
    '"' +
    String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [headers, ...records.map((r) => headers.map((key) => r[key]))]
      .map((row) => row.map(quote).join(","))
      .join("\r\n")
  );
}
export function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
