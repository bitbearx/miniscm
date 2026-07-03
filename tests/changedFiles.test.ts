import assert from 'node:assert/strict';
import test from 'node:test';

import { sortChangedFilesByDirectory } from '../src/changedFiles';
import type { ChangedFile } from '../src/types';

test('sortChangedFilesByDirectory keeps files from the same directory together', () => {
  const files: ChangedFile[] = [
    { status: 'M', path: 'src/zeta.ts' },
    { status: 'A', path: 'README.md' },
    { status: 'M', path: 'src/components/Card.ts' },
    { status: 'D', path: 'docs/guide.md' },
    { status: 'M', path: 'src/alpha.ts' },
    { status: 'M', path: 'src/components/Button.ts' }
  ];

  assert.deepEqual(sortChangedFilesByDirectory(files), [
    { status: 'A', path: 'README.md' },
    { status: 'D', path: 'docs/guide.md' },
    { status: 'M', path: 'src/alpha.ts' },
    { status: 'M', path: 'src/zeta.ts' },
    { status: 'M', path: 'src/components/Button.ts' },
    { status: 'M', path: 'src/components/Card.ts' }
  ]);
});
