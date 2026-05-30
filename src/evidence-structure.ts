import ts from "typescript";
import { makeEvidence, type AdapterContext, type AdapterResult } from "./evidence-core.js";
import { stableId } from "./ids.js";
import { createTypeScriptSourceFile, isTypeScriptLikeSource } from "./source-policy.js";
import type { EvidenceRecord } from "./types.js";

export async function typescriptStructureAdapter(context: AdapterContext): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];

  for (const file of context.files.filter(isTypeScriptLikeSource)) {
    const shallowWrappers: Array<{ name: string; startLine: number; endLine: number }> = [];
    const sourceFile = createTypeScriptSourceFile(file);

    visitNode(sourceFile, (node) => {
      if (
        !(
          ts.isFunctionDeclaration(node)
          || ts.isMethodDeclaration(node)
          || ts.isFunctionExpression(node)
          || ts.isArrowFunction(node)
        )
        || !node.body
      ) {
        return;
      }
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.end);
      const span = end.line - start.line + 1;
      const name = functionName(node) ?? "anonymous function";

      if (span >= 70) {
        evidence.push(makeEvidence(context, {
          id: stableId("ev", `ts-structure:function:${file.path}:${start.line}:${name}`),
          adapter: "typescript-structure",
          kind: "large-function",
          title: `Large function: ${name}`,
          summary: `${name} spans ${span} lines in ${file.path}.`,
          files: [{
            path: file.path,
            startLine: start.line + 1,
            endLine: end.line + 1,
          }],
          data: { name, lines: span },
          confidence: span >= 120 ? "high" : "medium",
        }));
      }

      const body = node.body;
      if (body && ts.isBlock(body) && body.statements.length === 1 && span <= 12) {
        const onlyStatement = body.statements[0];
        if (onlyStatement && ts.isReturnStatement(onlyStatement) && onlyStatement.expression) {
          shallowWrappers.push({
            name,
            startLine: start.line + 1,
            endLine: end.line + 1,
          });
        }
      }
    });

    if (shallowWrappers.length >= 5) {
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `ts-structure:wrapper-cluster:${file.path}:${shallowWrappers.length}`),
        adapter: "typescript-structure",
        kind: "shallow-wrapper-cluster",
        title: `Shallow wrapper cluster: ${file.path}`,
        summary: `${file.path} contains ${shallowWrappers.length} tiny wrappers that only return another expression.`,
        files: shallowWrappers.slice(0, 8).map((wrapper) => ({
          path: file.path,
          startLine: wrapper.startLine,
          endLine: wrapper.endLine,
        })),
        data: { wrappers: shallowWrappers },
        confidence: "medium",
      }));
    }
  }

  return { evidence: evidence.slice(0, 80), diagnostics: [] };
}
export function visitNode(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  node.forEachChild((child) => visitNode(child, visitor));
}

export function functionName(node: ts.FunctionLikeDeclaration): string | undefined {
  if ("name" in node && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return undefined;
}
