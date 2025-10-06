/**
 * Unit tests for DiffParser
 */

import { DiffParser, FileChange } from '../diff-parser';

describe('DiffParser', () => {
  let parser: DiffParser;

  beforeEach(() => {
    parser = new DiffParser();
  });

  describe('parseToFiles', () => {
    it('should parse a simple single-file diff', () => {
      const diff = `diff --git a/test.ts b/test.ts
index 1234567..abcdefg 100644
--- a/test.ts
+++ b/test.ts
@@ -1,5 +1,7 @@
 function hello() {
-  console.log('old');
+  console.log('new');
+  console.log('added line');
 }`;

      const result = parser.parseToFiles(diff);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('test.ts');
      expect(result.files[0].additions).toBe(2);
      expect(result.files[0].deletions).toBe(1);
      expect(result.totalAdditions).toBe(2);
      expect(result.totalDeletions).toBe(1);
    });

    it('should parse multiple files in a diff', () => {
      const diff = `diff --git a/file1.ts b/file1.ts
index 1234567..abcdefg 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,4 @@
+import { something } from 'lib';
 const x = 1;

diff --git a/file2.js b/file2.js
index 9876543..fedcba9 100644
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,3 @@
 const y = 2;
+const z = 3;`;

      const result = parser.parseToFiles(diff);

      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('file1.ts');
      expect(result.files[1].path).toBe('file2.js');
      expect(result.totalAdditions).toBe(2);
    });

    it('should handle binary files', () => {
      const diff = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;

      const result = parser.parseToFiles(diff);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].isBinary).toBe(true);
      expect(result.files[0].additions).toBe(0);
      expect(result.files[0].deletions).toBe(0);
    });

    it('should handle empty diff', () => {
      const diff = '';
      const result = parser.parseToFiles(diff);

      expect(result.files).toHaveLength(0);
      expect(result.totalAdditions).toBe(0);
      expect(result.totalDeletions).toBe(0);
    });

    it('should handle diff with only deletions', () => {
      const diff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index 1234567..0000000
--- a/old.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-function old() {
-  console.log('removed');
-}`;

      const result = parser.parseToFiles(diff);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].deletions).toBe(3);
      expect(result.files[0].additions).toBe(0);
    });

    it('should handle diff with only additions (new file)', () => {
      const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,5 @@
+function newFunc() {
+  console.log('new');
+}`;

      const result = parser.parseToFiles(diff);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].additions).toBe(3);
      expect(result.files[0].deletions).toBe(0);
    });
  });

  describe('calculateComplexity', () => {
    it('should calculate higher complexity for TypeScript files', () => {
      const tsFile: FileChange = {
        path: 'test.ts',
        additions: 50,
        deletions: 20,
        diff: '+import { something } from "lib";\n+function test() {}',
        complexity: 0,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const jsFile: FileChange = {
        ...tsFile,
        path: 'test.js',
        fileType: '.js',
      };

      const tsComplexity = parser.calculateComplexity(tsFile);
      const jsComplexity = parser.calculateComplexity(jsFile);

      expect(tsComplexity).toBeGreaterThan(jsComplexity);
    });

    it('should add complexity for imports', () => {
      const withImports: FileChange = {
        path: 'test.ts',
        additions: 10,
        deletions: 5,
        diff: '+import { a } from "a";\n+import { b } from "b";\n+const x = 1;',
        complexity: 0,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const withoutImports: FileChange = {
        ...withImports,
        diff: '+const x = 1;\n+const y = 2;',
      };

      const complexityWith = parser.calculateComplexity(withImports);
      const complexityWithout = parser.calculateComplexity(withoutImports);

      expect(complexityWith).toBeGreaterThan(complexityWithout);
    });

    it('should add complexity for function definitions', () => {
      const withFunctions: FileChange = {
        path: 'test.ts',
        additions: 10,
        deletions: 0,
        diff: '+function a() {}\n+const b = () => {};\n+class C {}',
        complexity: 0,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const withoutFunctions: FileChange = {
        ...withFunctions,
        diff: '+const x = 1;\n+const y = 2;',
      };

      const complexityWith = parser.calculateComplexity(withFunctions);
      const complexityWithout = parser.calculateComplexity(withoutFunctions);

      expect(complexityWith).toBeGreaterThan(complexityWithout);
    });

    it('should return moderate complexity for binary files', () => {
      const binaryFile: FileChange = {
        path: 'image.png',
        additions: 0,
        deletions: 0,
        diff: 'Binary files differ',
        complexity: 0,
        category: 'low-risk',
        fileType: '.png',
        isBinary: true,
      };

      const complexity = parser.calculateComplexity(binaryFile);
      expect(complexity).toBe(5);
    });
  });

  describe('categorizeByRisk', () => {
    it('should categorize files with SQL patterns as high-risk', () => {
      const file: FileChange = {
        path: 'query.ts',
        additions: 10,
        deletions: 0,
        diff: '+const query = `SELECT * FROM users WHERE id = ${userId}`;',
        complexity: 10,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const category = parser.categorizeByRisk(file);
      expect(category).toBe('high-risk');
    });

    it('should categorize files with eval() as high-risk', () => {
      const file: FileChange = {
        path: 'unsafe.js',
        additions: 5,
        deletions: 0,
        diff: '+eval(userInput);',
        complexity: 10,
        category: 'low-risk',
        fileType: '.js',
        isBinary: false,
      };

      const category = parser.categorizeByRisk(file);
      expect(category).toBe('high-risk');
    });

    it('should categorize authentication files as high-risk', () => {
      const file: FileChange = {
        path: 'src/auth/login.ts',
        additions: 20,
        deletions: 5,
        diff: '+function login() {}',
        complexity: 15,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const category = parser.categorizeByRisk(file);
      expect(category).toBe('high-risk');
    });

    it('should categorize migration files as high-risk', () => {
      const file: FileChange = {
        path: 'migrations/001_create_users.sql',
        additions: 30,
        deletions: 0,
        diff: '+CREATE TABLE users (...)',
        complexity: 20,
        category: 'low-risk',
        fileType: '.sql',
        isBinary: false,
      };

      const category = parser.categorizeByRisk(file);
      expect(category).toBe('high-risk');
    });

    it('should categorize complex service files as medium-risk', () => {
      const file: FileChange = {
        path: 'src/services/user.service.ts',
        additions: 80,
        deletions: 30,
        diff: '+function processUser() {}\n'.repeat(50),
        complexity: 35,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const category = parser.categorizeByRisk(file);
      expect(category).toBe('medium-risk');
    });

    it('should categorize large changes as medium-risk', () => {
      const file: FileChange = {
        path: 'src/utils/helpers.ts',
        additions: 120,
        deletions: 50,
        diff: '+function helper() {}\n'.repeat(100),
        complexity: 25,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const category = parser.categorizeByRisk(file);
      expect(category).toBe('medium-risk');
    });

    it('should categorize simple changes as low-risk', () => {
      const file: FileChange = {
        path: 'README.md',
        additions: 5,
        deletions: 2,
        diff: '+## New section\n+Some documentation',
        complexity: 3,
        category: 'low-risk',
        fileType: '.md',
        isBinary: false,
      };

      const category = parser.categorizeByRisk(file);
      expect(category).toBe('low-risk');
    });
  });

  describe('getStatistics', () => {
    it('should calculate correct statistics', () => {
      const diff = `diff --git a/high-risk.ts b/high-risk.ts
--- a/high-risk.ts
+++ b/high-risk.ts
@@ -1,3 +1,4 @@
+eval(userInput);

diff --git a/medium-risk.ts b/medium-risk.ts
--- a/medium-risk.ts
+++ b/medium-risk.ts
@@ -1,50 +1,100 @@
+${'function test() {}\n'.repeat(50)}

diff --git a/low-risk.md b/low-risk.md
--- a/low-risk.md
+++ b/low-risk.md
@@ -1,2 +1,3 @@
+# Documentation`;

      const result = parser.parseToFiles(diff);
      const stats = parser.getStatistics(result);

      expect(stats.totalFiles).toBe(3);
      expect(stats.highRiskFiles).toBeGreaterThanOrEqual(1);
      expect(stats.totalChanges).toBeGreaterThan(0);
      expect(stats.averageComplexity).toBeGreaterThan(0);
    });
  });
});
