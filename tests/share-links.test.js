import assert from 'node:assert/strict';
import test from 'node:test';
import { shareSlug } from '../server/share-links.js';

test('share slugs make Arabic titles readable in URL paths', () => {
  assert.equal(shareSlug('اختبار الفيزياء - الفصل الأول'), 'akhtbar-alfyzya-alfsl-alawl');
});

test('share slugs normalize punctuation, bound length, and provide a fallback', () => {
  assert.equal(shareSlug('  Algebra / Midterm #1  '), 'algebra-midterm-1');
  assert.match(shareSlug('ك'.repeat(100)), /^[a-z0-9-]{1,64}$/);
  assert.equal(shareSlug('---'), 'share');
});
