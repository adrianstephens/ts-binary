/// <reference types="node" />
import ts, { factory } from "typescript";

const quiet = true;

function isExported(node: ts.Declaration): boolean {
	return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

function getParseTreeNode<T extends ts.Node>(node: T) {
	while (node && ((node.flags & ts.NodeFlags.Synthesized)))
		node = (node as any).original;
	return node;
}

export function kind(node: ts.Node): string {
	return ts.SyntaxKind[node.kind];
}

function setParent(node: ts.Node, parent: ts.Node) {
	(node as any).parent = parent;
}

function hasSingleTypeParameter(node: ts.FunctionDeclaration | ts.MethodDeclaration): ts.ParameterDeclaration|undefined {
    if (node.typeParameters && node.typeParameters.length == 1) {
		const typeParam = node.typeParameters[0];
		
		if (ts.isTypeParameterDeclaration(typeParam) && typeParam.constraint) {
			let param: ts.ParameterDeclaration | undefined;

			for (const p of node.parameters) {
				if (p.type && ts.isTypeReferenceNode(p.type) && p.type.typeName.getText() === typeParam.name.text) {
					if (param)
						return;
					param = p;
				}
			}

			return param;
		}
	}
}

function createParameters(node: ts.FunctionDeclaration | ts.MethodDeclaration, param: ts.ParameterDeclaration, member: ts.TypeNode) {
	return node.parameters.map(p => {
		if (p === param) {
			p = factory.createParameterDeclaration(
				undefined,	//modifiers
				undefined,	//dotDotDotToken
				param.name,	//name
				undefined,	//questionToken
				member,		//type
			);
			setParent(p.type!, p);
		}
		return p;
	});
}

function getMembersOfConstraintType(typeChecker: ts.TypeChecker, constraint: ts.TypeNode): ts.TypeNode[] {
	const type			= typeChecker.getTypeAtLocation(constraint);

	const declarations	= type.getSymbol()?.getDeclarations();
	if (declarations) {
		let declaration: ts.EnumDeclaration|undefined;
		for (const i of declarations) {
			if (ts.isEnumDeclaration(i)) {
				declaration = i;
				break;
			}
		}
		if (declaration) {
			const prefix = typeChecker.typeToString(type, declaration);
			return declaration.members.map(i => factory.createTypeReferenceNode(
				factory.createQualifiedName(factory.createIdentifier(prefix), i.name.getText()),
				undefined
			));
		}
	}

	if (type.isUnion()) {
		if (type.types.every(i => i.isNumberLiteral()))
			return type.types.map(i => factory.createLiteralTypeNode(factory.createNumericLiteral(i.value)));

		if (type.types.every(i => i.isStringLiteral()))
			return type.types.map(i => factory.createLiteralTypeNode(factory.createStringLiteral(i.value)));
	}
	return [];
}

// this whole thing is a bit of a hack to resolve types in type predicates as the return type of generic methods
class TypeEvaluator {
	varDeclarations = new Map<string, ts.VariableDeclaration>();

	constructor(sourcefile: ts.SourceFile) {
		for (const stmt of sourcefile.statements) {
			if (ts.isVariableStatement(stmt)) {
				for (const decl of stmt.declarationList.declarations) {
					if (ts.isIdentifier(decl.name)) {
						if (decl.initializer)
							this.varDeclarations.set(decl.name.text, decl);
					}
				}
			}
		}
	}

	// Handle both regular and computed property names
	propValue(name: ts.Node) {
		return ts.isIdentifier(name)			? name.text
			:	ts.isStringLiteral(name)		? name.text
			:	ts.isNumericLiteral(name)		? parseInt(name.text)
			:	ts.isComputedPropertyName(name) ? this.evaluateConstantExpression(name.expression)
			:	undefined;
	}

	evaluateConstantExpression(expr: ts.Expression): string | number | undefined {
		if (ts.isNumericLiteral(expr))
			return parseInt(expr.text);
		if (ts.isStringLiteral(expr))
			return expr.text;

		// Handle property access like TYPE.Empty
		if (ts.isPropertyAccessExpression(expr)) {
			const objName = ts.isIdentifier(expr.expression) ? expr.expression.text : undefined;
			const propName = expr.name.text;
			if (objName) {
				// Look in cache first
				const cached = this.varDeclarations.get(objName);
				if (cached && cached.initializer) {
					let init = getParseTreeNode(cached.initializer);
					if (ts.isAsExpression(init))
						init = getParseTreeNode(init.expression);
					if (ts.isObjectLiteralExpression(init)) {
						for (const prop of init.properties) {
							if (ts.isPropertyAssignment(prop) && this.propValue(prop.name) === propName)
								return this.evaluateConstantExpression(prop.initializer);
						}
					}
				}
			}
		}
		return undefined;
	}


	resolveInstanceType(node: ts.TypeReferenceNode): ts.TypeNode | undefined {
		// Pattern: InstanceType<(typeof X)[n]> where n is a numeric/string literal
		if (!node.typeArguments || node.typeArguments.length !== 1)
			return undefined;
		
		const arg = node.typeArguments[0];

		// Check for indexed access: (typeof X)[0]
		if (ts.isIndexedAccessTypeNode(arg) && ts.isLiteralTypeNode(arg.indexType)) {
			// Get the index value
			const indexValue	= this.propValue(arg.indexType.literal);
			if (indexValue === undefined)
				return undefined;

			let objectType = arg.objectType;
		
			// Unwrap parentheses if present
			if (ts.isParenthesizedTypeNode(objectType))
				objectType = objectType.type;
			
			// Object type should be: typeof X
			if (!ts.isTypeQueryNode(objectType))
				return undefined;
			
			// Get the identifier name (X in typeof X)
			const decl = this.varDeclarations.get(ts.isIdentifier(objectType.exprName) ? objectType.exprName.text : '');
			if (!decl)
				return undefined;
			
			let realDecl = getParseTreeNode(decl.initializer!);
			
			// Unwrap 'as const' type assertions
			if (ts.isAsExpression(realDecl))
				realDecl = getParseTreeNode(realDecl.expression);
			
			if (ts.isObjectLiteralExpression(realDecl)) {
				for (const prop of realDecl.properties) {
					if (ts.isPropertyAssignment(prop)) {
						const propValue = this.propValue(prop.name);
						if (propValue === indexValue) {
							// Found the property - extract class reference
							if (ts.isIdentifier(prop.initializer))
								return factory.createTypeReferenceNode(prop.initializer.text, undefined);
						}
					}
				}
			}
		}
		
		return undefined;
	}
}	

function resolveTypesTransformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> | undefined {
	const typeChecker = program.getTypeChecker();

	return (context: ts.TransformationContext) => {
		return (sourceFile: ts.SourceFile) => {
			//UNCOMMENT TO DISABLE:
			//return sourceFile;

			let typeformatflags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.MultilineObjectLiterals;
			let exported 	= false;
			let depth		= 0;
			let declaration: ts.Declaration | undefined;
			const inherited: ts.ExpressionWithTypeArguments[] = [];
			
			// Create a cache for module resolution
			const moduleResolutionCache = ts.createModuleResolutionCache(
				process.cwd(), 			// Current working directory
				fileName => fileName	// Normalize file names
			);

			const originalSourceFile = program.getSourceFiles().find(f => f.fileName === sourceFile.fileName);
			const typeEval = new TypeEvaluator(originalSourceFile!);


			const moduleMap: Record<string, string> = {};
			const exportedTypeMap = new Map<ts.Symbol, string>();
			const exportedTypeNames = new Set<string>();
			const shapeToExportedName = new Map<string, string>();

			function safeGetTypeAtLocation(node: ts.Node): ts.Type | undefined {
				try {
					return typeChecker.getTypeAtLocation(node);
				} catch {
					return undefined;
				}
			}

			for (const stmt of sourceFile.statements) {
				if ((ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) || ts.isClassDeclaration(stmt)) && isExported(stmt)) {
					if (stmt.name) {
						exportedTypeNames.add(stmt.name.text);
						if (!stmt.typeParameters || stmt.typeParameters.length === 0) {
							const sym = typeChecker.getSymbolAtLocation(stmt.name);
							if (sym) {
								exportedTypeMap.set(sym, stmt.name.text);
								const type = typeChecker.getDeclaredTypeOfSymbol(sym);
								if (type) {
									if (type.aliasSymbol)
										exportedTypeMap.set(type.aliasSymbol, stmt.name.text);
									const typeNode = typeChecker.typeToTypeNode(type, sourceFile, typeformatflags);
									if (typeNode) {
										// Must go through the same `visitSubType` normalization (e.g. stripping
										// `Uint8Array<ArrayBufferLike>` down to `Uint8Array`) that every candidate
										// occurrence gets put through in `fixType` before its shape is looked up
										// here -- otherwise a type whose shape only differs from this raw,
										// unnormalized text by something `visitSubType` would have stripped can
										// never match, and silently gets fully inlined instead of referenced by name.
										const normalized = visitSubType(typeNode) as ts.TypeNode;
										shapeToExportedName.set(serializeNode(normalized), stmt.name.text);
									}
								}
							}
						}
					}
				}
			}

			function serializeNode(node: ts.Node): string {
				return ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, sourceFile);
			}

			function print(x: string) {
				if (!quiet)
					console.log('  '.repeat(depth) + x);
			}

			// visitEachChild on an accessor starts a lexical environment for its body, which asserts outside one; a
			// declaration's accessor (e.g. a swizzle in an inlined float3 literal) has no body, so only its types are visited
			function visitChildren(node: ts.Node, visitor: ts.Visitor): ts.Node {
				if (ts.isGetAccessorDeclaration(node))
					return factory.updateGetAccessorDeclaration(node, node.modifiers, node.name, ts.visitNodes(node.parameters, visitor, ts.isParameter), node.type && ts.visitNode(node.type, visitor, ts.isTypeNode), node.body);
				if (ts.isSetAccessorDeclaration(node))
					return factory.updateSetAccessorDeclaration(node, node.modifiers, node.name, ts.visitNodes(node.parameters, visitor, ts.isParameter), node.body);
				return ts.visitEachChild(node, visitor, context);
			}

			function fixParents(node: ts.Node) {
				let	parent = node;
				function visit(node: ts.Node): ts.Node {
					const save = parent;
					parent = node;
					node = visitChildren(node, visit);
					setParent(node, parent = save);
					return node;
				}
				return visitChildren(node, visit);
			}
			function templateSubstitute(node: ts.Node, param: string, replacement: ts.TypeNode) {
				function visit(node: ts.Node): ts.Node {
					if (ts.isTypeReferenceNode(node)) {
						// If the type node is a reference to the type parameter, replace it
						if (ts.isIdentifier(node.typeName) && node.typeName.text === param)
							return replacement;
					}

					return visitChildren(node, visit);
				}
				return ts.visitNode(node, visit);
			}
			function resolveUtilityTypes(node: ts.TypeNode): ts.TypeNode {
				function visit(n: ts.Node): ts.Node {
					// Check if this is InstanceType<...>
					if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && n.typeName.text === 'InstanceType') {
						const resolved = typeEval.resolveInstanceType(n);
						if (resolved)
							return resolved;
					}
					return visitChildren(n, visit);
				}
				return ts.visitNode(node, visit) as ts.TypeNode;
			}
			
			function createReturn(node: ts.FunctionDeclaration | ts.MethodDeclaration, member: ts.TypeNode) {
				const type = node.type!;
				const type2 = templateSubstitute(type, node.typeParameters![0].name.getText(), member);
				const ret = fixParents(type2);
				
				const obj = ret as any;
				//(ret as any).original = undefined;
				obj.flags &= ~16;
				setParent(obj, obj.original.parent ?? (node as any).original.parent);
				return ret as ts.TypeNode;
			}
			
			// `visitSubType`'s tree walk never recurses into a `TypeReferenceNode`'s own type arguments (it
			// treats a type reference as an opaque unit and hands off to `fixTypeReferenceCore` for just the
			// reference itself) -- so anything nested inside a generic type argument (e.g. `Uint8Array<ArrayBufferLike>`
			// buried inside `Partial<WasmModuleData>`-style wrapping) never gets the same normalization pass
			// applied elsewhere, and so can never match `shapeToExportedName`'s registered (normalized) text.
			// Confirmed concretely: within `WasmModule_base`'s declaration, the first 14 occurrences of `Instr`'s
			// shape (nested inside such a type reference) stayed unstripped and never matched, while the next 11
			// (in a plain, non-nested position) were stripped and matched correctly -- same file, same run.
			// `fixTypeReference` now recurses into type arguments via `visitSubType` after the rename step, so
			// every position gets the same treatment regardless of whether it's wrapped in a generic reference.
			function fixTypeReferenceCore(node: ts.TypeReferenceNode): ts.TypeReferenceNode {
				const name	= node.typeName;
				if (ts.isQualifiedName(name))
					return node;

				const symbol = (name as any).symbol;
				if (symbol) {
					const declarations = symbol.getDeclarations();
					if (declarations && declarations.length > 0) {
						const exported = isExported(declarations[0]);
						if (!exported && !declarations[0].typeParameters) {
							for (const statement of sourceFile.statements) {
								if (ts.isTypeAliasDeclaration(statement) && isExported(statement) && statement !== declaration) {
									if (ts.isTypeReferenceNode(statement.type) && ts.isIdentifier(statement.type.typeName) && statement.type.typeName.escapedText === name.escapedText) {
										const newName = factory.createIdentifier(statement.name.getText());
										return factory.updateTypeReferenceNode(node, newName, node.typeArguments);
									}
									/*
								} else if (ts.isImportDeclaration(statement)) {
									const importClause = statement.importClause;
									if (importClause && importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
										for (const i of importClause.namedBindings.elements) {
											if (i.propertyName?.escapedText === name.escapedText) {
												const newName = factory.createIdentifier(i.name.getText());
												return factory.updateTypeReferenceNode(node, newName, node.typeArguments);
											}
										}

									}*/
								}
							}
						}

						// add module prefix if missing
						const prefix = moduleMap[declarations[0].getSourceFile().fileName];
						if (prefix) {
							const newName = factory.createQualifiedName(factory.createIdentifier(prefix), name.text);
							return factory.updateTypeReferenceNode(node, newName, node.typeArguments);
						}
					}
				}

				return node;
			}

			function fixTypeReference(node: ts.TypeReferenceNode): ts.TypeReferenceNode {
				const renamed = fixTypeReferenceCore(node);
				if (renamed.typeArguments && renamed.typeArguments.length) {
					const newArgs = renamed.typeArguments.map(arg => visitSubType(arg) as ts.TypeNode);
					return factory.updateTypeReferenceNode(renamed, renamed.typeName, factory.createNodeArray(newArgs));
				}
				return renamed;
			}


			// Merges same-name property signatures found across the constituents of a flattened
			// intersection of type literals (e.g. `{f32:{sub:...}} & {f32:{mul:...}}` -> a single
			// `{f32:{sub:...;mul:...}}`). This is purely a syntax-level coalesce: it does not change
			// what the type accepts, it just prints the same structural type the way a `TreeBuilder`-style
			// chain actually builds it at runtime (one shared, deep-merged object), instead of as a raw
			// chain of `&`s. Only same-named `PropertySignature`s are merged (recursing into their value
			// types); anything else (methods, index signatures, or a same-named collision between two
			// non-object-literal types, e.g. two distinct function types) is left untouched/unmerged, since
			// that would indicate a real shape conflict rather than the same key legitimately built up
			// piecemeal across multiple constituents.
			//
			// Partial, not all-or-nothing: a same-named group can include one genuinely non-literal
			// member alongside dozens of literal ones (e.g. a `<T>(...) => ...` generic factory mixed in
			// with plain `{op:...}` leaves under the same key, as in `I`'s opcode groups). Requiring every
			// member to be a literal before merging any of them meant one such member silently blocked the
			// merge for the whole group. Merge just the literal subset and keep the rest as separate
			// intersection members instead.
			function mergeTypeNodes(types: ts.TypeNode[]): ts.TypeNode {
				if (types.length === 1)
					return types[0];
				const literals = types.filter(ts.isTypeLiteralNode);
				const rest = types.filter(t => !ts.isTypeLiteralNode(t));
				if (literals.length <= 1)
					return factory.createIntersectionTypeNode(factory.createNodeArray(types));
				const merged = factory.createTypeLiteralNode(mergeTypeLiteralMembers(literals.flatMap(t => t.members)));
				return rest.length ? factory.createIntersectionTypeNode(factory.createNodeArray([merged, ...rest])) : merged;
			}

			function mergeTypeLiteralMembers(members: readonly ts.TypeElement[]): ts.TypeElement[] {
				const groups = new Map<string, ts.TypeElement[]>();
				const order: string[] = [];
				let uniqueId = 0;

				for (const m of members) {
					const key = ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))
						? 'p:' + m.name.text
						: 'u:' + (uniqueId++);
					if (!groups.has(key)) {
						groups.set(key, []);
						order.push(key);
					}
					groups.get(key)!.push(m);
				}

				const result: ts.TypeElement[] = [];
				for (const key of order) {
					const group = groups.get(key)!;
					if (group.length === 1) {
						result.push(group[0]);
						continue;
					}
					const first = group[0] as ts.PropertySignature;
					const types = group.map(g => (g as ts.PropertySignature).type).filter((t): t is ts.TypeNode => !!t);
					if (types.length !== group.length) {
						result.push(...group);
						continue;
					}
					result.push(factory.updatePropertySignature(first, first.modifiers, first.name, first.questionToken, mergeTypeNodes(types)));
				}
				return result;
			}

			//various type fixing
			function visitSubType(node: ts.Node): ts.Node {
				//print(kind(node));

				if (ts.isQualifiedName(node))
					return node;

				if (ts.isTypeParameterDeclaration(node))
					return node;

				// Unlike a type parameter declaration (`<T extends ...>`), a value parameter's own `.type` is
				// exactly the kind of position this pass exists to normalize -- e.g. a constructor parameter's
				// type (as in `WasmModule_base`'s synthesized constructor) can itself be a huge union embedding
				// the same shapes found elsewhere in the file. Previously this returned the whole parameter
				// unchanged without ever visiting `.type`, so nothing nested inside a parameter's type could
				// ever be normalized or matched against `shapeToExportedName`, regardless of any other fix here.
				if (ts.isParameter(node)) {
					if (node.type) {
						const newType = visitSubType(node.type) as ts.TypeNode;
						if (newType !== node.type)
							return factory.updateParameterDeclaration(node, node.modifiers, node.dotDotDotToken, node.name, node.questionToken, newType, node.initializer);
					}
					return node;
				}

				if (ts.isTypeReferenceNode(node)) {
					if (ts.isIdentifier(node.typeName) && node.typeArguments && node.typeArguments.length === 1) {
						const name = node.typeName.text;
						if (/^(Uint8Array|Uint8ClampedArray|Int8Array|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array|BigInt64Array|BigUint64Array|DataView)$/.test(name)) {
							const argText = serializeNode(node.typeArguments[0]);
							if (argText === 'ArrayBufferLike' || argText === 'ArrayBuffer') {
								return factory.updateTypeReferenceNode(node, node.typeName, undefined);
							}
						}
					}
					return fixTypeReference(node);
				}
	
				++depth;
				node = visitChildren(node, visitSubType);
				--depth;

				// strip {}'s from intersection
				if (ts.isIntersectionTypeNode(node)) {
					const filtered = node.types.filter(n => !ts.isTypeLiteralNode(n) || n.members.length);
					if (filtered.length === 1)
						return filtered[0];

					// coalesce same-named properties across constituent type literals (see `mergeTypeNodes`)
					// so `{f32:{sub}} & {f32:{mul}}`-style chains print as one merged object instead of `&`
					if (filtered.every(ts.isTypeLiteralNode))
						return factory.createTypeLiteralNode(mergeTypeLiteralMembers(filtered.flatMap(n => (n as ts.TypeLiteralNode).members)));

					return ts.factory.updateIntersectionTypeNode(node, ts.factory.createNodeArray(filtered));
		  		}

				// remove parentheses if not needed
				if (ts.isParenthesizedTypeNode(node)) {
					if (ts.isTypeLiteralNode(node.type))
						return node.type;
				}

				return node;
			}

			function substituteExportedTypes(node: ts.Node, currentDeclName?: string): ts.Node {
				function visit(n: ts.Node): ts.Node {
					if (ts.isTypeNode(n)) {
						if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)) {
							const refName = n.typeName.text;
							if (exportedTypeNames.has(refName) && refName !== currentDeclName) {
								return n;
							}
						}

						// `ts.isUnionTypeNode` matters here as much as the other two -- an exported type whose
						// declared shape is a discriminated union (e.g. `Instr`) is exactly as eligible for
						// by-name substitution as an object-literal or intersection shape; without it, any
						// such type can never be matched here and silently gets fully inlined everywhere
						// it's used instead.
						if (ts.isTypeLiteralNode(n) || ts.isIntersectionTypeNode(n) || ts.isUnionTypeNode(n)) {
							const serialized = serializeNode(n);
							const matchedShape = shapeToExportedName.get(serialized);
							if (matchedShape && matchedShape !== currentDeclName) {
								return factory.createTypeReferenceNode(factory.createIdentifier(matchedShape), undefined);
							}
						}

						const type = safeGetTypeAtLocation(n);
						if (type) {
							let matchedName: string | undefined;
							if (type.aliasSymbol && exportedTypeMap.has(type.aliasSymbol)) {
								matchedName = exportedTypeMap.get(type.aliasSymbol);
							} else if (type.symbol && exportedTypeMap.has(type.symbol)) {
								matchedName = exportedTypeMap.get(type.symbol);
							}

							if (matchedName && matchedName !== currentDeclName) {
								if (matchedName === 'DirectoryReadResult') {
									return n;
								}
								return factory.createTypeReferenceNode(factory.createIdentifier(matchedName), undefined);
							}
						}
					}
					return visitChildren(n, visit);
				}
				return ts.visitNode(node, visit);
			}

			function fixType(node: ts.TypeNode, declaration?: ts.Declaration): ts.TypeNode {
				let currentDeclSymbol: ts.Symbol | undefined;
				let currentDeclName: string | undefined;
				if (declaration) {
					currentDeclSymbol = (declaration as any).symbol ?? safeGetTypeAtLocation(declaration)?.getSymbol();
					if ((declaration as any).name && ts.isIdentifier((declaration as any).name))
						currentDeclName = (declaration as any).name.text;
				}

				if (ts.isTypeReferenceNode(node) && !node.typeArguments) {
					if (ts.isIdentifier(node.typeName)) {
						const name = node.typeName.text;
						if (exportedTypeNames.has(name) && name !== currentDeclName) {
							return fixTypeReference(node);
						}
						const isUnexportedLocal = sourceFile.statements.some(s =>
							(ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isClassDeclaration(s)) &&
							s.name?.text === name && !isExported(s)
						);
						if (!isUnexportedLocal) {
							return fixTypeReference(node);
						}
					} else {
						return fixTypeReference(node);
					}
				}

				if (ts.isTypeReferenceNode(node) && node.typeArguments) {
					if (ts.isIdentifier(node.typeName)) {
						const name = node.typeName.text;
						if (exportedTypeNames.has(name) && name !== currentDeclName) {
							return fixTypeReference(node);
						}
						const isUnexportedLocal = sourceFile.statements.some(s =>
							(ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isClassDeclaration(s)) &&
							s.name?.text === name && !isExported(s)
						);
						if (!isUnexportedLocal && name !== 'ReadType' && name !== 'InstanceType') {
							const newArgs = node.typeArguments.map(arg => fixType(arg, declaration));
							return factory.updateTypeReferenceNode(node, node.typeName, factory.createNodeArray(newArgs));
						}
					}
				}

				const type		= safeGetTypeAtLocation(node);
				if (type) {
					let matchedName: string | undefined;
					if (type.aliasSymbol && exportedTypeMap.has(type.aliasSymbol)) {
						matchedName = exportedTypeMap.get(type.aliasSymbol);
					} else if (type.symbol && exportedTypeMap.has(type.symbol)) {
						matchedName = exportedTypeMap.get(type.symbol);
					}

					if (matchedName && matchedName !== currentDeclName) {
						return factory.createTypeReferenceNode(factory.createIdentifier(matchedName), undefined);
					}
				}

				let origAliasSymbol: ts.Symbol | undefined;
				if (type && type.aliasSymbol) {
					if (currentDeclName && (type.aliasSymbol === currentDeclSymbol || (type.aliasSymbol.escapedName as string) === currentDeclName)) {
						origAliasSymbol = type.aliasSymbol;
						type.aliasSymbol = undefined;
					} else if (!exportedTypeMap.has(type.aliasSymbol)) {
						origAliasSymbol = type.aliasSymbol;
						type.aliasSymbol = undefined;
					}
				}

				const typetext	= type ? typeChecker.typeToString(type, declaration) : 'any';
				let node1 = typetext === 'any' ? node : typeChecker.typeToTypeNode(type!, declaration, typeformatflags);

				if (origAliasSymbol && type) {
					type.aliasSymbol = origAliasSymbol;
				}

				if (node1) {
					if (ts.isTypeReferenceNode(node1) && !node1.typeArguments)
						return fixTypeReference(node1);

					node1 = visitSubType(node1) as ts.TypeNode;
					node1 = substituteExportedTypes(node1, currentDeclName) as ts.TypeNode;
					const text2 = serializeNode(node1);
					if (text2 !== 'any')
						return node1;
				}

				return node;
			}

			//finds types
			function visitType(node: ts.Node): ts.Node | undefined {
				if (ts.isTypePredicateNode(node)) {
					// Don't re-type predicates; generic expansion in createReturn already substituted literal types.
					if (node.type) {
						const resolvedType = resolveUtilityTypes(node.type);
						const fixedType = fixType(resolvedType, (node.parent as ts.Declaration) ?? declaration);
						if (fixedType !== node.type)
							return factory.updateTypePredicateNode(node, node.assertsModifier, node.parameterName, fixedType);
					}
					return node;
				}
				if (ts.isTypeNode(node))
					return fixType(node, declaration);
				return visitChildren(node, visitType);
			}

			function fixTypes<T extends ts.Declaration>(node: T) {
				const save = declaration;
				declaration = getParseTreeNode(node);
				node = visitChildren(node, visitType);
				declaration = save;
				return node;
			}

			//	VISIT - just for stripping crap out
			function stripCrap(node: ts.Node): ts.Node | undefined {

				// Don't recurse into import/export nodes
				if (ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportDeclaration(node) || ts.isExportAssignment(node))
					return node;
//
				if (ts.isVariableDeclaration(node)) {
					// `isExported(node)` (`ts.getCombinedModifierFlags`, which walks `.parent`) is not reliable
					// here: these are nodes from the synthesized `afterDeclarations` output, and their `.parent`
					// chain isn't necessarily set up the way a parsed source file's would be. This never mattered
					// before because an exported statement's children were never even visited (see the
					// `isVariableStatement` handler below) -- so use the already-correct, closure-captured
					// `exported` flag that handler just set from the *statement's own* modifiers, instead of
					// re-deriving export-ness from this declaration node's (possibly absent) parent chain.
					if (exported) {
						// An exported `const x = ...` with no explicit annotation still arrives here with
						// `node.type` already populated -- this is an `afterDeclarations` transform, so tsc's
						// own declaration emitter has already synthesized the inferred type as a real TypeNode
						// before we ever see it. Previously that synthesized type was returned completely
						// untouched, so none of `fixType`/`visitSubType`'s normalization (including the
						// intersection-member merge above) ever applied to it -- only explicitly-annotated
						// declarations and type aliases went through that path. Routing it through `fixType`
						// here (mirroring the `inherited`-case handling just below) gives inferred exported
						// consts the same treatment as everything else.
						//
						// `fixType` hands its `declaration` argument to `typeChecker.typeToTypeNode` as the
						// "enclosing declaration" for symbol-accessibility resolution, which needs a node with
						// real binder metadata (parent/id chain) from the original checked program. This
						// synthesized `node` doesn't have that -- passing it directly crashes deep inside tsc's
						// own `isSymbolAccessible` (`getNodeId` on an unbound node). `getParseTreeNode` walks
						// `.original` back to the real source declaration, exactly like `fixTypes` already does
						// for the `TypeAliasDeclaration` case.
						const realDecl = getParseTreeNode(node);
						if (node.type && ts.isVariableDeclaration(realDecl)) {
							const type = fixType(node.type, realDecl);
							if (type !== node.type)
								return factory.updateVariableDeclaration(node, node.name, node.exclamationToken, type, node.initializer);
						}
						return node;
					}
					for (const i of inherited) {
						if (i.expression === node.name) {
							exported	= true;
							if (node.type) {
								//setParentAndFlag(node.type, node);
								const type = fixType(node.type, node);
								return factory.updateVariableDeclaration(node, node.name, node.exclamationToken, type, node.initializer);
							}
						}
					}
					return undefined; // Remove the node
				}

				if (ts.isVariableStatement(node)) {
					const modifiers = node.modifiers;
					exported	= !!modifiers && modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
					// Previously this only recursed into the declaration list when *not* exported (on the way
					// to dropping it) -- an exported statement's node was returned as-is, so its declarations
					// never reached the `ts.isVariableDeclaration` visitor below, and an exported `const x = ...`
					// with no explicit annotation (tsc's own inferred type, synthesized onto `node.type` by this
					// point since this is an `afterDeclarations` transform) never got normalized/merged. Always
					// recursing lets that visitor run for both cases; `isExported`'s combined-modifier-flags
					// lookup still resolves correctly per-declaration off this statement's own modifiers.
					node = visitChildren(node, stripCrap);
					return exported ? node : undefined;
				}

				if (ts.isTypeAliasDeclaration(node)) {
					if (!isExported(node))
						return undefined;
					declaration = node;
					const save = typeformatflags;
					typeformatflags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.MultilineObjectLiterals;
					node = fixTypes(node);
					typeformatflags = save;
					return node;
				}

				++depth;
				node = visitChildren(node, stripCrap);
				--depth;
				return node;
			}
			
			//SourceFile:
			print(`SourceFile ${sourceFile.fileName}`);
			++depth;

			const newStatements: ts.Statement[] = [];

			for (const statement of sourceFile.statements) {
				//check for inheriting consts
				if (ts.isClassDeclaration(statement)) {
					print(`fixing class ${statement.name?.getText()}`);

					const heritageClauses = statement.heritageClauses;
					if (heritageClauses) {
						for (const i of heritageClauses) {
							if (i.token === ts.SyntaxKind.ExtendsKeyword)
								inherited.push(...i.types);
						}
					}
					//setParent(statement, sourceFile);
					++depth;
					const newMembers: ts.ClassElement[] = [];
					for (const member of statement.members) {
						const param = ts.isMethodDeclaration(member) && hasSingleTypeParameter(member);
						if (param) {
							const members	= getMembersOfConstraintType(typeChecker, member.typeParameters![0].constraint!);
							if (members.length) {
								print(`Expanding generic method "${member.name.getText()}"`);
								//setParent(member, statement);
								for (const i of members) {
									const overload = factory.createMethodDeclaration(
										undefined,		// modifiers
										undefined,		// asteriskToken
										member.name,	// name
										undefined,		// questionToken
										undefined,		// typeParameters
										createParameters(member, param, i),	// parameters
										createReturn(member, i),	//type
										undefined		//body
									);
									newMembers.push(overload);
								}
								continue;
							}
						}
						// Add the original member to the class
						newMembers.push(member);
					}

					// Update the class declaration with the new members
					const newClass = factory.updateClassDeclaration(
						statement,
						statement.modifiers,
						statement.name,
						statement.typeParameters,
						statement.heritageClauses,
						newMembers.map(i => fixTypes(i))
					);
					newStatements.push(newClass);
					--depth;

				} else if (ts.isImportDeclaration(statement)) {
					const importClause = statement.importClause;
					if (importClause && importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
						const module = statement.moduleSpecifier;
						if (ts.isStringLiteral(module)) {
							// Resolve the module name to its file path
							const resolved = ts.resolveModuleName(
								module.text,
								sourceFile.fileName,
								program.getCompilerOptions(),
								{
									fileExists: ts.sys.fileExists,
									readFile: ts.sys.readFile,
								},
								moduleResolutionCache
							);
			
							if (resolved.resolvedModule)
								moduleMap[resolved.resolvedModule.resolvedFileName] = importClause.namedBindings.name.text;
						}
					}
					newStatements.push(statement);

				} else if (ts.isFunctionDeclaration(statement)) {
					const param = hasSingleTypeParameter(statement);
					if (param) {
						const members	= getMembersOfConstraintType(typeChecker, statement.typeParameters![0].constraint!);
						if (members.length) {
							print(`Expanding generic function "${statement.name?.escapedText}"`);
							for (const i of members) {
								const overload 	= factory.createFunctionDeclaration(
									[factory.createModifier(ts.SyntaxKind.ExportKeyword)], // Add export
									undefined,		//asteriskToken
									statement.name,	//name
									undefined,		//type params
									createParameters(statement, param, i),
									createReturn(statement, i),	//type
									undefined		//body
								);
								newStatements.push(fixTypes(overload));
							}
							continue;
						}
					}
					newStatements.push(fixTypes(statement));

				} else if (ts.isTypeAliasDeclaration(statement)) {
					const save = typeformatflags;
					typeformatflags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.MultilineObjectLiterals;
					newStatements.push(fixTypes(statement));
					typeformatflags = save;
	
				} else if (ts.isInterfaceDeclaration(statement)) {
					let int = statement;
					const heritageClauses = int.heritageClauses;
					if (heritageClauses) {
						for (const i of heritageClauses) {
							if (i.token === ts.SyntaxKind.ExtendsKeyword) {
								if (i.types.length === 1) {
									const base = fixType(i.types[0]);
									if (ts.isTypeLiteralNode(base)) {
										int = factory.updateInterfaceDeclaration(int,
											int.modifiers,
											int.name,
											int.typeParameters,
											undefined,
										    [...base.members, ...int.members]
										);
									}
								} else {
									inherited.push(...i.types);
								}
							}
						}
					}
					newStatements.push(int);

				} else {
					newStatements.push(statement);
				}
			}
			return ts.visitEachChild(factory.updateSourceFile(sourceFile, newStatements), stripCrap, context);
		};
	};
}

export default resolveTypesTransformer;