import ts, { ClassDeclaration, Decorator, NodeArray } from "typescript";
import JSON5 from 'json5';
import * as abi from "near-abi";
import * as TJS from "near-typescript-json-schema";
import { JSONSchema7 } from "json-schema";
import * as fs from "fs";
import { LIB_VERSION } from "../version.js";

function parseMetadata(packageJsonPath: string): abi.AbiMetadata {
  const packageJson = JSON5.parse(fs.readFileSync(packageJsonPath, "utf8"));

  let authors: string[] = [];
  if (packageJson["author"]) authors.push(packageJson["author"]);
  authors = authors.concat(packageJson["contributors"] || []);

  return {
    name: packageJson["name"],
    version: packageJson["version"],
    authors,
    build: {
      compiler: "tsc " + ts.version,
      builder: "near-sdk-js " + LIB_VERSION,
    },
  };
}

function getProgramFromFiles(
  files: string[],
  jsonCompilerOptions: string,
  basePath = "./"
): ts.Program {
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    jsonCompilerOptions,
    basePath
  );
  if (errors.length > 0) {
    errors.forEach((error) => {
      console.log(error.messageText);
    });
    throw Error("Invalid compiler options");
  }
  return ts.createProgram(files, options);
}

function validateNearClass(node: ts.Node) {
  if (node.kind !== ts.SyntaxKind.ClassDeclaration) {
    throw Error("Expected NEAR function to be inside of a class");
  }
  const classDeclaration = node as ClassDeclaration;
  const decorators =
    classDeclaration.decorators || ([] as unknown as NodeArray<Decorator>);
  const containsNearBindgen = decorators.some((decorator) => {
    if (decorator.expression.kind !== ts.SyntaxKind.CallExpression)
      return false;
    const decoratorExpression = decorator.expression as ts.CallExpression;
    if (decoratorExpression.expression.kind !== ts.SyntaxKind.Identifier)
      return false;
    const decoratorIdentifier = decoratorExpression.expression as ts.Identifier;
    const decoratorName = decoratorIdentifier.text;
    return decoratorName === "NearBindgen";
  });

  if (!containsNearBindgen) {
    throw Error(
      "Expected NEAR function to be inside of a class decorated with @NearBindgen"
    );
  }
}

