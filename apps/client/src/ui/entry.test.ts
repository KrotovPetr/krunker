import { expect, it } from 'vitest';
import { invitationRoom } from './entry.js';

it.each([
  [' abc-123_ ', 'abc-123_'],
  ['https://game.example/?room=abc123', 'abc123'],
  ['?room=abc123', 'abc123'],
  ['', null],
  ['https://game.example/', null],
  ['https://game.example/?room=', null],
  ['?room=%3Cscript%3E', null],
  ['javascript:alert(1)?room=abc', null],
  ['bad room', null],
  ['a'.repeat(65), null],
])('extracts a safe room id from %s', (input, expected) => {
  expect(invitationRoom(input, 'http://localhost:5173/')).toBe(expected);
});
