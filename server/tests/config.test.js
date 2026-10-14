import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { configuration, root } from '../src/config.js';

test('Mio использует SQLite внутри локальной папки server', () => {
  const config = configuration({ RENDER_EXTERNAL_HOSTNAME:'old-test.example', PUBLIC_HOST:'old-test.example' });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.database, path.join(root, 'data/mio.sqlite'));
  assert.equal(config.publicHost, undefined);
});
test('Интернет-запуск не заменяет локальное хранение', () => {
  assert.throws(() => configuration({HOST:'0.0.0.0',PUBLIC_HOST:'example.com',ACCESS_PASSWORD:'long-enough-test-password'}), /локально/);
});
test('Рабочая база не может оказаться вне папки server', () => {
  for (const database of ['../outside.sqlite','/tmp/outside.sqlite','data/../../outside.sqlite']) {
    assert.throws(() => configuration({DATABASE_PATH:database}), /внутри папки server/);
  }
  assert.equal(configuration({DATABASE_PATH:'data/backups/restored.sqlite'}).database, path.join(root,'data/backups/restored.sqlite'));
});
