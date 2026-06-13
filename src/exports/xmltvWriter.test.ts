import { describe, expect, it } from 'vitest';
import { writeXmltv } from './xmltvWriter';

describe('writeXmltv', () => {
  it('writes escaped XMLTV output for channels and programmes', () => {
    const xml = writeXmltv([
      {
        xmltvId: 'movies.and.more',
        displayName: 'Movies & More',
        logo: 'https://example.test/logo?a=1&b=2',
        icon: null,
        image: null,
        programs: [
          {
            title: 'Tom & Jerry <Special>',
            subtitle: 'Cats "and" mice',
            description: "A chase with 'quotes'",
            category: 'Movies',
            start: new Date('2026-06-12T09:00:00.000Z'),
            stop: new Date('2026-06-12T10:30:00.000Z'),
            image: 'https://example.test/program.png'
          }
        ]
      }
    ] as any);

    expect(xml).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <tv generator-info-name="xmltv-aggregator">
        <channel id="movies.and.more">
          <display-name>Movies &amp; More</display-name>
          <icon src="https://example.test/logo?a=1&amp;b=2" />
        </channel>
        <programme start="20260612090000 +0000" stop="20260612103000 +0000" channel="movies.and.more">
          <title>Tom &amp; Jerry &lt;Special&gt;</title>
          <sub-title>Cats &quot;and&quot; mice</sub-title>
          <desc>A chase with &apos;quotes&apos;</desc>
          <category>Movies</category>
          <icon src="https://example.test/program.png" />
        </programme>
      </tv>"
    `);
  });

  it('writes aliases as additional display names without duplicating the primary name', () => {
    const xml = writeXmltv([
      {
        xmltvId: 'provider.101',
        displayName: 'News One',
        logo: null,
        icon: null,
        image: null,
        aliases: [
          {
            value: 'News 1'
          },
          {
            value: 'news one'
          }
        ],
        programs: []
      }
    ] as any);

    expect(xml).toContain('<display-name>News One</display-name>');
    expect(xml).toContain('<display-name>News 1</display-name>');
    expect(xml.match(/<display-name>/g)).toHaveLength(2);
  });
});