export function runAbiCompilerPlugin(
  tsFile: string,
  packageJsonPath: string,
  tsConfigJsonPath: string
) {
  const tsConfig = JSON5.parse(fs.readFileSync(tsConfigJsonPath, "utf8"));
  const program = getProgramFromFiles([tsFile], tsConfig["compilerOptions"]);
  const typeChecker = program.getTypeChecker();

  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    diagnostics.forEach((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n"
      );
      if (diagnostic.file && diagnostic.start) {
        const { line, character } =
          diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        console.error(
          `${diagnostic.file.fileName} (${line + 1},${
            character + 1
          }): ${message}`
        );
      } else {
        console.error(message);
      }
    });
    throw Error("Failed to compile the contract");
  }

  const generator = TJS.buildGenerator(program);
  if (!generator) {
    throw Error(
      "Failed to generate ABI due to an unexpected typescript-json-schema error. Please report this."
    );
  }

  const abiFunctions: abi.AbiFunction[] = [];

  program.getSourceFiles().forEach((sourceFile, _sourceFileIdx) => {
    function inspect(node: ts.Node, tc: ts.TypeChecker) {
      if (node.kind === ts.SyntaxKind.MethodDeclaration) {
        const methodDeclaration = node as ts.MethodDeclaration;
        const decorators =
          methodDeclaration.decorators ||
          ([] as unknown as NodeArray<Decorator>);
        let isCall = false;
        let isView = false;
        let isInit = false;
        const abiModifiers: abi.AbiFunctionModifier[] = [];
        decorators.forEach((decorator) => {
          if (decorator.expression.kind !== ts.SyntaxKind.CallExpression)
            return;
          const decoratorExpression = decorator.expression as ts.CallExpression;
          if (decoratorExpression.expression.kind !== ts.SyntaxKind.Identifier)
            return;
          const decoratorIdentifier =
            decoratorExpression.expression as ts.Identifier;
          const decoratorName = decoratorIdentifier.text;
          if (decoratorName === "call") {
            isCall = true;
            decoratorExpression.arguments.forEach((arg) => {
              if (arg.kind !== ts.SyntaxKind.ObjectLiteralExpression) return;
              const objLiteral = arg as ts.ObjectLiteralExpression;
              objLiteral.properties.forEach((prop) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const propName = (prop.name as any).text;
                if (propName === "privateFunction") {
                  if (prop.kind !== ts.SyntaxKind.PropertyAssignment) return;
                  const propAssignment = prop as ts.PropertyAssignment;
                  const init = propAssignment.initializer;
                  if (init.kind === ts.SyntaxKind.TrueKeyword) {
                    abiModifiers.push(abi.AbiFunctionModifier.Private);
                  } else if (init.kind === ts.SyntaxKind.FalseKeyword) {
                    // Do nothing
                  } else {
                    throw Error(
                      "Unexpected initializer for `privateFunction`: kind " +
                        init.kind
                    );
                  }
                }
                if (propName === "payableFunction") {
                  if (prop.kind !== ts.SyntaxKind.PropertyAssignment) return;
                  const propAssignment = prop as ts.PropertyAssignment;
                  const init = propAssignment.initializer;
                  if (init.kind === ts.SyntaxKind.TrueKeyword) {
                    abiModifiers.push(abi.AbiFunctionModifier.Payable);
                  } else if (init.kind === ts.SyntaxKind.FalseKeyword) {
                    // Do nothing
                  } else {
                    throw Error(
                      "Unexpected initializer for `publicFunction`: kind " +
                        init.kind
                    );
                  }
                }
              });
            });
          }
          if (decoratorName === "view") isView = true;
          if (decoratorName === "initialize") isInit = true;
        });
        const nearDecoratorsCount = [isCall, isView, isInit].filter(
          (b) => b
        ).length;
        if (nearDecoratorsCount > 1) {
          throw Error(
            "NEAR function cannot be init, call and view at the same time"
          );
        }
        if (nearDecoratorsCount === 0) {
          return;
        }
        validateNearClass(node.parent);

        let abiParams: abi.AbiJsonParameter[] = [];
        if (methodDeclaration.parameters.length > 1) {
          throw Error(
            "Expected NEAR function to have a single object parameter, but got " +
              methodDeclaration.parameters.length
          );
        } else if (methodDeclaration.parameters.length === 1) {
          const jsonObjectParameter = methodDeclaration.parameters[0];
          if (!jsonObjectParameter.type) {
            throw Error(
              "Expected NEAR function to have explicit types, e.g. `{ id }: {id : string }`"
            );
          }

          if (jsonObjectParameter.type.kind !== ts.SyntaxKind.TypeLiteral) {
            throw Error(
              "Expected NEAR function to have a single object binding parameter, e.g. `{ id }: { id: string }`"
            );
          }

          const typeLiteral = jsonObjectParameter.type as ts.TypeLiteralNode;
          abiParams = typeLiteral.members.map((member) => {
            if (member.kind !== ts.SyntaxKind.PropertySignature) {
              throw Error(
                "Expected NEAR function to have a single object binding parameter, e.g. `{ id }: { id: string }`"
              );
            }
            const propertySignature = member as ts.PropertySignature;
            const nodeType = tc.getTypeAtLocation(propertySignature.type);
            const schema = generator.getTypeDefinition(nodeType, true);
            const abiParameter: abi.AbiJsonParameter = {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              name: (propertySignature.name as any).text,
              type_schema: schema as JSONSchema7,
            };

            return abiParameter;
          });
        }
        let abiResult: abi.AbiType | undefined = undefined;
        const returnType = methodDeclaration.type;
        if (returnType) {
          const nodeType = tc.getTypeAtLocation(returnType);
          const schema = generator.getTypeDefinition(nodeType, true);
          abiResult = {
            serialization_type: abi.AbiSerializationType.Json,
            type_schema: schema,
          };
        }
        const abiFunction: abi.AbiFunction = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name: (methodDeclaration.name as any).text,
          kind: isView ? abi.AbiFunctionKind.View : abi.AbiFunctionKind.Call,
          modifiers: abiModifiers,
          params: {
            serialization_type: abi.AbiSerializationType.Json,
            args: abiParams,
          },
          result: abiResult,
        };
        abiFunctions.push(abiFunction);
      } else {
        ts.forEachChild(node, (n) => inspect(n, tc));
      }
    }
    inspect(sourceFile, typeChecker);
  });
  const abiRoot: abi.AbiRoot = {
    schema_version: abi.SCHEMA_VERSION,
    metadata: parseMetadata(packageJsonPath),
    body: {
      functions: abiFunctions,
      root_schema: generator.getSchemaForSymbol(
        "String",
        true,
        false
      ) as JSONSchema7,
    },
  };
  return abiRoot;
}
