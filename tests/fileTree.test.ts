import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFileTree } from '../src/fileTree';
import type { ChangedFile } from '../src/types';

test('buildFileTree groups changed files into nested folders and sorted files', () => {
  const files: ChangedFile[] = [
    { status: 'M', path: 'src/components/Button.js' },
    { status: 'A', path: 'README.md' },
    { status: 'D', path: 'src/index.js' },
    { status: 'M', path: 'src/components/Card.js' }
  ];

  assert.deepEqual(buildFileTree(files), [
    {
      type: 'file',
      name: 'README.md',
      path: 'README.md',
      change: { status: 'A', path: 'README.md' }
    },
    {
      type: 'folder',
      name: 'src',
      path: 'src',
      children: [
        {
          type: 'folder',
          name: 'components',
          path: 'src/components',
          children: [
            {
              type: 'file',
              name: 'Button.js',
              path: 'src/components/Button.js',
              change: { status: 'M', path: 'src/components/Button.js' }
            },
            {
              type: 'file',
              name: 'Card.js',
              path: 'src/components/Card.js',
              change: { status: 'M', path: 'src/components/Card.js' }
            }
          ]
        },
        {
          type: 'file',
          name: 'index.js',
          path: 'src/index.js',
          change: { status: 'D', path: 'src/index.js' }
        }
      ]
    }
  ]);
});
