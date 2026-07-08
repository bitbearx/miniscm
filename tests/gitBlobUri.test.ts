import assert from 'node:assert/strict';
import test from 'node:test';

import { createGitBlobUriString, parseGitBlobUriEntry } from '../src/gitBlobUri';

test('createGitBlobUriString keeps blob data in the uri and preserves file extension', () => {
  const uri = createGitBlobUriString({
    repoRoot: '/repo with spaces/project',
    ref: 'abc123',
    relativePath: 'src/hello.ts',
    label: 'src/hello.ts@before'
  });

  assert.match(uri, /^miniscm-git:\//);
  assert.match(uri, /\/src\/hello\.ts\?/);
  assert.deepEqual(parseGitBlobUriEntry(new URL(uri).search.slice(1)), {
    repoRoot: '/repo with spaces/project',
    ref: 'abc123',
    relativePath: 'src/hello.ts',
    label: 'src/hello.ts@before'
  });
});

test('createGitBlobUriString round-trips paths with reserved uri characters', () => {
  const entry = {
    repoRoot: '/repo/project',
    ref: 'refs/heads/feature/test',
    relativePath: 'src/a b/#hot?fix+.ts',
    label: 'src/a b/#hot?fix+.ts@feature/test'
  };
  const uri = createGitBlobUriString(entry);
  const parsedUrl = new URL(uri);

  assert.match(parsedUrl.pathname, /\/src\/a%20b\/%23hot%3Ffix%2B\.ts$/);
  assert.deepEqual(parseGitBlobUriEntry(parsedUrl.search.slice(1)), entry);
});

test('parseGitBlobUriEntry returns undefined for legacy id-only uri queries', () => {
  assert.equal(parseGitBlobUriEntry('id=1'), undefined);
});
