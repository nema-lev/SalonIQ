#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = await mkdtemp(path.join(tmpdir(), 'calendar-v2-regression-'));
const files = [
  'native-scheduler-geometry.ts',
  'native-scheduler-drag.ts',
  'native-scheduler-regression-checks.ts',
];

try {
  for (const file of files) {
    await transpileToCommonJs(file);
  }

  const checksModule = require(path.join(tempDir, 'native-scheduler-regression-checks.js'));
  const results = checksModule.runNativeSchedulerRegressionChecks(sourceDir);

  console.log(`Native scheduler regression checks passed (${results.length})`);
  for (const result of results) {
    console.log(`- ${result.name}`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function transpileToCommonJs(fileName) {
  const sourcePath = path.join(sourceDir, fileName);
  const source = await readFile(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      esModuleInterop: true,
      isolatedModules: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      strict: true,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => sourceDir,
      getNewLine: () => '\n',
    });
    throw new Error(formatted);
  }

  await writeFile(path.join(tempDir, fileName.replace(/\.ts$/, '.js')), output.outputText, 'utf8');
}
