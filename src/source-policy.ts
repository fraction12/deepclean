import ts from "typescript";
import type { SourceFile } from "./discovery.js";

const tsLikeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);

export function isTypeScriptLikeSource(file: SourceFile): boolean {
  return tsLikeExtensions.has(file.extension);
}

export function scriptKindForSource(file: SourceFile): "tsx" | "ts" {
  return file.extension.includes("x") ? "tsx" : "ts";
}

export function createTypeScriptSourceFile(file: SourceFile): ts.SourceFile {
  return ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForSource(file) === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}
