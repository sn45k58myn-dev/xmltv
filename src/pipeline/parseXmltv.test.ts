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

  it('keeps channel metadata and multiple programme categories', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel id="sports.one" country="GB">
          <display-name> Sports One </display-name>
          <category>Sports</category>
        </channel>
        <programme start="20260612090000 +0000" stop="20260612100000 +0000" channel="sports.one">
          <title> Live Match </title>
          <category>Sports</category>
          <category>Football</category>
          <category>Sports</category>
        </programme>
      </tv>
    `);

    expect(parsed.channels[0]).toMatchObject({
      id: 'sports.one',
      displayName: 'Sports One',
      country: 'GB',
      category: 'Sports'
    });
    expect(parsed.programs[0]).toMatchObject({
      title: 'Live Match',
      category: 'Sports, Football'
    });
  });

  it('skips channels without usable ids', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel><display-name>No ID</display-name></channel>
        <channel id="valid"><display-name>Valid</display-name></channel>
      </tv>
    `);

    expect(parsed.channels).toHaveLength(1);
    expect(parsed.channels[0].id).toBe('valid');
  });

  it('skips programmes with malformed date windows', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel id="bad.date"><display-name>Bad Date</display-name></channel>
        <programme start="not-a-date" stop="20260612100000 +0000" channel="bad.date">
          <title>Broken</title>
        </programme>
        <programme start="20260612090000 +0000" stop="20260612100000 +0000" channel="bad.date">
          <title>Good</title>
        </programme>
      </tv>
    `);

    expect(parsed.programs).toHaveLength(1);
    expect(parsed.programs[0].title).toBe('Good');
  });
});

describe('validateXmltv', () => {
  it('rejects invalid programme dates', () => {
    const parsed = {
      channels: [
        {
          id: 'bad.date',
          displayName: 'Bad Date'
        }
      ],
      programs: [
        {
          channel: 'bad.date',
          title: 'Broken',
          start: new Date('not-a-date'),
          stop: new Date('2026-06-12T10:00:00Z')
        }
      ]
    };

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

  it('rejects duplicate channel ids', () => {
    const parsed = parseXmltv(`
      <tv>
        <channel id="dup"><display-name>One</display-name></channel>
        <channel id="dup"><display-name>Two</display-name></channel>
      </tv>
    `);

    expect(() => validateXmltv(parsed)).toThrow('duplicate channel id dup');
  });
});
