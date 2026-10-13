import { describe, it, expect } from "vitest";
import { parseCSV, toCSV } from "../../src/services/csv.js";
describe("Импорт и экспорт CSV", () => {
  it("читает кавычки, запятые и многострочный текст", () =>
    expect(parseCSV('name,notes\r\n"Анна, Иванова","Первая\nВторая"')).toEqual([
      { name: "Анна, Иванова", notes: "Первая\nВторая" },
    ]));
  it("поддерживает BOM и разделитель точка с запятой", () =>
    expect(parseCSV("\uFEFFname;phone\nАнна;+370")).toEqual([
      { name: "Анна", phone: "+370" },
    ]));
  it("читает экранированные кавычки", () =>
    expect(parseCSV('name\n"Анна ""А"""')).toEqual([{ name: 'Анна "А"' }]));
  it.each(["name,phone\nАнна", "name,name\nАнна,Иванова", 'name\n"Анна'])(
    "отклоняет некорректную структуру",
    (csv) => expect(() => parseCSV(csv)).toThrow(),
  );
  it("защищает экспорт от формул таблиц", () =>
    expect(toCSV([{ name: '=HYPERLINK("bad")' }])).toContain("'=HYPERLINK"));
  it("не считает точку с запятой внутри кавычек разделителем", () =>
    expect(parseCSV('"name;label",phone\nАнна,123')).toEqual([
      { "name;label": "Анна", phone: "123" },
    ]));
  it("пустой CSV не создаёт записи", () => expect(parseCSV("")).toEqual([]));
});
