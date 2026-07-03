import assert from 'node:assert/strict';
import test from 'node:test';

import { createRefDiffDescriptor } from '../src/refDiff';
import type { GitRef } from '../src/types';

test('createRefDiffDescriptor places selected ref blob on the left and current file on the right', () => {
  const gitRef: GitRef = {
    label: 'v1.0.0',
    ref: 'refs/tags/v1.0.0',
    type: 'tag'
  };

  assert.deepEqual(
    createRefDiffDescriptor('/repo', 'src/hello.ts', '/repo/src/hello.ts', gitRef),
    {
      left: {
        repoRoot: '/repo',
        ref: 'refs/tags/v1.0.0',
        relativePath: 'src/hello.ts',
        label: 'src/hello.ts@v1.0.0'
      },
      rightPath: '/repo/src/hello.ts',
      titleFile: 'src/hello.ts',
      titleRef: 'v1.0.0'
    }
  );
});
