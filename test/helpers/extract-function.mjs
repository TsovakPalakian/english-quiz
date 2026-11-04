// AST-based function and statement extractor for non-modular client/production scripts.
// Replaces brittle source.slice(source.indexOf('function A'), source.indexOf('function B'))
// with deterministic ECMAScript AST extraction that is completely resilient to function
// reordering, deletions, renaming of adjacent functions, IIFE wrapping, minification, and formatting changes.

import * as acorn from 'acorn';

const astCache = new Map();

function getAst(source) {
  let cached = astCache.get(source);
  if (!cached) {
    cached = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    astCache.set(source, cached);
  }
  return cached;
}

function findNode(root, predicate) {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (predicate(node)) return node;
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && typeof item.type === 'string') queue.push(item);
        }
      } else if (val && typeof val === 'object' && typeof val.type === 'string') {
        queue.push(val);
      }
    }
  }
  return null;
}

export function extractFunction(source, name) {
  const ast = getAst(source);
  const node = findNode(ast, n => {
    if (n.type === 'FunctionDeclaration' && n.id?.name === name) return true;
    if (n.type === 'VariableDeclaration') {
      return n.declarations.some(decl => decl.id?.name === name);
    }
    return false;
  });

  if (!node) throw new Error(`Function or variable declaration "${name}" not found in AST`);
  return source.slice(node.start, node.end);
}

export function extractFunctions(source, ...names) {
  return names.map(name => extractFunction(source, name)).join('\n');
}

export function extractStatement(source, snippet) {
  const ast = getAst(source);
  const index = source.indexOf(snippet);
  if (index < 0) throw new Error(`Snippet not found in source: ${snippet}`);

  // Find the smallest statement node enclosing snippet
  let best = null;
  findNode(ast, n => {
    if (n.type.endsWith('Statement') || n.type === 'VariableDeclaration') {
      if (n.start <= index && index < n.end) {
        if (!best || (n.end - n.start < best.end - best.start)) {
          best = n;
        }
      }
    }
    return false; // keep searching all nodes
  });

  if (!best) throw new Error(`No AST statement enclosing snippet: ${snippet}`);
  return source.slice(best.start, best.end);
}
