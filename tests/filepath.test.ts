// tests/filepath.test.ts
import { describe, expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import { filepathResolver } from "../src/utils";

describe("filepathResolver", () => {
  const ejb = new Ejb({
    root: "/projects",
    aliases: {
      "@/": "/shared/",
      "tests/": "/custom/tests/",
    },
    extension: ".ejb",
  });

  // Testes para caminhos absolutos
  test("absolute paths remain unchanged", () => {
    expect(filepathResolver(ejb, "/projects/imported.ejb")).toBe(
      "/projects/imported.ejb"
    );
    expect(filepathResolver(ejb, "/project/file.ejb")).toBe("/project/file.ejb");
  });

  // Testes para aliases
  test("resolve alias @/ to /shared/", () => {
    expect(filepathResolver(ejb, "@/components/header.ejb")).toBe(
      "/shared/components/header.ejb"
    );
  });

  // Testes para caminhos relativos
  test("resolve relative paths from root", () => {
    expect(filepathResolver(ejb, "imported.ejb")).toBe("/projects/imported.ejb");
    expect(filepathResolver(ejb, "./imported.ejb")).toBe(
      "/projects/imported.ejb"
    );
  });

  test("resolve relative paths from current file", () => {
    expect(
      filepathResolver(ejb, "../imported.ejb", "/projects/src/main.ejb")
    ).toBe("/projects/imported.ejb");
    expect(
      filepathResolver(ejb, "utils/helper.ejb", "/projects/src/main.ejb")
    ).toBe("/projects/src/utils/helper.ejb");
  });

  // Testes para Windows paths
  test("normalize Windows paths", () => {
    expect(filepathResolver(ejb, "C:\\project\\file.ejb")).toBe(
      "C:/project/file.ejb"
    );
    expect(filepathResolver(ejb, "..\\imported.ejb", "/projects/src/main.ejb")).toBe(
      "/projects/imported.ejb"
    );
  });

  // Testes para adição de extensão
  test("add extension when missing", () => {
    expect(filepathResolver(ejb, "/projects/imported")).toBe(
      "/projects/imported.ejb"
    );
    expect(filepathResolver(ejb, "@/components/header")).toBe(
      "/shared/components/header.ejb"
    );
  });

  // Testes específicos do seu exemplo
  test("specific test cases from example", () => {
    expect(filepathResolver(ejb, "/projects/imported.ejb")).toBe(
      "/projects/imported.ejb"
    );
    expect(filepathResolver(ejb, "/projects/@/components/header.ejb")).toBe(
      "/projects/@/components/header.ejb"
    );
    expect(filepathResolver(ejb, "/project/file.ejb")).toBe("/project/file.ejb");
  });
});