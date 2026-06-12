import { describe, expect, it } from 'vitest';
import { parseXmltv } from './parseXmltv';
import { validateXmltv } from './validateXmltv';

describe('parseXmltv', () => {
  it('parses valid XMLTV channels and programmes', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel id="bbc.one">
          <display-name>BBC One</display-name>
          <icon src="https://example.test/bbc.png" />
        </channel>
        <programme start="20260612090000 +0000" stop="20260612100000 +0000" channel="bbc.one">
          <title>Breakfast</title>
          <category>News</category>
        </programme>
      </tv>
    `);

    expect(parsed.channels).toHaveLength(1);
    expect(parsed.channels[0]).toMatchObject({
      id: 'bbc.one',
      displayName: 'BBC One',
      icon: 'https://example.test/bbc.png'
    });
    expect(parsed.programs).toHaveLength(1);
    expect(parsed.programs[0]).toMatchObject({
      channel: 'bbc.one',
      title: 'Breakfast',
      category: 'News'
    });
    expect(parsed.programs[0].start.toISOString()).toBe('2026-06-12T09:00:00.000Z');
  });

  it('rejects documents without a tv root', () => {
    expect(() => parseXmltv('<channels />')).toThrow('Invalid XMLTV: missing <tv> root');
  });

  it('preserves multiple display-name values as aliases', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel id="itv.one">
          <display-name>ITV1</display-name>
          <display-name>ITV One</display-name>
          <display-name>Independent Television</display-name>
        </channel>
      </tv>
    `);

    expect(parsed.channels[0]).toMatchObject({
      displayName: 'ITV1',
      aliases: ['ITV One', 'Independent Television']
    });
  });
});

describe('validateXmltv', () => {
  it('rejects invalid programme dates', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel id="bad.date"><display-name>Bad Date</display-name></channel>
        <programme start="not-a-date" stop="20260612100000 +0000" channel="bad.date">
          <title>Broken</title>
        </programme>
      </tv>
    `);

    expect(() => validateXmltv(parsed)).toThrow('bad programme date');
  });

  it('rejects orphan programme channel references', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel id="known"><display-name>Known</display-name></channel>
        <programme start="20260612090000 +0000" stop="20260612100000 +0000" channel="missing">
          <title>Orphan</title>
        </programme>
      </tv>
    `);

    expect(() => validateXmltv(parsed)).toThrow('programme references unknown channel missing');
  });
});
